import * as THREE from 'three';
import type { WorldBuilder } from './world-builder';

interface Ped { pts: number[]; cum: number[]; len: number; s: number; dir: number; speed: number; off: number; side: number; phase: number; dodge: number; active: boolean; x: number; z: number; yaw: number; }

/** Pedestrians strolling the kerbside pavements near the player. Three instanced meshes (torso+head, two legs) = 3 draw calls. */
export class Pedestrians {
  private peds: Ped[] = [];
  private torso: THREE.InstancedMesh; private legL: THREE.InstancedMesh; private legR: THREE.InstancedMesh;
  private timer = 0; private count: number;
  private m = new THREE.Matrix4(); private q = new THREE.Quaternion(); private e = new THREE.Euler(); private v = new THREE.Vector3(); private one = new THREE.Vector3(1, 1, 1);
  private static SHIRTS = [0xd9534f, 0x3b6ea5, 0xf0c05a, 0x4f9d69, 0xeeeeee, 0x8a4fa5, 0xe08a3c, 0x222222];

  constructor(scene: THREE.Scene, private world: WorldBuilder, count = 48) {
    this.count = count;
    const body = new THREE.BoxGeometry(0.42, 0.62, 0.26).translate(0, 1.18, 0);
    const head = new THREE.SphereGeometry(0.13, 7, 6).translate(0, 1.64, 0);
    const torsoGeo = mergeSimple([body, head]);
    const leg = new THREE.BoxGeometry(0.17, 0.86, 0.2).translate(0, -0.43, 0); // pivots at the hip
    const mat = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.85 });
    this.torso = new THREE.InstancedMesh(torsoGeo, mat, count);
    this.legL = new THREE.InstancedMesh(leg, new THREE.MeshStandardMaterial({ color: 0x2b3340, roughness: 0.9 }), count);
    this.legR = new THREE.InstancedMesh(leg, this.legL.material, count);
    for (const im of [this.torso, this.legL, this.legR]) { im.frustumCulled = false; im.count = 0; scene.add(im); }
    for (let i = 0; i < count; i++) this.torso.setColorAt(i, new THREE.Color(Pedestrians.SHIRTS[i % Pedestrians.SHIRTS.length]));
    for (let i = 0; i < count; i++) this.peds.push({ pts: [], cum: [], len: 0, s: 0, dir: 1, speed: 1.3, off: 3, side: 1, phase: Math.random() * 6, dodge: 0, active: false, x: 0, z: 0, yaw: 0 });
  }

  /** Debug: active pedestrian positions. */
  debug(): number[][] { return this.peds.filter((p) => p.active).map((p) => [Math.round(p.x), Math.round(p.z), Math.round(p.yaw * 100) / 100]); }

  setCount(f: number): void { this.count = Math.max(0, Math.floor(this.peds.length * f)); }

  private spawn(p: Ped, px: number, pz: number): boolean {
    const near = this.world.waysNear(px, pz, 170);
    for (let tries = 0; tries < 12 && near.length; tries++) {
      const way = this.world.roadWays[near[Math.floor(Math.random() * near.length)]];
      if (way.c < 1 || way.c > 6 || way.u || way.dz || way.p.length < 6) continue;
      const pts: number[] = []; for (let i = 0; i < way.p.length; i += 2) pts.push(way.p[i] / 10, way.p[i + 1] / 10);
      const cum = [0]; for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
      const len = cum[cum.length - 1]; if (len < 15) continue;
      const s = Math.random() * len, off = way.w / 2 + (way.c <= 2 ? 1.5 : 1.15), side = Math.random() < 0.5 ? 1 : -1;
      const [x, z] = this.at(pts, cum, s, off * side); const d = Math.hypot(x - px, z - pz);
      if (d < 25 || d > 160 || !this.world.onPavement(x, z)) continue;
      Object.assign(p, { x, z, pts, cum, len, s, dir: Math.random() < 0.5 ? 1 : -1, speed: 1.1 + Math.random() * 0.7, off, side, dodge: 0, active: true });
      return true;
    }
    return false;
  }

  private at(pts: number[], cum: number[], s: number, lat: number): [number, number, number, number] {
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const ax = pts[(i - 1) * 2], az = pts[(i - 1) * 2 + 1], bx = pts[i * 2], bz = pts[i * 2 + 1], seg = cum[i] - cum[i - 1] || 1, t = Math.max(0, Math.min(1, (s - cum[i - 1]) / seg));
    const tx = (bx - ax) / seg, tz = (bz - az) / seg;
    return [ax + (bx - ax) * t - tz * lat, az + (bz - az) * t + tx * lat, tx, tz];
  }

  /** Call every frame with the player's car position, velocity (m/s). */
  update(dt: number, px: number, pz: number, vx: number, vz: number): void {
    this.timer += dt; const spawnNow = this.timer > 0.25; if (spawnNow) this.timer = 0;
    const speed = Math.hypot(vx, vz); let n = 0, spawned = 0;
    const slots = Math.min(this.count, this.peds.length);
    for (let i = 0; i < slots; i++) {
      const p = this.peds[i];
      if (p.active) { const d = Math.hypot(p.x - px, p.z - pz); if (d > 190) p.active = false; }
      if (!p.active) { if (spawnNow && spawned < 2 && this.spawn(p, px, pz)) spawned++; else continue; }
      // dodge: step away from the road when a fast car is close
      const dx = p.x - px, dz = p.z - pz, d = Math.hypot(dx, dz);
      const threat = speed > 4 && d < 14 && (dx * vx + dz * vz) < 0 ? 1 : 0;
      p.dodge += ((threat ? 1.4 : 0) - p.dodge) * Math.min(1, dt * 3);
      p.s += p.dir * p.speed * (1 + p.dodge * 1.4) * dt;
      if (p.s < 0 || p.s > p.len) { p.dir = -p.dir; p.s = Math.max(0, Math.min(p.len, p.s)); }
      const [x, z, tx, tz] = this.at(p.pts, p.cum, p.s, (p.off + p.dodge) * p.side);
      p.x = x; p.z = z; p.yaw = Math.atan2(tx * p.dir, tz * p.dir);
      const y = this.world.groundHeightAt(x, z, 1e3);
      p.phase += dt * p.speed * (1 + p.dodge) * 5.2; const sw = Math.sin(p.phase), bob = Math.abs(Math.cos(p.phase)) * 0.035;
      this.q.setFromEuler(this.e.set(0, p.yaw, 0));
      this.torso.setMatrixAt(n, this.m.compose(this.v.set(x, y + bob, z), this.q, this.one));
      const hip = (side: number) => this.m.compose(this.v.set(x + Math.cos(p.yaw) * 0.11 * side, y + 0.86 + bob, z - Math.sin(p.yaw) * 0.11 * side), new THREE.Quaternion().setFromEuler(this.e.set(sw * 0.7 * -side, p.yaw, 0, 'YXZ')), this.one);
      this.legL.setMatrixAt(n, hip(1)); this.legR.setMatrixAt(n, hip(-1));
      n++;
    }
    for (const im of [this.torso, this.legL, this.legR]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    if (this.torso.instanceColor) this.torso.instanceColor.needsUpdate = true;
  }
}

function mergeSimple(gs: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const parts = gs.map((g) => g.toNonIndexed()); let n = 0; for (const g of parts) n += g.attributes['position'].count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { pos.set(g.attributes['position'].array as Float32Array, o * 3); nor.set(g.attributes['normal'].array as Float32Array, o * 3); o += g.attributes['position'].count; }
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); return out;
}
