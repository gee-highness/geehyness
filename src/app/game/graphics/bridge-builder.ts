import * as THREE from 'three';
import { GeoBuf } from './geo-buf';
import type { WorldBuilder } from './world-builder';

const CH = 800;
type V3 = [number, number, number];

/**
 * Overpass structures built from the solved road elevation: deck beams and undersides, jersey-barrier parapets,
 * pier bents under viaducts, and retaining walls where approach ramps sit on embankment. All solid, with height ranges
 * so the road *below* is unaffected by the parapets above.
 */
export class BridgeBuilder {
  private bufs = new Map<string, GeoBuf>();
  constructor(private w: WorldBuilder) {}

  private buf(x: number, z: number): GeoBuf {
    const k = `${Math.floor(x / CH)},${Math.floor(z / CH)}`; let b = this.bufs.get(k); if (!b) { b = new GeoBuf(); this.bufs.set(k, b); } return b;
  }

  /** One quad with a given outward normal; winding is chosen so the front face really faces that normal. */
  private quad(b: GeoBuf, p: V3[], n: V3, col: number[], uv: [number, number][]): void {
    const ids = p.map((v, i) => b.vert(v[0], v[1], v[2], n[0], n[1], n[2], uv[i][0], uv[i][1], col));
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
      this.quad(b, [[a[0], y0, a[1]], [d[0], y0, d[1]], [d[0], y0 + h, d[1]], [a[0], y0 + h, a[1]]], [ez / l, 0, -ex / l], col, [[0, 0], [l / 3, 0], [l / 3, h / 3], [0, h / 3]]);
    }
    this.quad(b, q.map((p) => [p[0], y0 + h, p[1]] as V3), [0, 1, 0], col.map((v) => v * 1.1), q.map((p) => [p[0] / 3, p[1] / 3] as [number, number]));
  }

  addWay(pts: [number, number][], L: [number, number][], R: [number, number][], yl: number[], yr: number[], yc: number[], hw: number, isRamp: boolean): void {
    const w = this.w; const conc = [0.78, 0.78, 0.76], dark = [0.55, 0.55, 0.54], rail = [0.86, 0.86, 0.84];
    let cum = 0, pierAcc = 12;
    for (let i = 0; i + 1 < pts.length; i++) {
      const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2; const b = this.buf(mx, mz);
      const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (seg < 0.01) continue;
      const tx = (pts[i + 1][0] - pts[i][0]) / seg, tz = (pts[i + 1][1] - pts[i][1]) / seg;
      const above = (yc[i] + yc[i + 1]) / 2 - w.calculateRawTerrainHeight(mx, mz); // how high the deck is over the ground
      const viaduct = !isRamp && above > 3.2;
      const sides: { E0: [number, number]; E1: [number, number]; y0: number; y1: number; C0: [number, number]; C1: [number, number] }[] = [
        { E0: L[i], E1: L[i + 1], y0: yl[i], y1: yl[i + 1], C0: pts[i], C1: pts[i + 1] }, { E0: R[i], E1: R[i + 1], y0: yr[i], y1: yr[i + 1], C0: pts[i], C1: pts[i + 1] }];
      const bot: number[][] = [];
      sides.forEach((sd, si) => {
        const n0 = [sd.E0[0] - sd.C0[0], sd.E0[1] - sd.C0[1]], nl = Math.hypot(n0[0], n0[1]) || 1; const nx = n0[0] / nl, nz = n0[1] / nl;
        let b0: number, b1: number;
        if (viaduct) { b0 = sd.y0 - 1.15; b1 = sd.y1 - 1.15; }
        else { b0 = Math.min(w.calculateRawTerrainHeight(sd.E0[0], sd.E0[1]) - 0.4, sd.y0 - 0.5); b1 = Math.min(w.calculateRawTerrainHeight(sd.E1[0], sd.E1[1]) - 0.4, sd.y1 - 0.5); }
        bot.push([b0, b1]);
        // beam / retaining wall face
        const pc = Math.floor(cum / 3.5) % 2 ? conc.map((v) => v * 0.93) : conc; // panel joints like the real cast-concrete walls
        this.quad(b, [[sd.E0[0], b0, sd.E0[1]], [sd.E1[0], b1, sd.E1[1]], [sd.E1[0], sd.y1, sd.E1[1]], [sd.E0[0], sd.y0, sd.E0[1]]], [nx, 0, nz], pc, [[cum / 3, b0 / 3], [(cum + seg) / 3, b1 / 3], [(cum + seg) / 3, sd.y1 / 3], [cum / 3, sd.y0 / 3]]);
        // parapet: solid base band + open slots + top rail + posts every ~4 m (as on the Manzini interchange)
        const ix0 = sd.E0[0] - nx * 0.4, iz0 = sd.E0[1] - nz * 0.4, ix1 = sd.E1[0] - nx * 0.4, iz1 = sd.E1[1] - nz * 0.4, bh = 0.45, th = 0.2, ph = 1.1;
        const face = (xa: number, za: number, xb: number, zb: number, ya: number, yb: number, h0: number, h1: number, sx: number, sz: number): void =>
          this.quad(b, [[xa, ya + h0, za], [xb, yb + h0, zb], [xb, yb + h1, zb], [xa, ya + h1, za]], [sx, 0, sz], rail, [[cum / 3, 0], [(cum + seg) / 3, 0], [(cum + seg) / 3, 0.3], [cum / 3, 0.3]]);
        for (const [h0, h1] of [[0, bh], [ph - th, ph]]) { face(ix0, iz0, ix1, iz1, sd.y0, sd.y1, h0, h1, -nx, -nz); face(sd.E0[0], sd.E0[1], sd.E1[0], sd.E1[1], sd.y0, sd.y1, h0, h1, nx, nz); }
        for (const h of [bh, ph]) this.quad(b, [[ix0, sd.y0 + h, iz0], [ix1, sd.y1 + h, iz1], [sd.E1[0], sd.y1 + h, sd.E1[1]], [sd.E0[0], sd.y0 + h, sd.E0[1]]], [0, 1, 0], rail, [[ix0 / 3, iz0 / 3], [ix1 / 3, iz1 / 3], [sd.E1[0] / 3, sd.E1[1] / 3], [sd.E0[0] / 3, sd.E0[1] / 3]]);
        if (Math.floor((cum + seg) / 4) > Math.floor(cum / 4)) { const f = 0.5, px = (ix0 + sd.E0[0]) / 2 * (1 - f) + (ix1 + sd.E1[0]) / 2 * f, pz = (iz0 + sd.E0[1]) / 2 * (1 - f) + (iz1 + sd.E1[1]) / 2 * f; this.box(b, px, Math.min(sd.y0, sd.y1) + bh, pz, 0.3, 0.4, ph - bh, tx, tz, rail); }
        // solid for the car at deck level only
        const yy = Math.min(sd.y0, sd.y1);
        w.collision.addPolygon([ix0, iz0, ix1, iz1, sd.E1[0], sd.E1[1], sd.E0[0], sd.E0[1]], yy - 0.4, yy + 1.4);
        void si;
      });
      if (viaduct) {
        // soffit (underside) so the deck reads as a slab from below
        this.quad(b, [[L[i][0], bot[0][0], L[i][1]], [L[i + 1][0], bot[0][1], L[i + 1][1]], [R[i + 1][0], bot[1][1], R[i + 1][1]], [R[i][0], bot[1][0], R[i][1]]], [0, -1, 0], dark, [[L[i][0] / 3, L[i][1] / 3], [L[i + 1][0] / 3, L[i + 1][1] / 3], [R[i + 1][0] / 3, R[i + 1][1] / 3], [R[i][0] / 3, R[i][1] / 3]]);
        // pier bents every ~24 m
        pierAcc += seg;
        if (pierAcc >= 20) {
          pierAcc = 0; const px = pts[i][0], pz = pts[i][1], terr = w.calculateRawTerrainHeight(px, pz), under = yc[i] - 1.15;
          if (under - terr > 2.4) {
            const cols = hw > 7 ? [-0.62, -0.2, 0.2, 0.62] : hw > 5 ? [-0.5, 0.5] : [0]; const nx = -tz, nz = tx;
            for (const f of cols) {
              const cx2 = px + nx * hw * f, cz2 = pz + nz * hw * f, tg = w.calculateRawTerrainHeight(cx2, cz2);
              this.box(b, cx2, tg - 0.3, cz2, 1.2, 1.2, under - tg + 0.3, tx, tz, conc);
              w.collision.addCircle(cx2, cz2, 1.0, tg - 0.5, under);
            }
            this.box(b, px, under - 1.0, pz, 1.8, hw * 2 * 0.98, 1.0, tx, tz, conc); // cap beam
          }
        }
      }
      cum += seg;
    }
  }

  finish(): void {
    const mat = this.w.pbr('concrete_wall_007', 3, 0.85); mat.vertexColors = true; mat.side = THREE.DoubleSide;
    this.bufs.forEach((buf, key) => {
      if (buf.empty) return; const [ix, iz] = key.split(',').map(Number);
      const mesh = new THREE.Mesh(buf.toGeometry(true, false), mat); mesh.name = 'bridge'; mesh.castShadow = true; mesh.receiveShadow = true;
      this.w.registerChunk(mesh, (ix + 0.5) * CH, (iz + 0.5) * CH, CH * 0.75, 1700); this.w.landmarksGroup.add(mesh);
    });
    this.bufs.clear();
  }
}
