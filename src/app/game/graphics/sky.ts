import * as THREE from 'three';
import { STYLE_FUNCS } from './stylized';

/** One stylized palette per sun elevation; drives the sky dome, sun, ambient, rim light and fog together. */
export interface SkyPalette { zenith: THREE.Color; horizon: THREE.Color; sun: THREE.Color; sunI: number; day: number }
const STOPS: { e: number; z: number[]; h: number[]; s: number[]; i: number }[] = [
  { e: -0.28, z: [0.012, 0.016, 0.06], h: [0.03, 0.04, 0.13], s: [0.45, 0.55, 1.0], i: 0.08 },
  { e: -0.07, z: [0.05, 0.05, 0.2], h: [0.4, 0.17, 0.34], s: [1.0, 0.42, 0.32], i: 0.3 },
  { e: 0.05, z: [0.2, 0.2, 0.52], h: [1.0, 0.5, 0.3], s: [1.0, 0.56, 0.3], i: 1.3 },
  { e: 0.22, z: [0.2, 0.42, 0.86], h: [0.99, 0.78, 0.62], s: [1.0, 0.82, 0.6], i: 2.3 },
  { e: 0.6, z: [0.13, 0.4, 0.92], h: [0.6, 0.82, 0.99], s: [1.0, 0.96, 0.88], i: 3.0 },
];
const mix3 = (a: number[], b: number[], t: number, out: THREE.Color): void => { out.setRGB(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t); };

export function skyPalette(sunY: number, gloom: number, neo: boolean, out: SkyPalette): SkyPalette {
  const e = THREE.MathUtils.clamp(sunY, STOPS[0].e, STOPS[STOPS.length - 1].e);
  let i = 0; while (i < STOPS.length - 2 && e > STOPS[i + 1].e) i++;
  const a = STOPS[i], b = STOPS[i + 1], t = THREE.MathUtils.smoothstep(e, a.e, b.e);
  mix3(a.z, b.z, t, out.zenith); mix3(a.h, b.h, t, out.horizon); mix3(a.s, b.s, t, out.sun); out.sunI = a.i + (b.i - a.i) * t;
  out.day = THREE.MathUtils.smoothstep(sunY, -0.12, 0.3);
  if (gloom < 1) { const g = new THREE.Color(0.33, 0.36, 0.44).multiplyScalar(0.25 + 0.75 * out.day); out.zenith.lerp(g, 1 - gloom); out.horizon.lerp(g.multiplyScalar(1.25), (1 - gloom) * 0.9); }
  if (neo) { out.zenith.multiply(new THREE.Color(0.9, 0.6, 1.5)); out.horizon.lerp(new THREE.Color(0.95, 0.28, 0.85), 0.35 * (0.4 + out.day * 0.6)); out.sun.lerp(new THREE.Color(1, 0.6, 0.95), 0.4); }
  return out;
}

/** Stylized sky dome: banded gradient, glowing sun and moon, toon clouds lit by the sun, twinkling stars. */
export class Sky {
  readonly uniforms = {
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunCol: { value: new THREE.Color() },
    uDay: { value: 1 }, uTime: { value: 0 }, uCover: { value: 0.55 }, uGloom: { value: 0 }, uFlash: { value: 0 }, uWind: { value: new THREE.Vector2(0.01, 0.004) },
  };
  readonly mesh: THREE.Mesh; readonly envMesh: THREE.Mesh;
  constructor(scene: THREE.Scene) {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: /* glsl */ `
        varying vec3 vDir; uniform vec3 uSunDir, uZenith, uHorizon, uSunCol; uniform float uDay, uTime, uCover, uGloom, uFlash; uniform vec2 uWind;
        ${STYLE_FUNCS}
        vec3 band(vec3 a, vec3 b, float t){ float k = t * 7.0; float f = floor(k), r = smoothstep(0.0, 1.0, fract(k) * 1.6 - 0.3); return mix(a, b, (f + r) / 7.0); } // soft posterised gradient
        void main(){
          vec3 d = normalize(vDir); float up = clamp(d.y, -0.2, 1.0);
          float t = pow(clamp(up, 0.0, 1.0), 0.55);
          vec3 col = band(uHorizon, uZenith, t);
          if (d.y < 0.0) col = mix(uHorizon, uHorizon * 0.55, clamp(-d.y * 4.0, 0.0, 1.0));
          // sun glow + disc (toon: hard disc, soft halo)
          float sd = max(dot(d, normalize(uSunDir)), 0.0);
          col += uSunCol * (pow(sd, 6.0) * 0.28 + pow(sd, 40.0) * 0.45) * mix(0.35, 1.0, uDay) * (1.0 - uGloom * 0.8);
          float disc = smoothstep(0.9993, 0.9996, sd); col = mix(col, vec3(1.0, 0.97, 0.88) * 1.8, disc * (1.0 - uGloom));
          // moon (opposite the sun) + stars
          float night = 1.0 - uDay; vec3 md = -normalize(uSunDir); float mm = dot(d, md);
          col += vec3(0.75, 0.82, 1.0) * smoothstep(0.9993, 0.9997, mm) * night * 1.6 + vec3(0.4, 0.5, 0.9) * pow(max(mm, 0.0), 30.0) * night * 0.18;
          vec2 sp = vec2(atan(d.z, d.x) * 62.0, d.y * 62.0); float st = step(0.9965, sh1(floor(sp))) * (0.55 + 0.45 * sin(uTime * 2.0 + sh1(floor(sp) + 3.0) * 40.0));
          col += vec3(0.85, 0.9, 1.0) * st * night * smoothstep(0.02, 0.25, d.y) * (1.0 - uGloom);
          // toon clouds on a projected plane (domain-warped fbm, three light bands)
          if (d.y > 0.02) {
            vec2 cp = d.xz / (d.y + 0.18) * 1.7 + uWind * uTime;
            float w = sfbm(cp * 0.7 + 4.0), n = sfbm(cp + w * 1.4);
            float c = smoothstep(1.0 - uCover, 1.0 - uCover + 0.1, n);
            float core = smoothstep(1.0 - uCover + 0.12, 1.0 - uCover + 0.3, n);
            float lit = clamp(dot(normalize(vec3(sfbm(cp * 1.3) - 0.5, 0.6, sfbm(cp * 1.3 + 9.0) - 0.5)), normalize(uSunDir)), 0.0, 1.0);
            vec3 cl = mix(uZenith * 0.85 + 0.12, uSunCol * 1.15, floor(lit * 3.0) / 3.0 * (0.35 + 0.65 * uDay));
            cl = mix(cl, uHorizon * 1.15 + 0.05, 0.25 + 0.55 * (1.0 - t)); cl = mix(cl, cl * 0.62, core * 0.6);
            cl = mix(cl, vec3(0.28, 0.3, 0.36) * (0.4 + 0.6 * uDay), uGloom);
            col = mix(col, cl, c * smoothstep(0.02, 0.2, d.y) * (0.55 + 0.45 * uDay));
          }
          col += vec3(0.8, 0.85, 1.0) * uFlash;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const geo = new THREE.SphereGeometry(1, 40, 20);
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = -100; this.mesh.scale.setScalar(3800); scene.add(this.mesh);
    this.envMesh = new THREE.Mesh(geo, mat); this.envMesh.frustumCulled = false; this.envMesh.scale.setScalar(50);
  }
  update(camPos: THREE.Vector3, sunDir: THREE.Vector3, pal: SkyPalette, t: number, cover: number, gloom: number, flash: number): void {
    this.mesh.position.copy(camPos);
    const u = this.uniforms; u.uSunDir.value.copy(sunDir); u.uZenith.value.copy(pal.zenith); u.uHorizon.value.copy(pal.horizon); u.uSunCol.value.copy(pal.sun);
    u.uDay.value = pal.day; u.uTime.value = t; u.uCover.value = cover; u.uGloom.value = gloom; u.uFlash.value = flash;
  }
}
