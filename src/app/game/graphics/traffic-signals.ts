import * as THREE from 'three';
import type { WorldBuilder } from './world-builder';
import { PAVE_LIFT } from './street-constants';

interface Head { x: number; y: number; z: number; nx: number; nz: number; cluster: number; axis: 0 | 1 }
interface Stop { x: number; z: number; dx: number; dz: number; cluster: number; axis: 0 | 1 }

/**
 * Real signals from OSM: nearby signals are grouped into junctions that run a 2-phase cycle
 * (green 14 s, amber 3 s, all-red 2 s per axis). Lamps are one InstancedMesh recoloured on phase changes;
 * AI cars query stopDistance() and halt at the stop line on red/amber.
 */
export class TrafficSignals {
  private heads: Head[] = []; private grid = new Map<number, Stop[]>(); private offset: number[] = [];
  private lamps?: THREE.InstancedMesh; private t = 0; private lastKey = -1;
  private static readonly G = 14; private static readonly A = 3; private static readonly R = 2; private static readonly CYCLE = 2 * (14 + 3 + 2);

  constructor(private scene: THREE.Scene, private w: WorldBuilder) { this.build(); }

  private build(): void {
    const w = this.w, sigs = w.meta.signals; const clusters: { x: number; z: number; ref: number }[] = [];
    for (const [sx, sz] of sigs) {
      const road = w.nearestRoadSegment(sx, sz, 6); if (!road || road.dist > 25 || road.way.dz) continue;
      const hdg = Math.atan2(road.tz, road.tx);
      let ci = clusters.findIndex((c) => Math.hypot(c.x - sx, c.z - sz) < 45);
      if (ci < 0) { ci = clusters.length; clusters.push({ x: sx, z: sz, ref: hdg }); this.offset.push((ci * 7) % TrafficSignals.CYCLE); }
      let d = Math.abs(hdg - clusters[ci].ref) % Math.PI; if (d > Math.PI / 2) d = Math.PI - d;
      const axis: 0 | 1 = d < Math.PI / 4 ? 0 : 1;
      const nx = -road.tz, nz = road.tx, side = road.way.w / 2 + 0.9, px = sx + nx * side, pz = sz + nz * side;
      if (!w.roadAt(px, pz)) { const yy = w.calculateRawTerrainHeight(px, pz) + (road.way.sw ? PAVE_LIFT : 0) + w.roadLift(road.way.c); this.heads.push({ x: px + nx * 0.19, y: yy + 4.35, z: pz + nz * 0.19, nx, nz, cluster: ci, axis }); }
      for (const dir of [1, -1]) { // an approach each way, stop line 9 m before the junction centre
        const s: Stop = { x: sx - road.tx * 9 * dir, z: sz - road.tz * 9 * dir, dx: road.tx * dir, dz: road.tz * dir, cluster: ci, axis };
        const k = Math.floor(s.x / 50) * 100003 + Math.floor(s.z / 50); let l = this.grid.get(k); if (!l) { l = []; this.grid.set(k, l); } l.push(s);
      }
    }
    if (!this.heads.length) return;
    const geo = new THREE.BoxGeometry(0.06, 0.24, 0.24), mat = new THREE.MeshBasicMaterial({ toneMapped: false });
    this.lamps = new THREE.InstancedMesh(geo, mat, this.heads.length * 3); this.lamps.frustumCulled = false; this.lamps.name = 'signal-lamps';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    this.heads.forEach((h, i) => { q.setFromAxisAngle(up, Math.atan2(-h.nz, h.nx)); for (let k = 0; k < 3; k++) { m.compose(new THREE.Vector3(h.x, h.y - k * 0.37, h.z), q, new THREE.Vector3(1, 1, 1)); this.lamps!.setMatrixAt(i * 3 + k, m); } });
    this.scene.add(this.lamps); this.recolour();
  }

  /** 0 green, 1 amber, 2 red for an axis of a junction at the current clock. */
  state(cluster: number, axis: 0 | 1): 0 | 1 | 2 {
    const T = TrafficSignals.G + TrafficSignals.A + TrafficSignals.R, c = (this.t + this.offset[cluster]) % TrafficSignals.CYCLE, local = axis === 0 ? c : (c - T + TrafficSignals.CYCLE) % TrafficSignals.CYCLE;
    return local < TrafficSignals.G ? 0 : local < TrafficSignals.G + TrafficSignals.A ? 1 : (local < T ? 2 : 2);
  }

  private recolour(): void {
    const l = this.lamps; if (!l) return; const col = [new THREE.Color(1, 0.12, 0.08), new THREE.Color(1, 0.7, 0.1), new THREE.Color(0.1, 0.95, 0.35)], dim = [new THREE.Color(0.18, 0.02, 0.02), new THREE.Color(0.2, 0.14, 0.02), new THREE.Color(0.02, 0.16, 0.06)];
    this.heads.forEach((h, i) => { const s = this.state(h.cluster, h.axis); const lit = s === 0 ? 2 : s === 1 ? 1 : 0; for (let k = 0; k < 3; k++) l.setColorAt(i * 3 + k, k === lit ? col[k] : dim[k]); });
    if (l.instanceColor) l.instanceColor.needsUpdate = true;
  }

  /** Nearest signal heads to a point with the colour they are showing (for the emitter system). */
  nearestHeads(x: number, z: number, k: number): { x: number; y: number; z: number; col: number[] }[] {
    const list = this.heads.map((h) => ({ h, d: Math.hypot(h.x - x, h.z - z) })).filter((o) => o.d < 60).sort((a, b) => a.d - b.d).slice(0, k);
    return list.map(({ h }) => { const st = this.state(h.cluster, h.axis); return { x: h.x, y: h.y - 0.4, z: h.z, col: st === 0 ? [0.2, 1, 0.4] : st === 1 ? [1, 0.72, 0.1] : [1, 0.1, 0.08] }; });
  }

  update(dt: number): void { this.t += dt; const k = Math.floor(this.t); if (k !== this.lastKey) { this.lastKey = k; this.recolour(); } }

  /** Distance to a red/amber stop line ahead of a car at (x,z) heading (hx,hz), or null if free to proceed. */
  stopDistance(x: number, z: number, hx: number, hz: number, speed: number): number | null {
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50); let best: number | null = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = this.grid.get((cx + a) * 100003 + (cz + b)); if (!l) continue;
      for (const s of l) {
        if (s.dx * hx + s.dz * hz < 0.8) continue; const rx = s.x - x, rz = s.z - z, ahead = rx * hx + rz * hz, side = Math.abs(-rx * hz + rz * hx);
        if (ahead < -1.5 || ahead > 40 || side > 5) continue;
        const st = this.state(s.cluster, s.axis); if (st === 0) continue;
        if (st === 1 && ahead < (speed * speed) / (2 * 4.5)) continue; // too close to stop comfortably: carry on through the amber
        if (best === null || ahead < best) best = ahead;
      }
    }
    return best;
  }
}
