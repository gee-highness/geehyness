import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AssetLibrary } from './asset-library';
import { CollisionWorld } from '../physics/collision';
import { DISTRICTS } from '../../services/world-pipeline.service';
import { SPEED_TRAPS, DRIFT_ZONES, DANGER_SIGNS } from '../../services/festival.service';

export interface GroundQueryResult {
  height: number;
  normal: THREE.Vector3;
  surfaceClass: number;
  surfaceName: string;
}

interface WorldMeta {
  bounds: [number, number, number, number];
  px: number; gw: number; gh: number;
  dem: { x0: number; z0: number; step: number; nx: number; nz: number };
  spawn: { x: number; z: number; yaw: number };
  places: { n: string; k: string; p: [number, number] }[];
  pois: { n: string; k: string; p: [number, number] }[];
  signals: [number, number][];
  busstops?: { p: [number, number]; n: string }[]; lamps?: [number, number][]; signs?: [number, number, number][]; addr?: [number, number, string][]; views?: { p: [number, number]; n: string }[];
  snaps: Record<string, [number, number]>;
}
interface Surf { way: RoadWay; h: number; elev: boolean; px: number; pz: number; d: number }
interface RoadWay { c: number; w: number; u: number; o: number; n: string; p: number[]; sw?: number; bay?: number; dz?: number[]; br?: number; bk?: number; ms?: number; rg?: number; rb?: number }

import { GeoBuf } from './geo-buf';
import { styledMaterial, StyleKind, STYLE_FUNCS, noiseTex } from './stylized';
import { addLampLight, LAMP, SLOT, setEmitter, clearEmitter } from './lamp-light';
import { CityBuilder } from './city-builder';
import { StreetBuilder } from './street-builder';
import { BridgeBuilder } from './bridge-builder';
import { ExtrasBuilder } from './extras-builder';
import { FeaturesBuilder, Features } from './features-builder';

export const WORLD: { current?: WorldBuilder } = {};
const CHUNK = 800;
const HOUSE_TINTS_UNUSED: number[][] = [[0.95, 0.94, 0.9], [0.96, 0.9, 0.78], [0.95, 0.82, 0.7], [0.78, 0.86, 0.93], [0.8, 0.9, 0.78], [0.97, 0.9, 0.64], [0.9, 0.72, 0.6], [0.88, 0.88, 0.88]];
const ROOF_TINTS_UNUSED: number[][] = [[0.78, 0.78, 0.8], [0.8, 0.36, 0.3], [0.38, 0.55, 0.42], [0.55, 0.2, 0.18], [0.9, 0.9, 0.92], [0.4, 0.45, 0.6], [0.6, 0.5, 0.45]];
const CONCRETE_TINTS_UNUSED: number[][] = [[0.85, 0.85, 0.85], [0.95, 0.93, 0.88], [0.75, 0.78, 0.8], [0.9, 0.82, 0.7]];

/**
 * The real Manzini - Matsapha - Lobamba - Ezulwini - Mbabane corridor, built from OpenStreetMap
 * (roads, buildings, rivers, land cover) and Copernicus/SRTM elevation. Coordinates: x east, z south, origin Manzini.
 */
export class WorldBuilder {
  public terrainMesh!: THREE.Mesh;
  public roadMeshes: THREE.Mesh[] = [];
  public speedTrapMeshes: THREE.Group[] = [];
  public driftZoneMeshes: THREE.Group[] = [];
  public bridgeGroup = new THREE.Group();
  public landmarksGroup = new THREE.Group();
  public foliageGroup = new THREE.Group();
  public mountainBackdropGroup = new THREE.Group();
  public roadInfrastructureGroup = new THREE.Group();
  public highwayCurve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -100)]);

  public ready = false;
  public collision = new CollisionWorld();
  public meta!: WorldMeta;
  public roadWays: RoadWay[] = [];
  public markMat?: THREE.MeshStandardMaterial; public asphMat?: THREE.MeshStandardMaterial;
  /** Lake/pond outlines (decimetres) for the map. */
  public waterPolys: number[][] = [];
  /** Garden trees produced by the procedural infill (merged into the tree pass). */
  public extraTrees: { x: number; z: number; c: number }[] = [];
  private readyCbs: (() => void)[] = [];
  private dem!: Float32Array;
  private groundCls!: Uint8Array;
  private cellRoads = new Map<number, number[]>();
  private chunks: { obj: THREE.Object3D; cx: number; cz: number; r: number; half: number }[] = [];
  private bGrid = new Map<number, number[]>();
  public city!: CityBuilder;
  public shadowsOn = false;
  private propBufs = new Map<string, GeoBuf>();
  /** One shared 400 m props buffer per cell for every load-time builder (street, extras, features): fewer draw calls. */
  public propBuf(x: number, z: number): GeoBuf {
    const k = `${Math.floor(x / 400)},${Math.floor(z / 400)}`; let b = this.propBufs.get(k); if (!b) { b = new GeoBuf(); this.propBufs.set(k, b); } return b;
  }
  public flushProps(): void {
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.12, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.propBufs.forEach((buf, key) => {
      if (buf.empty) return; const [ix, iz] = key.split(',').map(Number); const m = new THREE.Mesh(buf.toGeometry(true, false), mat); m.name = 'props'; m.receiveShadow = true;
      this.registerChunk(m, (ix + 0.5) * 400, (iz + 0.5) * 400, 400 * 0.75, 450); this.landmarksGroup.add(m);
    });
    this.propBufs.clear();
  }
  public streets!: StreetBuilder;
  public features?: FeaturesBuilder;
  private barrierCells = new Set<number>();
  public markBarrier(x: number, z: number): void { this.barrierCells.add(Math.floor(x / 30) * 100003 + Math.floor(z / 30)); }
  public barrierNear(x: number, z: number): boolean {
    const cx = Math.floor(x / 30), cz = Math.floor(z / 30);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (this.barrierCells.has((cx + a) * 100003 + (cz + b))) return true;
    return false;
  }
  /** Raised speed humps add real height to the road surface. */
  private bumpAt(x: number, z: number): number {
    const bs = this.features?.bumps; if (!bs?.length) return 0;
    for (const b of bs) {
      const dx = x - b.x, dz = z - b.z; if (Math.abs(dx) > 6 || Math.abs(dz) > 6) continue;
      const along = dx * b.tx + dz * b.tz, across = -dx * b.tz + dz * b.tx;
      if (Math.abs(along) < 0.9 && Math.abs(across) < b.hw) return 0.09 * Math.min(1, (0.9 - Math.abs(along)) / 0.35);
    }
    return 0;
  }
  private bridges = new BridgeBuilder(this);

  /** Register a chunk object for distance streaming. */
  /** r = 1.5 x half-size of the chunk's square. */
  public registerChunk(obj: THREE.Object3D, cx: number, cz: number, r: number, far: number): void {
    obj.userData['far'] = far; obj.visible = false; this.visDirty = true; this.chunks.push({ obj, cx, cz, r, half: r / 1.5 });
  }
  public addFootprint(cx: number, cz: number, r: number): void {
    const gk = Math.floor(cx / 40) * 100003 + Math.floor(cz / 40); let l = this.bGrid.get(gk); if (!l) { l = []; this.bGrid.set(gk, l); } l.push(cx, cz, r);
  }
  /** Posted speed limit (km/h) of the road under the car, 0 if none. */
  public limitAt(x: number, z: number, y?: number): number { return this.roadSurface(x, z, y)?.way.ms ?? 0; }
  public roadLift(c: number): number { return WorldBuilder.ROAD_LIFT[c]; }
  public buildingsNear(x: number, z: number): number {
    const cx = Math.floor(x / 40), cz = Math.floor(z / 40); let n = 0;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = this.bGrid.get((cx + a) * 100003 + (cz + b)); if (l) n += l.length / 3; }
    return n;
  }
  public nearBuildingPublic(x: number, z: number): boolean { return this.nearBuilding(x, z); }
  /** Nearest road segment (class <= maxC): unit tangent, way and distance. */
  public nearestRoadSegment(x: number, z: number, maxC: number): { tx: number; tz: number; way: RoadWay; dist: number; px: number; pz: number } | null {
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50); let best: { tx: number; tz: number; way: RoadWay; dist: number; px: number; pz: number } | null = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.cellRoads.get((cx + a) * 100003 + (cz + b)); if (!list) continue;
      for (let k = 0; k < list.length; k += 2) {
        const way = this.roadWays[list[k]]; if (way.c > maxC) continue; const p = way.p, i = list[k + 1];
        const ax = p[i] / 10, az = p[i + 1] / 10, dx = p[i + 2] / 10 - ax, dz = p[i + 3] / 10 - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
        if (!best || d < best.dist) { const l = Math.sqrt(l2); best = { tx: dx / l, tz: dz / l, way, dist: d, px: ax + t * dx, pz: az + t * dz }; }
      }
    }
    return best;
  }

  /** Is (x,z) on a kerbed pavement beside a road? (visible geometry is built by StreetBuilder) */
  public onPavement(x: number, z: number): boolean {
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.cellRoads.get((cx + a) * 100003 + (cz + b)); if (!list) continue;
      for (let k = 0; k < list.length; k += 2) {
        const way = this.roadWays[list[k]]; if (!way.sw) continue; const p = way.p, i = list[k + 1];
        const ax = p[i] / 10, az = p[i + 1] / 10, dx = p[i + 2] / 10 - ax, dz = p[i + 3] / 10 - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); const d = Math.hypot(x - ax - t * dx, z - az - t * dz);
        if (d > way.w / 2 + 0.3 && d < way.w / 2 + 0.05 + way.sw && this.buildingsNear(x, z) >= 4) return true;
      }
    }
    return false;
  }

  /** Distance from a point to the nearest drawable road centreline (class <= maxC). */
  public distToRoad(x: number, z: number, maxC = 5): number {
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50); let best = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.cellRoads.get((cx + a) * 100003 + (cz + b)); if (!list) continue;
      for (let k = 0; k < list.length; k += 2) {
        const w = this.roadWays[list[k]]; if (w.c > maxC) continue; const p = w.p, i = list[k + 1];
        const ax = p[i] / 10, az = p[i + 1] / 10, dx = p[i + 2] / 10 - ax, dz = p[i + 3] / 10 - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2)); best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
      }
    }
    return best;
  }

  public onReady(cb: () => void): void { if (this.ready) cb(); else this.readyCbs.push(cb); }

  public buildWorld(scene: THREE.Scene): void {
    WORLD.current = this;
    for (const g of [this.bridgeGroup, this.landmarksGroup, this.foliageGroup, this.mountainBackdropGroup, this.roadInfrastructureGroup]) scene.add(g);
    AssetLibrary.total++;
    this.loadWorld(scene).catch((e) => console.error('World load failed', e)).finally(() => { AssetLibrary.done++; });
  }

  // ------------------------------------------------------------------ terrain model
  private cell(i: number, j: number): number {
    const d = this.meta.dem;
    return this.dem[Math.max(0, Math.min(d.nz - 1, j)) * d.nx + Math.max(0, Math.min(d.nx - 1, i))];
  }
  private static cr(p0: number, p1: number, p2: number, p3: number, t: number): number {
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
  }
  /** Smooth (bicubic) real-world elevation in metres, relative to the Manzini datum. Used to bake the terrain mesh. */
  private bicubicHeight(x: number, z: number): number {
    if (!this.dem) return 0;
    const d = this.meta.dem;
    const u = Math.max(0, Math.min(d.nx - 1.001, (x - d.x0) / d.step)), v = Math.max(0, Math.min(d.nz - 1.001, (z - d.z0) / d.step));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const row = (jj: number) => WorldBuilder.cr(this.cell(i - 1, jj), this.cell(i, jj), this.cell(i + 1, jj), this.cell(i + 2, jj), fu);
    return WorldBuilder.cr(row(j - 1), row(j), row(j + 1), row(j + 2), fv) - 610;
  }

  private readonly TS = 40; // terrain mesh spacing, metres (matches the 40 m DEM)
  private tnx = 0; private tnz = 0; private tH!: Float32Array;
  private bakeHeightGrid(): void {
    const [x0, x1, z0, z1] = this.meta.bounds, S = this.TS;
    this.tnx = Math.ceil((x1 - x0) / S) + 1; this.tnz = Math.ceil((z1 - z0) / S) + 1;
    this.tH = new Float32Array(this.tnx * this.tnz);
    for (let j = 0; j < this.tnz; j++) for (let i = 0; i < this.tnx; i++) this.tH[j * this.tnx + i] = this.bicubicHeight(x0 + i * S, z0 + j * S);
  }

  /**
   * Terrain height EXACTLY as the rendered mesh (same triangles), so roads, buildings, trees and the car
   * can never sink below or float above the ground.
   */
  public calculateRawTerrainHeight(x: number, z: number): number {
    if (!this.tH) return 0;
    const S = this.TS, [x0, , z0] = this.meta.bounds;
    const u = Math.max(0, Math.min(this.tnx - 1.0001, (x - x0) / S)), v = Math.max(0, Math.min(this.tnz - 1.0001, (z - z0) / S));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j, n = this.tnx;
    const ha = this.tH[j * n + i], hb = this.tH[j * n + i + 1], hc = this.tH[(j + 1) * n + i], hd = this.tH[(j + 1) * n + i + 1];
    // mesh triangles are (a,c,b) and (b,c,d): diagonal runs b-c
    return fu + fv <= 1 ? ha + fu * (hb - ha) + fv * (hc - ha) : hd + (1 - fu) * (hc - hd) + (1 - fv) * (hb - hd);
  }

  /** Visible road surface sits this far above the terrain (per road class). */
  private static readonly ROAD_LIFT = [0.16, 0.16, 0.15, 0.14, 0.13, 0.12, 0.1, 0.1, 0.08, -0.3];

  public groundClassAt(x: number, z: number): number {
    if (!this.groundCls) return 1;
    const m = this.meta;
    const ix = Math.floor((x - m.bounds[0]) / m.px), iz = Math.floor((z - m.bounds[2]) / m.px);
    if (ix < 0 || iz < 0 || ix >= m.gw || iz >= m.gh) return 1;
    return this.groundCls[iz * m.gw + ix] || 1;
  }

  /** Road elevation (m above the road's own ground level) along segment starting at index s of the point list. */
  public dzAt(w: RoadWay, s: number, t: number): number {
    if (!w.dz) return 0; const k = s / 2; return ((w.dz[k] ?? 0) * (1 - t) + (w.dz[k + 1] ?? w.dz[k] ?? 0) * t) / 10;
  }
  public isElevated(w: RoadWay): boolean { return !!w.dz; }

  /**
   * The drivable surface under (x,z). Roads can be stacked (overpasses), so when a height hint is given the
   * highest surface the car could actually be standing on (<= hint + 1.5 m) wins; otherwise the highest overall.
   */
  public roadSurface(x: number, z: number, yHint?: number): { way: RoadWay; h: number; elev: boolean; px: number; pz: number } | null {
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
    let best: Surf | null = null; let lowest: Surf | null = null;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.cellRoads.get((cx + a) * 100003 + (cz + b));
      if (!list) continue;
      for (let k = 0; k < list.length; k += 2) {
        const w = this.roadWays[list[k]]; if (w.c >= 8) continue;
        const p = w.p, s = list[k + 1];
        const ax = p[s] / 10, az = p[s + 1] / 10, dx = p[s + 2] / 10 - ax, dz2 = p[s + 3] / 10 - az, l2 = dx * dx + dz2 * dz2 || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz2) / l2));
        const qx = ax + t * dx, qz = az + t * dz2, ddx = x - qx, ddz = z - qz, lim = w.w / 2 + 0.3, d2 = ddx * ddx + ddz * ddz;
        if (d2 >= lim * lim) continue;
        const d = Math.sqrt(d2);
        const dzv = this.dzAt(w, s, t), elev = dzv > 0.25;
        const h = this.calculateRawTerrainHeight(elev ? qx : x, elev ? qz : z) + WorldBuilder.ROAD_LIFT[w.c] + dzv; // decks are flat across their width
        const cand: Surf = { way: w, h, elev, px: qx, pz: qz, d };
        if (!lowest || h < lowest.h) lowest = cand;
        if (yHint !== undefined && h > yHint + 1.5) continue;
        if (!best || h > best.h + 0.3 || (Math.abs(h - best.h) <= 0.3 && d < best.d)) best = cand;
      }
    }
    void lowest; // under a deck with no road beneath: the ground is the terrain, never the deck above
    const r = best;
    return r ? { way: r.way, h: r.h, elev: r.elev, px: r.px, pz: r.pz } : null;
  }

  /** Nearest drivable road under (x,z) within its half-width (highest if stacked). */
  public roadAt(x: number, z: number): RoadWay | null { return this.roadSurface(x, z)?.way ?? null; }

  public classifySurfaceAt(x: number, z: number, _h?: number): number {
    const r = this.roadAt(x, z);
    if (r) return r.u ? 7 : 11;
    return this.groundClassAt(x, z);
  }

  /** Height of the drivable surface (terrain + road lift + overpass elevation) at a point. */
  public groundHeightAt(x: number, z: number, y?: number): number {
    const roofH = y === undefined ? null : this.collision.roofAt(x, z, y);
    const rs = this.roadSurface(x, z, y);
    if (roofH !== null && (!rs || roofH > rs.h)) return roofH;
    if (rs) return rs.h;
    const base = this.calculateRawTerrainHeight(x, z);
    return this.onPavement(x, z) ? base + WorldBuilder.ROAD_LIFT[4] + 0.15 : base;
  }

  public queryGround(x: number, z: number, y?: number): GroundQueryResult {
    const roofH = y === undefined ? null : this.collision.roofAt(x, z, y);
    if (roofH !== null) { const r0 = this.roadSurface(x, z, y); if (!r0 || roofH > r0.h) return { height: roofH, normal: new THREE.Vector3(0, 1, 0), surfaceClass: 9, surfaceName: 'Rooftop' }; }
    const rs = this.roadSurface(x, z, y); const road = rs?.way ?? null;
    const pave = !road && this.onPavement(x, z);
    let height = rs ? rs.h : this.calculateRawTerrainHeight(x, z) + (pave ? WorldBuilder.ROAD_LIFT[4] + 0.15 : 0);
    if (rs && !rs.elev) height += this.bumpAt(x, z);
    if (road?.rg) height += 0.035 * Math.sin(x * 3.1 + z * 2.3) * Math.sin(x * 1.7 - z * 2.9) + 0.02 * Math.sin(x * 7.3 + z * 5.1); // washboard / potholes on roads tagged rough
    const e = 2.5; let normal: THREE.Vector3;
    if (rs?.elev) {
      const hx1 = this.roadSurface(x - e, z, y)?.h ?? height, hx2 = this.roadSurface(x + e, z, y)?.h ?? height, hz1 = this.roadSurface(x, z + e, y)?.h ?? height, hz2 = this.roadSurface(x, z - e, y)?.h ?? height;
      normal = new THREE.Vector3(hx1 - hx2, 2 * e, hz2 - hz1).normalize();
    } else {
      const hL = this.calculateRawTerrainHeight(x - e, z), hR = this.calculateRawTerrainHeight(x + e, z);
      const hD = this.calculateRawTerrainHeight(x, z - e), hU = this.calculateRawTerrainHeight(x, z + e);
      normal = new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
    }
    const cls = road ? (road.u ? 7 : 11) : pave ? 8 : this.groundClassAt(x, z);
    const names: Record<number, string> = { 1: 'Bushveld', 2: 'Grassland', 3: 'Pasture', 4: 'Farmland', 5: 'Forest floor', 6: 'Rock', 7: 'Dirt road', 8: 'Town ground', 9: 'Industrial ground', 10: 'Sand', 11: 'Asphalt', 12: 'Wetland' };
    const nm = road && road.n ? road.n : road && rs?.elev ? 'Overpass' : pave ? 'Pavement' : (names[cls] ?? 'Ground');
    return { height, normal, surfaceClass: cls, surfaceName: nm };
  }

  public districtAt(x: number, z: number): string {
    if (!this.meta) return 'Manzini';
    let best = 'Manzini', bd = 1e12;
    for (const p of this.meta.places) {
      if (!['city', 'town', 'suburb', 'neighbourhood', 'village'].includes(p.k)) continue;
      const w = p.k === 'city' || p.k === 'town' ? 0.55 : 1;
      const d = ((p.p[0] - x) ** 2 + (p.p[1] - z) ** 2) * w;
      if (d < bd) { bd = d; best = p.n; }
    }
    return best;
  }

  /** Indices of ways with a segment within r of (x,z) (uses the segment grid). */
  public waysNear(x: number, z: number, r: number): number[] {
    const seen = new Set<number>();
    for (let a = Math.floor((x - r) / 50); a <= Math.floor((x + r) / 50); a++) for (let b = Math.floor((z - r) / 50); b <= Math.floor((z + r) / 50); b++) {
      const list = this.cellRoads.get(a * 100003 + b); if (list) for (let k = 0; k < list.length; k += 2) seen.add(list[k]);
    }
    return [...seen];
  }

  /** Road polylines near a point, for the live minimap (uses the segment grid, not a scan of every way). */
  public nearbyRoads(x: number, z: number, r: number): { c: number; pts: number[] }[] {
    const seen = new Set<number>(); const out: { c: number; pts: number[] }[] = [];
    const c0x = Math.floor((x - r) / 50), c1x = Math.floor((x + r) / 50), c0z = Math.floor((z - r) / 50), c1z = Math.floor((z + r) / 50);
    for (let a = c0x; a <= c1x; a++) for (let b = c0z; b <= c1z; b++) {
      const list = this.cellRoads.get(a * 100003 + b); if (!list) continue;
      for (let k = 0; k < list.length; k += 2) { const wi = list[k]; if (seen.has(wi)) continue; seen.add(wi); const w = this.roadWays[wi]; out.push({ c: w.c, pts: w.p }); }
    }
    return out;
  }

  /** Quality tier multiplier on chunk draw distance. */
  public detailScale = 1;
  public setDetailScale(f: number): void { this.detailScale = f; this.visDirty = true; }
  private visDirty = true; private visX = 1e9; private visZ = 1e9; private visT = 0; private shadowT = 0;
  /** Streams chunks in/out by distance. Visibility only re-evaluates after moving ~12 m or 250 ms; new chunks force a refresh. */
  public update(px: number, pz: number): void {
    this.city?.update(px, pz);
    this.updateLampLight(px, pz);
    this.streets?.updateCars(px, pz);
    const now = performance.now();
    if (!this.visDirty && Math.hypot(px - this.visX, pz - this.visZ) < 12 && now - this.visT < 250) return;
    this.visDirty = false; this.visX = px; this.visZ = pz; this.visT = now;
    for (const t of this.terrainTiles) {
      const dx = Math.max(Math.abs(t.cx - px) - 640, 0), dz = Math.max(Math.abs(t.cz - pz) - 640, 0), d = Math.hypot(dx, dz);
      t.lod0.visible = d < 1500; t.lod1.visible = d >= 1500 && d < 5200;
    }
    const doShadow = this.shadowsOn && now - this.shadowT > 600; if (doShadow) this.shadowT = now;
    for (const c of this.chunks) {
      const dx = Math.max(Math.abs(c.cx - px) - c.half, 0), dz = Math.max(Math.abs(c.cz - pz) - c.half, 0); // exact distance to the chunk's box
      const d = Math.hypot(dx, dz);
      const ud = c.obj.userData; c.obj.visible = d < (ud['far'] ?? 3000) * this.detailScale && d >= (ud['near'] ?? 0) * this.detailScale;
      if (doShadow && c.obj.visible) c.obj.castShadow = d < 230; // only nearby geometry casts into the shadow map
    }
  }

  // ------------------------------------------------------------------ loading
  private async loadWorld(scene: THREE.Scene): Promise<void> {
    const base = 'assets/world/';
    const json = (n: string) => fetch(base + n).then((r) => r.json());
    const [meta, roads, blds, hbuf, tbuf, feats] = await Promise.all([
      json('meta.json'), json('roads.json'), json('buildings.json'),
      fetch(base + 'height.bin').then((r) => r.arrayBuffer()), fetch(base + 'trees.bin').then((r) => r.arrayBuffer()),
      json('features.json').catch(() => null),
    ]);
    this.meta = meta;
    this.dem = Float32Array.from(new Int16Array(hbuf), (v) => v / 10);
    this.groundCls = await this.loadClassRaster(base + 'groundclass.png', meta.gw, meta.gh);
    const groundTex = new THREE.TextureLoader().load(base + 'groundcolor.png');
    groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = 8;

    this.roadWays = roads.roads;
    this.bakeHeightGrid();
    this.indexRoads();
    this.buildTerrain(scene, groundTex);
    this.buildRoads(scene);
    this.waterPolys = (roads.water as { p: number[] }[]).map((q) => q.p);
    this.buildWater(scene, roads.water);
    this.city = new CityBuilder(this);
    this.city.build(scene, blds.b, blds.signs ?? []);
    this.streets = new StreetBuilder(this);
    this.streets.build(scene);
    new ExtrasBuilder(this, roads.rails ?? [], roads.crossings ?? []).build(scene);
    if (feats) { this.features = new FeaturesBuilder(this, feats as Features); this.features.build(); }
    this.flushProps();
    this.city.prime();
    this.buildTrees(scene, tbuf);
    this.buildStreetFurniture(scene);
    this.buildLabels(scene);
    this.highwayCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(meta.spawn.x, 0, meta.spawn.z),
      new THREE.Vector3(meta.spawn.x + Math.sin(meta.spawn.yaw) * 200, 0, meta.spawn.z + Math.cos(meta.spawn.yaw) * 200),
    ]);
    this.applyLandmarks();
    this.ready = true;
    this.readyCbs.splice(0).forEach((cb) => cb());
  }

  /** Re-anchor districts, speed traps, drift zones and jumps onto real MR3 locations. */
  private applyLandmarks(): void {
    const sn = this.meta.snaps;
    const dist: Record<string, string> = { MANZINI: 'manzini', MATSAPHA: 'matsapha', MALKERNS: 'malkerns', LOBAMBA: 'lobamba', EZULWINI: 'ezulwini', MBABANE: 'mbabane' };
    for (const d of DISTRICTS) if (sn[dist[d.id]]) d.centerPos = sn[dist[d.id]];
    const trapAt = ['manzini', 'matsapha', 'ezulwini', 'mbabane'];
    SPEED_TRAPS.forEach((t, i) => { if (sn[trapAt[i]]) t.position = sn[trapAt[i]]; });
    if (DRIFT_ZONES[0]) { DRIFT_ZONES[0].startPos = sn['ezulwini']; DRIFT_ZONES[0].endPos = sn['lobamba']; }
    if (DRIFT_ZONES[1]) { DRIFT_ZONES[1].startPos = sn['malkerns']; DRIFT_ZONES[1].endPos = sn['matsapha']; }
    if (DANGER_SIGNS[0]) DANGER_SIGNS[0].rampPos = sn['matsapha'];
  }

  private loadClassRaster(url: string, w: number, h: number): Promise<Uint8Array> {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true })!; ctx.drawImage(img, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data; const out = new Uint8Array(w * h);
        for (let i = 0; i < out.length; i++) out[i] = d[i * 4];
        resolve(out);
      };
      img.onerror = () => resolve(new Uint8Array(w * h).fill(1));
      img.src = url;
    });
  }

  private indexRoads(): void {
    this.roadWays.forEach((w, wi) => {
      if (w.c >= 8) return;
      const p = w.p;
      for (let s = 0; s + 3 < p.length; s += 2) {
        const ax = p[s] / 10, az = p[s + 1] / 10, bx = p[s + 2] / 10, bz = p[s + 3] / 10;
        const c0x = Math.floor(Math.min(ax, bx) / 50), c1x = Math.floor(Math.max(ax, bx) / 50);
        const c0z = Math.floor(Math.min(az, bz) / 50), c1z = Math.floor(Math.max(az, bz) / 50);
        for (let a = c0x; a <= c1x; a++) for (let b = c0z; b <= c1z; b++) {
          const k = a * 100003 + b; let l = this.cellRoads.get(k);
          if (!l) { l = []; this.cellRoads.set(k, l); }
          l.push(wi, s);
        }
      }
    });
  }

  public static loadTiled(url: string, rx: number, ry: number, srgb: boolean): THREE.Texture {
    const tex = new THREE.TextureLoader().load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Real photographic PBR set tiled in world space (uv = metres / tileM). */
  /** Stylized procedural stand-ins for the old tiled photo textures (kept by name so callers did not change). */
  public pbr(name: string, tile: number, rough = 0.9): THREE.MeshStandardMaterial {
    const map: Record<string, [StyleKind, number, number]> = { // name -> [kind, base colour, bump]
      asphalt_02: ['asphalt', 0x2c3140, 1.0], gravel_road: ['gravel', 0x8a7a68, 1.2], white_plaster_rough_01: ['panel', 0xffffff, 0.7], concrete_wall_007: ['panel', 0xe6e9ef, 0.7],
      brick_wall_02: ['brick', 0xffffff, 1.0], corrugated_iron: ['metal', 0xffffff, 1.0], herringbone_pavement_03: ['paver', 0xeae6e0, 1.0], concrete_pavement: ['slab', 0xe4e6ea, 0.9],
    };
    const [kind, col, bump] = map[name] ?? ['plate', 0xffffff, 0.8];
    const m = styledMaterial(kind, { color: col, rough, bump });
    m.userData['tile'] = tile;
    return m;
  }

  // ------------------------------------------------------------------ terrain
  private buildTerrain(scene: THREE.Scene, groundTex: THREE.Texture): void {
    const detail0 = 0; void detail0;
    const mat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 });
    const tPrevKey = 'terrain-style';
    mat.onBeforeCompile = (sh) => {
      sh.uniforms['uNoise'] = { value: noiseTex() };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;\n' + STYLE_FUNCS)
        .replace('#include <map_fragment>', `#include <map_fragment>
          float l1 = 0.12 + 0.5 * sfbm(vW.xz*0.21 + 3.0), l2 = sfbm(vW.xz*0.0113 + 7.0);
          float sat = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b)) - min(diffuseColor.r, min(diffuseColor.g, diffuseColor.b));
          float urban = 1.0 - smoothstep(0.03, 0.12, sat);
          float lum = mix(l1, 0.6 + (l1 - 0.35) * 0.45, urban);
          diffuseColor.rgb *= (0.45 + lum * 1.35) * (0.7 + l2 * 0.8);
          float lg = dot(diffuseColor.rgb, vec3(0.3, 0.59, 0.11));
          diffuseColor.rgb = mix(vec3(lg), diffuseColor.rgb, 1.28) * mix(vec3(0.84, 0.92, 0.86), vec3(1.0), urban);
          diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);`);
    };
    mat.customProgramCacheKey = () => tPrevKey; addLampLight(mat);
    this.buildTerrainTiles(scene, mat);
  }

  public terrainTiles: { lod0: THREE.Mesh; lod1: THREE.Mesh; cx: number; cz: number }[] = [];

  /** 1280 m tiles, each with a fine (40 m) and a coarse (320 m) mesh; skirts hide LOD seams. */
  private buildTerrainTiles(scene: THREE.Scene, mat: THREE.Material): void {
    const [x0, , z0] = this.meta.bounds, S = this.TS, nx = this.tnx, nz = this.tnz, TC = 32;
    const W = this.meta.gw * this.meta.px, Hh = this.meta.gh * this.meta.px;
    const H = (i: number, j: number) => this.tH[Math.max(0, Math.min(nz - 1, j)) * nx + Math.max(0, Math.min(nx - 1, i))];
    const make = (i0: number, j0: number, step: number): THREE.Mesh => {
      const iMax = Math.min(i0 + TC, nx - 1), jMax = Math.min(j0 + TC, nz - 1);
      const cols: number[] = [], rows: number[] = [];
      for (let i = i0; i < iMax; i += step) cols.push(i); cols.push(iMax);
      for (let j = j0; j < jMax; j += step) rows.push(j); rows.push(jMax);
      const cw = cols.length, rw = rows.length, count = cw * rw;
      const skirt = 2 * (cw + rw);
      const pos = new Float32Array((count + skirt) * 3), nor = new Float32Array((count + skirt) * 3), uv = new Float32Array((count + skirt) * 2);
      const put = (k: number, i: number, j: number, drop: number) => {
        const x = x0 + i * S, z = z0 + j * S, hL = H(i - step, j), hR = H(i + step, j), hU = H(i, j - step), hD = H(i, j + step);
        const nxv = hL - hR, nzv = hU - hD, ny = 2 * S * step, il = 1 / Math.hypot(nxv, ny, nzv);
        pos[k * 3] = x; pos[k * 3 + 1] = H(i, j) - drop; pos[k * 3 + 2] = z;
        nor[k * 3] = nxv * il; nor[k * 3 + 1] = ny * il; nor[k * 3 + 2] = nzv * il;
        uv[k * 2] = (x - x0) / W; uv[k * 2 + 1] = 1 - (z - z0) / Hh;
      };
      for (let r = 0; r < rw; r++) for (let c = 0; c < cw; c++) put(r * cw + c, cols[c], rows[r], 0);
      const idx: number[] = [];
      for (let r = 0; r < rw - 1; r++) for (let c = 0; c < cw - 1; c++) {
        const a = r * cw + c, b = a + 1, cc = a + cw, d = cc + 1; idx.push(a, cc, b, b, cc, d);
      }
      // skirts (vertical flaps dropped 14 m) around the four edges
      let k = count; const drop = 14;
      const edge = (pts: [number, number, number][], flip: boolean) => {
        const base = k;
        for (const [i, j] of pts) { put(k, i, j, drop); k++; }
        for (let q = 0; q < pts.length - 1; q++) {
          const a = pts[q][2], b = pts[q + 1][2], sa = base + q, sb = base + q + 1;
          if (flip) idx.push(a, b, sa, b, sb, sa); else idx.push(a, sa, b, b, sa, sb);
        }
      };
      edge(cols.map((i, c) => [i, rows[0], c] as [number, number, number]), false);
      edge(cols.map((i, c) => [i, rows[rw - 1], (rw - 1) * cw + c] as [number, number, number]), true);
      edge(rows.map((j, r) => [cols[0], j, r * cw] as [number, number, number]), true);
      edge(rows.map((j, r) => [cols[cw - 1], j, r * cw + cw - 1] as [number, number, number]), false);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1)); g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat); m.name = 'terrain'; m.receiveShadow = true; m.visible = false; scene.add(m); return m;
    };
    for (let j0 = 0; j0 < nz - 1; j0 += TC) for (let i0 = 0; i0 < nx - 1; i0 += TC) {
      this.terrainTiles.push({ lod0: make(i0, j0, 1), lod1: make(i0, j0, 8), cx: x0 + (i0 + TC / 2) * S, cz: z0 + (j0 + TC / 2) * S });
    }
    this.terrainMesh = this.terrainTiles[0].lod0;
  }

  // ------------------------------------------------------------------ roads
  private chunkOf(map: Map<string, Map<string, GeoBuf>>, x: number, z: number, mat: string, size = CHUNK): GeoBuf {
    const k = `${Math.floor(x / size)},${Math.floor(z / size)}`;
    let m = map.get(k); if (!m) { m = new Map(); map.set(k, m); }
    let b = m.get(mat); if (!b) { b = new GeoBuf(); m.set(mat, b); }
    return b;
  }

  private emit(map: Map<string, Map<string, GeoBuf>>, mats: Record<string, THREE.Material>, withColor: boolean, withWin: boolean, far: number, shadow: boolean, onMesh?: (m: THREE.Mesh) => void, size = CHUNK): void {
    map.forEach((m, key) => {
      const [cxI, czI] = key.split(',').map(Number); const cx = (cxI + 0.5) * size, cz = (czI + 0.5) * size;
      m.forEach((buf, mk) => {
        if (buf.empty) return;
        const mesh = new THREE.Mesh(buf.toGeometry(withColor, withWin), mats[mk]);
        mesh.name = 'road:' + mk; mesh.receiveShadow = shadow; mesh.castShadow = shadow; mesh.userData['far'] = far;
        onMesh?.(mesh);
        mesh.visible = false; this.visDirty = true; this.chunks.push({ obj: mesh, cx, cz, r: size * 0.75, half: size / 2 });
        this.landmarksGroup.add(mesh);
      });
    });
  }

  private buildRoads(scene: THREE.Scene): void {
    const asph = this.pbr('asphalt_02', 5, 0.88), dirt = this.pbr('gravel_road', 4, 0.95);
    for (const m of [asph, dirt]) {
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
    }
    // world-space UVs => repeat is 1/tile on uv=metres
    const markTex = () => {
      const c = document.createElement('canvas'); c.width = 256; c.height = 256; const x = c.getContext('2d')!;
      x.clearRect(0, 0, 256, 256); x.fillStyle = 'rgba(240,240,235,0.92)';
      for (const o of [0, 128]) { x.fillRect(o + 6, 0, 5, 256); x.fillRect(o + 117, 0, 5, 256); }
      x.fillRect(128 + 61, 20, 6, 110);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    };
    const mk = () => new THREE.MeshStandardMaterial({ map: markTex(), transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    const water = new THREE.MeshStandardMaterial({ color: 0x3b6f8a, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.9 });
    const mats: Record<string, THREE.Material> = { asph, dirt, mark: mk(), water };
    addLampLight(mats['mark']); this.markMat = mats['mark'] as THREE.MeshStandardMaterial; this.asphMat = asph as THREE.MeshStandardMaterial;
    const map = new Map<string, Map<string, GeoBuf>>();
    const YOFF = WorldBuilder.ROAD_LIFT; const RC = 1600;

    for (const w of this.roadWays) {
      // resample to <= 16 m
      const pts: [number, number][] = []; const dzs: number[] = []; const dzv = w.dz ? w.dz.map((v) => v / 10) : null;
      for (let i = 0; i + 1 < w.p.length; i += 2) {
        const x = w.p[i] / 10, z = w.p[i + 1] / 10;
        if (i === 0) { pts.push([x, z]); dzs.push(dzv ? dzv[0] : 0); continue; }
        const [px, pz] = pts[pts.length - 1]; const L = Math.hypot(x - px, z - pz), n = Math.max(1, Math.ceil(L / 8));
        for (let k = 1; k <= n; k++) { pts.push([px + ((x - px) * k) / n, pz + ((z - pz) * k) / n]); dzs.push(dzv ? dzv[i / 2 - 1] + (dzv[i / 2] - dzv[i / 2 - 1]) * (k / n) : 0); }
      }
      if (pts.length < 2) continue;
      const hw = w.w / 2; const L: [number, number][] = [], R: [number, number][] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        let tx = b[0] - a[0], tz = b[1] - a[1]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
        L.push([pts[i][0] - tz * hw, pts[i][1] + tx * hw]); R.push([pts[i][0] + tz * hw, pts[i][1] - tx * hw]);
      }
      const isDirt = w.u === 1 || w.c >= 7, isWater = w.c === 9;
      const matKey = isWater ? 'water' : (isDirt ? 'dirt' : 'asph');
      const y0 = YOFF[w.c], dash = w.w >= 6.2;
      // deck heights: elevated sections are flat across their width (terrain at the centreline + lift + overpass dz)
      const yc = pts.map((p, i) => this.calculateRawTerrainHeight(p[0], p[1]) + y0 + dzs[i]);
      const yl = L.map((p, i) => (dzs[i] > 0.25 ? yc[i] : this.calculateRawTerrainHeight(p[0], p[1]) + y0));
      const yr = R.map((p, i) => (dzs[i] > 0.25 ? yc[i] : this.calculateRawTerrainHeight(p[0], p[1]) + y0));
      if (w.br && w.c <= 6) { const maxDz = Math.max(...dzs); this.bridges.addWay(pts, L, R, yl, yr, yc, hw, !w.bk && maxDz > 0.25); }
      let cum = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
        const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const buf = this.chunkOf(map, mx, mz, matKey, RC);
        const q = [L[i], R[i], L[i + 1], R[i + 1]];
        const qy = [yl[i], yr[i], yl[i + 1], yr[i + 1]];
        const ids = q.map((p, qi) => buf.vert(p[0], qy[qi], p[1], 0, 1, 0, p[0], p[1], [1, 1, 1]));
        buf.tri(ids[0], ids[2], ids[1]); buf.tri(ids[1], ids[2], ids[3]);
        if (w.c <= 4 && !isDirt) {
          const mb = this.chunkOf(map, mx, mz, 'mark', RC); const uo = dash ? 0.5 : 0;
          const mid = [mb.vert(L[i][0], yl[i] + 0.02, L[i][1], 0, 1, 0, uo, cum / 12, [1, 1, 1]),
            mb.vert(R[i][0], yr[i] + 0.02, R[i][1], 0, 1, 0, uo + 0.5, cum / 12, [1, 1, 1]),
            mb.vert(L[i + 1][0], yl[i + 1] + 0.02, L[i + 1][1], 0, 1, 0, uo, (cum + seg) / 12, [1, 1, 1]),
            mb.vert(R[i + 1][0], yr[i + 1] + 0.02, R[i + 1][1], 0, 1, 0, uo + 0.5, (cum + seg) / 12, [1, 1, 1])];
          mb.tri(mid[0], mid[2], mid[1]); mb.tri(mid[1], mid[2], mid[3]);
        }
        cum += seg;
      }
    }
    this.bridges.finish();
    this.emit(map, mats, false, false, 1900, false, (m) => { if (m.material === asph) this.roadMeshes.push(m); }, RC);
    // Planar UV: uv = metres, textures repeat 1/tile
    { const t = (mats['mark'] as THREE.MeshStandardMaterial).map!; t.repeat.set(1, 1); }
  }

  private buildWater(scene: THREE.Scene, polys: { p: number[] }[]): void {
    const mat = new THREE.MeshStandardMaterial({ color: 0x35657f, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.92 });
    const buf = new GeoBuf();
    for (const wp of polys) {
      const c: THREE.Vector2[] = []; let minH = 1e9;
      for (let i = 0; i < wp.p.length; i += 2) { const x = wp.p[i] / 10, z = wp.p[i + 1] / 10; c.push(new THREE.Vector2(x, z)); minH = Math.min(minH, this.calculateRawTerrainHeight(x, z)); }
      if (c.length > 2 && c[0].equals(c[c.length - 1])) c.pop();
      if (c.length < 3) continue;
      const tris = THREE.ShapeUtils.triangulateShape(c, []);
      const base = buf.pos.length / 3;
      c.forEach((p) => buf.vert(p.x, minH - 0.05, p.y, 0, 1, 0, p.x * 0.05, p.y * 0.05, [1, 1, 1]));
      for (const t of tris) {
        const [a, b, d] = t; const cr = (c[b].x - c[a].x) * (c[d].y - c[a].y) - (c[b].y - c[a].y) * (c[d].x - c[a].x);
        if (cr < 0) buf.tri(base + a, base + b, base + d); else buf.tri(base + a, base + d, base + b);
      }
    }
    if (!buf.empty) { const m = new THREE.Mesh(buf.toGeometry(false), mat); m.frustumCulled = false; scene.add(m); }
  }

  // ------------------------------------------------------------------ buildings
  public static hash(a: number, b: number): number { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

  // ------------------------------------------------------------------ trees
  private buildTrees(scene: THREE.Scene, buf: ArrayBuffer): void {
    const dv = new DataView(buf); const n = buf.byteLength / 9;
    const trunk = new THREE.CylinderGeometry(0.2, 0.32, 3.2, 5); trunk.translate(0, 1.6, 0);
    const mkCanopy = (r: number, y: number) => { const g = new THREE.IcosahedronGeometry(r, 0); g.translate(0, y, 0); return g; };
    const paint = (g: THREE.BufferGeometry, c: THREE.Color) => { const a = new Float32Array(g.attributes['position'].count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed(); };
    const geo = mergeGeometries([paint(trunk, new THREE.Color(0x4a3524)), paint(mkCanopy(2.4, 4.4), new THREE.Color(0xffffff)), paint(mkCanopy(1.7, 5.8), new THREE.Color(0xffffff))].map((g) => { g.deleteAttribute('uv'); return g; }))!;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    const TCH = 300;   // tree cells: small enough that distant trees really drop out (was one 800 m block)
    const byChunk = new Map<string, { x: number; z: number; c: number }[]>();
    const all: { x: number; z: number; c: number }[] = this.streets.streetTrees.concat(this.extraTrees);
    for (let i = 0; i < n; i++) all.push({ x: dv.getFloat32(i * 9, true), z: dv.getFloat32(i * 9 + 4, true), c: dv.getUint8(i * 9 + 8) });
    for (const { x, z, c } of all) {
      if (this.roadAt(x, z)) continue;
      if (this.nearBuilding(x, z)) continue;
      this.collision.addCircle(x, z, 0.38);
      const k = `${Math.floor(x / TCH)},${Math.floor(z / TCH)}`; let l = byChunk.get(k); if (!l) { l = []; byChunk.set(k, l); } l.push({ x, z, c });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    byChunk.forEach((list, key) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length); im.name = 'trees'; im.castShadow = true;
      list.forEach((t, i) => {
        const s = 0.7 + WorldBuilder.hash(t.x, t.z) * 0.9;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), WorldBuilder.hash(t.z, t.x) * 6.28);
        m4.compose(new THREE.Vector3(t.x, this.calculateRawTerrainHeight(t.x, t.z) - 0.2, t.z), q, new THREE.Vector3(s, s * (t.c === 5 ? 1.5 : 1), s));
        im.setMatrixAt(i, m4);
        const r = WorldBuilder.hash(t.x * 2, t.z * 3);
        if (t.c === 5) col.setRGB(0.1 + r * 0.06, 0.25 + r * 0.14, 0.1 + r * 0.05);
        else if (t.c === 10 || (t.c === 8 && r > 0.82)) col.setRGB(0.5 + r * 0.1, 0.34, 0.74); // jacaranda blossom
        else col.setRGB(0.22 + r * 0.12, 0.42 + r * 0.14, 0.18 + r * 0.06);
        im.setColorAt(i, col);
      });
      im.userData['far'] = 380; im.computeBoundingSphere();
      const [cxI, czI] = key.split(',').map(Number);
      im.visible = false; this.visDirty = true; this.chunks.push({ obj: im, cx: (cxI + 0.5) * TCH, cz: (czI + 0.5) * TCH, r: TCH * 0.75, half: TCH / 2 });
      this.foliageGroup.add(im);
    });
  }

  public overlapsRoad(pts: [number, number][], cx: number, cz: number): boolean {
    if (this.roadAt(cx, cz)) return true;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      if (this.roadAt(a[0], a[1]) || this.roadAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)) return true;
    }
    return false;
  }

  private nearBuilding(x: number, z: number): boolean {
    const cx = Math.floor(x / 40), cz = Math.floor(z / 40);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = this.bGrid.get((cx + a) * 100003 + (cz + b)); if (!l) continue;
      for (let i = 0; i < l.length; i += 3) if (Math.hypot(x - l[i], z - l[i + 1]) < l[i + 2] + 2) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ lamps, signals
  private lampGrid = new Map<number, number[]>(); private lampT = 0; private lampX = 1e9; private lampZ = 1e9;
  /** Feed the 16 nearest lamps to the shader (throttled; moves with the player). */
  private updateLampLight(px: number, pz: number): void {
    if (LAMP.uLampOn.value < 0.01) return; const now = performance.now();
    if (now - this.lampT < 160 && Math.hypot(px - this.lampX, pz - this.lampZ) < 6) return; this.lampT = now; this.lampX = px; this.lampZ = pz;
    if (!this.lampGrid.size) this.lampSpots.forEach((l, i) => { const k = Math.floor(l.x / 60) * 100003 + Math.floor(l.z / 60); let a = this.lampGrid.get(k); if (!a) { a = []; this.lampGrid.set(k, a); } a.push(i); });
    const cx = Math.floor(px / 60), cz = Math.floor(pz / 60), cand: { d: number; i: number }[] = [];
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const l = this.lampGrid.get((cx + a) * 100003 + (cz + b)); if (l) for (const i of l) { const s = this.lampSpots[i], hx = s.x + Math.cos(s.rot) * 2.5, hz = s.z - Math.sin(s.rot) * 2.5; cand.push({ d: Math.hypot(hx - px, hz - pz), i }); } }
    cand.sort((p, q) => p.d - q.d);
    for (let k = 0; k < SLOT.LAMPS; k++) { const c = cand[k]; if (!c || c.d > 110) { clearEmitter(SLOT.LAMP + k); continue; } const l = this.lampSpots[c.i], hx = l.x + Math.cos(l.rot) * 2.5, hz = l.z - Math.sin(l.rot) * 2.5; setEmitter(SLOT.LAMP + k, hx, this.groundHeightAt(l.x, l.z) + 8.9, hz, 38, 1.0, 0.7, 0.38, 1.0); }
    // shop signs / lit windows: the nearest few commercial buildings tint the street with their own colour
    const em = this.city?.emittersNear(px, pz, SLOT.SHOPS, 80) ?? [];
    for (let k = 0; k < SLOT.SHOPS; k++) { const e = em[k]; if (!e) { clearEmitter(SLOT.SHOP + k); continue; } setEmitter(SLOT.SHOP + k, e.x, this.groundHeightAt(e.x, e.z) + 4.2, e.z, e.r, e.col[0], e.col[1], e.col[2], e.s); }
  }
  private glowMat?: THREE.MeshBasicMaterial; private static _glowGeo?: THREE.BufferGeometry;
  private static glowGeo(): THREE.BufferGeometry { return (WorldBuilder._glowGeo ??= new THREE.CircleGeometry(7, 20).rotateX(-Math.PI / 2)); }
  private makeGlowMat(): THREE.MeshBasicMaterial {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!; const gr = g.createRadialGradient(64, 64, 2, 64, 64, 62);
    gr.addColorStop(0, 'rgba(255,214,150,0.95)'); gr.addColorStop(0.35, 'rgba(255,190,110,0.38)'); gr.addColorStop(1, 'rgba(255,170,90,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    return new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6 });
  }
  /** 0..1 night factor from the scene: fades the lamp light pools in and out. */
  public setNightGlow(n: number): void { const k = Math.max(0, (n - 0.15) / 0.85); LAMP.uLampOn.value = k; if (this.glowMat) this.glowMat.opacity = k * 0.9; }
  public lampSpots: { x: number; z: number; rot: number }[] = [];
  private buildStreetFurniture(scene: THREE.Scene): void {
    const poleG = new THREE.CylinderGeometry(0.1, 0.16, 9, 6); poleG.translate(0, 4.5, 0);
    const armG = new THREE.BoxGeometry(2.6, 0.12, 0.14); armG.translate(1.3, 9, 0);
    const headG = new THREE.BoxGeometry(0.9, 0.16, 0.38); headG.translate(2.5, 8.9, 0);
    const pole = mergeGeometries([poleG, armG].map((g) => g.toNonIndexed()))!;
    const poleM = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.35 });
    const headM = new THREE.MeshBasicMaterial({ color: 0xfff1c0 });
    const spots: { x: number; z: number; rot: number }[] = [];
    // real OSM street lamps first (arm turned toward the nearest carriageway); procedural ones then skip anywhere near a real lamp
    for (const [lx, lz] of this.meta.lamps ?? []) {
      const rd = this.nearestRoadSegment(lx, lz, 8); if (!rd || rd.dist > 25 || rd.way.dz) continue;
      const dx = rd.px - lx, dz = rd.pz - lz; spots.push({ x: lx, z: lz, rot: Math.atan2(-dz, dx) });
    }
    const real = spots.slice();
    for (const w of this.roadWays) {
      if (w.c > 3 || w.dz) continue;
      let acc = 0;
      for (let i = 0; i + 3 < w.p.length; i += 2) {
        const ax = w.p[i] / 10, az = w.p[i + 1] / 10, bx = w.p[i + 2] / 10, bz = w.p[i + 3] / 10; const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        for (let s = (50 - acc) % 50; s < L; s += 50) {
          const x = ax + tx * s, z = az + tz * s;
          if (Math.hypot(x, z) > 6500) continue;
          if (real.length && real.some((r) => Math.abs(r.x - x) < 22 && Math.abs(r.z - z) < 22)) continue;
          const side = w.o ? 1 : (Math.floor(x / 50 + z / 50) % 2 ? 1 : -1);
          const nx = -tz * side, nz = tx * side, off = w.w / 2 + 1.4;
          // arm (+x of the lamp) points back toward the carriageway: direction (-nx, -nz)
          spots.push({ x: x + nx * off, z: z + nz * off, rot: Math.atan2(nz, -nx) });
        }
        acc = (acc + L) % 50;
      }
    }
    this.lampSpots = spots.slice(0, 2500);
    for (const l of this.lampSpots) this.collision.addCircle(l.x, l.z, 0.28);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    const byChunk = new Map<string, { x: number; z: number; rot: number }[]>();
    for (const l of this.lampSpots) { const k = `${Math.floor(l.x / CHUNK)},${Math.floor(l.z / CHUNK)}`; let a = byChunk.get(k); if (!a) { a = []; byChunk.set(k, a); } a.push(l); }
    byChunk.forEach((list, key) => {
      const poles = new THREE.InstancedMesh(pole, poleM, list.length), heads = new THREE.InstancedMesh(headG, headM, list.length); poles.name = heads.name = 'lamps';
      list.forEach((s, i) => { q.setFromAxisAngle(up, s.rot); m4.compose(new THREE.Vector3(s.x, this.calculateRawTerrainHeight(s.x, s.z) + (this.onPavement(s.x, s.z) ? 0.3 : 0), s.z), q, new THREE.Vector3(1, 1, 1)); poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4); });
      // stylised light pool on the ground under each lamp (additive, strength follows the night factor)
      { this.glowMat ??= this.makeGlowMat(); const glow = new THREE.InstancedMesh(WorldBuilder.glowGeo(), this.glowMat, list.length); glow.name = 'lamp-glow'; glow.renderOrder = 3;
        list.forEach((l2, i) => { const gx = l2.x + Math.cos(l2.rot) * 2.3, gz = l2.z - Math.sin(l2.rot) * 2.3; m4.compose(new THREE.Vector3(gx, this.groundHeightAt(gx, gz) + 0.07, gz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1)); glow.setMatrixAt(i, m4); });
        glow.computeBoundingSphere?.(); const [gx2, gz2] = key.split(',').map(Number); this.registerChunk(glow, (gx2 + 0.5) * CHUNK, (gz2 + 0.5) * CHUNK, CHUNK * 0.75, 320); this.roadInfrastructureGroup.add(glow); }
      poles.computeBoundingSphere(); heads.computeBoundingSphere(); const [ix, iz] = key.split(',').map(Number);
      for (const o of [poles, heads]) { this.registerChunk(o, (ix + 0.5) * CHUNK, (iz + 0.5) * CHUNK, CHUNK * 0.75, 460); this.roadInfrastructureGroup.add(o); }
    });
  }

  // ------------------------------------------------------------------ labels
  private buildLabels(scene: THREE.Scene): void {
    const shown = this.meta.pois.filter((p) => Math.hypot(p.p[0], p.p[1]) < 3200 && ['mall', 'supermarket', 'marketplace', 'hospital', 'bus_station', 'fuel', 'college', 'university'].includes(p.k)).slice(0, 40);
    for (const p of shown) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 96; const x = c.getContext('2d')!;
      x.fillStyle = 'rgba(9,9,11,.78)'; x.beginPath(); x.roundRect(4, 8, 504, 80, 24); x.fill();
      x.strokeStyle = '#fbbf24'; x.lineWidth = 3; x.stroke();
      x.fillStyle = '#fff'; x.font = '700 38px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(p.n.slice(0, 26), 256, 50);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, fog: false }));
      s.scale.set(26, 4.9, 1); s.position.set(p.p[0], this.calculateRawTerrainHeight(p.p[0], p.p[1]) + 20, p.p[1]);
      s.userData['far'] = 700; this.chunks.push({ obj: s, cx: p.p[0], cz: p.p[1], r: 0, half: 0 });
      this.landmarksGroup.add(s);
    }
  }
}
