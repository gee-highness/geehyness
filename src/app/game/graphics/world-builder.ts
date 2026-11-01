import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { AssetLibrary } from './asset-library';
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
  snaps: Record<string, [number, number]>;
}
interface RoadWay { c: number; w: number; u: number; o: number; n: string; p: number[] }

/** Growable geometry buffers. */
class GeoBuf {
  pos: number[] = []; nor: number[] = []; uv: number[] = []; col: number[] = []; win: number[] = []; idx: number[] = [];
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: number[], w = 0): number {
    this.pos.push(x, y, z); this.nor.push(nx, ny, nz); this.uv.push(u, v); this.col.push(c[0], c[1], c[2]); this.win.push(w);
    return this.pos.length / 3 - 1;
  }
  tri(a: number, b: number, c: number): void { this.idx.push(a, b, c); }
  get empty(): boolean { return this.idx.length === 0; }
  toGeometry(withColor = true, withWin = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    if (withWin) g.setAttribute('aWin', new THREE.Float32BufferAttribute(this.win, 1));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

export const WORLD: { current?: WorldBuilder } = {};
const CHUNK = 800;
const HOUSE_TINTS: number[][] = [[0.95, 0.94, 0.9], [0.96, 0.9, 0.78], [0.95, 0.82, 0.7], [0.78, 0.86, 0.93], [0.8, 0.9, 0.78], [0.97, 0.9, 0.64], [0.9, 0.72, 0.6], [0.88, 0.88, 0.88]];
const ROOF_TINTS: number[][] = [[0.78, 0.78, 0.8], [0.8, 0.36, 0.3], [0.38, 0.55, 0.42], [0.55, 0.2, 0.18], [0.9, 0.9, 0.92], [0.4, 0.45, 0.6], [0.6, 0.5, 0.45]];
const CONCRETE_TINTS: number[][] = [[0.85, 0.85, 0.85], [0.95, 0.93, 0.88], [0.75, 0.78, 0.8], [0.9, 0.82, 0.7]];

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
  public meta!: WorldMeta;
  public roadWays: RoadWay[] = [];
  private readyCbs: (() => void)[] = [];
  private dem!: Float32Array;
  private groundCls!: Uint8Array;
  private cellRoads = new Map<number, number[]>();
  private chunks: { obj: THREE.Object3D; cx: number; cz: number; r: number }[] = [];
  private bGrid = new Map<number, number[]>();

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
  /** Smooth (bicubic) real-world elevation in metres, relative to the Manzini datum. */
  public calculateRawTerrainHeight(x: number, z: number): number {
    if (!this.dem) return 0;
    const d = this.meta.dem;
    const u = Math.max(0, Math.min(d.nx - 1.001, (x - d.x0) / d.step)), v = Math.max(0, Math.min(d.nz - 1.001, (z - d.z0) / d.step));
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    const row = (jj: number) => WorldBuilder.cr(this.cell(i - 1, jj), this.cell(i, jj), this.cell(i + 1, jj), this.cell(i + 2, jj), fu);
    return WorldBuilder.cr(row(j - 1), row(j), row(j + 1), row(j + 2), fv) - 610;
  }

  private groundClassAt(x: number, z: number): number {
    if (!this.groundCls) return 1;
    const m = this.meta;
    const ix = Math.floor((x - m.bounds[0]) / m.px), iz = Math.floor((z - m.bounds[2]) / m.px);
    if (ix < 0 || iz < 0 || ix >= m.gw || iz >= m.gh) return 1;
    return this.groundCls[iz * m.gw + ix] || 1;
  }

  /** Nearest drivable road under (x,z) within its half-width. */
  public roadAt(x: number, z: number): RoadWay | null {
    const cx = Math.floor(x / 50), cz = Math.floor(z / 50);
    let best: RoadWay | null = null, bd = 1e9;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = this.cellRoads.get((cx + a) * 100003 + (cz + b));
      if (!list) continue;
      for (let k = 0; k < list.length; k += 2) {
        const w = this.roadWays[list[k]]; if (w.c >= 8) continue;
        const p = w.p, s = list[k + 1];
        const ax = p[s] / 10, az = p[s + 1] / 10, bx = p[s + 2] / 10, bz = p[s + 3] / 10;
        const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
        const d = Math.hypot(x - (ax + t * dx), z - (az + t * dz));
        if (d < w.w / 2 + 0.3 && d < bd) { bd = d; best = w; }
      }
    }
    return best;
  }

  public classifySurfaceAt(x: number, z: number, _h?: number): number {
    const r = this.roadAt(x, z);
    if (r) return r.u ? 7 : 11;
    return this.groundClassAt(x, z);
  }

  public queryGround(x: number, z: number): GroundQueryResult {
    const height = this.calculateRawTerrainHeight(x, z);
    const e = 0.6;
    const hL = this.calculateRawTerrainHeight(x - e, z), hR = this.calculateRawTerrainHeight(x + e, z);
    const hD = this.calculateRawTerrainHeight(x, z - e), hU = this.calculateRawTerrainHeight(x, z + e);
    const normal = new THREE.Vector3(hL - hR, 2 * e, hD - hU).normalize();
    const road = this.roadAt(x, z);
    const cls = road ? (road.u ? 7 : 11) : this.groundClassAt(x, z);
    const names: Record<number, string> = { 1: 'Bushveld', 2: 'Grassland', 3: 'Pasture', 4: 'Farmland', 5: 'Forest floor', 6: 'Rock', 7: 'Dirt road', 8: 'Town ground', 9: 'Industrial ground', 10: 'Sand', 11: 'Asphalt', 12: 'Wetland' };
    return { height, normal, surfaceClass: cls, surfaceName: road && road.n ? road.n : (names[cls] ?? 'Ground') };
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

  /** Road polylines near a point, for the live minimap. */
  public nearbyRoads(x: number, z: number, r: number): { c: number; pts: number[] }[] {
    const out: { c: number; pts: number[] }[] = [];
    for (const w of this.roadWays) {
      const p = w.p; let hit = false;
      for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] / 10 - x) < r && Math.abs(p[i + 1] / 10 - z) < r) { hit = true; break; }
      if (hit) out.push({ c: w.c, pts: p });
    }
    return out;
  }

  /** Streams chunks in/out by distance so mobile GPUs stay happy. */
  public update(px: number, pz: number): void {
    for (const c of this.chunks) {
      const d = Math.hypot(c.cx - px, c.cz - pz) - c.r;
      c.obj.visible = d < (c.obj.userData['far'] ?? 3000);
    }
  }

  // ------------------------------------------------------------------ loading
  private async loadWorld(scene: THREE.Scene): Promise<void> {
    const base = 'assets/world/';
    const json = (n: string) => fetch(base + n).then((r) => r.json());
    const [meta, roads, blds, hbuf, tbuf] = await Promise.all([
      json('meta.json'), json('roads.json'), json('buildings.json'),
      fetch(base + 'height.bin').then((r) => r.arrayBuffer()), fetch(base + 'trees.bin').then((r) => r.arrayBuffer()),
    ]);
    this.meta = meta;
    this.dem = Float32Array.from(new Int16Array(hbuf), (v) => v / 10);
    this.groundCls = await this.loadClassRaster(base + 'groundclass.png', meta.gw, meta.gh);
    const groundTex = new THREE.TextureLoader().load(base + 'groundcolor.png');
    groundTex.colorSpace = THREE.SRGBColorSpace; groundTex.anisotropy = 8;

    this.roadWays = roads.roads;
    this.indexRoads();
    this.buildTerrain(scene, groundTex);
    this.buildRoads(scene);
    this.buildWater(scene, roads.water);
    this.buildBuildings(scene, blds.b);
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
  private pbr(name: string, tile: number, rough = 0.9): THREE.MeshStandardMaterial {
    const map = WorldBuilder.loadTiled(`assets/tex/${name}_diff.jpg`, 1, 1, true);
    const nrm = WorldBuilder.loadTiled(`assets/tex/${name}_nor_gl.jpg`, 1, 1, false);
    const m = new THREE.MeshStandardMaterial({ map, normalMap: nrm, roughness: rough, metalness: 0.02 });
    m.userData['tile'] = tile;
    return m;
  }

  // ------------------------------------------------------------------ terrain
  private buildTerrain(scene: THREE.Scene, groundTex: THREE.Texture): void {
    const [x0, x1, z0, z1] = this.meta.bounds; const S = 120;
    const nx = Math.ceil((x1 - x0) / S) + 1, nz = Math.ceil((z1 - z0) / S) + 1;
    const pos = new Float32Array(nx * nz * 3), uv = new Float32Array(nx * nz * 2);
    const W = this.meta.gw * this.meta.px, Hh = this.meta.gh * this.meta.px;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const x = x0 + i * S, z = z0 + j * S, k = j * nx + i;
      pos[k * 3] = x; pos[k * 3 + 1] = this.calculateRawTerrainHeight(x, z); pos[k * 3 + 2] = z;
      uv[k * 2] = (x - x0) / W; uv[k * 2 + 1] = 1 - (z - z0) / Hh;
    }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6); let n = 0;
    for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
      idx[n++] = a; idx[n++] = c; idx[n++] = b; idx[n++] = b; idx[n++] = c; idx[n++] = d;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1)); g.computeVertexNormals();
    const detail = WorldBuilder.loadTiled('assets/tex/leafy_grass_diff.jpg', 1, 1, true);
    const rock = WorldBuilder.loadTiled('assets/tex/red_laterite_soil_stones_diff.jpg', 1, 1, true);
    const mat = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95, metalness: 0 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms['detailTex'] = { value: detail }; sh.uniforms['rockTex'] = { value: rock };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vW;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(transformed,1.0)).xyz;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vW; uniform sampler2D detailTex; uniform sampler2D rockTex;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          vec3 d1 = texture2D(detailTex, vW.xz*0.16).rgb; vec3 d2 = texture2D(detailTex, vW.xz*0.0113+7.0).rgb; vec3 r1 = texture2D(rockTex, vW.xz*0.11).rgb;
          float l1 = dot(d1, vec3(0.333)), l2 = dot(d2, vec3(0.333)), lr = dot(r1, vec3(0.333));
          float redness = clamp((diffuseColor.r - diffuseColor.g) * 3.0, 0.0, 1.0);
          float lum = mix(l1, lr, redness);
          diffuseColor.rgb *= (0.45 + lum * 1.35) * (0.7 + l2 * 0.8);`);
    };
    this.terrainMesh = new THREE.Mesh(g, mat);
    this.terrainMesh.name = 'RealTerrain'; this.terrainMesh.receiveShadow = true; this.terrainMesh.frustumCulled = false;
    scene.add(this.terrainMesh);
  }

  // ------------------------------------------------------------------ roads
  private chunkOf(map: Map<string, Map<string, GeoBuf>>, x: number, z: number, mat: string): GeoBuf {
    const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
    let m = map.get(k); if (!m) { m = new Map(); map.set(k, m); }
    let b = m.get(mat); if (!b) { b = new GeoBuf(); m.set(mat, b); }
    return b;
  }

  private emit(map: Map<string, Map<string, GeoBuf>>, mats: Record<string, THREE.Material>, withColor: boolean, withWin: boolean, far: number, shadow: boolean, onMesh?: (m: THREE.Mesh) => void): void {
    map.forEach((m, key) => {
      const [cxI, czI] = key.split(',').map(Number); const cx = (cxI + 0.5) * CHUNK, cz = (czI + 0.5) * CHUNK;
      m.forEach((buf, mk) => {
        if (buf.empty) return;
        const mesh = new THREE.Mesh(buf.toGeometry(withColor, withWin), mats[mk]);
        mesh.receiveShadow = shadow; mesh.castShadow = shadow; mesh.userData['far'] = far;
        onMesh?.(mesh);
        this.chunks.push({ obj: mesh, cx, cz, r: CHUNK * 0.75 });
        this.landmarksGroup.add(mesh);
      });
    });
  }

  private buildRoads(scene: THREE.Scene): void {
    const asph = this.pbr('asphalt_02', 5, 0.88), dirt = this.pbr('gravel_road', 4, 0.95);
    for (const m of [asph, dirt]) {
      m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2;
      const tile = m.userData['tile'];
      for (const t of [m.map!, m.normalMap!]) { t.repeat.set(1 / tile, 1 / tile); }
    }
    // world-space UVs => repeat is 1/tile on uv=metres
    const markTex = (dash: boolean) => {
      const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d')!;
      x.clearRect(0, 0, 128, 256); x.fillStyle = 'rgba(240,240,235,0.92)';
      x.fillRect(6, 0, 5, 256); x.fillRect(117, 0, 5, 256);
      if (dash) { x.fillRect(61, 20, 6, 110); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
    };
    const mk = (dash: boolean) => new THREE.MeshStandardMaterial({ map: markTex(dash), transparent: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false });
    const water = new THREE.MeshStandardMaterial({ color: 0x3b6f8a, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.9 });
    const mats: Record<string, THREE.Material> = { asph, dirt, mark1: mk(false), mark2: mk(true), water };
    const map = new Map<string, Map<string, GeoBuf>>();
    const YOFF = [0.18, 0.16, 0.14, 0.12, 0.1, 0.08, 0.06, 0.05, 0.04, -0.3];

    for (const w of this.roadWays) {
      // resample to <= 16 m
      const pts: [number, number][] = [];
      for (let i = 0; i + 1 < w.p.length; i += 2) {
        const x = w.p[i] / 10, z = w.p[i + 1] / 10;
        if (i === 0) { pts.push([x, z]); continue; }
        const [px, pz] = pts[pts.length - 1]; const L = Math.hypot(x - px, z - pz), n = Math.max(1, Math.ceil(L / 16));
        for (let k = 1; k <= n; k++) pts.push([px + ((x - px) * k) / n, pz + ((z - pz) * k) / n]);
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
      let cum = 0;
      for (let i = 0; i + 1 < pts.length; i++) {
        const mx = (pts[i][0] + pts[i + 1][0]) / 2, mz = (pts[i][1] + pts[i + 1][1]) / 2;
        const seg = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
        const buf = this.chunkOf(map, mx, mz, matKey);
        const q = [L[i], R[i], L[i + 1], R[i + 1]];
        const ids = q.map((p) => buf.vert(p[0], this.calculateRawTerrainHeight(p[0], p[1]) + y0, p[1], 0, 1, 0, p[0], p[1], [1, 1, 1]));
        buf.tri(ids[0], ids[2], ids[1]); buf.tri(ids[1], ids[2], ids[3]);
        if (w.c <= 4 && !isDirt) {
          const mb = this.chunkOf(map, mx, mz, dash ? 'mark2' : 'mark1');
          const mid = [mb.vert(L[i][0], this.calculateRawTerrainHeight(L[i][0], L[i][1]) + y0 + 0.02, L[i][1], 0, 1, 0, 0, cum / 12, [1, 1, 1]),
            mb.vert(R[i][0], this.calculateRawTerrainHeight(R[i][0], R[i][1]) + y0 + 0.02, R[i][1], 0, 1, 0, 1, cum / 12, [1, 1, 1]),
            mb.vert(L[i + 1][0], this.calculateRawTerrainHeight(L[i + 1][0], L[i + 1][1]) + y0 + 0.02, L[i + 1][1], 0, 1, 0, 0, (cum + seg) / 12, [1, 1, 1]),
            mb.vert(R[i + 1][0], this.calculateRawTerrainHeight(R[i + 1][0], R[i + 1][1]) + y0 + 0.02, R[i + 1][1], 0, 1, 0, 1, (cum + seg) / 12, [1, 1, 1])];
          mb.tri(mid[0], mid[2], mid[1]); mb.tri(mid[1], mid[2], mid[3]);
        }
        cum += seg;
      }
    }
    this.emit(map, mats, false, false, 4500, false, (m) => { if (m.material === asph) this.roadMeshes.push(m); });
    // Planar UV: uv = metres, textures repeat 1/tile
    for (const m of [asph, dirt]) for (const t of [m.map!, m.normalMap!]) t.repeat.set(1 / m.userData['tile'], 1 / m.userData['tile']);
    for (const k of ['mark1', 'mark2']) { const t = (mats[k] as THREE.MeshStandardMaterial).map!; t.repeat.set(1, 1); }
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
  private static hash(a: number, b: number): number { const s = Math.sin(a * 12.9898 + b * 78.233) * 43758.5453; return s - Math.floor(s); }

  private buildBuildings(scene: THREE.Scene, list: [number, number, number[]][]): void {
    const plaster = this.pbr('white_plaster_rough_01', 3, 0.9);
    const concrete = this.pbr('concrete_wall_007', 3, 0.85);
    const iron = this.pbr('corrugated_iron', 3, 0.55); iron.metalness = 0.45;
    const clay = this.pbr('clay_roof_tiles_03', 3, 0.8);
    for (const m of [plaster, concrete]) this.windowize(m);
    for (const m of [plaster, concrete, iron, clay]) { m.vertexColors = true; for (const t of [m.map!, m.normalMap!]) { t.repeat.set(1, 1); } }
    const mats: Record<string, THREE.Material> = { plaster, concrete, iron, clay };
    const map = new Map<string, Map<string, GeoBuf>>();

    for (const [ty, hdm, flat] of list) {
      const n = flat.length / 2; if (n < 3) continue;
      let pts: [number, number][] = []; let cx = 0, cz = 0;
      for (let i = 0; i < n; i++) { pts.push([flat[i * 2] / 10, flat[i * 2 + 1] / 10]); cx += pts[i][0]; cz += pts[i][1]; }
      cx /= n; cz /= n;
      let A = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; A += a[0] * b[1] - b[0] * a[1]; }
      if (A < 0) { pts = pts.reverse(); A = -A; }
      const area = A / 2; let maxH = -1e9, minH = 1e9; const hs = pts.map((p) => { const h = this.calculateRawTerrainHeight(p[0], p[1]); maxH = Math.max(maxH, h); minH = Math.min(minH, h); return h; });
      const h = hdm / 10; const top = maxH + h;
      const seed = WorldBuilder.hash(cx, cz);
      const concreteWall = ty === 2 || ty === 3 || ty === 6;
      const wallKey = concreteWall ? 'concrete' : 'plaster';
      const tint = concreteWall ? CONCRETE_TINTS[Math.floor(seed * CONCRETE_TINTS.length) % CONCRETE_TINTS.length] : HOUSE_TINTS[Math.floor(seed * HOUSE_TINTS.length) % HOUSE_TINTS.length];
      const winV = ty === 3 || ty === 6 ? 0 : 1;
      const wb = this.chunkOf(map, cx, cz, wallKey);
      let u = 0;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % n]; const dx = b[0] - a[0], dz = b[1] - a[1]; const len = Math.hypot(dx, dz); if (len < 0.2) continue;
        const nx = dz / len, nz = -dx / len;
        const ya = hs[i] - 0.5, yb = hs[(i + 1) % n] - 0.5;
        const u0 = u / 3, u1 = (u + len) / 3; u += len;
        const v0a = (ya - hs[i] + 0.5 + (top - ya)) / 3.2, v0b = (yb - hs[(i + 1) % n] + 0.5 + (top - yb)) / 3.2;
        const i0 = wb.vert(a[0], ya, a[1], nx, 0, nz, u0, 0, tint, winV);
        const i1 = wb.vert(b[0], yb, b[1], nx, 0, nz, u1, 0, tint, winV);
        const i2 = wb.vert(b[0], top, b[1], nx, 0, nz, u1, v0b, tint, winV);
        const i3 = wb.vert(a[0], top, a[1], nx, 0, nz, u0, v0a, tint, winV);
        wb.tri(i0, i2, i1); wb.tri(i0, i3, i2);
      }
      // roof
      const pitched = (ty === 0 || ty === 1) && area < 230 && n <= 8;
      const rt = ROOF_TINTS[Math.floor(WorldBuilder.hash(cz, cx) * ROOF_TINTS.length) % ROOF_TINTS.length];
      const useClay = pitched && WorldBuilder.hash(cx * 3, cz * 7) < 0.18;
      const rb = this.chunkOf(map, cx, cz, useClay ? 'clay' : 'iron');
      if (pitched) {
        let rad = 0; pts.forEach((p) => { rad += Math.hypot(p[0] - cx, p[1] - cz); }); rad /= n;
        const k = 1 + 0.45 / Math.max(rad, 2), ridge = Math.min(2.2, 0.55 * rad + 0.4);
        const eaves = pts.map((p) => [cx + (p[0] - cx) * k, cz + (p[1] - cz) * k]);
        const apex = rb.vert(cx, top + ridge, cz, 0, 1, 0, cx / 3, cz / 3, rt);
        for (let i = 0; i < n; i++) {
          const a = eaves[i], b = eaves[(i + 1) % n];
          const e1 = [b[0] - a[0], 0, b[1] - a[1]], e2 = [cx - a[0], ridge, cz - a[1]];
          let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
          const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
          const ia = rb.vert(a[0], top - 0.15, a[1], nx, ny, nz, a[0] / 3, a[1] / 3, rt);
          const ib = rb.vert(b[0], top - 0.15, b[1], nx, ny, nz, b[0] / 3, b[1] / 3, rt);
          const ap = rb.vert(cx, top + ridge, cz, nx, ny, nz, cx / 3, cz / 3, rt);
          rb.tri(ia, ap, ib);
        }
        void apex;
      } else {
        const c2 = pts.map((p) => new THREE.Vector2(p[0], p[1]));
        const tris = THREE.ShapeUtils.triangulateShape(c2, []);
        const base = rb.pos.length / 3;
        pts.forEach((p) => rb.vert(p[0], top, p[1], 0, 1, 0, p[0] / 3, p[1] / 3, rt));
        for (const t of tris) { const [a, b, d] = t; const cr = (pts[b][0] - pts[a][0]) * (pts[d][1] - pts[a][1]) - (pts[b][1] - pts[a][1]) * (pts[d][0] - pts[a][0]); if (cr < 0) rb.tri(base + a, base + b, base + d); else rb.tri(base + a, base + d, base + b); }
      }
      // spatial hash for tree/lamp rejection
      const gk = Math.floor(cx / 40) * 100003 + Math.floor(cz / 40); let l = this.bGrid.get(gk); if (!l) { l = []; this.bGrid.set(gk, l); } l.push(cx, cz, Math.sqrt(area) * 0.6 + 1.5);
      void minH;
    }
    this.emit(map, mats, true, true, 2600, true);
  }

  /** Window grid + glazing, drawn procedurally over the real plaster/concrete textures. */
  private windowize(m: THREE.MeshStandardMaterial): void {
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWin; varying float vWin; varying vec2 vWUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = aWin; vWUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWin; varying vec2 vWUv;')
        .replace('#include <map_fragment>', `#include <map_fragment>
          float bay = fract(vWUv.x), flr = fract(vWUv.y);
          float winM = step(0.3, bay) * step(bay, 0.7) * step(0.34, flr) * step(flr, 0.8) * vWin * step(0.3, vWUv.y);
          float doorM = step(0.36, bay) * step(bay, 0.64) * step(flr, 0.7) * step(vWUv.y, 0.7) * vWin * step(0.75, fract(floor(vWUv.x) * 0.618));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.04, 0.07, 0.1), winM * 0.92);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.08, 0.06), doorM * 0.9);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.06, winM * 0.9);`);
    };
  }

  // ------------------------------------------------------------------ trees
  private buildTrees(scene: THREE.Scene, buf: ArrayBuffer): void {
    const dv = new DataView(buf); const n = buf.byteLength / 9;
    const trunk = new THREE.CylinderGeometry(0.2, 0.32, 3.2, 5); trunk.translate(0, 1.6, 0);
    const mkCanopy = (r: number, y: number) => { const g = new THREE.IcosahedronGeometry(r, 1); g.translate(0, y, 0); return g; };
    const paint = (g: THREE.BufferGeometry, c: THREE.Color) => { const a = new Float32Array(g.attributes['position'].count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g.toNonIndexed(); };
    const geo = mergeGeometries([paint(trunk, new THREE.Color(0x4a3524)), paint(mkCanopy(2.4, 4.4), new THREE.Color(0xffffff)), paint(mkCanopy(1.7, 5.8), new THREE.Color(0xffffff))].map((g) => { g.deleteAttribute('uv'); return g; }))!;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, flatShading: true });
    const byChunk = new Map<string, { x: number; z: number; c: number }[]>();
    for (let i = 0; i < n; i++) {
      const x = dv.getFloat32(i * 9, true), z = dv.getFloat32(i * 9 + 4, true), c = dv.getUint8(i * 9 + 8);
      if (this.roadAt(x, z)) continue;
      if (this.nearBuilding(x, z)) continue;
      const k = `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`; let l = byChunk.get(k); if (!l) { l = []; byChunk.set(k, l); } l.push({ x, z, c });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), col = new THREE.Color();
    byChunk.forEach((list, key) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length); im.castShadow = true;
      list.forEach((t, i) => {
        const s = 0.7 + WorldBuilder.hash(t.x, t.z) * 0.9;
        q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), WorldBuilder.hash(t.z, t.x) * 6.28);
        m4.compose(new THREE.Vector3(t.x, this.calculateRawTerrainHeight(t.x, t.z) - 0.2, t.z), q, new THREE.Vector3(s, s * (t.c === 5 ? 1.5 : 1), s));
        im.setMatrixAt(i, m4);
        const r = WorldBuilder.hash(t.x * 2, t.z * 3);
        if (t.c === 5) col.setRGB(0.1 + r * 0.06, 0.25 + r * 0.14, 0.1 + r * 0.05);
        else if (t.c === 8 && r > 0.82) col.setRGB(0.55, 0.38, 0.75); // jacaranda blossom
        else col.setRGB(0.22 + r * 0.12, 0.42 + r * 0.14, 0.18 + r * 0.06);
        im.setColorAt(i, col);
      });
      im.userData['far'] = 1800; im.computeBoundingSphere();
      const [cxI, czI] = key.split(',').map(Number);
      this.chunks.push({ obj: im, cx: (cxI + 0.5) * CHUNK, cz: (czI + 0.5) * CHUNK, r: CHUNK * 0.75 });
      this.foliageGroup.add(im);
    });
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
  public lampSpots: { x: number; z: number; rot: number }[] = [];
  private buildStreetFurniture(scene: THREE.Scene): void {
    const poleG = new THREE.CylinderGeometry(0.1, 0.16, 9, 6); poleG.translate(0, 4.5, 0);
    const armG = new THREE.BoxGeometry(2.6, 0.12, 0.14); armG.translate(1.3, 9, 0);
    const headG = new THREE.BoxGeometry(0.9, 0.16, 0.38); headG.translate(2.5, 8.9, 0);
    const pole = mergeGeometries([poleG, armG].map((g) => g.toNonIndexed()))!;
    const poleM = new THREE.MeshStandardMaterial({ color: 0x8a9096, metalness: 0.8, roughness: 0.35 });
    const headM = new THREE.MeshBasicMaterial({ color: 0xfff1c0 });
    const spots: { x: number; z: number; rot: number }[] = [];
    for (const w of this.roadWays) {
      if (w.c > 3) continue;
      let acc = 0;
      for (let i = 0; i + 3 < w.p.length; i += 2) {
        const ax = w.p[i] / 10, az = w.p[i + 1] / 10, bx = w.p[i + 2] / 10, bz = w.p[i + 3] / 10; const L = Math.hypot(bx - ax, bz - az); if (L < 0.5) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        for (let s = (50 - acc) % 50; s < L; s += 50) {
          const x = ax + tx * s, z = az + tz * s;
          if (Math.hypot(x, z) > 6500) continue;
          const side = w.o ? 1 : (Math.floor(x / 50 + z / 50) % 2 ? 1 : -1);
          const nx = -tz * side, nz = tx * side, off = w.w / 2 + 1.4;
          // arm (+x of the lamp) points back toward the carriageway: direction (-nx, -nz)
          spots.push({ x: x + nx * off, z: z + nz * off, rot: Math.atan2(nz, -nx) });
        }
        acc = (acc + L) % 50;
      }
    }
    this.lampSpots = spots.slice(0, 2500);
    const poles = new THREE.InstancedMesh(pole, poleM, this.lampSpots.length), heads = new THREE.InstancedMesh(headG, headM, this.lampSpots.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    this.lampSpots.forEach((s, i) => {
      // arm points toward the road: rot is set so +x of the lamp faces the carriageway
      q.setFromAxisAngle(up, s.rot);
      m4.compose(new THREE.Vector3(s.x, this.calculateRawTerrainHeight(s.x, s.z), s.z), q, new THREE.Vector3(1, 1, 1));
      poles.setMatrixAt(i, m4); heads.setMatrixAt(i, m4);
    });
    poles.castShadow = true; poles.frustumCulled = false; heads.frustumCulled = false;
    this.roadInfrastructureGroup.add(poles, heads);
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
      s.userData['far'] = 700; this.chunks.push({ obj: s, cx: p.p[0], cz: p.p[1], r: 0 });
      this.landmarksGroup.add(s);
    }
  }
}
