import * as THREE from 'three';
import { GeoBuf } from './geo-buf';
import type { WorldBuilder } from './world-builder';

const CH = 800;
type V3 = [number, number, number];
interface Rail { a: number; p: number[] }

/**
 * More of OpenStreetMap, made physical: the railway (ballast, sleepers, steel) with level crossings,
 * bus shelters at the real stops, speed-limit signs where the map says so, roundabout islands, and viewpoints.
 */
export class ExtrasBuilder {
  private bufs = new Map<string, GeoBuf>();
  constructor(private w: WorldBuilder, private rails: Rail[], private crossings: number[][]) {}

  private static size(mat: string): number { return mat === 'ballast' ? CH : 300; }
  private buf(x: number, z: number, mat: string): GeoBuf {
    if (mat === 'props') return this.w.propBuf(x, z);
    const sz = ExtrasBuilder.size(mat); const k = `${sz}:${Math.floor(x / sz)},${Math.floor(z / sz)}:${mat}`;
    let b = this.bufs.get(k); if (!b) { b = new GeoBuf(); this.bufs.set(k, b); } return b;
  }

  private quad(b: GeoBuf, p: V3[], n: V3, col: number[], uv?: [number, number][]): void {
    const ids = p.map((v, i) => b.vert(v[0], v[1], v[2], n[0], n[1], n[2], uv ? uv[i][0] : v[0], uv ? uv[i][1] : v[2], col));
    const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
    const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) { b.tri(ids[0], ids[1], ids[2]); b.tri(ids[0], ids[2], ids[3]); } else { b.tri(ids[0], ids[2], ids[1]); b.tri(ids[0], ids[3], ids[2]); }
  }

  private box(b: GeoBuf, cx: number, y0: number, cz: number, along: number, across: number, h: number, tx: number, tz: number, col: number[]): void {
    const nx = -tz, nz = tx, ha = along / 2, hc = across / 2;
    const c = (a: number, s: number): [number, number] => [cx + tx * a + nx * s, cz + tz * a + nz * s];
    const q = [c(-ha, -hc), c(ha, -hc), c(ha, hc), c(-ha, hc)];
    for (let k = 0; k < 4; k++) {
      const a = q[k], d = q[(k + 1) % 4]; const ex = d[0] - a[0], ez = d[1] - a[1], l = Math.hypot(ex, ez) || 1;
      this.quad(b, [[a[0], y0, a[1]], [d[0], y0, d[1]], [d[0], y0 + h, d[1]], [a[0], y0 + h, a[1]]], [ez / l, 0, -ex / l], col);
    }
    this.quad(b, q.map((p) => [p[0], y0 + h, p[1]] as V3), [0, 1, 0], col.map((v) => Math.min(1, v * 1.1)));
  }

  build(scene: THREE.Scene): void {
    this.railway();
    this.levelCrossings();
    this.busShelters(); this.regSigns(); this.billboards();
    this.speedSigns(scene);
    this.roundabouts(); this.footbridges(); this.animals();
    this.viewpoints();
    this.flush();
  }

  // ------------------------------------------------------------------ railway
  private railway(): void {
    const w = this.w;
    for (const rl of this.rails) {
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < rl.p.length; i += 2) {
        const x = rl.p[i] / 10, z = rl.p[i + 1] / 10; if (i === 0) { pts.push([x, z]); continue; }
        const [px, pz] = pts[pts.length - 1]; const L = Math.hypot(x - px, z - pz), n = Math.max(1, Math.ceil(L / 4));
        for (let k = 1; k <= n; k++) pts.push([px + ((x - px) * k) / n, pz + ((z - pz) * k) / n]);
      }
      const steel = rl.a ? [0.4, 0.3, 0.24] : [0.62, 0.64, 0.68], sleeper = rl.a ? [0.2, 0.17, 0.13] : [0.26, 0.2, 0.15];
      let acc = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const a = pts[i], c = pts[i + 1]; const seg = Math.hypot(c[0] - a[0], c[1] - a[1]); if (seg < 0.05) continue;
        const tx = (c[0] - a[0]) / seg, tz = (c[1] - a[1]) / seg, nx = -tz, nz = tx;
        const mx = (a[0] + c[0]) / 2, mz = (a[1] + c[1]) / 2;
        const ya = w.calculateRawTerrainHeight(a[0], a[1]) + 0.1, yc = w.calculateRawTerrainHeight(c[0], c[1]) + 0.1;
        // ballast bed 3.6 m wide
        const bb = this.buf(mx, mz, 'ballast'); const hb = 1.8, up: V3 = [0, 1, 0];
        this.quad(bb, [[a[0] - nx * hb, ya, a[1] - nz * hb], [a[0] + nx * hb, ya, a[1] + nz * hb], [c[0] + nx * hb, yc, c[1] + nz * hb], [c[0] - nx * hb, yc, c[1] - nz * hb]], up, [1, 1, 1], [[a[0] - nx * hb, a[1] - nz * hb], [a[0] + nx * hb, a[1] + nz * hb], [c[0] + nx * hb, c[1] + nz * hb], [c[0] - nx * hb, c[1] - nz * hb]]);
        const rb = this.buf(mx, mz, 'rail');
        for (const s of [-0.53, 0.53]) {   // Cape-gauge rails (1.067 m)
          const o = s - 0.045, o2 = s + 0.045, y = 0.07;
          this.quad(rb, [[a[0] + nx * o, ya + y, a[1] + nz * o], [a[0] + nx * o2, ya + y, a[1] + nz * o2], [c[0] + nx * o2, yc + y, c[1] + nz * o2], [c[0] + nx * o, yc + y, c[1] + nz * o]], up, steel);
        }
        // sleepers every ~0.75 m
        acc += seg;
        while (acc >= 0.75) {
          acc -= 0.75; const t = 1 - acc / seg; const sx = a[0] + (c[0] - a[0]) * t, sz = a[1] + (c[1] - a[1]) * t, sy = ya + (yc - ya) * t + 0.035;
          this.quad(rb, [[sx - nx * 1.3 - tx * 0.13, sy, sz - nz * 1.3 - tz * 0.13], [sx + nx * 1.3 - tx * 0.13, sy, sz + nz * 1.3 - tz * 0.13], [sx + nx * 1.3 + tx * 0.13, sy, sz + nz * 1.3 + tz * 0.13], [sx - nx * 1.3 + tx * 0.13, sy, sz - nz * 1.3 + tz * 0.13]], up, sleeper);
        }
      }
    }
  }

  // ------------------------------------------------------------------ level crossings
  private levelCrossings(): void {
    const w = this.w; const seen: number[][] = [];
    for (const [x, z, ang, rw, active] of this.crossings) {
      if (!active) continue; if (seen.some((s) => Math.hypot(s[0] - x, s[1] - z) < 14)) continue; seen.push([x, z]);
      const rd = w.nearestRoadSegment(x, z, 6); if (!rd || rd.dist > 6 || rd.way.dz) continue;
      const tx = Math.sin(ang), tz = Math.cos(ang), nx = -tz, nz = tx; const b = this.buf(x, z, 'props');
      const y = w.calculateRawTerrainHeight(x, z) + w.roadLift(rd.way.c);
      // road planking across the tracks
      this.quad(b, [[x - nx * rw / 2 - tx * 1.9, y + 0.05, z - nz * rw / 2 - tz * 1.9], [x + nx * rw / 2 - tx * 1.9, y + 0.05, z + nz * rw / 2 - tz * 1.9], [x + nx * rw / 2 + tx * 1.9, y + 0.05, z + nz * rw / 2 + tz * 1.9], [x - nx * rw / 2 + tx * 1.9, y + 0.05, z - nz * rw / 2 + tz * 1.9]], [0, 1, 0], [0.18, 0.15, 0.12]);
      // crossbuck + barrier posts either side of the tracks
      for (const side of [-1, 1]) {
        const px = x + tx * 5.2 * side + nx * (rw / 2 + 1.3), pz = z + tz * 5.2 * side + nz * (rw / 2 + 1.3), yy = w.groundHeightAt(px, pz) - 0.05;
        this.box(b, px, yy, pz, 0.09, 0.09, 2.7, tx, tz, [0.8, 0.8, 0.8]);
        for (const r of [-0.62, 0.62]) { const cxr = Math.cos(r), sxr = Math.sin(r); this.box(b, px + nx * 0.06, yy + 2.45, pz + nz * 0.06, 0.04, 1.15, 0.16, tx * cxr - nx * sxr, tz * cxr - nz * sxr, [0.95, 0.95, 0.95]); }
        this.box(b, px, yy + 1.5, pz, 0.12, 0.12, 0.35, tx, tz, [0.85, 0.12, 0.1]); // warning light housing
        w.collision.addCircle(px, pz, 0.12);
      }
    }
  }

  // ------------------------------------------------------------------ real regulatory signs (OSM stop / give way / traffic_sign)
  private regSigns(): void {
    const w = this.w;
    for (const [x, z, kind] of w.meta.signs ?? []) {
      const rd = w.nearestRoadSegment(x, z, 6); if (!rd || rd.dist > 14 || rd.way.dz || rd.way.c > 6) continue;
      const dx = x - rd.px, dz = z - rd.pz; let l = Math.hypot(dx, dz), nx: number, nz: number;
      if (l < 0.5) { nx = -rd.tz; nz = rd.tx; l = 1; } else { nx = dx / l; nz = dz / l; }
      const off = Math.max(rd.way.w / 2 + 0.9, l); const px = rd.px + nx * off, pz = rd.pz + nz * off; if (w.roadAt(px, pz)) continue;
      const y = w.groundHeightAt(px, pz), b = this.buf(px, pz, 'props'), tx = rd.tx, tz = rd.tz;
      this.box(b, px, y, pz, 0.07, 0.07, 2.3, tx, tz, [0.5, 0.52, 0.55]);
      // plate faces oncoming traffic: stop = red, give way = white with red rim, other = yellow warning
      const c: V3 = kind === 0 ? [0.78, 0.08, 0.08] : kind === 1 ? [0.95, 0.95, 0.95] : [0.95, 0.78, 0.1];
      this.box(b, px, y + 1.85, pz, 0.05, 0.62, 0.62, tx, tz, kind === 1 ? [0.8, 0.1, 0.1] : c);
      if (kind === 1) this.box(b, px, y + 1.88, pz, 0.06, 0.4, 0.4, tx, tz, c);
      w.collision.addCircle(px, pz, 0.12);
    }
  }

  // ------------------------------------------------------------------ roadside advertising + shop signs (real positions from Mapillary)
  private billboards(): void {
    const w = this.w; const PAL: V3[] = [[0.85, 0.12, 0.1], [0.1, 0.35, 0.75], [0.95, 0.75, 0.1], [0.1, 0.55, 0.3], [0.95, 0.95, 0.95], [0.9, 0.4, 0.1]];
    (w.meta.bills ?? []).forEach(([x, z, kind], i) => {
      const rd = w.nearestRoadSegment(x, z, 7); if (!rd || rd.dist > 30 || rd.way.dz || w.roadAt(x, z)) return;
      const y = w.groundHeightAt(x, z), b = this.buf(x, z, 'props'), tx = rd.tx, tz = rd.tz, c = PAL[i % PAL.length], steel: V3 = [0.4, 0.42, 0.45];
      if (kind === 0) { // roadside advertising board on a post, wide face toward the road
        this.box(b, x, y, z, 0.14, 0.14, 3.4, tx, tz, steel); this.box(b, x, y + 3.4, z, 3.0, 0.14, 1.0, tx, tz, [0.92, 0.92, 0.92]); this.box(b, x, y + 3.45, z, 2.8, 0.18, 0.9, tx, tz, c);
      } else { this.box(b, x, y, z, 0.08, 0.08, 2.4, tx, tz, steel); this.box(b, x, y + 2.2, z, 1.1, 0.1, 0.55, tx, tz, c); } // shop sign on a post
      w.collision.addCircle(x, z, 0.2);
    });
  }

  // ------------------------------------------------------------------ bus shelters
  private busShelters(): void {
    const w = this.w;
    for (const bs of w.meta.busstops ?? []) {
      const [x, z] = bs.p; const rd = w.nearestRoadSegment(x, z, 6); if (!rd || rd.dist > 18 || rd.way.dz) continue;
      const dx = x - rd.px, dz = z - rd.pz; let l = Math.hypot(dx, dz); let nx: number, nz: number;
      if (l < 0.5) { nx = -rd.tz; nz = rd.tx; l = 1; } else { nx = dx / l; nz = dz / l; }
      const off = Math.max(rd.way.w / 2 + (rd.way.sw ?? 0) + 1.6, l + 1.4); const px = rd.px + nx * off, pz = rd.pz + nz * off;
      if (w.roadAt(px, pz)) continue;
      const tx = rd.tx, tz = rd.tz, b = this.buf(px, pz, 'props');
      // stand on the lowest ground under the 3.8 x 1.7 m footprint (never floating on a slope), pavement-high if on a pavement
      let y = 1e9; for (const [a, c] of [[-1.9, -0.85], [1.9, -0.85], [-1.9, 0.85], [1.9, 0.85], [0, 0]]) y = Math.min(y, w.groundHeightAt(px + tx * a + nx * c, pz + tz * a + nz * c)); y -= 0.04;
      const glass = [0.55, 0.72, 0.78], steel = [0.35, 0.38, 0.42], wood = [0.45, 0.32, 0.2];
      this.box(b, px + nx * 0.7, y, pz + nz * 0.7, 3.4, 0.07, 2.2, tx, tz, glass);          // back panel
      this.box(b, px, y + 2.25, pz, 3.8, 1.7, 0.1, tx, tz, steel);                          // roof
      for (const s of [-1.6, 1.6]) this.box(b, px + tx * s + nx * 0.7, y, pz + tz * s + nz * 0.7, 0.09, 0.09, 2.25, tx, tz, steel);
      this.box(b, px + nx * 0.3, y + 0.42, pz + nz * 0.3, 2.4, 0.42, 0.07, tx, tz, wood);   // bench
      const sx = px + tx * 2.6 - nx * 0.4, sz = pz + tz * 2.6 - nz * 0.4;                     // stop sign pole
      this.box(b, sx, y, sz, 0.07, 0.07, 2.6, tx, tz, steel); this.box(b, sx, y + 2.15, sz, 0.04, 0.5, 0.5, tx, tz, [0.1, 0.32, 0.75]);
      w.collision.addPolygon([px - tx * 1.9 + nx * 0.6, pz - tz * 1.9 + nz * 0.6, px + tx * 1.9 + nx * 0.6, pz + tz * 1.9 + nz * 0.6, px + tx * 1.9 + nx * 0.8, pz + tz * 1.9 + nz * 0.8, px - tx * 1.9 + nx * 0.8, pz - tz * 1.9 + nz * 0.8], y - 1, y + 2.5);
      w.collision.addCircle(sx, sz, 0.12);
    }
  }

  // ------------------------------------------------------------------ speed-limit signs
  private speedSigns(_scene: THREE.Scene): void {
    const w = this.w; const limits = [20, 40, 60, 80, 100, 120];
    const cv = document.createElement('canvas'); cv.width = 768; cv.height = 128; const g = cv.getContext('2d')!;
    limits.forEach((v, i) => {
      const cx = i * 128 + 64; g.fillStyle = '#fff'; g.beginPath(); g.arc(cx, 64, 60, 0, 7); g.fill();
      g.strokeStyle = '#d4101a'; g.lineWidth = 12; g.beginPath(); g.arc(cx, 64, 54, 0, 7); g.stroke();
      g.fillStyle = '#111'; g.font = '800 54px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), cx, 68);
    });
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, toneMapped: false });
    const geo = new GeoBuf(); const pole = this.bufs;
    const place = (x: number, z: number, tx: number, tz: number, hw: number, lim: number) => {
      const idx = Math.max(0, limits.indexOf(limits.reduce((a, c) => (Math.abs(c - lim) < Math.abs(a - lim) ? c : a), 60)));
      const nx = -tz, nz = tx; const px = x - nx * (hw + 1.1), pz = z - nz * (hw + 1.1); // left side for left-hand traffic
      if (w.roadAt(px, pz)) return; const y = w.groundHeightAt(px, pz) - 0.05;
      const b = this.buf(px, pz, 'props'); this.box(b, px, y, pz, 0.08, 0.08, 2.5, tx, tz, [0.55, 0.57, 0.6]); w.collision.addCircle(px, pz, 0.1);
      // face toward the oncoming driver: normal = -tangent
      const fx = -tx, fz = -tz, sx = -fz, sz = fx, u0 = idx / 6, u1 = (idx + 1) / 6, yy = y + 1.6, s = 0.45;
      const i0 = geo.vert(px - sx * s, yy, pz - sz * s, fx, 0, fz, u0, 0, [1, 1, 1]), i1 = geo.vert(px + sx * s, yy, pz + sz * s, fx, 0, fz, u1, 0, [1, 1, 1]);
      const i2 = geo.vert(px + sx * s, yy + s * 2, pz + sz * s, fx, 0, fz, u1, 1, [1, 1, 1]), i3 = geo.vert(px - sx * s, yy + s * 2, pz - sz * s, fx, 0, fz, u0, 1, [1, 1, 1]);
      geo.tri(i0, i1, i2); geo.tri(i0, i2, i3);
    };
    void pole;
    for (const way of w.roadWays) {
      if (!way.ms || way.c > 5 || way.dz) continue; const p = way.p; if (p.length < 4) continue;
      let acc = 1200;
      for (let i = 0; i + 3 < p.length; i += 2) {
        const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L; acc += L;
        if (acc >= 1100) { acc = 0; place(ax + tx * Math.min(6, L * 0.5), az + tz * Math.min(6, L * 0.5), tx, tz, way.w / 2 + (way.sw ?? 0), way.ms); }
        if (!way.o && i + 4 >= p.length) place(bx - tx * Math.min(6, L * 0.5), bz - tz * Math.min(6, L * 0.5), -tx, -tz, way.w / 2 + (way.sw ?? 0), way.ms); // the other direction
      }
    }
    if (!geo.empty) { const m = new THREE.Mesh(geo.toGeometry(false, false), mat); m.name = 'speedsigns'; m.frustumCulled = false; this.w.landmarksGroup.add(m); this.w.registerChunk(m, 0, 0, 1e7, 1e9); }
  }

  // ------------------------------------------------------------------ roundabouts
  private roundabouts(): void {
    const w = this.w; const done: number[][] = [];
    for (const way of w.roadWays) {
      if (!way.rb || way.dz || way.p.length < 8) continue;
      const n = way.p.length / 2, A = [way.p[0] / 10, way.p[1] / 10], B = [way.p[(n >> 1) * 2] / 10, way.p[(n >> 1) * 2 + 1] / 10], C = [way.p[(n - 1) * 2] / 10, way.p[(n - 1) * 2 + 1] / 10];
      const d = 2 * (A[0] * (B[1] - C[1]) + B[0] * (C[1] - A[1]) + C[0] * (A[1] - B[1])); if (Math.abs(d) < 1e-6) continue;
      const ux = ((A[0] ** 2 + A[1] ** 2) * (B[1] - C[1]) + (B[0] ** 2 + B[1] ** 2) * (C[1] - A[1]) + (C[0] ** 2 + C[1] ** 2) * (A[1] - B[1])) / d;
      const uz = ((A[0] ** 2 + A[1] ** 2) * (C[0] - B[0]) + (B[0] ** 2 + B[1] ** 2) * (A[0] - C[0]) + (C[0] ** 2 + C[1] ** 2) * (B[0] - A[0])) / d;
      const R = Math.hypot(A[0] - ux, A[1] - uz); if (R < 6 || R > 70) continue; if (done.some((q) => Math.hypot(q[0] - ux, q[1] - uz) < 6)) continue; done.push([ux, uz]);
      const ri = R - way.w / 2 - 0.9; if (ri < 2.5) continue;
      const y = w.calculateRawTerrainHeight(ux, uz) + w.roadLift(way.c); const b = this.buf(ux, uz, 'props'); const seg = way.c <= 4 ? 40 : 28; const chev = way.c <= 4; // arterial islands get yellow/black chevron kerbs
      const kerb = [0.75, 0.75, 0.73], grass = [0.2, 0.42, 0.16];
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2, c0 = Math.cos(a0), s0 = Math.sin(a0), c1 = Math.cos(a1), s1 = Math.sin(a1), am = (a0 + a1) / 2;
        const P = (r: number, c: number, s: number, yy: number): V3 => [ux + c * r, yy, uz + s * r];
        this.quad(b, [P(ri, c0, s0, y), P(ri, c1, s1, y), P(ri, c1, s1, y + 0.22), P(ri, c0, s0, y + 0.22)], [Math.cos(am), 0, Math.sin(am)], chev ? (i % 2 ? [0.08, 0.08, 0.08] : [0.95, 0.78, 0.08]) : kerb);
        this.quad(b, [P(ri, c0, s0, y + 0.22), P(ri, c1, s1, y + 0.22), P(0.01, 0, 0, y + 0.3), P(0.01, 0, 0, y + 0.3)], [0, 1, 0], grass);
      }
      w.collision.addCircle(ux, uz, ri + 0.05, y - 0.3, y + 1.5);
      if (ri > 4) w.streets.streetTrees.push({ x: ux, z: uz, c: 9 });
    }
  }

  // ------------------------------------------------------------------ pedestrian footbridges (steel, over arterial roads at out-of-town bus stops, as on the MR3)
  private footbridges(): void {
    const cx0 = (v: number): number => v;
    const w = this.w, sn = (w.meta.snaps ?? {}) as Record<string, [number, number]>; const placed: number[][] = []; const steel: V3 = [0.62, 0.64, 0.68], rail: V3 = [0.5, 0.52, 0.56];
    for (const bs of w.meta.busstops ?? []) {
      if (placed.length >= 6) break; const [x, z] = bs.p;
      if (['manzini', 'mbabane'].some((k) => sn[k] && Math.hypot(sn[k][0] - x, sn[k][1] - z) < 700)) continue;
      if (placed.some((q) => Math.hypot(q[0] - x, q[1] - z) < 900)) continue;
      const rd = w.nearestRoadSegment(x, z, 3); if (!rd || rd.dist > 25 || rd.way.dz || rd.way.w < 6) continue;
      placed.push([x, z]); w.footSpots.push([Math.round(cx0(x)), Math.round(z)]); const nx = -rd.tz, nz = rd.tx, half = rd.way.w / 2 + 3.2, cx = rd.px, cz = rd.pz, y = w.groundHeightAt(cx, cz), b = this.buf(cx, cz, 'props'), top = 5.6;
      this.box(b, cx, y + top, cz, half * 2, 2.0, 0.3, nx, nz, steel);                                              // deck
      for (const o of [-0.95, 0.95]) this.box(b, cx + rd.tx * o, y + top + 0.3, cz + rd.tz * o, half * 2, 0.08, 1.3, nx, nz, rail); // side screens
      this.box(b, cx, y + top + 1.6, cz, half * 2, 2.1, 0.1, nx, nz, [0.55, 0.57, 0.6]);                          // roof
      for (const e of [-1, 1]) {
        const ex = cx + nx * half * e, ez = cz + nz * half * e, gy = w.groundHeightAt(ex, ez);
        this.box(b, ex, gy, ez, 0.5, 0.5, top, rd.tx, rd.tz, steel); w.collision.addCircle(ex, ez, 0.4);
        for (let k = 1; k <= 8; k++) this.box(b, ex + nx * e * (0.9 + k * 0.45), gy + top - k * (top / 9), ez + nz * e * (0.9 + k * 0.45), 0.45, 1.6, 0.14, nx, nz, rail); // stair run
      }
    }
  }

  // ------------------------------------------------------------------ roadside livestock (rural verges: cattle, goats), static low-poly
  private animals(): void {
    const w = this.w; let made = 0; const COW: V3[] = [[0.42, 0.28, 0.2], [0.08, 0.08, 0.08], [0.82, 0.8, 0.74], [0.6, 0.42, 0.25]], GOAT: V3[] = [[0.85, 0.82, 0.76], [0.35, 0.28, 0.22], [0.12, 0.12, 0.12]];
    const hash = (a: number, c: number): number => { const t = Math.sin(a * 12.9898 + c * 78.233) * 43758.5453; return t - Math.floor(t); };
    for (const way of w.roadWays) {
      if (way.c < 3 || way.c > 6 || way.dz || way.br || made > 260) continue;
      const p = way.p;
      for (let i = 0; i + 3 < p.length; i += 4) {
        const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az); if (L < 20) continue;
        if (hash(ax, az) > 0.1 || w.buildingsNear(ax, az) > 1 || Math.hypot(ax, az) < 1500) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L, side = hash(az, ax) > 0.5 ? 1 : -1, off = way.w / 2 + 6 + hash(ax, 1) * 8, goats = hash(ax, 3) > 0.5, n = 2 + Math.floor(hash(az, 7) * 4);
        for (let k = 0; k < n; k++) {
          const u = hash(ax + k, az) * L * 0.8, v = off + hash(az + k, ax) * 5, x = ax + tx * u - tz * side * v, z = az + tz * u + tx * side * v; if (w.roadAt(x, z) || w.buildingsNear(x, z) > 0) continue;
          const y = w.calculateRawTerrainHeight(x, z), rot = Math.atan2(tz, tx) + hash(x, z) * 6.28, c = (goats ? GOAT : COW)[Math.floor(hash(x, z) * (goats ? 3 : 4))], b = this.buf(x, z, 'props'), sc = goats ? 0.55 : 1;
          const fx = Math.cos(rot), fz = Math.sin(rot);
          this.box(b, x, y + 0.62 * sc, z, 1.9 * sc, 0.7 * sc, 0.7 * sc, fx, fz, c);                                  // body
          this.box(b, x + fx * 1.15 * sc, y + 0.85 * sc, z + fz * 1.15 * sc, 0.45 * sc, 0.34 * sc, 0.4 * sc, fx, fz, c); // head
          for (const [lu, lv] of [[0.7, 0.22], [0.7, -0.22], [-0.7, 0.22], [-0.7, -0.22]]) this.box(b, x + fx * lu * sc - fz * lv * sc, y, z + fz * lu * sc + fx * lv * sc, 0.13 * sc, 0.13 * sc, 0.65 * sc, fx, fz, c);
          w.collision.addCircle(x, z, 0.55 * sc + 0.15); made++; w.animalSpots.push([Math.round(x), Math.round(z)]);
        }
      }
    }
  }

  // ------------------------------------------------------------------ viewpoints
  private viewpoints(): void {
    const w = this.w;
    for (const v of w.meta.views ?? []) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 112; const g = c.getContext('2d')!;
      g.fillStyle = 'rgba(9,9,11,.85)'; g.beginPath(); g.roundRect(4, 6, 504, 100, 26); g.fill(); g.strokeStyle = '#22d3ee'; g.lineWidth = 4; g.stroke();
      g.fillStyle = '#22d3ee'; g.font = '700 22px sans-serif'; g.textAlign = 'center'; g.fillText('VIEWPOINT', 256, 36);
      g.fillStyle = '#fff'; g.font = '800 38px sans-serif'; g.fillText(v.n.slice(0, 22), 256, 82);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: false })); s.scale.set(36, 7.9, 1);
      const y = w.calculateRawTerrainHeight(v.p[0], v.p[1]); s.position.set(v.p[0], y + 26, v.p[1]);
      w.landmarksGroup.add(s); w.registerChunk(s, v.p[0], v.p[1], 0, 1400);
      const b = this.buf(v.p[0], v.p[1], 'props');
      this.box(b, v.p[0], y, v.p[1], 0.25, 0.25, 22, 1, 0, [0.13, 0.83, 0.93]); // a tall cyan marker pole you can spot from the road
    }
  }

  // ------------------------------------------------------------------ emit
  private flush(): void {
    const w = this.w;
    const ballast = w.pbr('gravel_road', 4, 0.95); ballast.polygonOffset = true; ballast.polygonOffsetFactor = -1; ballast.polygonOffsetUnits = -1;
    const plain = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.2, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.bufs.forEach((buf, key) => {
      if (buf.empty) return; const [szs, rest, mat] = key.split(':'); const sz = Number(szs); const [ix, iz] = rest.split(',').map(Number);
      const mesh = new THREE.Mesh(buf.toGeometry(mat !== 'ballast', false), mat === 'ballast' ? ballast : plain); mesh.name = 'extra:' + mat; mesh.receiveShadow = true;
      w.registerChunk(mesh, (ix + 0.5) * sz, (iz + 0.5) * sz, sz * 0.75, mat === 'ballast' ? 1300 : mat === 'rail' ? 700 : 480); w.landmarksGroup.add(mesh);
    });
    this.bufs.clear();
  }
}
