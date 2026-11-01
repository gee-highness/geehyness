import * as THREE from 'three';

/** GPU-animated rain streaks around the camera (no per-frame CPU cost) plus storm lightning. */
export class Weather {
  private rain: THREE.LineSegments;
  private uni = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uWind: { value: new THREE.Vector2(3, 1) }, uAlpha: { value: 0 } };
  private intensity = 0; private target = 0; private maxDrops = 6000; private flash = 0; private nextFlash = 4;
  public lightning = 0; // 0..1, read by the scene to brighten sky/ambient

  constructor(scene: THREE.Scene, private count = 6000) {
    this.maxDrops = count;
    const pos = new Float32Array(count * 6), end = new Float32Array(count * 2);
    const B = 70, H = 45;
    for (let i = 0; i < count; i++) {
      const x = Math.random() * B, y = Math.random() * H, z = Math.random() * B;
      pos.set([x, y, z, x, y, z], i * 6); end[i * 2] = 0; end[i * 2 + 1] = 1;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: this.uni, transparent: true, depthWrite: false, fog: false,
      vertexShader: `uniform float uTime; uniform vec3 uCam; uniform vec2 uWind; attribute float aEnd; varying float vA;
        void main(){ vec3 box=vec3(70.,45.,70.); vec3 vel=vec3(uWind.x,-28.,uWind.y);
          vec3 p=position+vel*uTime; p=mod(p-uCam+box*.5,box)+uCam-box*.5;
          p-=vel*aEnd*0.028; vec4 mv=viewMatrix*vec4(p,1.); vA=1.-clamp(-mv.z/60.,0.,1.); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float uAlpha; varying float vA; void main(){ gl_FragColor=vec4(.78,.84,.92,.38*vA*uAlpha); }`,
    });
    this.rain = new THREE.LineSegments(g, m); this.rain.frustumCulled = false; this.rain.visible = false; this.rain.renderOrder = 5; scene.add(this.rain);
  }

  /** Density multiplier for the quality tier (0..1). */
  public setDetail(f: number): void { this.rain.geometry.setDrawRange(0, Math.floor(this.maxDrops * f) * 2); }

  public set(kind: 'SUNNY' | 'OVERCAST' | 'MIST' | 'TROPICAL_RAIN'): void { this.target = kind === 'TROPICAL_RAIN' ? 1 : 0; }
  public get raining(): boolean { return this.target > 0; }

  public update(dt: number, cam: THREE.Vector3, windKmh: number): void {
    this.intensity += (this.target - this.intensity) * Math.min(1, dt * 0.6);
    this.rain.visible = this.intensity > 0.02; this.uni.uAlpha.value = this.intensity;
    this.uni.uTime.value += dt; this.uni.uCam.value.copy(cam); this.uni.uWind.value.set(windKmh * 0.12, windKmh * 0.04);
    // storm: sporadic double-flash lightning
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.target > 0.5) { this.nextFlash -= dt; if (this.nextFlash < 0) { this.flash = 1; this.nextFlash = 5 + Math.random() * 14; setTimeout(() => { this.flash = 0.8; }, 130); } }
    this.lightning = this.flash * this.intensity;
  }
}
