import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Parametric vehicle bodies for traffic and parked cars: the shapes actually seen on Manzini streets (Corolla-type sedan, Polo-type
 * hatch, double-cab bakkie, Fortuner-type SUV, Quantum minibus taxi, long-distance coach), lofted from a side profile with a curved
 * plan and tumblehome. One smooth-shaded, vertex-coloured mesh per body (~1.2-1.9k triangles, no textures) + shared wheel geometry,
 * so a street full of them costs less than the toy-kit models they replace. Forward = +z, ground = y 0.
 */
export type CarKind = 'sedan' | 'hatch' | 'bakkie' | 'suv' | 'minibus' | 'coach' | 'coupe' | 'bakkie1' | 'cruiser';
interface Spec {
  L: number; W: number; H: number; wr: number; ax: [number, number]; belt: number; sill: number;
  prof: [number, number][];            // roof line: z (rear -> front), y
  glass: [number, number][];           // side-window z ranges
  bed?: [number, number];              // open load bed z range (bakkie)
}
const SPECS: Record<CarKind, Spec> = {
  sedan: { L: 4.6, W: 1.76, H: 1.45, wr: 0.32, ax: [-1.32, 1.36], belt: 0.95, sill: 0.3, prof: [[-2.3, 0.56], [-2.27, 0.96], [-1.6, 1.02], [-0.95, 1.42], [0.2, 1.45], [1.0, 1.0], [2.05, 0.86], [2.27, 0.74], [2.3, 0.5]], glass: [[-0.98, -0.12], [-0.02, 0.8]] },
  hatch: { L: 4.0, W: 1.7, H: 1.47, wr: 0.31, ax: [-1.2, 1.27], belt: 0.97, sill: 0.3, prof: [[-2.0, 0.56], [-1.98, 0.98], [-1.72, 1.38], [-1.2, 1.47], [0.15, 1.47], [0.92, 1.0], [1.8, 0.86], [1.97, 0.74], [2.0, 0.5]], glass: [[-1.5, -0.2], [-0.1, 0.72]] },
  suv: { L: 4.8, W: 1.86, H: 1.82, wr: 0.38, ax: [-1.35, 1.4], belt: 1.16, sill: 0.42, prof: [[-2.4, 0.7], [-2.38, 1.2], [-2.2, 1.76], [-1.7, 1.82], [0.3, 1.82], [1.05, 1.2], [2.15, 1.08], [2.37, 0.95], [2.4, 0.66]], glass: [[-2.0, -1.15], [-1.05, -0.15], [-0.05, 0.85]] },
  bakkie: { L: 5.3, W: 1.85, H: 1.8, wr: 0.38, ax: [-1.55, 1.55], belt: 1.16, sill: 0.42, prof: [[-2.65, 0.7], [-2.63, 1.14], [-0.95, 1.14], [-0.8, 1.76], [-0.3, 1.8], [0.55, 1.8], [1.3, 1.2], [2.4, 1.08], [2.62, 0.95], [2.65, 0.66]], glass: [[-0.7, 0.02], [0.1, 1.05]], bed: [-2.55, -1.0] },
  minibus: { L: 5.3, W: 1.9, H: 2.25, wr: 0.36, ax: [-1.6, 1.6], belt: 1.28, sill: 0.42, prof: [[-2.65, 0.6], [-2.63, 2.12], [-2.35, 2.25], [1.6, 2.25], [1.85, 2.18], [2.3, 1.32], [2.6, 1.08], [2.65, 0.6]], glass: [[-2.4, -1.2], [-1.1, 0.1], [0.2, 1.75]] },
  // player-garage bodies: boxy rear-drive two-door, single-cab half-tonner, upright bush 4x4
  coupe: { L: 4.35, W: 1.68, H: 1.38, wr: 0.3, ax: [-1.25, 1.3], belt: 0.92, sill: 0.28, prof: [[-2.175, 0.55], [-2.15, 0.98], [-1.35, 1.0], [-0.95, 1.36], [0.1, 1.38], [0.85, 0.98], [1.95, 0.88], [2.15, 0.76], [2.175, 0.5]], glass: [[-0.9, -0.2], [-0.1, 0.7]] },
  bakkie1: { L: 5.2, W: 1.8, H: 1.74, wr: 0.37, ax: [-1.5, 1.6], belt: 1.14, sill: 0.42, prof: [[-2.6, 0.7], [-2.58, 1.12], [-0.25, 1.12], [-0.12, 1.7], [0.25, 1.74], [0.75, 1.74], [1.4, 1.18], [2.38, 1.06], [2.57, 0.94], [2.6, 0.66]], glass: [[-0.05, 1.1]], bed: [-2.5, -0.3] },
  cruiser: { L: 4.9, W: 1.87, H: 1.95, wr: 0.4, ax: [-1.4, 1.45], belt: 1.22, sill: 0.48, prof: [[-2.45, 0.75], [-2.43, 1.3], [-2.38, 1.9], [-2.0, 1.95], [0.45, 1.95], [0.95, 1.28], [2.2, 1.18], [2.42, 1.02], [2.45, 0.7]], glass: [[-2.1, -1.2], [-1.1, -0.2], [-0.1, 0.85]] },
  coach: { L: 12, W: 2.5, H: 3.4, wr: 0.5, ax: [-3.4, 3.9], belt: 1.9, sill: 0.5, prof: [[-6, 0.7], [-5.98, 3.25], [-5.6, 3.4], [5.2, 3.4], [5.55, 3.3], [5.92, 1.7], [6, 0.7]], glass: [[-5.6, 5.3]] },
};
/** Paint colours weighted like a real Southern African car park: mostly white, silver and grey. */
export const PAINTS: number[][] = [[0.95, 0.97, 1.0], [0.95, 0.97, 1.0], [0.95, 0.97, 1.0], [0.7, 0.76, 0.84], [0.7, 0.76, 0.84], [0.2, 0.24, 0.32], [0.2, 0.24, 0.32],
  [0.03, 0.04, 0.07], [0.04, 0.45, 0.62], [0.08, 0.14, 0.55], [0.48, 0.12, 0.75], [0.8, 0.08, 0.5], [0.05, 0.6, 0.5], [0.9, 0.35, 0.1], [0.85, 0.87, 0.92]];   // future fleet: pearl whites, titanium, midnight, electric cyan / violet / magenta
const GLASS = [0.045, 0.07, 0.1], DARK = [0.035, 0.035, 0.04], TYRE = [0.03, 0.03, 0.035], HUB = [0.62, 0.64, 0.66], LAMP = [2.4, 2.3, 1.9], TAIL = [1.7, 0.07, 0.07], GLOW = [0.25, 2.6, 3.3], CHROME = [0.8, 0.82, 0.85], RAIL = [0.1, 0.1, 0.11], PLATE = [0.92, 0.8, 0.2];

const profY = (s: Spec, z: number): number => {
  const p = s.prof; if (z <= p[0][0]) return p[0][1];
  for (let i = 0; i + 1 < p.length; i++) if (z <= p[i + 1][0]) { const t = (z - p[i][0]) / Math.max(1e-4, p[i + 1][0] - p[i][0]); return p[i][1] + (p[i + 1][1] - p[i][1]) * t; }
  return p[p.length - 1][1];
};
const RING = 15; // points around one cross-section
/** Cross-section at z: from the left sill, over the roof, to the right sill (15 points). */
function ring(s: Spec, z: number): [number, number][] {
  const u = Math.abs((2 * z) / s.L), plan = 1 - 0.13 * Math.pow(u, 3.6);                    // rounded corners in plan
  const wS = (s.W / 2) * plan, top = profY(s, z), cabin = top > s.belt + 0.12;
  const wG = cabin ? wS * (s.H > 2 ? 0.93 : 0.8) : wS * 0.95;                                  // tumblehome (vans stay upright)
  const yb = cabin ? s.belt : Math.max(s.sill + 0.2, top - 0.07);
  const half: [number, number][] = [
    [wS * 0.9, s.sill], [wS, s.sill + 0.1], [wS, s.sill + (yb - s.sill) * 0.6], [wS * 0.985, yb],
    [cabin ? wG : wS * 0.93, cabin ? top - 0.1 : top - 0.015], [wG * 0.72, top], [wG * 0.36, top + (cabin ? 0.025 : 0.012)],
  ];
  const r: [number, number][] = [];
  for (let i = 0; i < 7; i++) r.push([-half[i][0], half[i][1]]);
  r.push([0, top + (cabin ? 0.035 : 0.018)]);
  for (let i = 6; i >= 0; i--) r.push([half[i][0], half[i][1]]);
  return r;
}

const cache = new Map<string, THREE.BufferGeometry>();
const box = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: number[]): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); g.translate(x, y, z); g.deleteAttribute('uv'); return paint(g, c);
};
function paint(g: THREE.BufferGeometry, c: number[]): THREE.BufferGeometry {
  const n = g.attributes['position'].count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
}

/** Body shell (no wheels) in the given paint; `stripe` adds a waist band (minibus taxis, coaches). Cached per kind + colour. */
export function carBody(kind: CarKind, col: number[], stripe?: number[]): THREE.BufferGeometry {
  const key = `${kind}|${col.join(',')}|${stripe ? stripe.join(',') : ''}`; const hit = cache.get(key); if (hit) return hit;
  const s = SPECS[kind];
  // stations: even spacing plus every profile break so creases stay crisp
  const zs = new Set<number>(); const N = kind === 'coach' ? 34 : 26;
  for (let i = 0; i <= N; i++) zs.add(Math.round((-s.L / 2 + (s.L * i) / N) * 1000) / 1000);
  for (const p of s.prof) zs.add(p[0]); for (const gl of s.glass) { zs.add(gl[0]); zs.add(gl[1]); }
  const Z = [...zs].sort((a, b) => a - b), rings = Z.map((z) => ring(s, z));
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i < Z.length; i++) for (let j = 0; j < RING; j++) pos.push(rings[i][j][0], rings[i][j][1], Z[i]);
  const quadCol: number[][] = [];
  for (let i = 0; i + 1 < Z.length; i++) {
    const zm = (Z[i] + Z[i + 1]) / 2, top = profY(s, zm), cabin = top > s.belt + 0.12, slope = Math.abs(profY(s, Z[i + 1]) - profY(s, Z[i])) / Math.max(0.01, Z[i + 1] - Z[i]);
    const sideGlass = cabin && s.glass.some(([a, b]) => zm > a + 0.04 && zm < b - 0.04) && top > s.H - 0.2;
    const screen = cabin && slope > 0.32 && top < s.H - 0.03 && top > s.belt + 0.1;         // windscreen / rear window
    const bed = !!s.bed && zm > s.bed[0] && zm < s.bed[1];
    for (let j = 0; j + 1 < RING; j++) {
      const a = i * RING + j, b = a + 1, c = a + RING, d = c + 1; idx.push(a, c, b, b, c, d);
      const k = j < 7 ? j : 13 - j;   // 0 rocker, 1 lower door, 2 upper door, 3 window band, 4 roof edge, 5-6 roof
      let q = col;
      if (k === 0) q = DARK;
      else if (k === 2 && stripe) q = stripe;
      else if (k === 3 && (sideGlass || screen)) q = GLASS;
      else if (k >= 4 && screen) q = GLASS;
      else if (k >= 4 && bed) q = DARK;
      quadCol.push(q);
    }
  }
  // closed underside + front / rear fascia fans
  const under = pos.length / 3; for (let i = 0; i < Z.length; i++) pos.push(0, s.sill - 0.02, Z[i]);
  for (let i = 0; i + 1 < Z.length; i++) { const a = i * RING, c = a + RING, m = under + i; idx.push(a, m, c, c, m, m + 1, i * RING + 14, (i + 1) * RING + 14, m, m, (i + 1) * RING + 14, m + 1); quadCol.push(DARK, DARK); }
  for (const end of [0, Z.length - 1]) {
    const c0 = pos.length / 3; let cy = 0; for (let j = 0; j < RING; j++) cy += rings[end][j][1]; pos.push(0, cy / RING, Z[end]);
    for (let j = 0; j + 1 < RING; j++) { const a = end * RING + j, b = a + 1; if (end === 0) idx.push(a, b, c0); else idx.push(a, c0, b); }
  }
  const g0 = new THREE.BufferGeometry(); g0.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g0.setIndex(idx); g0.computeVertexNormals();
  const g = g0.toNonIndexed(); g0.dispose();
  const nTri = g.attributes['position'].count / 3, colA = new Float32Array(nTri * 9);
  const nQuadTri = quadCol.length * 2;
  const pa = g.attributes['position'];
  for (let t = 0; t < nTri; t++) {
    const q = t < nQuadTri ? quadCol[t >> 1] : col;
    for (let v = 0; v < 3; v++) { const ao = 0.76 + 0.24 * Math.min(1, Math.max(0, (pa.getY(t * 3 + v) - s.sill) / (s.belt - s.sill))); colA[t * 9 + v * 3] = q[0] * ao; colA[t * 9 + v * 3 + 1] = q[1] * ao; colA[t * 9 + v * 3 + 2] = q[2] * ao; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(colA, 3));
  // details: lamps, grille, bumpers, plates, mirrors, wheel-arch shadows
  const f = s.L / 2, hw = s.W / 2, ny = profY(s, f - 0.06), ry = profY(s, -f + 0.04), big = s.H > 2;
  const parts: THREE.BufferGeometry[] = [g,
    box(s.W * 0.86, 0.2, 0.1, 0, s.sill + 0.12, f - 0.02, DARK), box(s.W * 0.86, 0.2, 0.1, 0, s.sill + 0.12, -f + 0.02, DARK),
    box(s.W * 0.42, big ? 0.3 : 0.14, 0.05, 0, Math.min(ny, s.belt) - (big ? 0.3 : 0.16), f - 0.005, DARK),
    box(0.36, 0.13, 0.06, hw * 0.66, Math.min(ny, s.belt) - 0.12, f - 0.03, LAMP), box(0.36, 0.13, 0.06, -hw * 0.66, Math.min(ny, s.belt) - 0.12, f - 0.03, LAMP),
    box(0.3, big ? 0.5 : 0.14, 0.06, hw * 0.72, Math.min(ry, s.belt) - (big ? 0.2 : 0.1), -f + 0.02, TAIL), box(0.3, big ? 0.5 : 0.14, 0.06, -hw * 0.72, Math.min(ry, s.belt) - (big ? 0.2 : 0.1), -f + 0.02, TAIL),
    box(0.46, 0.12, 0.03, 0, s.sill + 0.26, f + 0.03, PLATE), box(0.46, 0.12, 0.03, 0, s.sill + 0.3, -f - 0.03, PLATE),
  ];
  const mz = s.prof.find((p, i) => i > 0 && p[1] < s.prof[i - 1][1] - 0.2 && p[0] > 0)?.[0] ?? f * 0.4;                // base of the windscreen
  for (const sd of [-1, 1]) parts.push(box(0.16, 0.11, 0.07, sd * (hw + 0.07), s.belt + 0.07, mz - 0.12, DARK));
  const plan = (z: number): number => 1 - 0.13 * Math.pow(Math.abs((2 * z) / s.L), 3.6), side = (z: number): number => hw * plan(z) + 0.004;
  for (let i = 0; i + 1 < s.glass.length; i++) { const z = (s.glass[i][1] + s.glass[i + 1][0]) / 2; for (const sd of [-1, 1]) parts.push(box(0.012, s.belt - s.sill - 0.14, 0.012, sd * side(z), (s.sill + 0.12 + s.belt) / 2, z, DARK)); }   // door shut lines
  if (kind !== 'coach') for (const gl of s.glass) for (const sd of [-1, 1]) parts.push(box(0.03, 0.03, 0.14, sd * (side(gl[0]) + 0.012), s.belt - 0.1, gl[0] + 0.16, CHROME));   // door handles
  parts.push(box(s.W * 0.4, 0.03, 0.04, 0, Math.min(ny, s.belt) - (big ? 0.12 : 0.1), f + 0.005, CHROME));
  // future fleet: light-bar nose and tail, glowing underglow strips along both sills
  parts.push(box(s.W * 0.7, 0.035, 0.05, 0, Math.min(ny, s.belt) - (big ? 0.02 : 0.02), f + 0.012, [2.2, 2.6, 3.0]), box(s.W * 0.74, 0.04, 0.05, 0, Math.min(ry, s.belt) - (big ? 0.12 : 0.04), -f - 0.012, TAIL));
  for (const sd of [-1, 1]) parts.push(box(0.03, 0.035, s.L * 0.5, sd * (hw + 0.012), s.sill + 0.03, 0, GLOW));                                                      // grille bar
  for (const sd of [-1, 1]) { parts.push(box(0.12, 0.07, 0.05, sd * hw * 0.72, s.sill + 0.12, f + 0.01, LAMP));                                                     // fog lamps
    parts.push(box(0.5, 0.012, 0.02, sd * 0.3, profY(s, mz) + 0.012, mz - 0.04, RAIL)); }                                                                              // wipers
  if (kind === 'sedan' || kind === 'hatch' || kind === 'coupe') { parts.push(box(0.012, 0.28, 0.012, hw * 0.55, s.H + 0.14, -0.4, RAIL)); for (const sd of [-1, 1]) parts.push(box(0.06, 0.06, 0.12, sd * hw * 0.55, s.sill + 0.08, -f - 0.04, CHROME)); }   // aerial, exhaust tips
  if (kind === 'coupe') parts.push(box(s.W * 0.8, 0.03, 0.2, 0, ry + 0.03, -f + 0.28, DARK));                                                                           // ducktail lip
  if (kind === 'suv' || kind === 'cruiser' || kind === 'bakkie' || kind === 'bakkie1') {
    parts.push(box(0.1, 0.1, 0.18, 0, s.sill + 0.02, -f - 0.06, RAIL));                                                                                                   // tow bar
    for (const sd of [-1, 1]) parts.push(box(0.14, 0.04, s.L * 0.34, sd * (hw + 0.03), s.sill + 0.02, 0, RAIL));                                                        // side steps
  }
  if (kind === 'suv' || kind === 'cruiser') { const z0 = kind === 'suv' ? -0.7 : -0.78, ln = kind === 'suv' ? 2.0 : 2.4; for (const sd of [-1, 1]) parts.push(box(0.04, 0.045, ln, sd * s.W * 0.36, s.H + 0.03, z0, RAIL)); parts.push(box(s.W * 0.72, 0.03, 0.04, 0, s.H + 0.05, z0 - ln * 0.3, RAIL), box(s.W * 0.72, 0.03, 0.04, 0, s.H + 0.05, z0 + ln * 0.3, RAIL)); }   // roof rails
  if (kind === 'cruiser' || kind === 'bakkie') { parts.push(box(s.W * 0.7, 0.07, 0.06, 0, s.sill + 0.34, f + 0.08, CHROME)); for (const sd of [-1, 1]) parts.push(box(0.06, 0.34, 0.06, sd * s.W * 0.3, s.sill + 0.2, f + 0.08, CHROME)); }   // bull bar
  if (s.bed) { const [b0, b1] = s.bed, by = profY(s, (b0 + b1) / 2) + 0.03; for (const sd of [-1, 1]) parts.push(box(0.05, 0.05, b1 - b0, sd * hw * 0.93, by, (b0 + b1) / 2, RAIL)); parts.push(box(s.W * 0.9, 0.05, 0.05, 0, by, b1, RAIL), box(s.W * 0.86, 0.3, 0.03, 0, by - 0.16, b0 + 0.02, DARK), box(s.W * 0.86, 0.05, 0.05, 0, by + 0.34, b1 + 0.02, CHROME)); }   // load-bed rails, tailgate, sports bar
  if (kind === 'minibus') parts.push(box(0.55, 0.07, 0.8, 0, s.H + 0.03, 0.4, [0.8, 0.8, 0.78]), box(0.3, 0.025, 0.04, 0, s.sill + 0.5, f + 0.02, CHROME));              // roof vent, badge bar
  if (kind === 'coach') parts.push(box(1.3, 0.16, 2.6, 0, s.H + 0.07, -2.0, [0.85, 0.85, 0.84]), box(1.1, 0.5, 0.05, 0, 1.1, -f - 0.02, DARK));                          // roof A/C, engine grille
  const arch = new THREE.CircleGeometry(s.wr * 1.2, 14).toNonIndexed(); arch.deleteAttribute('uv');
  for (const az of s.ax) for (const sd of [-1, 1]) { const a = arch.clone(); a.rotateY((sd * Math.PI) / 2); a.translate(sd * (hw * (1 - 0.13 * Math.pow(Math.abs((2 * az) / s.L), 3.6)) + 0.004), s.wr * 0.98, az); parts.push(paint(a, DARK)); }
  for (const p of parts) for (const k of Object.keys(p.attributes)) if (!['position', 'normal', 'color'].includes(k)) p.deleteAttribute(k);
  const out = mergeGeometries(parts)!; for (const p of parts) p.dispose(); arch.dispose();
  out.computeBoundingSphere(); cache.set(key, out); return out;
}

const wheelCache = new Map<number, THREE.BufferGeometry>();
/** One wheel (tyre + rim face both sides), axle along x, centred on the origin. */
export function wheelGeo(r: number): THREE.BufferGeometry {
  let g = wheelCache.get(r); if (g) return g;
  const w = r * 0.62, tyre = new THREE.CylinderGeometry(r, r, w, 20).toNonIndexed(); tyre.rotateZ(Math.PI / 2);
  const parts = [paint(tyre, TYRE)];
  for (const sd of [-1, 1]) {
    const disc = new THREE.CircleGeometry(r * 0.62, 14).toNonIndexed(); disc.rotateY((sd * Math.PI) / 2); disc.translate(sd * (w / 2 + 0.003), 0, 0); parts.push(paint(disc, DARK));
    const lip = new THREE.RingGeometry(r * 0.54, r * 0.64, 14).toNonIndexed(); lip.rotateY((sd * Math.PI) / 2); lip.translate(sd * (w / 2 + 0.006), 0, 0); parts.push(paint(lip, GLOW));
    const hubc = new THREE.CircleGeometry(r * 0.15, 8).toNonIndexed(); hubc.rotateY((sd * Math.PI) / 2); hubc.translate(sd * (w / 2 + 0.012), 0, 0); parts.push(paint(hubc, HUB));
    for (let k = 0; k < 6; k++) { const sp = new THREE.BoxGeometry(0.014, r * 0.42, r * 0.1).toNonIndexed(); sp.translate(sd * (w / 2 + 0.009), r * 0.3, 0); sp.rotateX((k * Math.PI * 2) / 6); parts.push(paint(sp, HUB)); }
  }
  for (const p of parts) p.deleteAttribute('uv');
  g = mergeGeometries(parts)!; for (const p of parts) p.dispose(); wheelCache.set(r, g); return g;
}
/** Wheel centres (FL, FR, RL, RR) for a kind: [x, y, z]. Coaches get a second rear axle drawn as part of the static set. */
export function wheelSpots(kind: CarKind): [number, number, number][] {
  const s = SPECS[kind], x = s.W / 2 - s.wr * 0.34;
  const o: [number, number, number][] = [[x, s.wr, s.ax[1]], [-x, s.wr, s.ax[1]], [x, s.wr, s.ax[0]], [-x, s.wr, s.ax[0]]];
  if (kind === 'coach') o.push([x, s.wr, s.ax[0] - 1.3], [-x, s.wr, s.ax[0] - 1.3]);
  return o;
}
export const carSize = (kind: CarKind): { L: number; W: number; H: number; wr: number } => SPECS[kind];

/** Glossy two-layer look without a physical material: metallic base, sky reflections from the scene environment. */
export const carPaintMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.26, metalness: 0.5, envMapIntensity: 1.3 });
/** Player's own car: same vertex-coloured shell under a clear coat. */
export const playerPaintMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.34, metalness: 0.5, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.25 });
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 });

/** Whole static vehicle (body + wheels) as one geometry: parked cars, far LOD. */
export function carStatic(kind: CarKind, col: number[], stripe?: number[]): THREE.BufferGeometry {
  const key = `S|${kind}|${col.join(',')}|${stripe ? stripe.join(',') : ''}`; const hit = cache.get(key); if (hit) return hit;
  const parts = [carBody(kind, col, stripe).clone()];
  for (const [x, y, z] of wheelSpots(kind)) parts.push(wheelGeo(SPECS[kind].wr).clone().translate(x, y, z));
  const g = mergeGeometries(parts)!; for (const p of parts) p.dispose(); g.computeBoundingSphere(); cache.set(key, g); return g;
}

/** Drivable traffic vehicle: body mesh + four spinning wheels. userData: car (detail group), wheels (rotate .x to spin). */
export function makeCar(kind: CarKind, col: number[], stripe?: number[], mat: THREE.Material = carPaintMat): THREE.Group {
  const g = new THREE.Group(), detail = new THREE.Group(); const s = SPECS[kind];
  const body = new THREE.Mesh(carBody(kind, col, stripe), mat); body.castShadow = true; detail.add(body);
  const wheels: THREE.Object3D[] = [];
  for (const [x, y, z] of wheelSpots(kind)) { const w = new THREE.Mesh(wheelGeo(s.wr), wheelMat); w.position.set(x, y, z); w.castShadow = false; detail.add(w); wheels.push(w); }
  g.add(detail); g.userData['car'] = detail; g.userData['wheels'] = wheels; g.userData['paint'] = col; g.userData['size'] = s;
  return g;
}
