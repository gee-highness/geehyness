import * as THREE from 'three';

/**
 * World emitters: up to 24 coloured point lights fed to every world material as shader uniforms (position + radius, colour + strength).
 * Far cheaper than real lights. Slots are fixed by kind so static and dynamic updaters never fight:
 *   0-9 street lamps · 10-11 traffic signals · 12-15 shop signs / lit windows · 16-19 AI car headlights · 20-21 cop strobes · 22 player tail glow
 */
export const SLOT = { LAMP: 0, LAMPS: 10, SIGNAL: 10, SIGNALS: 2, SHOP: 12, SHOPS: 4, CAR: 16, CARS: 4, COP: 20, PLAYER: 22, TOTAL: 24 };
export const LAMP = {
  uLamp: { value: Array.from({ length: SLOT.TOTAL }, () => new THREE.Vector4(0, -9999, 0, 0)) },
  uLampCol: { value: Array.from({ length: SLOT.TOTAL }, () => new THREE.Vector4(1, 1, 1, 0)) },
  uLampOn: { value: 0 },
  uLampN: { value: SLOT.TOTAL },
};
export function setEmitter(i: number, x: number, y: number, z: number, radius: number, r: number, g: number, b: number, strength: number): void {
  LAMP.uLamp.value[i].set(x, y, z, radius); LAMP.uLampCol.value[i].set(r, g, b, strength);
}
export function clearEmitter(i: number): void { LAMP.uLamp.value[i].set(0, -9999, 0, 0); }

const DECL = `uniform vec4 uLamp[${SLOT.TOTAL}]; uniform vec4 uLampCol[${SLOT.TOTAL}]; uniform float uLampOn; uniform int uLampN; varying vec3 vLW; varying vec3 vLN;`;
const FRAG = /* glsl */ `
  if (uLampOn > 0.01) {
    vec3 lampAcc = vec3(0.0); vec3 lN = normalize(vLN);
    for (int i = 0; i < ${SLOT.TOTAL}; i++) {
      if (i >= uLampN) break;
      float R = uLamp[i].w; if (R <= 0.0) continue;
      vec3 dv = uLamp[i].xyz - vLW; float dist = length(dv); if (dist > R) continue;
      float att = 1.0 - dist / R; att *= att;
      float lam = clamp(dot(lN, dv / dist) * 0.8 + 0.28, 0.0, 1.0);          // wrapped lambert so walls and ground both catch the light
      lampAcc += uLampCol[i].rgb * (uLampCol[i].a * att * lam);
    }
    reflectedLight.directDiffuse += diffuseColor.rgb * lampAcc * uLampOn * 2.0;
  }`;

/** Make a standard material receive the emitters. Safe to call on materials that already patch their shader. */
export function addLampLight(m: THREE.Material): void {
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey, prevSrc = String(prev);
  m.onBeforeCompile = (sh, r) => {
    prev?.call(m, sh, r); sh.uniforms['uLamp'] = LAMP.uLamp; sh.uniforms['uLampCol'] = LAMP.uLampCol; sh.uniforms['uLampOn'] = LAMP.uLampOn; sh.uniforms['uLampN'] = LAMP.uLampN;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\nvarying vec3 vLW; varying vec3 vLN;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLW = (modelMatrix * vec4(transformed, 1.0)).xyz; vLN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${DECL}`).replace('#include <lights_fragment_end>', `#include <lights_fragment_end>\n${FRAG}`);
  };
  m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : prevSrc) + '|lamp2';
}
