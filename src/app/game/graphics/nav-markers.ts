import * as THREE from 'three';
import type { Route } from '../road-graph';

const STEP = 3, AHEAD = 450, W = 3.4;

/** Everything the sat-nav shows IN the world: animated chevrons painted on the road along the route, a wide destination beam + pulsing ring + floating
 *  diamond + a distance label that stays readable through buildings, and a marker at the next turn. */
export class NavMarkers {
  private ribbon: THREE.Mesh; private tex: THREE.CanvasTexture;
  private dest = new THREE.Group(); private ring: THREE.Mesh; private gem: THREE.Mesh; private label: THREE.Sprite; private labelTxt = '';
  private turn = new THREE.Group(); private lastRoute: Route | null = null; private lastIdx = -1; private lastBuild = 0; private t = 0;

  constructor(private scene: THREE.Scene, private ground: (x: number, z: number, y: number) => number) {
    const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128; const x = cv.getContext('2d')!;
    x.clearRect(0, 0, 64, 128); x.lineCap = 'round'; x.lineJoin = 'round';
    x.strokeStyle = 'rgba(0,40,60,0.9)'; x.lineWidth = 22; x.beginPath(); x.moveTo(8, 100); x.lineTo(32, 46); x.lineTo(56, 100); x.stroke();
    x.strokeStyle = '#ffffff'; x.lineWidth = 12; x.beginPath(); x.moveTo(8, 100); x.lineTo(32, 46); x.lineTo(56, 100); x.stroke();
    this.tex = new THREE.CanvasTexture(cv); this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping; this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 4;
    this.ribbon = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ map: this.tex, color: 0x22e5ff, transparent: true, opacity: 0.95, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide, toneMapped: false }));
    this.ribbon.frustumCulled = false; this.ribbon.renderOrder = 3; this.ribbon.visible = false; scene.add(this.ribbon);

    const mat = (c: number, o: number) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: THREE.DoubleSide, fog: false, toneMapped: false });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 600, 24, 1, true).translate(0, 300, 0), mat(0xd946ef, 0.32)); beam.renderOrder = 4; beam.frustumCulled = false;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 600, 12, 1, true).translate(0, 300, 0), mat(0xffffff, 0.55)); core.renderOrder = 4; core.frustumCulled = false;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(7, 9, 48).rotateX(-Math.PI / 2), mat(0xf0abfc, 0.85)); this.ring.position.y = 0.6; this.ring.renderOrder = 4;
    const gm = mat(0xfef08a, 0.95); gm.depthTest = false;
    this.gem = new THREE.Mesh(new THREE.OctahedronGeometry(4), gm); this.gem.position.y = 45; this.gem.renderOrder = 30; this.gem.frustumCulled = false;
    this.label = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, fog: false, sizeAttenuation: false })); this.label.position.y = 62; this.label.renderOrder = 31; this.label.scale.set(0.26, 0.065, 1);
    this.dest.add(beam, core, this.ring, this.gem, this.label); this.dest.visible = false; scene.add(this.dest);

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 14, 10, 1, true).translate(0, 7, 0), mat(0x22e5ff, 0.55)); pole.renderOrder = 4;
    const tgem = new THREE.Mesh(new THREE.ConeGeometry(1.8, 3.2, 4).rotateX(Math.PI), (() => { const m = mat(0x22e5ff, 0.95); m.depthTest = false; return m; })()); tgem.position.y = 16; tgem.renderOrder = 30;
    this.turn.add(pole, tgem); this.turn.visible = false; scene.add(this.turn);
  }

  private paintLabel(text: string): void {
    if (text === this.labelTxt) return; this.labelTxt = text;
    const cv = document.createElement('canvas'); cv.width = 512; cv.height = 128; const x = cv.getContext('2d')!;
    x.fillStyle = 'rgba(88,28,135,0.92)'; x.beginPath(); x.roundRect(4, 4, 504, 120, 40); x.fill(); x.strokeStyle = '#f0abfc'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 62px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 68);
    const old = this.label.material.map; this.label.material.map = new THREE.CanvasTexture(cv); this.label.material.needsUpdate = true; old?.dispose();
  }

  /** Per frame. `route` may be null (straight-line destination only); `idx` = the car's progress along it. */
  update(wp: [number, number] | null, route: Route | null, idx: number, car: THREE.Vector3, dt: number): void {
    this.t += dt;
    if (!wp) { this.ribbon.visible = this.dest.visible = this.turn.visible = false; this.lastRoute = null; return; }
    // destination
    const gy = this.ground(wp[0], wp[1], car.y); this.dest.visible = true; this.dest.position.set(wp[0], gy, wp[1]);
    const rem = route ? Math.max(0, route.length - route.cum[Math.min(idx, route.cum.length - 1)]) : Math.hypot(wp[0] - car.x, wp[1] - car.z);
    this.paintLabel(rem >= 1000 ? `${(rem / 1000).toFixed(1)} km` : `${Math.round(rem / 10) * 10} m`);
    const pulse = (this.t % 1.6) / 1.6; this.ring.scale.setScalar(0.6 + pulse * 0.9); (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - pulse);
    this.gem.rotation.y += dt * 1.6; this.gem.position.y = 45 + Math.sin(this.t * 2) * 2;
    // route ribbon + next turn
    if (!route) { this.ribbon.visible = false; this.turn.visible = false; this.lastRoute = null; return; }
    this.tex.offset.y -= dt * 0.7;
    const now = performance.now();
    if (route !== this.lastRoute || (idx !== this.lastIdx && now - this.lastBuild > 200)) { this.lastRoute = route; this.lastIdx = idx; this.lastBuild = now; this.build(route, idx, car.y); }
    const along = route.cum[Math.min(idx, route.cum.length - 1)], st = route.steps.find((s) => s.at > along + 6);
    this.turn.visible = !!st && st.at - along < 700 && st.turn !== 'arrive' as never;
    if (st) this.turn.position.set(st.x, this.ground(st.x, st.z, car.y), st.z);
  }

  private build(route: Route, idx: number, yHint: number): void {
    const n = route.pts.length / 2, pos: number[] = [], uv: number[] = [], ind: number[] = [];
    let px = route.pts[idx * 2], pz = route.pts[idx * 2 + 1], i = idx + 1, dist = 0, carry = 0, y = yHint, k = 0;
    const emit = (x: number, z: number, tx: number, tz: number): void => {
      y = this.ground(x, z, y) + 0.18; const nx = -tz * W / 2, nz = tx * W / 2;
      pos.push(x + nx, y, z + nz, x - nx, y, z - nz); uv.push(0, dist / 6, 1, dist / 6);
      if (k > 0) { const a = (k - 1) * 2; ind.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } k++;
    };
    while (i < n && dist < AHEAD) {
      const qx = route.pts[i * 2], qz = route.pts[i * 2 + 1], sx = qx - px, sz = qz - pz, len = Math.hypot(sx, sz);
      if (len < 1e-3) { i++; continue; }
      const tx = sx / len, tz = sz / len; let s = STEP - carry;
      while (s <= len && dist < AHEAD) { emit(px + tx * s, pz + tz * s, tx, tz); dist += s - (STEP - carry) + STEP; carry = 0; s += STEP; }
      carry = len - (s - STEP); if (carry < 0) carry = 0; px = qx; pz = qz; i++;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(ind);
    this.ribbon.geometry.dispose(); this.ribbon.geometry = g; this.ribbon.visible = k > 1;
  }
}
