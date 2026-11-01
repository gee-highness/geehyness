import * as THREE from 'three';
import { AssetLibrary } from './asset-library';
import type { WorldBuilder } from './world-builder';
import { CAR_CATALOG, TRAFFIC_MODELS } from '../cars';
import type { DynamicCollider } from '../physics/collision';

interface Agent { cruise: number; obj: THREE.Group; pts: number[]; seg: number; s: number; speed: number; w: number; cum: number[]; len: number; }

/** Ambient traffic that drives the real OSM road geometry, on the left (Eswatini). */
export class RoadTraffic {
  private agents: Agent[] = [];
  private candidates: number[] = [];
  private timer = 0;
  private readonly N = 26;

  constructor(private scene: THREE.Scene, private world: WorldBuilder) {
    world.roadWays.forEach((w, i) => { if (w.c <= 4 && w.p.length >= 6) this.candidates.push(i); });
    this.populate();
  }

  private async populate(): Promise<void> {
    for (let i = 0; i < this.N; i++) {
      const id = TRAFFIC_MODELS[i % TRAFFIC_MODELS.length];
      const def = CAR_CATALOG.find((c) => c.id === id);
      const model = def ? (await AssetLibrary.load(def.file).catch(() => null)) : null;
      if (!model || !def) continue;
      const car = model.clone(true);
      const wheels = def.wheels.map((n) => car.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
      let s = 2.2;
      if (wheels.length === 4) { car.updateWorldMatrix(true, true); const p = wheels.map((w) => w.getWorldPosition(new THREE.Vector3())); s = 2.7 / (Math.abs((p[0].z + p[1].z) / 2 - (p[2].z + p[3].z) / 2) || 1); }
      const g = new THREE.Group(); car.scale.setScalar(s); car.position.y = 0.33 - 0.3 * s; g.add(car); g.visible = false;
      this.scene.add(g);
      this.agents.push({ cruise: 12, obj: g, pts: [], seg: 0, s: 0, speed: 0, w: 6, cum: [], len: 0 });
    }
  }

  private respawn(a: Agent, px: number, pz: number): void {
    for (let tries = 0; tries < 40; tries++) {
      const wi = this.candidates[Math.floor(Math.random() * this.candidates.length)];
      const way = this.world.roadWays[wi];
      const p = way.p; const k = Math.floor(Math.random() * (p.length / 2));
      const x = p[k * 2] / 10, z = p[k * 2 + 1] / 10; const d = Math.hypot(x - px, z - pz);
      if (d < 160 || d > 650) continue;
      let pts: number[] = [];
      for (let i = 0; i < p.length; i += 2) pts.push(p[i] / 10, p[i + 1] / 10);
      if (!way.o && Math.random() < 0.5) { const r: number[] = []; for (let i = pts.length - 2; i >= 0; i -= 2) r.push(pts[i], pts[i + 1]); pts = r; }
      const cum = [0]; for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
      const len = cum[cum.length - 1]; if (len < 40) continue;
      a.pts = pts; a.cum = cum; a.len = len; a.w = way.w; a.seg = 0;
      // start at the picked vertex's distance (reverse-aware nearest vertex)
      let best = 0, bd = 1e9; for (let i = 0; i < pts.length; i += 2) { const dd = Math.hypot(pts[i] - x, pts[i + 1] - z); if (dd < bd) { bd = dd; best = i / 2; } }
      a.s = cum[best] * 0.98; a.cruise = (way.c <= 2 ? 15 : 9) + Math.random() * 6; a.speed = a.cruise;
      a.obj.visible = true; return;
    }
  }

  /** Moving circles for the collision solver (3 per car along its heading). */
  colliders(): DynamicCollider[] {
    const out: DynamicCollider[] = [];
    this.agents.forEach((a, id) => {
      const hd = a.obj.userData['hd'] as [number, number] | undefined; if (!a.obj.visible || !hd) return;
      for (const off of [-1.3, 0, 1.3]) out.push({ x: a.obj.position.x + hd[0] * off, z: a.obj.position.z + hd[1] * off, r: 1.0, vx: hd[0] * a.speed, vz: hd[1] * a.speed, mass: 1500, id });
    });
    return out;
  }
  /** A collision shoved this car: lose speed in proportion to the hit. */
  hit(id: number, impact: number): void { const a = this.agents[id]; if (a) a.speed = Math.max(0, a.speed - impact * 0.6); }

  update(dt: number, px: number, pz: number): void {
    this.timer += dt;
    const up = new THREE.Vector3(0, 1, 0);
    for (const a of this.agents) {
      if (!a.pts.length) { if (this.timer > 0.2) this.respawn(a, px, pz); continue; }
      // yield: brake for the player (or anything) ahead in our lane, else return to cruising speed
      const hx = a.obj.position.x - px, hz = a.obj.position.z - pz;
      const hd = a.obj.userData['hd'] as [number, number] | undefined;
      let blocked = false;
      if (hd) { const ahead = -(hx * hd[0] + hz * hd[1]), side = Math.abs(-hx * hd[1] + hz * hd[0]); blocked = ahead > 0 && ahead < 14 + a.speed * 0.8 && side < 2.4; }
      a.speed = blocked ? Math.max(0, a.speed - 14 * dt) : Math.min(a.cruise, a.speed + 4 * dt);
      a.s += a.speed * dt;
      if (a.s >= a.len - 1 || Math.hypot(a.obj.position.x - px, a.obj.position.z - pz) > 800) { this.respawn(a, px, pz); continue; }
      let i = a.seg; while (i + 1 < a.cum.length - 1 && a.cum[i + 1] < a.s) i++; while (i > 0 && a.cum[i] > a.s) i--; a.seg = i;
      const x0 = a.pts[i * 2], z0 = a.pts[i * 2 + 1], x1 = a.pts[i * 2 + 2], z1 = a.pts[i * 2 + 3];
      const L = Math.hypot(x1 - x0, z1 - z0) || 1, t = (a.s - a.cum[i]) / L, dx = (x1 - x0) / L, dz = (z1 - z0) / L;
      const off = Math.min(a.w / 4, 2.2); // keep left
      const x = x0 + (x1 - x0) * t + dz * off, z = z0 + (z1 - z0) * t - dx * off;
      const h = this.world.calculateRawTerrainHeight(x, z) + 0.12;
      const hf = this.world.calculateRawTerrainHeight(x + dx * 1.6, z + dz * 1.6), hb = this.world.calculateRawTerrainHeight(x - dx * 1.6, z - dz * 1.6);
      a.obj.position.set(x, h, z); a.obj.userData['hd'] = [dx, dz];
      a.obj.quaternion.setFromAxisAngle(up, Math.atan2(dx, dz)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan2(hf - hb, 3.2)));
      a.obj.userData['spin'] = ((a.obj.userData['spin'] as number) || 0) + (a.speed / 0.33) * dt;
      a.obj.traverse((o) => { if (o.name.startsWith('wheel-')) o.rotation.x = a.obj.userData['spin']; });
    }
  }
}
