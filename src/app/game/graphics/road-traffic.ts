import {makeQuantum, makeCoach} from './vehicles-sa';
import { makeCar, PAINTS, CarKind } from './car-gen';
import * as THREE from 'three';
import { AssetLibrary } from './asset-library';
import type { WorldBuilder } from './world-builder';
import { CAR_CATALOG, TRAFFIC_MODELS } from '../cars';
import type { DynamicCollider } from '../physics/collision';
import type { TrafficSignals } from './traffic-signals';

interface Agent { lift?: number; dzs: number[]; cruise: number; obj: THREE.Group; pts: number[]; seg: number; s: number; speed: number; w: number; cum: number[]; len: number; }

/** Ambient traffic that drives the real OSM road geometry, on the left (Eswatini). */
export class RoadTraffic {
  private agents: Agent[] = [];
  private candidates: number[] = [];
  private timer = 0;
  private readonly N = 26;
  public signals?: TrafficSignals;
  private static boxA = new THREE.BoxGeometry(1.8, 0.7, 4.3); private static boxB = new THREE.BoxGeometry(1.5, 0.5, 2.1);
  private static glassMat = new THREE.MeshStandardMaterial({ color: 0x1b2128, roughness: 0.2, metalness: 0.5 });

  constructor(private scene: THREE.Scene, private world: WorldBuilder) {
    world.roadWays.forEach((w, i) => { if (w.c <= 4 && w.p.length >= 6) this.candidates.push(i); });
    this.populate();
  }

  /** Minibus taxis (most common in towns) and long-distance coaches share the same lanes as the car models. */
  private addPublicTransport(): void {
    const stripes = [0x1e5bb8, 0x0e8a4a, 0xd7261e, 0xf2a900, 0x6a2c91];
    for (let i = 0; i < 9; i++) {
      const coach = i >= 7, g = coach ? makeCoach(stripes[i % 5]) : makeQuantum(stripes[i % 5]);
      this.scene.add(g); g.visible = false;
      this.agents.push({ dzs: [], cruise: coach ? 17 : 13, obj: g, pts: [], seg: 0, s: 0, speed: 0, w: 6, cum: [], len: 0 });
    }
  }

  private async populate(): Promise<void> {
    this.addPublicTransport();
    // the real street mix: white/silver sedans, hatches, bakkies and SUVs (generated bodies, ~1.5k triangles, one material)
    const MIX: CarKind[] = ['sedan', 'bakkie', 'hatch', 'suv', 'sedan', 'hatch', 'bakkie', 'sedan', 'suv', 'hatch'];
    for (let i = 0; i < this.N; i++) {
      const kind = MIX[i % MIX.length], col = PAINTS[(i * 7 + 3) % PAINTS.length];
      const g = makeCar(kind, col); g.visible = false;
      { // distance LOD: a two-box silhouette in the car's own colour stands in beyond ~75 m
        const px = new THREE.Group(), bm = new THREE.MeshStandardMaterial({ color: new THREE.Color(col[0], col[1], col[2]), roughness: 0.5, metalness: 0.3 }), gm = RoadTraffic.glassMat;
        const b1 = new THREE.Mesh(RoadTraffic.boxA, bm); b1.position.set(0, 0.62, 0); const b2 = new THREE.Mesh(RoadTraffic.boxB, gm); b2.position.set(0, 1.2, -0.15);
        px.add(b1, b2); px.visible = false; g.add(px); g.userData['proxy'] = px;
      }
      this.scene.add(g);
      this.agents.push({ dzs: [], cruise: 12, obj: g, pts: [], seg: 0, s: 0, speed: 0, w: 6, cum: [], len: 0 });
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
      let rev = false;
      if (!way.o && Math.random() < 0.5) { const r: number[] = []; for (let i = pts.length - 2; i >= 0; i -= 2) r.push(pts[i], pts[i + 1]); pts = r; rev = true; }
      const cum = [0]; for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
      const len = cum[cum.length - 1]; if (len < 40) continue;
      let dzs = way.dz ? way.dz.map((v) => v / 10) : pts.map(() => 0);
      if (rev) dzs = dzs.slice().reverse();
      a.pts = pts; a.cum = cum; a.len = len; a.w = way.w; a.seg = 0; a.dzs = dzs; a.lift = this.world.roadLift(way.c);
      // start at the picked vertex's distance (reverse-aware nearest vertex)
      let best = 0, bd = 1e9; for (let i = 0; i < pts.length; i += 2) { const dd = Math.hypot(pts[i] - x, pts[i + 1] - z); if (dd < bd) { bd = dd; best = i / 2; } }
      a.s = cum[best] * 0.98; a.cruise = (way.c <= 2 ? 15 : 9) + Math.random() * 6; if (way.ms) a.cruise = Math.min(a.cruise, (way.ms * 0.95) / 3.6); a.speed = a.cruise;
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
  /** Headlight emitters for the nearest visible cars: position a few metres ahead of the bonnet. */
  nearestCars(px: number, pz: number, k: number): { x: number; y: number; z: number }[] {
    const o: { d: number; x: number; y: number; z: number }[] = [];
    for (const a of this.agents) { const hd = a.obj.userData['hd'] as [number, number] | undefined; if (!a.obj.visible || !hd) continue; const d = Math.hypot(a.obj.position.x - px, a.obj.position.z - pz); if (d < 90) o.push({ d, x: a.obj.position.x + hd[0] * 4.5, y: a.obj.position.y + 0.8, z: a.obj.position.z + hd[1] * 4.5 }); }
    return o.sort((p, q) => p.d - q.d).slice(0, k);
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
      let want = a.cruise;
      if (hd && this.signals) { const sd = this.signals.stopDistance(a.obj.position.x, a.obj.position.z, hd[0], hd[1], a.speed); if (sd !== null) want = Math.min(want, Math.sqrt(2 * 3.5 * Math.max(0, sd - 2.5))); }
      a.speed = blocked ? Math.max(0, a.speed - 14 * dt) : a.speed > want ? Math.max(want, a.speed - 7 * dt) : Math.min(want, a.speed + 4 * dt);
      a.s += a.speed * dt;
      if (a.s >= a.len - 1 || Math.hypot(a.obj.position.x - px, a.obj.position.z - pz) > 800) { this.respawn(a, px, pz); continue; }
      let i = a.seg; while (i + 1 < a.cum.length - 1 && a.cum[i + 1] < a.s) i++; while (i > 0 && a.cum[i] > a.s) i--; a.seg = i;
      const x0 = a.pts[i * 2], z0 = a.pts[i * 2 + 1], x1 = a.pts[i * 2 + 2], z1 = a.pts[i * 2 + 3];
      const L = Math.hypot(x1 - x0, z1 - z0) || 1, t = (a.s - a.cum[i]) / L, dx = (x1 - x0) / L, dz = (z1 - z0) / L;
      const off = Math.min(a.w / 4, 2.2); // keep left
      const x = x0 + (x1 - x0) * t + dz * off, z = z0 + (z1 - z0) * t - dx * off;
      const dzI = a.dzs.length > i + 1 ? a.dzs[i] + (a.dzs[i + 1] - a.dzs[i]) * t : 0, elev = dzI > 0.25;
      const tg = (px: number, pz: number) => this.world.calculateRawTerrainHeight(elev ? x : px, elev ? z : pz);
      const h = tg(x, z) + (a.lift ?? 0.1) + dzI;
      const hf = tg(x + dx * 1.6, z + dz * 1.6) + (a.lift ?? 0.1) + dzI + (a.dzs[i + 1] - a.dzs[i]) / L * 1.6, hb = tg(x - dx * 1.6, z - dz * 1.6) + (a.lift ?? 0.1) + dzI - (a.dzs[i + 1] - a.dzs[i]) / L * 1.6;
      a.obj.position.set(x, h, z); a.obj.userData['hd'] = [dx, dz];
      a.obj.quaternion.setFromAxisAngle(up, Math.atan2(dx, dz)).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.atan2(hf - hb, 3.2)));
      const dp = Math.hypot(x - px, z - pz), near = dp < 75, car = a.obj.userData['car'] as THREE.Object3D | undefined, proxy = a.obj.userData['proxy'] as THREE.Object3D | undefined;
      if (car) car.visible = near; if (proxy) proxy.visible = !near && dp < 330;          // full model only up close, silhouette to 330 m, then nothing
      if (near) { const sp = ((a.obj.userData['spin'] as number) || 0) + (a.speed / 0.33) * dt; a.obj.userData['spin'] = sp; for (const w of (a.obj.userData['wheels'] as THREE.Object3D[]) ?? []) w.rotation.x = sp; }
    }
  }
}
