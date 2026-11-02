import * as THREE from 'three';
import { addLampLight } from './lamp-light';
import { GeoBuf, slab } from './geo-buf';
import type { WorldBuilder } from './world-builder';

const SZ = 400;
type V3 = [number, number, number];
export interface Features {
  barriers: [number, number[]][]; gates: [number, number, number][]; trees: [number, number][];
  lines: [number, number[]][]; towers: [number, number, number][]; solar: number[][]; subst: number[][];
  cliffs?: [number, number, number[]][]; pitches: [number, number[]][]; pools: number[][]; parking: number[][]; tanks: [number, number, number, number][]; bumps: [number, number][];
}
const rnd = (a: number): number => { const s = Math.sin(a * 12.9898) * 43758.5453; return s - Math.floor(s); };

/** Real OSM barriers, trees, power network, pitches, pools, parking lots, tanks and speed humps. */
export class FeaturesBuilder {
  private bufs = new Map<string, GeoBuf>();
  private wires = new Map<string, number[]>();
  public bumps: { x: number; z: number; tx: number; tz: number; hw: number }[] = [];
  constructor(private w: WorldBuilder, private f: Features) {}

  private buf(x: number, z: number, mat: string): GeoBuf {
    if (mat === 'props') return this.w.propBuf(x, z);
    const k = `${Math.floor(x / SZ)},${Math.floor(z / SZ)}:${mat}`; let b = this.bufs.get(k); if (!b) { b = new GeoBuf(); this.bufs.set(k, b); } return b;
  }
  private h(x: number, z: number): number { return this.w.calculateRawTerrainHeight(x, z); }

  private quad(b: GeoBuf, p: V3[], n: V3, col: number[], uv?: [number, number][]): void {
    const ids = p.map((v, i) => b.vert(v[0], v[1], v[2], n[0], n[1], n[2], uv ? uv[i][0] : v[0] / 3, uv ? uv[i][1] : v[2] / 3, col));
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) { b.tri(ids[0], ids[1], ids[2]); b.tri(ids[0], ids[2], ids[3]); } else { b.tri(ids[0], ids[2], ids[1]); b.tri(ids[0], ids[3], ids[2]); }
  }
  private box(b: GeoBuf, cx: number, y0: number, cz: number, along: number, across: number, hgt: number, tx: number, tz: number, col: number[]): void {
    const nx = -tz, nz = tx, ha = along / 2, hc = across / 2;
    const c = (a: number, s: number): [number, number] => [cx + tx * a + nx * s, cz + tz * a + nz * s];
    const q = [c(-ha, -hc), c(ha, -hc), c(ha, hc), c(-ha, hc)];
    for (let k = 0; k < 4; k++) { const a = q[k], d = q[(k + 1) % 4]; const ex = d[0] - a[0], ez = d[1] - a[1], l = Math.hypot(ex, ez) || 1; this.quad(b, [[a[0], y0, a[1]], [d[0], y0, d[1]], [d[0], y0 + hgt, d[1]], [a[0], y0 + hgt, a[1]]], [ez / l, 0, -ex / l], col); }
    this.quad(b, q.map((p) => [p[0], y0 + hgt, p[1]] as V3), [0, 1, 0], col.map((v) => Math.min(1, v * 1.1)));
  }
  /** A square-section strut between two 3D points (lattice tower members). */
  private beam(b: GeoBuf, a: V3, c: V3, t: number, col: number[]): void {
    const d = [c[0] - a[0], c[1] - a[1], c[2] - a[2]], l = Math.hypot(d[0], d[1], d[2]) || 1, u = [d[0] / l, d[1] / l, d[2] / l];
    const ref = Math.abs(u[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    let s = [u[1] * ref[2] - u[2] * ref[1], u[2] * ref[0] - u[0] * ref[2], u[0] * ref[1] - u[1] * ref[0]]; const sl = Math.hypot(s[0], s[1], s[2]) || 1; s = [s[0] / sl * t, s[1] / sl * t, s[2] / sl * t];
    const v = [u[1] * s[2] - u[2] * s[1], u[2] * s[0] - u[0] * s[2], u[0] * s[1] - u[1] * s[0]];
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    const at = (p: V3, i: number): V3 => [p[0] + s[0] * corners[i][0] + v[0] * corners[i][1], p[1] + s[1] * corners[i][0] + v[1] * corners[i][1], p[2] + s[2] * corners[i][0] + v[2] * corners[i][1]];
    for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; const nrm: V3 = [(s[0] * (corners[i][0] + corners[j][0]) + v[0] * (corners[i][1] + corners[j][1])) / 2, (s[1] * (corners[i][0] + corners[j][0]) + v[1] * (corners[i][1] + corners[j][1])) / 2, (s[2] * (corners[i][0] + corners[j][0]) + v[2] * (corners[i][1] + corners[j][1])) / 2]; const nl = Math.hypot(...nrm) || 1; this.quad(b, [at(a, i), at(a, j), at(c, j), at(c, i)], [nrm[0] / nl, nrm[1] / nl, nrm[2] / nl], col); }
  }

  /** Polygon fill following the terrain at its vertices. */
  private fill(b: GeoBuf, pts: [number, number][], lift: number, col: number[], flatY?: number): void {
    const c2 = pts.map((p) => new THREE.Vector2(p[0], p[1])); const tris = THREE.ShapeUtils.triangulateShape(c2, []); const base = b.pos.length / 3;
    pts.forEach((p) => b.vert(p[0], (flatY ?? this.h(p[0], p[1])) + lift, p[1], 0, 1, 0, p[0] / 3, p[1] / 3, col));
    for (const t of tris) { const [a, c, d] = t; const cr = (pts[c][0] - pts[a][0]) * (pts[d][1] - pts[a][1]) - (pts[c][1] - pts[a][1]) * (pts[d][0] - pts[a][0]); if (cr < 0) b.tri(base + a, base + c, base + d); else b.tri(base + a, base + d, base + c); }
  }
  private line(b: GeoBuf, a: [number, number], c: [number, number], wd: number, lift: number, col: number[]): void {
    const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1, px = -dz / l * wd / 2, pz = dx / l * wd / 2;
    this.quad(b, [[a[0] - px, this.h(a[0], a[1]) + lift, a[1] - pz], [c[0] - px, this.h(c[0], c[1]) + lift, c[1] - pz], [c[0] + px, this.h(c[0], c[1]) + lift, c[1] + pz], [a[0] + px, this.h(a[0], a[1]) + lift, a[1] + pz]], [0, 1, 0], col);
  }
  private poly(p: number[]): [number, number][] { const r: [number, number][] = []; for (let i = 0; i + 1 < p.length; i += 2) r.push([p[i] / 10, p[i + 1] / 10]); if (r.length > 1 && r[0][0] === r[r.length - 1][0] && r[0][1] === r[r.length - 1][1]) r.pop(); return r; }
  private obb(pts: [number, number][]) {
    let cx = 0, cz = 0; pts.forEach((p) => { cx += p[0]; cz += p[1]; }); cx /= pts.length; cz /= pts.length;
    let bl = 0, bi = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > bl) { bl = l; bi = i; } }
    const a = pts[bi], c = pts[(bi + 1) % pts.length]; const ux = (c[0] - a[0]) / bl, uz = (c[1] - a[1]) / bl, vx = -uz, vz = ux;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9; for (const p of pts) { const pu = (p[0] - cx) * ux + (p[1] - cz) * uz, pv = (p[0] - cx) * vx + (p[1] - cz) * vz; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
    let area = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; area += p[0] * q[1] - q[0] * p[1]; }
    return { cx: cx + ux * (u0 + u1) / 2 + vx * (v0 + v1) / 2, cz: cz + uz * (u0 + u1) / 2 + vz * (v0 + v1) / 2, ux, uz, vx, vz, hu: (u1 - u0) / 2, hv: (v1 - v0) / 2, fill: Math.abs(area) / 2 / Math.max(1, (u1 - u0) * (v1 - v0)) };
  }

  build(): void {
    this.barriers(); this.guardrails(); this.realTrees(); this.power(); this.pitches(); this.pools(); this.parking(); this.tanks(); this.humps(); this.cliffs();
    this.flush();
  }

  // ------------------------------------------------------------------ cliffs, ridges, embankments (OSM natural=cliff etc.)
  private cliffs(): void {
    const w = this.w;
    for (const [kind, ht, p] of this.f.cliffs ?? []) {
      const pts = this.poly(p); const col: V3 = kind === 0 ? [0.5, 0.45, 0.4] : [0.42, 0.4, 0.36], col2: V3 = kind === 0 ? [0.36, 0.33, 0.3] : [0.3, 0.3, 0.27];
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], c = pts[i + 1]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 1) continue;
        const tx = (c[0] - a[0]) / L, tz = (c[1] - a[1]) / L, n = Math.max(1, Math.ceil(L / 6));
        for (let k = 0; k < n; k++) {
          const s0 = (L * k) / n, s1 = (L * (k + 1)) / n, mx = a[0] + tx * (s0 + s1) / 2, mz = a[1] + tz * (s0 + s1) / 2, len = s1 - s0;
          if (w.roadAt(mx, mz)) continue;
          const hh = ht * (0.75 + 0.5 * rnd(mx * 0.31 + mz * 0.17)), t = kind === 0 ? 1.6 : 0.9;
          slab(this.buf(mx, mz, 'props'), (px, pz) => this.h(px, pz), mx - tx * len / 2, mz - tz * len / 2, mx + tx * len / 2, mz + tz * len / 2, t, hh, col, col2);
          const nx = -tz * t / 2, nz = tx * t / 2;
          w.collision.addPolygon([mx - tx * len / 2 + nx, mz - tz * len / 2 + nz, mx + tx * len / 2 + nx, mz + tz * len / 2 + nz, mx + tx * len / 2 - nx, mz + tz * len / 2 - nz, mx - tx * len / 2 - nx, mz - tz * len / 2 - nz], this.h(mx, mz) - 1, this.h(mx, mz) + hh);
        }
      }
    }
  }


  // ------------------------------------------------------------------ guardrails on drop-offs (steep fall beside a road): visible W-beam rail + solid collision
  private guardrails(): void {
    const w = this.w, STEP = 8, RAIL: V3 = [0.72, 0.74, 0.76], POST: V3 = [0.5, 0.52, 0.55];
    for (const r of w.roadWays) {
      if (r.c > 4 || r.br || r.u || r.dz || r.bay || r.sw || r.ms) continue;   // rural / trunk roads only: never town streets (pavements, parking bays, humps)
      const p = r.p; const half = r.w / 2 + 0.9;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i] / 10, az = p[i + 1] / 10, cx = p[i + 2] / 10, cz = p[i + 3] / 10, L = Math.hypot(cx - ax, cz - az); if (L < 2) continue;
        const tx = (cx - ax) / L, tz = (cz - az) / L, nx = -tz, nz = tx, n = Math.max(1, Math.round(L / STEP));
        for (let k = 0; k < n; k++) {
          const s0 = (L * k) / n, s1 = (L * (k + 1)) / n, mx = ax + tx * (s0 + s1) / 2, mz = az + tz * (s0 + s1) / 2, len = s1 - s0;
          const yr = w.groundHeightAt(mx, mz);
          for (const sd of [-1, 1]) {
            const ex = mx + nx * sd * half, ez = mz + nz * sd * half;
            if (w.roadAt(ex, ez) || w.roadAt(mx + nx * sd * (half + 2.5), mz + nz * sd * (half + 2.5))) continue;
            const drop = yr - this.h(mx + nx * sd * (half + 3), mz + nz * sd * (half + 3));
            if (drop < 3.5) continue;
            if (w.nearBuildingPublic(mx, mz) || w.nearBuildingPublic(ex, ez)) continue;
            const x0 = ex - tx * len / 2, z0 = ez - tz * len / 2, x1 = ex + tx * len / 2, z1 = ez + tz * len / 2;
            const y0 = this.h(x0, z0), y1 = this.h(x1, z1), ya = Math.max(y0, yr - 0.2), yb = Math.max(y1, yr - 0.2);
            const b = this.buf(mx, mz, 'props');
            this.quad(b, [[x0, ya + 0.45, z0], [x1, yb + 0.45, z1], [x1, yb + 0.85, z1], [x0, ya + 0.85, z0]], [-nz * sd * -1, 0, nx * sd * -1], RAIL);
            this.quad(b, [[x1, yb + 0.45, z1], [x0, ya + 0.45, z0], [x0, ya + 0.85, z0], [x1, yb + 0.85, z1]], [nz * sd * -1, 0, -nx * sd * -1], RAIL);
            this.box(b, x0, Math.min(ya, y0) - 0.1, z0, 0.1, 0.1, ya - Math.min(ya, y0) + 0.95, tx, tz, POST);
            const q = 0.12;
            w.collision.addPolygon([x0 + nx * q, z0 + nz * q, x1 + nx * q, z1 + nz * q, x1 - nx * q, z1 - nz * q, x0 - nx * q, z0 - nz * q], yr - 0.6, yr + 1.0);
            w.markBarrier(mx, mz);
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ barriers
  private barriers(): void {
    const w = this.w;
    const spec = [{ h: 1.4, t: 0.05, c: [0.55, 0.57, 0.6], solid: true }, { h: 1.9, t: 0.24, c: [0.85, 0.83, 0.78], solid: true }, { h: 1.5, t: 0.4, c: [0.62, 0.62, 0.6], solid: true }, { h: 1.3, t: 0.8, c: [0.18, 0.4, 0.15], solid: true }, { h: 1.9, t: 0.08, c: [0.16, 0.17, 0.2], solid: false }];
    for (const [kind, p] of this.f.barriers) {
      const sp = spec[kind]; const pts = this.poly(p);
      for (const q of pts) w.markBarrier(q[0], q[1]);
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], c = pts[i + 1]; const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.3) continue;
        const tx = (c[0] - a[0]) / L, tz = (c[1] - a[1]) / L, n = Math.max(1, Math.ceil(L / 8));
        for (let k = 0; k < n; k++) {
          const s0 = (L * k) / n, s1 = (L * (k + 1)) / n, mx = a[0] + tx * (s0 + s1) / 2, mz = a[1] + tz * (s0 + s1) / 2, len = s1 - s0, y = this.h(mx, mz);
          if (w.roadAt(mx, mz)) continue;
          if (kind === 0 || kind === 4) {
            const mb = this.buf(mx, mz, 'mesh'); const hh = sp.h;
            const ya = this.h(mx - tx * len / 2, mz - tz * len / 2), yb = this.h(mx + tx * len / 2, mz + tz * len / 2);
            this.quad(mb, [[mx - tx * len / 2, ya - 0.05, mz - tz * len / 2], [mx + tx * len / 2, yb - 0.05, mz + tz * len / 2], [mx + tx * len / 2, yb + hh, mz + tz * len / 2], [mx - tx * len / 2, ya + hh, mz - tz * len / 2]], [-tz, 0, tx], kind === 4 ? [0.2, 0.2, 0.22] : [0.75, 0.77, 0.8], [[0, 0], [len / 0.9, 0], [len / 0.9, hh / 0.9], [0, hh / 0.9]]);
            const pb = this.buf(mx, mz, 'props'); { const px0 = mx - tx * len / 2, pz0 = mz - tz * len / 2, g0 = this.h(px0, pz0); this.box(pb, px0, g0 - 0.1, pz0, 0.09, 0.09, hh + 0.2, tx, tz, sp.c); }
          } else {
            const pb = this.buf(mx, mz, 'props');
            slab(pb, (px, pz) => this.h(px, pz), mx - tx * len / 2, mz - tz * len / 2, mx + tx * len / 2, mz + tz * len / 2, sp.t, sp.h, sp.c, kind === 1 ? [sp.c[0] * 0.78, sp.c[1] * 0.78, sp.c[2] * 0.78] : undefined);
          }
          if (sp.solid) { const nx = -tz * Math.max(0.12, sp.t / 2), nz = tx * Math.max(0.12, sp.t / 2); w.collision.addPolygon([mx - tx * len / 2 + nx, mz - tz * len / 2 + nz, mx + tx * len / 2 + nx, mz + tz * len / 2 + nz, mx + tx * len / 2 - nx, mz + tz * len / 2 - nz, mx - tx * len / 2 - nx, mz - tz * len / 2 - nz], y - 0.6, y + sp.h + 0.4); }
        }
      }
    }
    for (const [x, z, k] of this.f.gates) {
      const rd = w.nearestRoadSegment(x, z, 6); const tx = rd?.tx ?? 1, tz = rd?.tz ?? 0, y = this.h(x, z), b = this.buf(x, z, 'props');
      if (k === 2) { this.box(b, x, y, z, 0.22, 0.22, 0.85, 1, 0, [0.9, 0.78, 0.1]); w.collision.addCircle(x, z, 0.18, y - 0.5, y + 1); }
      else if (k === 1) { this.box(b, x, y, z, 0.3, 0.3, 1.1, tx, tz, [0.85, 0.2, 0.15]); this.box(b, x - tz * 0.9, y + 1.0, z + tx * 0.9, 0.12, 1.8, 0.12, tx, tz, [0.95, 0.95, 0.95]); w.collision.addCircle(x, z, 0.25, y - 0.5, y + 1.3); }
      else { this.box(b, x, y, z, 0.5, 0.5, 1.9, tx, tz, [0.8, 0.78, 0.72]); w.collision.addCircle(x, z, 0.3, y - 0.5, y + 2); }
    }
  }

  // ------------------------------------------------------------------ real trees
  private realTrees(): void {
    for (const [x, z] of this.f.trees) this.w.streets.streetTrees.push({ x, z, c: rnd(x * 0.31 + z) < 0.2 ? 10 : 9 });
  }

  // ------------------------------------------------------------------ power
  private tower(x: number, z: number, tx: number, tz: number): void {
    const y = this.h(x, z), b = this.buf(x, z, 'tower'), steel = [0.62, 0.64, 0.68], nx = -tz, nz = tx;
    const P = (a: number, s: number, hh: number): V3 => [x + tx * a + nx * s, y + hh, z + tz * a + nz * s];
    const base = 3.0, top = 0.7, H = 24;
    const legs: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [la, ls] of legs) { const bp = P(la * base, ls * base, 0); bp[1] = this.h(bp[0], bp[2]) - 0.5; this.beam(b, bp, P(la * top, ls * top, H), 0.14, steel); }
    for (const hh of [0, 8, 16, H]) { const r = base + (top - base) * (hh / H); for (let i = 0; i < 4; i++) { const a = legs[i], c = legs[(i + 1) % 4]; this.beam(b, P(a[0] * r, a[1] * r, hh), P(c[0] * r, c[1] * r, hh), 0.07, steel); } }
    for (let lvl = 0; lvl < 3; lvl++) { const h0 = lvl * 8, h1 = h0 + 8, r0 = base + (top - base) * (h0 / H), r1 = base + (top - base) * (h1 / H); for (let i = 0; i < 4; i++) { const a = legs[i], c = legs[(i + 1) % 4]; this.beam(b, P(a[0] * r0, a[1] * r0, h0), P(c[0] * r1, c[1] * r1, h1), 0.06, steel); } }
    for (const hh of [H, H + 3.5]) { this.beam(b, P(0, -7.4 + (hh > H ? 1.6 : 0), hh), P(0, 7.4 - (hh > H ? 1.6 : 0), hh), 0.1, steel); }
    this.beam(b, P(0, 0, H), P(0, 0, H + 9), 0.12, steel);
    this.w.collision.addCircle(x, z, 3.2, y - 1, y + 4);
  }

  private power(): void {
    const w = this.w; const towers: { x: number; z: number; k: number }[] = [];
    const near = (x: number, z: number) => towers.some((t) => Math.hypot(t.x - x, t.z - z) < 20);
    const spans: [number, number, number, number, number][] = [];
    for (const [kind, p] of this.f.lines) {
      const pts = this.poly(p);
      for (let i = 0; i < pts.length; i++) {
        if (!near(pts[i][0], pts[i][1])) towers.push({ x: pts[i][0], z: pts[i][1], k: kind });
        if (i + 1 < pts.length) spans.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], kind]);
      }
    }
    const loose = this.f.towers.filter((t) => !near(t[0], t[1]));
    for (const t of loose) towers.push({ x: t[0], z: t[1], k: t[2] });
    // join isolated towers to their nearest isolated neighbour so lines are not left dangling
    for (const t of loose) {
      let best: { x: number; z: number } | null = null, bd = 520;
      for (const o of loose) { if (o === t) continue; const d = Math.hypot(o[0] - t[0], o[1] - t[1]); if (d < bd && d > 25) { bd = d; best = { x: o[0], z: o[1] }; } }
      if (best && (t[0] < best.x || (t[0] === best.x && t[1] < best.z))) spans.push([t[0], t[1], best.x, best.z, t[2]]);
    }
    for (const t of towers) {
      // face the arms across the line: use the tangent of the nearest span
      let tx = 1, tz = 0, bd = 1e9;
      for (const s of spans) { const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1, u = Math.max(0, Math.min(1, ((t.x - s[0]) * dx + (t.z - s[1]) * dz) / l2)), d = Math.hypot(t.x - s[0] - dx * u, t.z - s[1] - dz * u); if (d < bd) { bd = d; const l = Math.sqrt(l2); tx = dx / l; tz = dz / l; } }
      if (t.k === 0) this.tower(t.x, t.z, tx, tz);
      else { const y = this.h(t.x, t.z), b = this.buf(t.x, t.z, 'props'); this.box(b, t.x, y, t.z, 0.3, 0.3, 9, tx, tz, [0.36, 0.26, 0.17]); this.box(b, t.x, y + 8.3, t.z, 0.14, 2.2, 0.14, tx, tz, [0.3, 0.22, 0.15]); w.collision.addCircle(t.x, t.z, 0.25, y - 1, y + 9); }
    }
    // conductors: 3 sagging wires per span
    for (const [ax, az, bx, bz, kind] of spans) {
      const L = Math.hypot(bx - ax, bz - az); if (L < 10 || L > 900) continue; const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
      const ya = this.h(ax, az) + (kind === 0 ? 24 : 8.4), yb = this.h(bx, bz) + (kind === 0 ? 24 : 8.4);
      const key = `${Math.floor(ax / 1600)},${Math.floor(az / 1600)}`; let arr = this.wires.get(key); if (!arr) { arr = []; this.wires.set(key, arr); }
      for (const o of kind === 0 ? [-6.3, 0, 6.3] : [-0.9, 0, 0.9]) {
        let lx = ax + nx * o, ly = ya, lz = az + nz * o; const sag = Math.min(14, L * L / 9000 + 0.3);
        for (let s = 1; s <= 8; s++) { const t = s / 8, x = ax + (bx - ax) * t + nx * o, zz = az + (bz - az) * t + nz * o, y = ya + (yb - ya) * t - Math.sin(t * Math.PI) * sag; arr.push(lx, ly, lz, x, y, zz); lx = x; ly = y; lz = zz; }
      }
    }
    // solar farms and substations
    for (const p of this.f.solar.slice(0, 200)) { const pts = this.poly(p); if (pts.length < 3) continue; const b = this.buf(pts[0][0], pts[0][1], 'props'); this.fill(b, pts, 0.7, [0.06, 0.1, 0.24]); }
    for (const p of this.f.subst) {
      const pts = this.poly(p); if (pts.length < 3) continue; const o = this.obb(pts), b = this.buf(o.cx, o.cz, 'props'); this.fill(b, pts, 0.06, [0.5, 0.5, 0.5]);
      for (let i = -1; i <= 1; i++) { const x = o.cx + o.ux * i * Math.min(6, o.hu * 0.5), z = o.cz + o.uz * i * Math.min(6, o.hu * 0.5); this.box(b, x, this.h(x, z), z, 2.2, 2.2, 2.6, o.ux, o.uz, [0.38, 0.4, 0.43]); }
    }
  }

  // ------------------------------------------------------------------ sports pitches
  private pitches(): void {
    const w = this.w;
    for (const [sport, p] of this.f.pitches) {
      const pts = this.poly(p); if (pts.length < 3) continue; const o = this.obb(pts), b = this.buf(o.cx, o.cz, 'props'), white = [0.96, 0.96, 0.94];
      const surf = sport === 0 ? [0.2, 0.5, 0.2] : sport === 1 ? [0.18, 0.46, 0.34] : sport === 2 ? [0.7, 0.42, 0.24] : [0.6, 0.27, 0.22];
      this.fill(b, pts, 0.07, surf);
      for (let i = 0; i < pts.length; i++) this.line(b, pts[i], pts[(i + 1) % pts.length], 0.14, 0.1, white);
      const P = (su: number, sv: number): [number, number] => [o.cx + o.ux * su + o.vx * sv, o.cz + o.uz * su + o.vz * sv];
      if (sport === 0 && o.hu > 25 && o.hv > 15) {
        this.line(b, P(0, -o.hv), P(0, o.hv), 0.14, 0.1, white);
        for (let i = 0; i < 28; i++) this.line(b, P(Math.cos((i / 28) * 6.283) * 9.15, Math.sin((i / 28) * 6.283) * 9.15), P(Math.cos(((i + 1) / 28) * 6.283) * 9.15, Math.sin(((i + 1) / 28) * 6.283) * 9.15), 0.14, 0.1, white);
        for (const s of [-1, 1]) { // goals
          const g0 = P(s * o.hu, -3.66), g1 = P(s * o.hu, 3.66), y = this.h(...P(s * o.hu, 0));
          this.box(b, g0[0], y, g0[1], 0.12, 0.12, 2.44, o.ux, o.uz, white); this.box(b, g1[0], y, g1[1], 0.12, 0.12, 2.44, o.ux, o.uz, white);
          this.box(b, (g0[0] + g1[0]) / 2, y + 2.34, (g0[1] + g1[1]) / 2, 0.12, 7.4, 0.12, o.ux, o.uz, white);
          w.collision.addCircle(g0[0], g0[1], 0.12, y - 0.5, y + 2.6); w.collision.addCircle(g1[0], g1[1], 0.12, y - 0.5, y + 2.6);
        }
      } else if (sport === 3 && o.hu > 40 && o.hv > 25) { // athletics: green infield inside the track
        this.fill(b, pts.map((q) => [o.cx + (q[0] - o.cx) * 0.7, o.cz + (q[1] - o.cz) * 0.7] as [number, number]), 0.1, [0.2, 0.5, 0.2]);
      } else if (sport === 2) { // basketball hoops
        for (const s of [-1, 1]) { const q = P(s * (o.hu - 1), 0), y = this.h(q[0], q[1]); this.box(b, q[0], y, q[1], 0.12, 0.12, 3.1, o.ux, o.uz, [0.3, 0.3, 0.32]); this.box(b, q[0] - o.ux * s * 0.3, y + 2.7, q[1] - o.uz * s * 0.3, 0.05, 1.8, 1.05, o.ux, o.uz, [0.95, 0.95, 0.95]); w.collision.addCircle(q[0], q[1], 0.15, y - 0.5, y + 3.2); }
      }
    }
  }

  // ------------------------------------------------------------------ pools
  private pools(): void {
    for (const p of this.f.pools) {
      const pts = this.poly(p); if (pts.length < 3) continue; let mn = 1e9; pts.forEach((q) => { mn = Math.min(mn, this.h(q[0], q[1])); });
      const b = this.buf(pts[0][0], pts[0][1], 'pool'); this.fill(b, pts, 0.04, [0.12, 0.62, 0.82], mn);
      const rb = this.buf(pts[0][0], pts[0][1], 'props'); for (let i = 0; i < pts.length; i++) { const a = pts[i], c = pts[(i + 1) % pts.length]; const dx = c[0] - a[0], dz = c[1] - a[1], l = Math.hypot(dx, dz) || 1; this.quad(rb, [[a[0], mn + 0.06, a[1]], [c[0], mn + 0.06, c[1]], [c[0] - dz / l * 0.35, mn + 0.06, c[1] + dx / l * 0.35], [a[0] - dz / l * 0.35, mn + 0.06, a[1] + dx / l * 0.35]], [0, 1, 0], [0.82, 0.82, 0.8]); }
    }
  }

  // ------------------------------------------------------------------ parking lots
  private parking(): void {
    const w = this.w; const cars: { m: string; x: number; z: number; rot: number }[] = []; const MODELS = ['sedan', 'hatchback-sports', 'suv', 'van', 'taxi', 'delivery'];
    for (const p of this.f.parking) {
      const pts = this.poly(p); if (pts.length < 3) continue; const o = this.obb(pts), b = this.buf(o.cx, o.cz, 'props');
      this.fill(b, pts, 0.05, [0.2, 0.2, 0.21]);
      if (o.fill < 0.72 || o.hu < 6 || o.hv < 4.5) continue;
      const P = (su: number, sv: number): [number, number] => [o.cx + o.ux * su + o.vx * sv, o.cz + o.uz * su + o.vz * sv];
      const depth = 4.8, aisle = 6.2, slotW = 2.6, rows: number[] = [];
      if (o.hv * 2 >= depth * 2 + aisle - 0.5) rows.push(-(aisle / 2 + depth / 2), aisle / 2 + depth / 2); else if (o.hv * 2 >= depth + 3) rows.push(o.hv - depth / 2);
      let slot = 0;
      for (const rv of rows) {
        const sign = rv < 0 ? 1 : -1;
        for (let su = -o.hu + 1; su + slotW <= o.hu - 0.5; su += slotW) {
          const a = P(su, rv - sign * depth / 2 * -1 - depth / 2 * sign * -1), cen = P(su + slotW / 2, rv); const s0 = P(su, rv - depth / 2), s1 = P(su, rv + depth / 2);
          void a; if (!pointIn(pts, cen[0], cen[1])) continue;
          this.line(b, s0, s1, 0.1, 0.09, [0.95, 0.95, 0.92]); slot++;
          if (rnd(cen[0] * 1.7 + cen[1] * 0.9 + slot) < 0.5) cars.push({ m: MODELS[Math.floor(rnd(cen[0] * 3.3 + cen[1]) * MODELS.length)], x: cen[0], z: cen[1], rot: Math.atan2(o.vx * (rv < 0 ? 1 : -1), o.vz * (rv < 0 ? 1 : -1)) });
        }
      }
    }
    void w; if (cars.length) this.w.streets.placeParked(cars);
  }

  // ------------------------------------------------------------------ tanks, silos
  private tanks(): void {
    const w = this.w;
    for (const [x, z, r, kind] of this.f.tanks) {
      const y = this.h(x, z), hgt = kind ? 17 + rnd(x) * 6 : 6 + rnd(z) * 4, b = this.buf(x, z, 'props'), col = kind ? [0.86, 0.84, 0.78] : [0.86, 0.87, 0.88], sides = 14;
      for (let i = 0; i < sides; i++) {
        const a0 = (i / sides) * 6.283, a1 = ((i + 1) / sides) * 6.283, am = (a0 + a1) / 2;
        const P = (a: number, hh: number): V3 => [x + Math.cos(a) * r, y + hh, z + Math.sin(a) * r];
        const lo = (a: number): V3 => { const q = P(a, 0); q[1] = Math.min(this.h(q[0], q[2]), y) - 0.4; return q; }; // each rim point starts on its own ground
        this.quad(b, [lo(a0), lo(a1), P(a1, hgt), P(a0, hgt)], [Math.cos(am), 0, Math.sin(am)], col);
        this.quad(b, [P(a0, hgt), P(a1, hgt), [x, y + hgt + (kind ? 2.4 : 0.6), z], [x, y + hgt + (kind ? 2.4 : 0.6), z]], [0, 1, 0], [col[0] * 0.8, col[1] * 0.8, col[2] * 0.8]);
      }
      w.collision.addCircle(x, z, r, y - 1, y + hgt);
    }
  }

  // ------------------------------------------------------------------ speed humps
  private humps(): void {
    const w = this.w;
    for (const [x, z] of this.f.bumps) {
      const rd = w.nearestRoadSegment(x, z, 6); if (!rd || rd.dist > 12) continue; const tx = rd.tx, tz = rd.tz, nx = -tz, nz = tx, hw = rd.way.w / 2;
      this.bumps.push({ x: rd.px, z: rd.pz, tx, tz, hw });
      const b = this.buf(rd.px, rd.pz, 'props'), y = this.h(rd.px, rd.pz) + w.roadLift(rd.way.c);
      const n = Math.max(4, Math.round(hw * 2 / 0.9));
      for (let i = 0; i < n; i++) { const lat = ((i + 0.5) / n - 0.5) * hw * 2; this.box(b, rd.px + nx * lat, y, rd.pz + nz * lat, 1.7, hw * 2 / n, 0.09, tx, tz, i % 2 ? [0.1, 0.1, 0.1] : [0.95, 0.8, 0.1]); }
    }
  }

  // ------------------------------------------------------------------ emit
  private flush(): void {
    const w = this.w;
    const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const steel = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide }); addLampLight(plain); addLampLight(steel);
    const water = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.04, metalness: 0.25, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!; g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 3;
    g.beginPath(); for (let i = -64; i < 128; i += 16) { g.moveTo(i, 0); g.lineTo(i + 64, 64); g.moveTo(i + 64, 0); g.lineTo(i, 64); } g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
    const mesh = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.7, metalness: 0.4 });
    const mats: Record<string, THREE.Material> = { props: plain, tower: steel, pool: water, mesh };
    this.bufs.forEach((buf, key) => {
      if (buf.empty) return; const [rest, mat] = key.split(':'); const [ix, iz] = rest.split(',').map(Number);
      const m = new THREE.Mesh(buf.toGeometry(true, false), mats[mat]); m.name = 'feat:' + mat; m.receiveShadow = true;
      w.registerChunk(m, (ix + 0.5) * SZ, (iz + 0.5) * SZ, SZ * 0.75, mat === 'tower' ? 2300 : 440); w.landmarksGroup.add(m);
    });
    this.bufs.clear();
    this.wires.forEach((pos, key) => {
      const [ix, iz] = key.split(',').map(Number); const g2 = new THREE.BufferGeometry(); g2.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g2.computeBoundingSphere();
      const l = new THREE.LineSegments(g2, new THREE.LineBasicMaterial({ color: 0x222222 })); w.registerChunk(l, (ix + 0.5) * 1600, (iz + 0.5) * 1600, 1600 * 0.75, 2000); w.landmarksGroup.add(l);
    });
  }
}

function pointIn(pts: [number, number][], x: number, z: number): boolean {
  let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], c = pts[j]; if ((a[1] > z) !== (c[1] > z) && x < ((c[0] - a[0]) * (z - a[1])) / (c[1] - a[1]) + a[0]) ins = !ins; } return ins;
}
