import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { GeoBuf } from './geo-buf';
import { AssetLibrary } from './asset-library';
import type { WorldBuilder } from './world-builder';

const CH = 800;
const rnd = (a: number): number => { const s = Math.sin(a * 12.9898) * 43758.5453; return s - Math.floor(s); };
const PARKED = ['sedan', 'hatchback-sports', 'suv', 'van', 'taxi', 'delivery', 'sedan', 'suv-luxury', 'truck-flat'];

/**
 * Everything that makes the streets feel lived-in: kerbed pavements (also solid for physics), street trees,
 * wooden utility poles with sagging wires, parked cars, traffic lights, zebra crossings, clouds.
 */
export class StreetBuilder {
  public static readonly PAVE_LIFT = 0.15; // kerb height above the road surface
  private bufs = new Map<string, Map<string, GeoBuf>>();
  public streetTrees: { x: number; z: number; c: number }[] = [];
  private parkedList: { m: string; x: number; z: number; rot: number }[] = [];
  private wires = new Map<string, number[]>();

  constructor(private w: WorldBuilder) {}

  private static size(mat: string): number { return mat === 'props' || mat === 'decal' ? 300 : CH; }
  private buf(x: number, z: number, mat: string): GeoBuf {
    if (mat === 'props') return this.w.propBuf(x, z);
    const sz = StreetBuilder.size(mat);
    const k = `${sz}:${Math.floor(x / sz)},${Math.floor(z / sz)}`;
    let m = this.bufs.get(k); if (!m) { m = new Map(); this.bufs.set(k, m); }
    let b = m.get(mat); if (!b) { b = new GeoBuf(); m.set(mat, b); }
    return b;
  }

  build(scene: THREE.Scene): void {
    const w = this.w;
    const pave1 = w.pbr('herringbone_pavement_03', 2.4, 0.85), pave2 = w.pbr('concrete_pavement', 3, 0.9);
    for (const m of [pave1, pave2]) { m.polygonOffset = true; m.polygonOffsetFactor = -3; m.polygonOffsetUnits = -3;  }
    const curb = new THREE.MeshStandardMaterial({ color: 0x9a9a98, roughness: 0.85, vertexColors: false });
    const props = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.15, side: THREE.DoubleSide });
    const decal = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
    const mats: Record<string, THREE.Material> = { pave1, pave2, curb, props, decal };

    this.sidewalks();
    this.parkingBays();
    this.poles();
    this.signals();
    this.carsAndTrees();

    this.bufs.forEach((m, key) => {
      const [szs, rest] = key.split(':'); const sz = Number(szs); const [ix, iz] = rest.split(',').map(Number); const cx = (ix + 0.5) * sz, cz = (iz + 0.5) * sz;
      m.forEach((buf, mk) => {
        if (buf.empty) return;
        const mesh = new THREE.Mesh(buf.toGeometry(mk === 'props', false), mats[mk]);
        mesh.name = 'street:' + mk; mesh.receiveShadow = true;
        w.registerChunk(mesh, cx, cz, sz * 0.75, mk === 'props' ? 420 : mk === 'decal' ? 450 : 750);
        w.landmarksGroup.add(mesh);
      });
    });
    this.bufs.clear();
    this.wires.forEach((pos, key) => {
      const [ix, iz] = key.split(',').map(Number);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeBoundingSphere();
      const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0x1b1b1b })); w.registerChunk(l, (ix + 0.5) * CH, (iz + 0.5) * CH, CH * 0.75, 450); w.landmarksGroup.add(l);
    });
    this.makeClouds(scene);
  }

  // ------------------------------------------------------------------ helpers
  private resample(p: number[], step: number): [number, number][] {
    const pts: [number, number][] = [];
    for (let i = 0; i + 1 < p.length; i += 2) {
      const x = p[i] / 10, z = p[i + 1] / 10; if (i === 0) { pts.push([x, z]); continue; }
      const [px, pz] = pts[pts.length - 1]; const L = Math.hypot(x - px, z - pz), n = Math.max(1, Math.ceil(L / step));
      for (let k = 1; k <= n; k++) pts.push([px + ((x - px) * k) / n, pz + ((z - pz) * k) / n]);
    }
    return pts;
  }

  private urban(x: number, z: number): boolean { return this.w.buildingsNear(x, z) >= 4; }

  // ------------------------------------------------------------------ pavements
  private sidewalks(): void {
    const w = this.w; const lift = (c: number) => w.roadLift(c);
    for (const way of w.roadWays) {
      if (way.c < 1 || way.c > 6 || way.u || way.dz) continue;
      const pts = this.resample(way.p, 8); if (pts.length < 2) continue;
      const sw = way.c <= 2 ? 2.6 : way.c <= 4 ? 2.1 : 1.6, hw = way.w / 2;
      const L: [number, number][][] = [[], []];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        L[0].push([-tz, tx]); L[1].push([tz, -tx]);
      }
      let any = false;
      for (let i = 0; i + 1 < pts.length; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
        if (!this.urban(mx, mz)) continue;
        const useBrick = Math.hypot(mx + 750, mz + 210) < 1100;
        const y0 = lift(way.c);
        for (const side of [0, 1]) {
          const n0 = L[side][i], n1 = L[side][i + 1];
          const ax = pts[i][0] + n0[0] * (hw + 0.05), az = pts[i][1] + n0[1] * (hw + 0.05), bx = pts[i + 1][0] + n1[0] * (hw + 0.05), bz = pts[i + 1][1] + n1[1] * (hw + 0.05);
          const cx = pts[i][0] + n0[0] * (hw + sw), cz = pts[i][1] + n0[1] * (hw + sw), dx = pts[i + 1][0] + n1[0] * (hw + sw), dz = pts[i + 1][1] + n1[1] * (hw + sw);
          // skip where the strip would cut across another carriageway (junction mouths become dropped kerbs)
          const ox = (cx + dx) / 2, oz = (cz + dz) / 2; const r = w.roadAt(ox, oz); if (r && r !== way) continue;
          const r2 = w.roadAt((ax + bx) / 2 + n0[0] * 0.6, (az + bz) / 2 + n0[1] * 0.6); if (r2 && r2 !== way) continue;
          any = true;
          const ya = w.calculateRawTerrainHeight(ax, az) + y0, yb = w.calculateRawTerrainHeight(bx, bz) + y0, yc = w.calculateRawTerrainHeight(cx, cz) + y0, yd = w.calculateRawTerrainHeight(dx, dz) + y0;
          const H = StreetBuilder.PAVE_LIFT, top = useBrick ? 'pave1' : 'pave2';
          const tb = this.buf(mx, mz, top); const wh = [1, 1, 1];
          const t0 = tb.vert(ax, ya + H, az, 0, 1, 0, ax, az, wh), t1 = tb.vert(bx, yb + H, bz, 0, 1, 0, bx, bz, wh), t2 = tb.vert(cx, yc + H, cz, 0, 1, 0, cx, cz, wh), t3 = tb.vert(dx, yd + H, dz, 0, 1, 0, dx, dz, wh);
          if (side === 0) { tb.tri(t0, t1, t2); tb.tri(t1, t3, t2); } else { tb.tri(t0, t2, t1); tb.tri(t1, t2, t3); }
          // kerb face toward the road
          const cb = this.buf(mx, mz, 'curb'); const nxv = -n0[0], nzv = -n0[1];
          const k0 = cb.vert(ax, ya, az, nxv, 0, nzv, 0, 0, wh), k1 = cb.vert(bx, yb, bz, nxv, 0, nzv, 0, 0, wh), k2 = cb.vert(bx, yb + H, bz, nxv, 0, nzv, 0, 0, wh), k3 = cb.vert(ax, ya + H, az, nxv, 0, nzv, 0, 0, wh);
          if (side === 0) { cb.tri(k0, k1, k2); cb.tri(k0, k2, k3); } else { cb.tri(k0, k2, k1); cb.tri(k0, k3, k2); }
        }
      }
      if (any) (way as unknown as { sw?: number }).sw = sw;
    }
  }

  // ------------------------------------------------------------------ parking bays
  /** Painted parallel bays in the 2.4 m parking lane on both sides of every town street, with cars in many of them. */
  private parkingBays(): void {
    const w = this.w, BAY = 5.6, LANE = 2.4;
    for (const way of w.roadWays) {
      if (!way.bay || way.dz) continue;
      const pts = this.resample(way.p, 2); if (pts.length < 2) continue; const hw = way.w / 2;
      for (const side of [1, -1]) {
        let acc = BAY; let slot = 0;
        for (let i = 0; i + 1 < pts.length; i++) {
          const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (L < 0.01) continue;
          const tx = (pts[i + 1][0] - pts[i][0]) / L, tz = (pts[i + 1][1] - pts[i][1]) / L, nx = -tz * side, nz = tx * side;
          // inner line (every 2 m piece) + a tick every BAY metres
          const mx = pts[i][0], mz = pts[i][1]; const c0 = (hw - LANE);
          const ox = mx + nx * c0, oz = mz + nz * c0; if (w.roadAt(ox + nx * 1.2, oz + nz * 1.2) !== way) { acc = BAY; continue; }
          const db = this.buf(mx, mz, 'decal'); const y = (px: number, pz: number) => w.calculateRawTerrainHeight(px, pz) + w.roadLift(way.c) + 0.03;
          const line = (ax: number, az: number, bx: number, bz: number, wd: number) => {
            const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, px = -dz / l * wd / 2, pz = dx / l * wd / 2;
            const i0 = db.vert(ax - px, y(ax, az), az - pz, 0, 1, 0, 0, 0, [1, 1, 1]), i1 = db.vert(bx - px, y(bx, bz), bz - pz, 0, 1, 0, 0, 0, [1, 1, 1]), i2 = db.vert(bx + px, y(bx, bz), bz + pz, 0, 1, 0, 0, 0, [1, 1, 1]), i3 = db.vert(ax + px, y(ax, az), az + pz, 0, 1, 0, 0, 0, [1, 1, 1]);
            db.tri(i0, i2, i1); db.tri(i0, i3, i2);
          };
          const ex = pts[i + 1][0] + nx * c0, ez = pts[i + 1][1] + nz * c0;
          line(ox, oz, ex, ez, 0.13);
          acc += L;
          if (acc >= BAY) {
            acc -= BAY; slot++;
            line(ox, oz, ox + nx * LANE, oz + nz * LANE, 0.12);
            // a car in roughly 55% of the bays, parked square in the slot
            const h = rnd(mx * 1.7 + mz * 0.9 + slot);
            if (h < 0.55 && this.urban(mx, mz)) {
              const cx = mx + nx * (c0 + LANE / 2) - tx * BAY * 0.5, cz = mz + nz * (c0 + LANE / 2) - tz * BAY * 0.5;
              if (!w.nearBuildingPublic(cx, cz) || true) this.parkedList.push({ m: PARKED[Math.floor(rnd(cx * 3.3 + cz) * PARKED.length)], x: cx, z: cz, rot: Math.atan2(tx, tz) + (side > 0 ? 0 : Math.PI) });
            }
          }
        }
      }
    }
  }

  // ------------------------------------------------------------------ utility poles + wires
  private poles(): void {
    const w = this.w; const wood = [0.36, 0.26, 0.17], arm = [0.3, 0.22, 0.15];
    for (const way of w.roadWays) {
      if (way.c < 4 || way.c > 6 || way.u || way.dz) continue;
      const pts = this.resample(way.p, 4); let acc = 0; let prev: [number, number, number] | null = null;
      for (let i = 0; i + 1 < pts.length; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); acc += L;
        if (acc < 42) continue; acc = 0;
        const tx = (pts[i + 1][0] - pts[i][0]) / L, tz = (pts[i + 1][1] - pts[i][1]) / L;
        const off = way.w / 2 + (way.sw ?? 0) + 1.3, px = pts[i][0] - tz * off, pz = pts[i][1] + tx * off;
        if (Math.hypot(px + 750, pz + 210) > 2300 || !this.urban(px, pz) || w.roadAt(px, pz)) { prev = null; continue; }
        const y = w.calculateRawTerrainHeight(px, pz), b = this.buf(px, pz, 'props'); const rot = Math.atan2(tz, tx);
        this.box(b, px, y, pz, 0.26, 8.2, 0.26, rot, wood); this.box(b, px, y + 7.5, pz, 0.14, 0.14, 2.0, rot, arm);
        w.collision.addCircle(px, pz, 0.2);
        const top: [number, number, number] = [px, y + 7.6, pz];
        if (prev && Math.hypot(top[0] - prev[0], top[2] - prev[2]) < 70) {
          const key = `${Math.floor(px / CH)},${Math.floor(pz / CH)}`; let arr = this.wires.get(key); if (!arr) { arr = []; this.wires.set(key, arr); }
          for (const o of [-0.8, 0, 0.8]) {
            const sx = prev[0] - tz * o, sz = prev[2] + tx * o, ex = top[0] - tz * o, ez = top[2] + tx * o;
            let lx = sx, ly = prev[1], lz = sz;
            for (let s = 1; s <= 6; s++) { const t = s / 6, x = sx + (ex - sx) * t, zz = sz + (ez - sz) * t, yy = prev[1] + (top[1] - prev[1]) * t - Math.sin(t * Math.PI) * 0.7; arr.push(lx, ly, lz, x, yy, zz); lx = x; ly = yy; lz = zz; }
          }
        }
        prev = top;
      }
    }
  }

  private box(b: GeoBuf, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, col: number[]): void {
    const c = Math.cos(rot), s = Math.sin(rot), hx = sx / 2, hz = sz / 2;
    const cr = (lx: number, lz: number): [number, number] => [x + lx * c - lz * s, z + lx * s + lz * c];
    const q = [cr(-hx, -hz), cr(hx, -hz), cr(hx, hz), cr(-hx, hz)];
    for (let k = 0; k < 4; k++) {
      const a = q[k], d = q[(k + 1) % 4]; const ex = d[0] - a[0], ez = d[1] - a[1], l = Math.hypot(ex, ez) || 1, nx = ez / l, nz = -ex / l;
      const i0 = b.vert(a[0], y, a[1], nx, 0, nz, 0, 0, col), i1 = b.vert(d[0], y, d[1], nx, 0, nz, 0, 0, col), i2 = b.vert(d[0], y + sy, d[1], nx, 0, nz, 0, 0, col), i3 = b.vert(a[0], y + sy, a[1], nx, 0, nz, 0, 0, col);
      b.tri(i0, i2, i1); b.tri(i0, i3, i2);
    }
    const t = col.map((v) => Math.min(1, v * 1.1)); const j = q.map((p) => b.vert(p[0], y + sy, p[1], 0, 1, 0, 0, 0, t));
    b.tri(j[0], j[2], j[1]); b.tri(j[0], j[3], j[2]);
  }

  // ------------------------------------------------------------------ traffic lights + zebra crossings
  private signals(): void {
    const w = this.w;
    for (const [sx, sz] of w.meta.signals) {
      const road = w.nearestRoadSegment(sx, sz, 6); if (!road || road.dist > 25 || road.way.dz) continue;
      const { tx, tz, way } = road; const nx = -tz, nz = tx;
      const y = w.calculateRawTerrainHeight(sx, sz) + w.roadLift(way.c);
      // zebra crossing 7 m before and after the junction centre
      for (const off of [-8, 8]) {
        const cx = sx + tx * off, cz = sz + tz * off; if (w.roadAt(cx, cz)?.c !== undefined && w.roadAt(cx, cz) !== way) continue;
        const db = this.buf(cx, cz, 'decal');
        const n = Math.floor(way.w / 1.0);
        for (let k = 0; k < n; k++) {
          const lat = (k - (n - 1) / 2) * 1.0, px = cx + nx * lat, pz = cz + nz * lat; const yy = w.calculateRawTerrainHeight(px, pz) + w.roadLift(way.c) + 0.025;
          const hl = 1.6, hwid = 0.25;
          const a = [px - tx * hl - nx * hwid, pz - tz * hl - nz * hwid], b2 = [px + tx * hl - nx * hwid, pz + tz * hl - nz * hwid], c2 = [px + tx * hl + nx * hwid, pz + tz * hl + nz * hwid], d2 = [px - tx * hl + nx * hwid, pz - tz * hl + nz * hwid];
          const i0 = db.vert(a[0], yy, a[1], 0, 1, 0, 0, 0, [1, 1, 1]), i1 = db.vert(b2[0], yy, b2[1], 0, 1, 0, 0, 0, [1, 1, 1]), i2 = db.vert(c2[0], yy, c2[1], 0, 1, 0, 0, 0, [1, 1, 1]), i3 = db.vert(d2[0], yy, d2[1], 0, 1, 0, 0, 0, [1, 1, 1]);
          db.tri(i0, i2, i1); db.tri(i0, i3, i2);
        }
      }
      // signal pole at the kerb with a 3-lamp head
      const side = way.w / 2 + 0.9, px = sx + nx * side, pz = sz + nz * side;
      if (w.roadAt(px, pz)) continue;
      const b = this.buf(px, pz, 'props'); const yy = w.calculateRawTerrainHeight(px, pz) + (way.sw ? StreetBuilder.PAVE_LIFT : 0) + w.roadLift(way.c);
      const rot = Math.atan2(tz, tx);
      this.box(b, px, yy, pz, 0.16, 4.6, 0.16, rot, [0.25, 0.26, 0.28]); this.box(b, px, yy + 3.5, pz, 0.45, 1.15, 0.35, rot, [0.08, 0.08, 0.09]);
      // lamps are animated by TrafficSignals (instanced), the pole and housing stay static
      w.collision.addCircle(px, pz, 0.2);
    }
  }

  // ------------------------------------------------------------------ parked cars + street trees
  private carsAndTrees(): void {
    const w = this.w; const parked = this.parkedList;
    for (const way of w.roadWays) {
      if (way.c < 3 || way.c > 6 || way.u || way.dz) continue;
      const pts = this.resample(way.p, 3); let acc = 0, accT = 0, k = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); const tx = (pts[i + 1][0] - pts[i][0]) / L, tz = (pts[i + 1][1] - pts[i][1]) / L;
        acc += L; accT += L;
        const mx = pts[i][0], mz = pts[i][1];
        if (accT >= 19 && this.urban(mx, mz)) {
          accT = 0; k++;
          const side = k % 2 ? 1 : -1, off = way.w / 2 + (way.sw ?? 0) + 1.5; const px = mx - tz * off * side, pz = mz + tx * off * side;
          if (!w.roadAt(px, pz) && !w.nearBuildingPublic(px, pz) && !this.streetTrees.some((t) => Math.abs(t.x - px) < 4 && Math.abs(t.z - pz) < 4) && Math.hypot(mx + 750, mz + 210) < 3200)
            this.streetTrees.push({ x: px, z: pz, c: rnd(px * 3 + pz) > 0.55 ? 10 : 9 });
        }
        if (!way.bay && acc >= 14 + rnd(mx + mz * 3) * 16) {
          acc = 0; if (rnd(mx * 1.3 + mz) > 0.3 || Math.hypot(mx + 750, mz + 210) > 2000 || !this.urban(mx, mz)) continue;
          const side = rnd(mx + mz) > 0.5 ? 1 : -1, off = way.w / 2 - 1.15; const px = mx - tz * off * side, pz = mz + tx * off * side;
          if (w.distToRoad(px, pz, 6) < off - 0.8 - 1 && way.w < 6) continue;
          parked.push({ m: PARKED[Math.floor(rnd(mx * 9 + mz) * PARKED.length)], x: px, z: pz, rot: Math.atan2(tx, tz) + (side > 0 ? 0 : Math.PI) });
        }
      }
    }
    this.placeParked(parked.slice(0, 1100));
  }

  // ------------------------------------------------------------------ parked cars (streamed: built near the player only)
  private carCells = new Map<string, { m: string; x: number; z: number; rot: number }[]>();
  private carMeshes = new Map<string, THREE.Mesh>();
  private carParts = new Map<string, THREE.BufferGeometry[]>();
  private carMat?: THREE.Material;
  private lodMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
  private carLodCells = new Map<string, THREE.Mesh>();
  private bodyT = new THREE.BoxGeometry(1.8, 0.8, 4.3).translate(0, 0.78, 0);
  private cabinT = new THREE.BoxGeometry(1.55, 0.62, 2.3).translate(0, 1.5, -0.15);
  private static PAL = [[0.9, 0.9, 0.9], [0.62, 0.64, 0.68], [0.12, 0.12, 0.13], [0.7, 0.1, 0.1], [0.12, 0.25, 0.6], [0.8, 0.75, 0.6], [0.2, 0.4, 0.25]];

  /** Registers parking spots (cheap data only); geometry is created lazily by updateCars(). */
  public async placeParked(list: { m: string; x: number; z: number; rot: number }[]): Promise<void> {
    const w = this.w;
    for (const m of new Set(list.map((l) => l.m))) {
      if (this.carParts.has(m)) continue;
      const model = await AssetLibrary.load(`assets/models/cars/${m}.glb`).catch(() => null); if (!model) continue;
      model.updateWorldMatrix(true, true);
      const bb = new THREE.Box3().setFromObject(model); const s = 4.3 / Math.max(0.5, bb.max.z - bb.min.z);
      const parts: THREE.BufferGeometry[] = [];
      model.traverse((o) => { const me = o as THREE.Mesh; if (me.isMesh) { const g = me.geometry.clone(); g.applyMatrix4(me.matrixWorld); g.scale(s, s, s); g.translate(0, -bb.min.y * s, 0); for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); parts.push(g.index ? g.toNonIndexed() : g); } });
      this.carParts.set(m, parts);
    }
    if (!this.carMat) { const atlas = (await AssetLibrary.load('assets/models/cars/sedan.glb')).getObjectByProperty('isMesh', true) as THREE.Mesh; this.carMat = (atlas.material as THREE.Material).clone(); }
    const tint = (g: THREE.BufferGeometry, c: number[]) => { const n = g.attributes['position'].count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; };
    const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0); const lod = new Map<string, THREE.BufferGeometry[]>();
    for (const c of list) {
      if (!this.carParts.has(c.m)) continue;
      const key = `${Math.floor(c.x / 160)},${Math.floor(c.z / 160)}`; let arr = this.carCells.get(key); if (!arr) { arr = []; this.carCells.set(key, arr); } arr.push(c);
      const y = w.groundHeightAt(c.x, c.z) - 0.02;
      M.compose(new THREE.Vector3(c.x, y, c.z), Q.setFromAxisAngle(up, c.rot), new THREE.Vector3(1, 1, 1));
      const lk = `${Math.floor(c.x / 300)},${Math.floor(c.z / 300)}`; let la = lod.get(lk); if (!la) { la = []; lod.set(lk, la); }
      const col = StreetBuilder.PAL[Math.floor(rnd(c.x * 0.7 + c.z * 1.3) * StreetBuilder.PAL.length)];
      la.push(tint(this.bodyT.clone().applyMatrix4(M), col), tint(this.cabinT.clone().applyMatrix4(M), [col[0] * 0.5, col[1] * 0.55, col[2] * 0.6]));
      const fx = Math.sin(c.rot), fz = Math.cos(c.rot); for (const o of [-1.3, 0, 1.3]) w.collision.addCircle(c.x + fx * o, c.z + fz * o, 0.95);
    }
    lod.forEach((geos, key) => {
      const g = mergeGeometries(geos.map((q) => (q.index ? q.toNonIndexed() : q))); if (!g) return; g.computeBoundingSphere();
      const [ix, iz] = key.split(',').map(Number); const mesh = new THREE.Mesh(g, this.lodMat); mesh.name = 'parkedcars-lod';
      w.registerChunk(mesh, (ix + 0.5) * 300, (iz + 0.5) * 300, 300 * 0.75, 400); w.landmarksGroup.add(mesh);
    });
  }

  /** Build detailed parked-car meshes for cells within ~220 m, free the ones beyond ~420 m. Cheap; call from the world update. */
  public updateCars(px: number, pz: number): void {
    const w = this.w; let built = 0;
    for (const [key, list] of this.carCells) {
      const [ix, iz] = key.split(',').map(Number); const dx = Math.max(Math.abs((ix + 0.5) * 160 - px) - 80, 0), dz = Math.max(Math.abs((iz + 0.5) * 160 - pz) - 80, 0), d = Math.hypot(dx, dz);
      const have = this.carMeshes.get(key);
      if (d < 60 && !have && built < 2 && this.carMat) {
        const geos: THREE.BufferGeometry[] = []; const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        for (const c of list) { const parts = this.carParts.get(c.m); if (!parts) continue; const y = w.groundHeightAt(c.x, c.z) - 0.02; M.compose(new THREE.Vector3(c.x, y, c.z), Q.setFromAxisAngle(up, c.rot), new THREE.Vector3(1, 1, 1)); for (const p of parts) geos.push(p.clone().applyMatrix4(M)); }
        const g = geos.length ? mergeGeometries(geos) : null; if (!g) { this.carMeshes.set(key, new THREE.Mesh()); continue; }
        for (const q of geos) q.dispose(); g.computeBoundingSphere();
        const mesh = new THREE.Mesh(g, this.carMat); mesh.name = 'parkedcars'; mesh.frustumCulled = true; w.landmarksGroup.add(mesh); this.carMeshes.set(key, mesh); built++;
      } else if (d > 120 && have) { if (have.geometry) have.geometry.dispose(); w.landmarksGroup.remove(have); this.carMeshes.delete(key); }
    }
  }

  // ------------------------------------------------------------------ clouds
  public clouds: THREE.Group | null = null;
  private makeClouds(scene: THREE.Scene): void {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    for (let i = 0; i < 9; i++) { const x = 30 + rnd(i * 3.1) * 68, y = 50 + rnd(i * 7.3) * 28, r = 22 + rnd(i * 5.9) * 22; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const grp = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const m = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
      const s = new THREE.Sprite(m); const sc = 700 + rnd(i * 2.3) * 700; s.scale.set(sc, sc * 0.45, 1);
      s.position.set((rnd(i * 4.7) - 0.5) * 9000, 850 + rnd(i * 1.9) * 500, (rnd(i * 8.1) - 0.5) * 9000); grp.add(s);
    }
    this.clouds = grp; scene.add(grp);
  }
}
