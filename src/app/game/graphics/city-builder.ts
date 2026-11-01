import * as THREE from 'three';
import { addLampLight } from './lamp-light';
import { GeoBuf, slab } from './geo-buf';
import type { WorldBuilder } from './world-builder';

/** [use, heightDm, footprint dm..., signIndex, seed] */
type Bld = [number, number, number[], number, number];

const CH = 800;
const rnd = (a: number): number => { const s = Math.sin(a * 12.9898) * 43758.5453; return s - Math.floor(s); };
const pick = <T>(arr: T[], r: number): T => arr[Math.floor(r * arr.length) % arr.length];

const HOUSE: number[][] = [[0.9, 0.93, 0.97], [0.96, 0.86, 0.7], [0.97, 0.66, 0.56], [0.62, 0.82, 0.95], [0.6, 0.88, 0.78], [0.98, 0.84, 0.46], [0.9, 0.6, 0.5], [0.8, 0.84, 0.9], [0.92, 0.62, 0.72], [0.45, 0.78, 0.82]];
const CIVIC: number[][] = [[0.98, 0.94, 0.78], [0.96, 0.96, 0.94], [0.92, 0.86, 0.7]];
const CONCRETE: number[][] = [[0.86, 0.86, 0.86], [0.95, 0.93, 0.88], [0.76, 0.79, 0.82], [0.92, 0.84, 0.72], [0.7, 0.72, 0.74]];
const BRICK: number[][] = [[1, 0.88, 0.8], [0.9, 0.7, 0.6], [1, 0.95, 0.9], [0.8, 0.65, 0.55]];
const METAL: number[][] = [[0.7, 0.72, 0.75], [0.55, 0.65, 0.58], [0.6, 0.66, 0.78], [0.82, 0.82, 0.8], [0.78, 0.6, 0.52]];
const ROOFS: number[][] = [[0.62, 0.66, 0.74], [0.86, 0.38, 0.24], [0.14, 0.58, 0.6], [0.7, 0.24, 0.2], [0.9, 0.92, 0.96], [0.3, 0.38, 0.78], [0.82, 0.56, 0.36], [0.26, 0.29, 0.38]];
const AWNING: number[][] = [[0.8, 0.16, 0.16], [0.14, 0.32, 0.7], [0.1, 0.5, 0.25], [0.95, 0.7, 0.1], [0.9, 0.9, 0.88], [0.9, 0.4, 0.1]];

/** Roof colour drawn from the distribution seen in the satellite imagery (rust / brick-red tin dominate small houses). */
const houseRoof = (r: number): number[] => r < 0.38 ? ROOFS[1] : r < 0.58 ? ROOFS[3] : r < 0.72 ? ROOFS[0] : r < 0.8 ? ROOFS[5] : r < 0.88 ? ROOFS[6] : r < 0.94 ? ROOFS[2] : ROOFS[4];
const tileRoof = (r: number): number[] => r < 0.45 ? ROOFS[1] : r < 0.75 ? ROOFS[6] : r < 0.9 ? ROOFS[3] : ROOFS[0];
const sheetRoof = (r: number): number[] => r < 0.4 ? ROOFS[0] : r < 0.7 ? ROOFS[4] : r < 0.9 ? ROOFS[5] : ROOFS[7];

interface Style { wall: 'plaster' | 'brick' | 'concrete' | 'ironw'; tint: number[]; win: number; roof: 'hip' | 'gable' | 'flat' | 'lowgable' | 'canopy'; rtint: number[]; props: boolean; awn: boolean; sign: 'door' | 'big' | 'top' | 'none'; pitch: number }

/**
 * Turns the OSM footprints + inferred uses into varied, believable buildings: wall/roof materials, window
 * styles, roof shapes, awnings, shop signs, rooftop tanks, church towers and petrol canopies.
 */
let _winAtlas: THREE.DataTexture | null = null;
/** Bakes the procedural window styles (1..7) into one small RGBA mask atlas, shared by every wall material. */
function windowAtlas(): THREE.DataTexture {
  if (_winAtlas) return _winAtlas;
  const T = 64, W = T * 8, H = T * 2, data = new Uint8Array(W * H * 4);
  const st_ = (a: number, x: number) => (x >= a ? 1 : 0), rng = (lo: number, v: number, hi: number) => st_(lo, v) * st_(v, hi);
  for (let st = 1; st < 8; st++) for (let row = 0; row < 2; row++) for (let py = 0; py < T; py++) for (let px = 0; px < T; px++) {
    const bay = (px + 0.5) / T, flr = (py + 0.5) / T, y = row === 0 ? flr : 1 + flr, g0 = row === 0 ? 1 : 0;
    let win = 0, glass = 0, mull = 0, door = 0;
    if (st < 2) { win = rng(0.3, bay, 0.7) * rng(0.34, flr, 0.8) * st_(0.3, y); door = rng(0.36, bay, 0.64) * st_(flr, 0.7) * st_(y, 0.7); }
    else if (st < 3) { const shop = rng(0.06, bay, 0.94) * rng(0.1, flr, 0.78) * g0, up = rng(0.3, bay, 0.7) * rng(0.34, flr, 0.8) * (1 - g0); win = Math.max(shop, up); glass = shop; mull = g0 * rng(0.47, bay, 0.5); }
    else if (st < 4) { win = rng(0.05, bay, 0.95) * rng(0.08, flr, 0.92); glass = win; mull = 1 - rng(0.05, bay, 0.95); }
    else if (st < 5) { win = rng(0.12, bay, 0.88) * rng(0.66, flr, 0.86) * g0; }
    else if (st < 6) { win = rng(0.1, bay, 0.95) * rng(0.38, flr, 0.8) * st_(0.3, y); }
    else if (st < 7) { win = rng(0.4, bay, 0.6) * rng(0.2, flr, 0.88); }
    else { win = rng(0.18, bay, 0.82) * rng(0.3, flr, 0.82) * st_(0.3, y); }
    const o = ((row * T + py) * W + st * T + px) * 4; data[o] = win * 255; data[o + 1] = glass * 255; data[o + 2] = mull * 255; data[o + 3] = door * 255;
  }
  const t = new THREE.DataTexture(data, W, H, THREE.RGBAFormat); t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.needsUpdate = true; return (_winAtlas = t);
}

export class CityBuilder {
  public night = { value: 0 };
  /** Neo-Eswatini theme amount (0 real .. 1 neon-futuristic); shared by every wall material. */
  public neo = { value: 0 };
  private mats!: Record<string, THREE.Material>;
  private walls = new Map<string, Map<string, GeoBuf>>();
  private signCols = 4; private signRows = 1;

  constructor(private w: WorldBuilder) {}

  private static size(mat: string): number { return mat === 'props' || mat === 'sign' ? 400 : CH; }
  private buf(cx: number, cz: number, mat: string): GeoBuf {
    const sz = CityBuilder.size(mat);
    const k = `${sz}:${Math.floor(cx / sz)},${Math.floor(cz / sz)}`;
    let m = this.walls.get(k); if (!m) { m = new Map(); this.walls.set(k, m); }
    let b = m.get(mat); if (!b) { b = new GeoBuf(); m.set(mat, b); }
    return b;
  }

  // ------------------------------------------------------------------ materials
  private makeMaterials(signs: string[][]): void {
    const w = this.w;
    const plaster = w.pbr('white_plaster_rough_01', 3, 0.9), brick = w.pbr('brick_wall_02', 3, 0.85);
    const concrete = w.pbr('concrete_wall_007', 3, 0.85), ironw = w.pbr('corrugated_iron', 3, 0.6); ironw.metalness = 0.25;
    const roof = w.pbr('corrugated_iron', 3, 0.5); roof.metalness = 0.45;
    for (const m of [plaster, brick, concrete, ironw]) this.windowize(m);
    for (const m of [plaster, brick, concrete, ironw, roof]) {
      m.vertexColors = true;
    }
    const props = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.1, side: THREE.DoubleSide }); addLampLight(props);
    roof.side = THREE.DoubleSide;
    // sign atlas: 4 columns x N rows of 512x128 plates
    this.signRows = Math.max(1, Math.ceil(signs.length / this.signCols));
    const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 128 * this.signRows;
    const g = cv.getContext('2d')!;
    signs.forEach(([text, bg, fg], i) => {
      const x = (i % this.signCols) * 512, y = Math.floor(i / this.signCols) * 128;
      g.fillStyle = bg; g.fillRect(x, y, 512, 128);
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 6; g.strokeRect(x + 5, y + 5, 502, 118);
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      let fs = 78; g.font = `800 ${fs}px sans-serif`;
      while (g.measureText(text).width > 450 && fs > 24) { fs -= 4; g.font = `800 ${fs}px sans-serif`; }
      g.fillText(text, x + 256, y + 68);
    });
    const atlas = new THREE.CanvasTexture(cv); atlas.colorSpace = THREE.SRGBColorSpace; atlas.anisotropy = 4;
    const sign = new THREE.MeshBasicMaterial({ map: atlas, toneMapped: false });
    sign.polygonOffset = true; sign.polygonOffsetFactor = -1; sign.polygonOffsetUnits = -1;
    this.mats = { plaster, brick, concrete, ironw, roof, props, sign };
  }

  /** Procedural windows/doors/glazing in the shader, lit at night, over the real photographic wall textures. */
  private windowize(m: THREE.MeshStandardMaterial): void {
    const night = this.night, neoU = this.neo;
    const prev = m.onBeforeCompile, k0 = m.customProgramCacheKey; m.customProgramCacheKey = () => (k0 ? k0.call(m) : '') + '|win';
    m.onBeforeCompile = (sh, r) => {
      prev?.call(m, sh, r);
      sh.uniforms['uNight'] = night; sh.uniforms['uNeo'] = neoU; sh.uniforms['uWinAtlas'] = { value: windowAtlas() };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aWin; varying float vWin; varying vec2 vWUv;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWin = aWin; vWUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vWin; varying vec2 vWUv; uniform float uNight; uniform float uNeo; uniform sampler2D uWinAtlas;\nfloat h11(float n){ n = mod(n, 997.0); return fract(sin(n*12.9898 + 0.31)*43758.5453); }')
        .replace(sh.fragmentShader.includes('/*STYLE_DONE*/') ? '/*STYLE_DONE*/' : '#include <map_fragment>', `${sh.fragmentShader.includes('/*STYLE_DONE*/') ? '/*STYLE_DONE*/' : '#include <map_fragment>'}
          float st = min(floor(vWin + 0.001), 7.0), sd = floor(fract(vWin) * 1000.0 + 0.5) / 1000.0;
          float bay = fract(vWUv.x), flr = fract(vWUv.y), fl = floor(vWUv.y), bi = floor(vWUv.x);
          float win = 0.0, door = 0.0, mull = 0.0, glass = 0.0;
          if (st > 0.5) {
            // baked mask atlas: 8 styles across, ground floor / upper floor rows; R=window G=glass B=mullion A=door zone
            vec2 tuv = vec2((st + clamp(bay, 0.008, 0.992)) / 8.0, (min(fl, 1.0) + clamp(flr, 0.008, 0.992)) / 2.0);
            vec4 wm = textureGrad(uWinAtlas, tuv, dFdx(vWUv) * vec2(0.125, 0.5), dFdy(vWUv) * vec2(0.125, 0.5));
            if (st > 5.5 && st < 6.5) wm.r *= step(0.5, fract(bi*0.5));
            win = wm.r; glass = wm.g; mull = wm.b; door = wm.a * step(0.75, fract(bi*0.618+sd*7.0)) * step(st, 1.5);
          }
          vec3 glassCol = mix(vec3(0.05,0.08,0.11), vec3(0.16,0.3,0.36), glass * 0.8);
          vec3 neonCol = mix(vec3(0.1,0.9,1.0), vec3(1.0,0.22,0.8), step(0.62, h11(sd*37.0 + 3.0)));
          glassCol = mix(glassCol, mix(vec3(0.02,0.05,0.09), vec3(0.05,0.3,0.45), glass*0.7 + 0.25), uNeo);
          float lit = step(mix(0.78, 0.3, uNeo), h11(bi*13.1 + fl*7.7 + sd*91.0)) * max(uNight, uNeo) * win;
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * 0.3 + vec3(0.015,0.025,0.045), uNeo * (1.0 - win));
          diffuseColor.rgb = mix(diffuseColor.rgb, glassCol, win * 0.92);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.5,0.5,0.52), mull * 0.6 * step(0.5, st));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.13,0.08,0.06), door * 0.9);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
          roughnessFactor = mix(roughnessFactor, 0.05, win * 0.9);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          totalEmissiveRadiance += lit * mix(vec3(1.0, 0.72, 0.36), neonCol, uNeo) * 0.95;
          totalEmissiveRadiance += uNeo * smoothstep(0.92, 0.985, flr) * neonCol * 1.3 * step(0.5, st);`);
    };
  }

  /** Neo theme only (decided when a chunk is generated): taller towers where the OSM footprint density is high. */
  private neoHeight(cx: number, cz: number, area: number): number {
    if (typeof localStorage === 'undefined' || localStorage.getItem('shesha.theme') !== 'NEO') return 1;
    const l = this.pending.get(`${Math.floor(cx / CH)},${Math.floor(cz / CH)}`); const density = l ? l.length : 0;
    return 1 + Math.min(2.2, density / 260) * Math.min(1, Math.sqrt(area) / 14);
  }

  // ------------------------------------------------------------------ main
  private pending = new Map<string, Bld[]>();
  private cur: { list: Bld[]; i: number } | null = null;

  /** Group footprints by 800 m chunk (cheap); geometry is generated lazily as the player approaches. */
  build(scene: THREE.Scene, list: Bld[], signs: string[][]): void {
    this.makeMaterials(signs);
    for (const b of list) {
      const f = b[2], n = f.length / 2; if (n < 3) continue;
      let cx = 0, cz = 0, A = 0;
      for (let i = 0; i < n; i++) { cx += f[i * 2]; cz += f[i * 2 + 1]; const j = (i + 1) % n; A += f[i * 2] * f[j * 2 + 1] - f[j * 2] * f[i * 2 + 1]; }
      cx /= n * 10; cz /= n * 10; const area = Math.abs(A) / 200;
      if (area < 14 && b[0] !== 12) continue;
      this.w.addFootprint(cx, cz, Math.sqrt(area) * 0.6 + 1.5); this.addEmitter(b, cx, cz, area);
      { const gk = Math.floor(cx / 150) * 100003 + Math.floor(cz / 150); this.realGrid.set(gk, (this.realGrid.get(gk) ?? 0) + 1); }
      const key = `${Math.floor(cx / CH)},${Math.floor(cz / CH)}`; let l = this.pending.get(key); if (!l) { l = []; this.pending.set(key, l); } l.push(b);
    }
    this.infill();
    void scene;
  }

  // ------------------------------------------------------------------ light emitters (shop signs / lit windows)
  private emit: { x: number; z: number; col: number[]; s: number; r: number }[] = []; private emitGrid = new Map<number, number[]>();
  private static readonly NEON = [[1, 0.32, 0.5], [0.3, 0.8, 1], [1, 0.74, 0.28], [0.5, 1, 0.6], [1, 0.5, 0.15], [0.75, 0.45, 1]];
  private addEmitter(b: Bld, cx: number, cz: number, area: number): void {
    const use = b[0]; if (area < 90 || ![2, 3, 4, 5, 6, 9, 10, 11, 12, 15].includes(use)) return; const r = b[4] / 1000;
    const col = use === 12 ? [1, 0.98, 0.9] : use === 6 || use === 5 ? [0.9, 0.95, 1] : CityBuilder.NEON[Math.floor(r * 6) % 6];
    const e = { x: cx, z: cz, col, s: use === 12 ? 1.5 : 0.8, r: use === 12 ? 26 : 19 }; const i = this.emit.push(e) - 1;
    const k = Math.floor(cx / 50) * 100003 + Math.floor(cz / 50); let l = this.emitGrid.get(k); if (!l) { l = []; this.emitGrid.set(k, l); } l.push(i);
  }
  /** Nearest commercial emitters within maxD metres (nearest first). */
  emittersNear(px: number, pz: number, k: number, maxD: number): { x: number; z: number; col: number[]; s: number; r: number }[] {
    const cx = Math.floor(px / 50), cz = Math.floor(pz / 50), out: { d: number; e: { x: number; z: number; col: number[]; s: number; r: number } }[] = [];
    for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const l = this.emitGrid.get((cx + a) * 100003 + (cz + b)); if (l) for (const i of l) { const e = this.emit[i], d = Math.hypot(e.x - px, e.z - pz); if (d < maxD) out.push({ d, e }); } }
    return out.sort((p, q) => p.d - q.d).slice(0, k).map((o) => o.e);
  }

  // ------------------------------------------------------------------ procedural infill
  private realGrid = new Map<number, number>();
  /**
   * Where OSM has streets but (almost) no mapped buildings, line the street with deterministic houses so the
   * world is not empty. It looks only at the data actually loaded, so it fades away wherever real buildings exist.
   */
  private infill(): void {
    const w = this.w; const MAX = 32000; let made = 0;
    const real = (x: number, z: number): number => { let n = 0; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) n += this.realGrid.get((Math.floor(x / 150) + a) * 100003 + Math.floor(z / 150) + b) ?? 0; return n; };
    for (const way of w.roadWays) {
      if (way.c < 4 || way.c > 6 || way.u || way.dz || way.br || way.w < 3) continue;
      const p = way.p; let carry = 0;
      for (let i = 0; i + 3 < p.length && made < MAX; i += 2) {
        const ax = p[i] / 10, az = p[i + 1] / 10, bx = p[i + 2] / 10, bz = p[i + 3] / 10, L = Math.hypot(bx - ax, bz - az); if (L < 1) continue;
        const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
        for (let s = carry; s < L; s += 13 + rnd(ax + s) * 7) {
          const x = ax + tx * s, z = az + tz * s;
          const zone = 0.5 + 0.5 * Math.sin(x * 0.0101 + 1.3) * Math.sin(z * 0.0127 + 0.7), dens = 0.28 + 0.62 * zone;
          const nearReal = real(x, z); if (nearReal > 14) continue;                                  // already mapped: leave it to the data
          if (!way.n && nearReal < 2) continue;                                                       // unnamed track in the middle of nowhere
          for (const side of [-1, 1]) {
            if (rnd(x * 0.73 + z * 1.31 + side * 7.7) > dens) continue;
            const wd = 5.5 + rnd(x + z * 3.1 + side) * 3, dp = 7 + rnd(x * 2.3 + z + side) * 4.5, off = way.w / 2 + (way.sw ?? 0) + 4.5 + dp / 2 + rnd(x * 1.7 - z) * 4;
            const px = x + nx * off * side, pz = z + nz * off * side;
            if (w.roadAt(px, pz) || w.distToRoad(px, pz, 6) < dp / 2 + 2.2 || w.nearBuildingPublic(px, pz)) continue;
            const cl = w.groundClassAt(px, pz); if (cl === 5 || cl === 6 || cl === 10 || cl === 11 || cl === 12) continue;
            const h0 = w.calculateRawTerrainHeight(px - 4, pz), h1 = w.calculateRawTerrainHeight(px + 4, pz), h2 = w.calculateRawTerrainHeight(px, pz - 4), h3 = w.calculateRawTerrainHeight(px, pz + 4);
            if (Math.abs(h1 - h0) > 2.6 || Math.abs(h3 - h2) > 2.6) continue;                            // too steep
            const c4 = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [Math.round((px + tx * a * wd / 2 + nx * b * dp / 2) * 10), Math.round((pz + tz * a * wd / 2 + nz * b * dp / 2) * 10)]);
            const seed = Math.floor(rnd(px * 12.9 + pz * 7.1) * 999);
            const bld: Bld = [18, 27 + Math.floor(rnd(px + pz * 5) * 8), c4.flat(), 0, seed];
            w.addFootprint(px, pz, Math.sqrt(wd * dp) * 0.6 + 1.5);
            const key = `${Math.floor(px / CH)},${Math.floor(pz / CH)}`; let l = this.pending.get(key); if (!l) { l = []; this.pending.set(key, l); } l.push(bld); made++;
            if (rnd(px * 3.3 + pz * 9.9) < 0.6) { const back = dp / 2 + 3 + rnd(px - pz) * 3; w.extraTrees.push({ x: px + nx * back * side * 0.9 + tx * (rnd(px) - 0.5) * 8, z: pz + nz * back * side * 0.9 + tz * (rnd(pz) - 0.5) * 8, c: rnd(px * 5 + pz) < 0.3 ? 10 : 9 }); }
          }
          carry = s + 1e-3 - L > 0 ? s - L : 0;
        }
        carry = Math.max(0, carry - L);
      }
    }
    console.info(`[infill] ${made} procedural houses`);
  }

  /** Build the area around the start synchronously so it is ready before the intro ends (after barriers/features exist). */
  prime(): void { const sp = this.w.meta.spawn; this.stream(sp.x, sp.z, 1300, 1e9); }

  /** Called every frame: builds nearby chunks within a small time budget (keeps the frame rate smooth). */
  update(px: number, pz: number): void { this.stream(px, pz, 1500, 1.6); }

  private stream(px: number, pz: number, radius: number, budgetMs: number): void {
    const t0 = performance.now();
    if (!this.drainEmit(t0, budgetMs)) return;
    for (;;) {
      if (!this.cur) {
        let bestKey: string | null = null, bd = radius;
        this.pending.forEach((_, key) => {
          const [ix, iz] = key.split(',').map(Number);
          const dx = Math.max(Math.abs((ix + 0.5) * CH - px) - CH / 2, 0), dz = Math.max(Math.abs((iz + 0.5) * CH - pz) - CH / 2, 0), d = Math.hypot(dx, dz);
          if (d < bd) { bd = d; bestKey = key; }
        });
        if (!bestKey) return;
        this.cur = { list: this.pending.get(bestKey)!, i: 0 }; this.pending.delete(bestKey);
      }
      const c = this.cur;
      while (c.i < c.list.length) { this.addBuilding(c.list[c.i++]); if ((c.i & 7) === 0 && performance.now() - t0 > budgetMs) return; }
      this.emitWalls(); this.cur = null;
      if (!this.drainEmit(t0, budgetMs)) return;
    }
  }

  private emitQ: { buf: GeoBuf; mk: string; cx: number; cz: number; sz: number }[] = [];
  private emitWalls(): void {
    this.walls.forEach((m, key) => {
      const [szs, rest] = key.split(':'); const sz = Number(szs); const [ix, iz] = rest.split(',').map(Number);
      m.forEach((buf, mk) => { if (!buf.empty) this.emitQ.push({ buf, mk, cx: (ix + 0.5) * sz, cz: (iz + 0.5) * sz, sz }); });
    });
    this.walls.clear();
  }
  /** Turn queued buffers into meshes, one at a time, inside the frame budget. */
  private drainEmit(t0: number, budgetMs: number): boolean {
    while (this.emitQ.length) {
      const q = this.emitQ.shift()!; const isProp = q.mk === 'props' || q.mk === 'sign';
      const mesh = new THREE.Mesh(q.buf.toGeometry(q.mk !== 'sign', !isProp), this.mats[q.mk]);
      mesh.name = 'bld:' + q.mk; mesh.castShadow = false; mesh.receiveShadow = true;
      this.w.registerChunk(mesh, q.cx, q.cz, q.sz * 0.75, isProp ? 420 : 1150); this.w.landmarksGroup.add(mesh);
      if (performance.now() - t0 > budgetMs) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ styles by use
  private style(use: number, r: number, area: number, n: number): Style {
    const small = area < 230 && n <= 8;
    switch (use) {
      case 0: return { wall: r < 0.3 ? 'brick' : 'plaster', tint: r < 0.3 ? pick(BRICK, r * 7) : pick(HOUSE, r * 3.7), win: 1, roof: small ? (r < 0.55 ? 'hip' : 'gable') : 'gable', rtint: houseRoof(r * 7.13 % 1), props: false, awn: false, sign: 'none', pitch: 0.5 };
      case 1: return { wall: 'plaster', tint: pick(HOUSE, r * 5.3), win: 1, roof: r < 0.5 ? 'hip' : 'gable', rtint: tileRoof(r * 9.7 % 1), props: false, awn: false, sign: 'none', pitch: 0.55 };
      case 2: return { wall: r < 0.45 ? 'brick' : 'plaster', tint: r < 0.45 ? pick(BRICK, r * 5) : pick(HOUSE, r * 2.9), win: 1, roof: 'flat', rtint: [0.62, 0.62, 0.62], props: true, awn: false, sign: 'none', pitch: 0 };
      case 3: return { wall: r < 0.5 ? 'plaster' : 'concrete', tint: r < 0.5 ? pick(HOUSE, r * 4.1) : pick(CONCRETE, r * 6.3), win: 2, roof: r < 0.75 ? 'flat' : 'lowgable', rtint: pick(ROOFS.slice(0, 1).concat(ROOFS.slice(4)), r * 3), props: true, awn: true, sign: 'door', pitch: 0.2 };
      case 4: return { wall: 'concrete', tint: pick(CONCRETE, r * 5.1), win: 2, roof: 'flat', rtint: [0.6, 0.6, 0.6], props: true, awn: true, sign: 'big', pitch: 0 };
      case 5: return { wall: 'concrete', tint: pick(CONCRETE.slice(0, 4), r * 4.7), win: 2, roof: 'flat', rtint: [0.58, 0.58, 0.6], props: true, awn: false, sign: 'big', pitch: 0 };
      case 6: return { wall: 'concrete', tint: pick(CONCRETE, r * 3.3), win: 3, roof: 'flat', rtint: [0.5, 0.52, 0.55], props: true, awn: false, sign: 'top', pitch: 0 };
      case 7: return { wall: 'ironw', tint: pick(METAL, r * 5.9), win: 4, roof: 'lowgable', rtint: sheetRoof(r * 4.9 % 1), props: false, awn: false, sign: 'none', pitch: 0.16 };
      case 8: return { wall: r < 0.5 ? 'ironw' : 'concrete', tint: r < 0.5 ? pick(METAL, r * 7.7) : pick(CONCRETE, r * 3), win: 0, roof: r < 0.6 ? 'lowgable' : 'flat', rtint: sheetRoof(r * 13.3 % 1), props: false, awn: false, sign: 'none', pitch: 0.22 };
      case 9: return { wall: 'plaster', tint: pick(CIVIC, r * 3), win: 5, roof: 'gable', rtint: [0.7, 0.24, 0.2], props: false, awn: false, sign: 'top', pitch: 0.32 };
      case 10: return { wall: 'plaster', tint: [0.97, 0.96, 0.93], win: 6, roof: 'gable', rtint: pick([ROOFS[3], ROOFS[7], ROOFS[5]], r * 3), props: true, awn: false, sign: 'none', pitch: 0.75 };
      case 11: return { wall: 'plaster', tint: [0.97, 0.97, 0.97], win: 7, roof: 'flat', rtint: [0.7, 0.7, 0.72], props: true, awn: false, sign: 'top', pitch: 0 };
      case 12: return { wall: 'concrete', tint: [0.93, 0.93, 0.9], win: 2, roof: 'flat', rtint: [0.7, 0.7, 0.7], props: true, awn: false, sign: 'door', pitch: 0 };
      case 13: return { wall: 'plaster', tint: pick(HOUSE, r * 6.1), win: 7, roof: 'hip', rtint: tileRoof(r * 4.4 % 1), props: false, awn: false, sign: 'door', pitch: 0.5 };
      case 14: return { wall: 'plaster', tint: pick(CIVIC, r * 2.2), win: 7, roof: r < 0.5 ? 'hip' : 'flat', rtint: [0.62, 0.3, 0.26], props: true, awn: false, sign: 'door', pitch: 0.4 };
      case 15: return { wall: 'plaster', tint: pick(HOUSE, r * 8.1), win: 2, roof: 'flat', rtint: [0.6, 0.6, 0.6], props: true, awn: true, sign: 'door', pitch: 0 };
      case 16: return { wall: 'ironw', tint: pick(METAL, r * 3.3), win: 0, roof: 'lowgable', rtint: pick(ROOFS, r * 6), props: false, awn: false, sign: 'none', pitch: 0.3 };
      case 18: return { wall: r < 0.3 ? 'brick' : 'plaster', tint: r < 0.3 ? pick(BRICK, r * 6.1) : pick(HOUSE, r * 5.9), win: 1, roof: area > 78 && r > 0.6 ? 'hip' : 'gable', rtint: houseRoof(r * 8.3 % 1), props: false, awn: false, sign: 'none', pitch: 0.26 };
      default: return { wall: 'plaster', tint: pick(HOUSE, r), win: 0, roof: 'canopy', rtint: [0.7, 0.7, 0.72], props: false, awn: false, sign: 'none', pitch: 0 };
    }
  }

  // ------------------------------------------------------------------ building
  private addBuilding(b: Bld): void {
    const [use, hdm, flat, sid, seed] = b;
    let n = flat.length / 2; if (n < 3) return;
    let pts: [number, number][] = []; let cx = 0, cz = 0;
    for (let i = 0; i < n; i++) { pts.push([flat[i * 2] / 10, flat[i * 2 + 1] / 10]); cx += pts[i][0]; cz += pts[i][1]; }
    cx /= n; cz /= n;
    let A = 0; for (let i = 0; i < n; i++) { const a = pts[i], c = pts[(i + 1) % n]; A += a[0] * c[1] - c[0] * a[1]; }
    if (A < 0) { pts = pts.reverse(); A = -A; }
    n = pts.length; const area = A / 2, r = seed / 1000, w = this.w;
    let maxH = -1e9; const hs = pts.map((p) => { const h = w.calculateRawTerrainHeight(p[0], p[1]); maxH = Math.max(maxH, h); return h; });
    const st = this.style(use, r, area, n);
    const boost = st.wall === 'plaster' ? 1.0 : st.wall === 'concrete' ? 0.98 : st.wall === 'brick' ? 1.05 : 1.15;
    st.tint = st.tint.map((v) => v * boost);
    const h = (hdm / 10) * this.neoHeight(cx, cz, area); const top = maxH + h;
    const wallBuf = this.buf(cx, cz, st.wall);
    const winCode = st.win + Math.min(0.99, r);

    // walls
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % n]; const dx = c[0] - a[0], dz = c[1] - a[1]; const len = Math.hypot(dx, dz); if (len < 0.2) continue;
      const nx = dz / len, nz = -dx / len, ya = hs[i] - 0.5, yb = hs[(i + 1) % n] - 0.5, u0 = u / 3, u1 = (u + len) / 3; u += len;
      const i0 = wallBuf.vert(a[0], ya, a[1], nx, 0, nz, u0, 0, st.tint, winCode);
      const i1 = wallBuf.vert(c[0], yb, c[1], nx, 0, nz, u1, 0, st.tint, winCode);
      const i2 = wallBuf.vert(c[0], top, c[1], nx, 0, nz, u1, (top - yb) / 3.2, st.tint, winCode);
      const i3 = wallBuf.vert(a[0], top, a[1], nx, 0, nz, u0, (top - ya) / 3.2, st.tint, winCode);
      wallBuf.tri(i0, i2, i1); wallBuf.tri(i0, i3, i2);
    }

    // oriented bounding box from the longest edge
    let best = 0, bl = 0; for (let i = 0; i < n; i++) { const a = pts[i], c = pts[(i + 1) % n]; const l = Math.hypot(c[0] - a[0], c[1] - a[1]); if (l > bl) { bl = l; best = i; } }
    const ea = pts[best], ec = pts[(best + 1) % n]; const ux = (ec[0] - ea[0]) / bl, uz = (ec[1] - ea[1]) / bl, vx = -uz, vz = ux;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (const p of pts) { const pu = (p[0] - cx) * ux + (p[1] - cz) * uz, pv = (p[0] - cx) * vx + (p[1] - cz) * vz; u0 = Math.min(u0, pu); u1 = Math.max(u1, pu); v0 = Math.min(v0, pv); v1 = Math.max(v1, pv); }
    const obbA = (u1 - u0) * (v1 - v0), fill = area / Math.max(1, obbA);
    const ocx = cx + ux * (u0 + u1) / 2 + vx * (v0 + v1) / 2, ocz = cz + uz * (u0 + u1) / 2 + vz * (v0 + v1) / 2;
    const halfU = (u1 - u0) / 2, halfV = (v1 - v0) / 2;

    // roof
    let roof = st.roof;
    if ((roof === 'gable' || roof === 'lowgable') && (fill < 0.82 || n > 10 || halfV < 1.5)) roof = n <= 8 && area < 400 ? 'hip' : 'flat';
    if (roof === 'hip' && n > 9) roof = 'flat';
    if (roof === 'canopy') roof = 'flat';
    const rb = this.buf(cx, cz, 'roof'), cb = this.buf(cx, cz, 'concrete');
    if (roof === 'flat') this.flatRoof(cb, pts, top - 0.45, st.rtint, use !== 0 && use !== 8);
    else if (roof === 'hip') this.hipRoof(rb, pts, cx, cz, top, st.rtint, area);
    else this.gableRoof(rb, wallBuf, ocx, ocz, ux, uz, vx, vz, halfU, halfV, top, st.rtint, st.pitch, st.tint, winCode, roof === 'lowgable');

    // collision footprint + tree rejection
    if (use !== 17 && !w.overlapsRoad(pts, cx, cz)) w.collision.addPolygon(pts.flatMap((p) => [p[0], p[1]]), Math.min(...hs) - 1, top, roof === 'flat' && area > 30);

    // walled compound + hedge for houses in town (detail only when close)
    if ((use === 0 || use === 1 || use === 13) && area > 70 && Math.hypot(cx + 750, cz + 210) < 3400 && r < 0.8) this.compound(cx, cz, ocx, ocz, ux, uz, vx, vz, halfU, halfV, r, hs);

    // props + signs (detail only when close)
    if (!st.props && !st.awn && st.sign === 'none') return;
    const pb = this.buf(cx, cz, 'props');
    const front = this.frontEdge(pts);
    if (st.awn && front >= 0) this.awning(pb, pts, front, hs, r);
    if (sid >= 0 && st.sign !== 'none') this.signPlate(pts, front, hs, top, sid, st.sign, cx, cz);
    if (st.props && roof === 'flat' && area > 70) this.roofProps(pb, pts, cx, cz, top - 0.45, use, r, area);
    if (use === 10 && front >= 0) this.churchTower(wallBuf, rb, pts, front, hs, top, st.tint, winCode, pb);
    if (use === 12 && front >= 0) this.petrolCanopy(pb, pts, front, hs, cx, cz);
  }

  // ------------------------------------------------------------------ compound walls
  private compound(cx: number, cz: number, ocx: number, ocz: number, ux: number, uz: number, vx: number, vz: number, hu: number, hv: number, r: number, hs: number[]): void {
    const w = this.w; if (w.barrierNear(cx, cz)) return; // real mapped walls/fences take priority over my guessed compound
    const m = 2.4 + r * 2.4, A = hu + m, B = hv + m; const y = Math.min(...hs);
    const P = (su: number, sv: number): [number, number] => [ocx + ux * su + vx * sv, ocz + uz * su + vz * sv];
    const corners = [P(-A, -B), P(A, -B), P(A, B), P(-A, B)];
    for (const c of corners) if (w.roadAt(c[0], c[1])) return;
    // front = the side whose midpoint is nearest to a road
    const sides: [number, number][][] = [[corners[0], corners[1]], [corners[1], corners[2]], [corners[2], corners[3]], [corners[3], corners[0]]];
    let front = 0, bd = 1e9; sides.forEach((sd, i) => { const d = w.distToRoad((sd[0][0] + sd[1][0]) / 2, (sd[0][1] + sd[1][1]) / 2, 5); if (d < bd) { bd = d; front = i; } });
    const pb = this.buf(cx, cz, 'props'); const tint = pick(CONCRETE, r * 9.7).map((v) => v * 1.1), cap = [tint[0] * 0.8, tint[1] * 0.8, tint[2] * 0.8];
    const wall = (a: [number, number], b: [number, number]) => {
      const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz); if (len < 0.5) return;
      const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
      slab(pb, (px, pz) => w.calculateRawTerrainHeight(px, pz), a[0], a[1], b[0], b[1], 0.22, 1.75, tint, cap);
      const nx = -dz / len * 0.1, nz = dx / len * 0.1, tx = dx / len * len / 2, tz = dz / len * len / 2;
      w.collision.addPolygon([mx - tx + nx, mz - tz + nz, mx + tx + nx, mz + tz + nz, mx + tx - nx, mz + tz - nz, mx - tx - nx, mz - tz - nz]);
    };
    sides.forEach((sd, i) => {
      if (i !== front) { wall(sd[0], sd[1]); return; }
      const dx = sd[1][0] - sd[0][0], dz = sd[1][1] - sd[0][1], len = Math.hypot(dx, dz), gap = Math.min(4.2, len * 0.45), g0 = (len - gap) / 2 / len, g1 = 1 - g0;
      const q = (t: number): [number, number] => [sd[0][0] + dx * t, sd[0][1] + dz * t];
      wall(sd[0], q(g0)); wall(q(g1), sd[1]);
      // gate pillars
      for (const t of [g0, g1]) { const p = q(t); this.box(pb, p[0], w.calculateRawTerrainHeight(p[0], p[1]), p[1], 0.5, 2.1, 0.5, Math.atan2(dz, dx), [tint[0] * 0.85, tint[1] * 0.85, tint[2] * 0.85]); }
    });
    // hedge / shrubs just inside the wall
    const green = [0.18 + r * 0.12, 0.38 + r * 0.14, 0.15];
    for (let k = 0; k < 3; k++) { const sv = (k - 1) * hv * 0.8, p = P(-A + 1.1, sv); if (!w.roadAt(p[0], p[1])) this.box(pb, p[0], w.calculateRawTerrainHeight(p[0], p[1]), p[1], 1.4, 1.1 + r * 0.5, 1.4, r * 6 + k, green); }
  }

  // ------------------------------------------------------------------ roofs
  private flatRoof(b: GeoBuf, pts: [number, number][], y: number, tint: number[], _parapet: boolean): void {
    const c2 = pts.map((p) => new THREE.Vector2(p[0], p[1]));
    const tris = THREE.ShapeUtils.triangulateShape(c2, []); const base = b.pos.length / 3;
    pts.forEach((p) => b.vert(p[0], y, p[1], 0, 1, 0, p[0] / 3, p[1] / 3, tint, 0));
    for (const t of tris) { const [a, c, d] = t; const cr = (pts[c][0] - pts[a][0]) * (pts[d][1] - pts[a][1]) - (pts[c][1] - pts[a][1]) * (pts[d][0] - pts[a][0]); if (cr < 0) b.tri(base + a, base + c, base + d); else b.tri(base + a, base + d, base + c); }
  }

  private hipRoof(b: GeoBuf, pts: [number, number][], cx: number, cz: number, top: number, tint: number[], area: number): void {
    const n = pts.length; let rad = 0; pts.forEach((p) => { rad += Math.hypot(p[0] - cx, p[1] - cz); }); rad /= n;
    const k = 1 + 0.4 / Math.max(rad, 2), ridge = Math.min(2.4, 0.5 * rad + 0.3 + (area > 150 ? 0.2 : 0));
    const eaves = pts.map((p) => [cx + (p[0] - cx) * k, cz + (p[1] - cz) * k]);
    for (let i = 0; i < n; i++) {
      const a = eaves[i], c = eaves[(i + 1) % n];
      const e1 = [c[0] - a[0], 0, c[1] - a[1]], e2 = [cx - a[0], ridge, cz - a[1]];
      let nx = e1[1] * e2[2] - e1[2] * e2[1], ny = e1[2] * e2[0] - e1[0] * e2[2], nz = e1[0] * e2[1] - e1[1] * e2[0];
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const ia = b.vert(a[0], top - 0.15, a[1], nx, ny, nz, a[0] / 3, a[1] / 3, tint, 0), ib = b.vert(c[0], top - 0.15, c[1], nx, ny, nz, c[0] / 3, c[1] / 3, tint, 0), ap = b.vert(cx, top + ridge, cz, nx, ny, nz, cx / 3, cz / 3, tint, 0);
      b.tri(ia, ap, ib);
    }
  }

  private gableRoof(rb: GeoBuf, wb: GeoBuf, cx: number, cz: number, ux: number, uz: number, vx: number, vz: number, hu: number, hv: number, top: number, tint: number[], pitch: number, wallTint: number[], win: number, low: boolean): void {
    const o = low ? 0.25 : 0.4, A = hu + o, B = hv + o, rh = hv * pitch, y0 = top - 0.1;
    const P = (su: number, sv: number): [number, number] => [cx + ux * su + vx * sv, cz + uz * su + vz * sv];
    const slope = (sv: number) => {
      const e1 = P(-A, sv * B), e2 = P(A, sv * B), r1 = P(-A, 0), r2 = P(A, 0);
      const t0 = [e2[0] - e1[0], 0, e2[1] - e1[1]], t1 = [r1[0] - e1[0], rh + 0.1, r1[1] - e1[1]];
      let nx = t0[1] * t1[2] - t0[2] * t1[1], ny = t0[2] * t1[0] - t0[0] * t1[2], nz = t0[0] * t1[1] - t0[1] * t1[0];
      const nl = Math.hypot(nx, ny, nz) || 1; nx /= nl; ny /= nl; nz /= nl; if (ny < 0) { nx = -nx; ny = -ny; nz = -nz; }
      const a = rb.vert(e1[0], y0, e1[1], nx, ny, nz, e1[0] / 3, e1[1] / 3, tint, 0), b2 = rb.vert(e2[0], y0, e2[1], nx, ny, nz, e2[0] / 3, e2[1] / 3, tint, 0);
      const c = rb.vert(r2[0], top + rh, r2[1], nx, ny, nz, r2[0] / 3, r2[1] / 3, tint, 0), d = rb.vert(r1[0], top + rh, r1[1], nx, ny, nz, r1[0] / 3, r1[1] / 3, tint, 0);
      if (sv > 0) { rb.tri(a, c, b2); rb.tri(a, d, c); } else { rb.tri(a, b2, c); rb.tri(a, c, d); }
    };
    slope(1); slope(-1);
    // gable end triangles in the wall material (both faces so winding can never hide them)
    for (const su of [-hu, hu]) {
      const l = P(su, -hv), r = P(su, hv), t = P(su, 0); const s = su > 0 ? 1 : -1;
      for (const f of [1, -1]) {
        const nx = ux * s * f, nz = uz * s * f;
        const i0 = wb.vert(l[0], top - 0.1, l[1], nx, 0, nz, 0, 0, wallTint, 0), i1 = wb.vert(r[0], top - 0.1, r[1], nx, 0, nz, 1, 0, wallTint, 0), i2 = wb.vert(t[0], top + rh, t[1], nx, 0, nz, 0.5, 1, wallTint, 0);
        if (f > 0) wb.tri(i0, i1, i2); else wb.tri(i0, i2, i1);
      }
    }
    void win;
  }

  // ------------------------------------------------------------------ details
  private frontEdge(pts: [number, number][]): number {
    const n = pts.length; let best = -1, bd = 60;
    for (let i = 0; i < n; i++) {
      const a = pts[i], c = pts[(i + 1) % n]; const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz); if (len < 3.5) continue;
      const mx = (a[0] + c[0]) / 2 + (dz / len) * 6, mz = (a[1] + c[1]) / 2 - (dx / len) * 6;
      const d = this.w.distToRoad(mx, mz, 5) - (len > 8 ? 2 : 0);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  private awning(b: GeoBuf, pts: [number, number][], i: number, hs: number[], r: number): void {
    const n = pts.length, a = pts[i], c = pts[(i + 1) % n]; const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    const nx = dz / len, nz = -dx / len, tx = dx / len, tz = dz / len; const wdt = Math.min(len * 0.9, 12), s0 = (len - wdt) / 2;
    const col = pick(AWNING, r * 5.3), y = (hs[i] + hs[(i + 1) % n]) / 2;
    const p0: [number, number] = [a[0] + tx * s0, a[1] + tz * s0], p1: [number, number] = [p0[0] + tx * wdt, p0[1] + tz * wdt];
    const out = 1.7, yh = y + 3.0, yl = y + 2.55;
    const sn = [nx * 0.45, 0.89, nz * 0.45], sl = Math.hypot(sn[0], sn[1], sn[2]);
    const v = [b.vert(p0[0], yh, p0[1], sn[0] / sl, sn[1] / sl, sn[2] / sl, 0, 0, col), b.vert(p1[0], yh, p1[1], sn[0] / sl, sn[1] / sl, sn[2] / sl, 0, 0, col),
      b.vert(p1[0] + nx * out, yl, p1[1] + nz * out, sn[0] / sl, sn[1] / sl, sn[2] / sl, 0, 0, col), b.vert(p0[0] + nx * out, yl, p0[1] + nz * out, sn[0] / sl, sn[1] / sl, sn[2] / sl, 0, 0, col)];
    b.tri(v[0], v[2], v[1]); b.tri(v[0], v[3], v[2]);
    const v2 = [b.vert(p0[0], yh, p0[1], -sn[0] / sl, -sn[1] / sl, -sn[2] / sl, 0, 0, [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55]), b.vert(p1[0], yh, p1[1], -sn[0] / sl, -sn[1] / sl, -sn[2] / sl, 0, 0, [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55]),
      b.vert(p1[0] + nx * out, yl, p1[1] + nz * out, -sn[0] / sl, -sn[1] / sl, -sn[2] / sl, 0, 0, [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55]), b.vert(p0[0] + nx * out, yl, p0[1] + nz * out, -sn[0] / sl, -sn[1] / sl, -sn[2] / sl, 0, 0, [col[0] * 0.55, col[1] * 0.55, col[2] * 0.55])];
    b.tri(v2[0], v2[1], v2[2]); b.tri(v2[0], v2[2], v2[3]);
  }

  private signPlate(pts: [number, number][], i: number, hs: number[], top: number, sid: number, kind: string, cx: number, cz: number): void {
    const b = this.buf(cx, cz, 'sign'); const n = pts.length;
    let e = i; if (e < 0) { let bl = 0; for (let k = 0; k < n; k++) { const l = Math.hypot(pts[(k + 1) % n][0] - pts[k][0], pts[(k + 1) % n][1] - pts[k][1]); if (l > bl) { bl = l; e = k; } } }
    const a = pts[e], c = pts[(e + 1) % n]; const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz); if (len < 3) return;
    const nx = dz / len, nz = -dx / len, tx = dx / len, tz = dz / len; const y = (hs[e] + hs[(e + 1) % n]) / 2;
    const big = kind === 'big' || kind === 'top'; const wdt = Math.min(len * (big ? 0.7 : 0.6), big ? 14 : 7), hh = Math.min(wdt / 4, big ? 2.2 : 1.1);
    const s0 = (len - wdt) / 2, y0 = kind === 'top' ? top - hh - 0.4 : kind === 'big' ? top - hh - 0.5 : y + 3.15, y1 = y0 + hh, off = 0.07;
    const p0: [number, number] = [a[0] + tx * s0 + nx * off, a[1] + tz * s0 + nz * off], p1: [number, number] = [p0[0] + tx * wdt, p0[1] + tz * wdt];
    const col = sid % this.signCols, row = Math.floor(sid / this.signCols);
    const ux0 = col / this.signCols, ux1 = (col + 1) / this.signCols, vy1 = 1 - row / this.signRows, vy0 = 1 - (row + 1) / this.signRows;
    const w = [1, 1, 1];
    // seen from outside the edge runs right-to-left, so mirror U to make the text read left-to-right
    const i0 = b.vert(p0[0], y0, p0[1], nx, 0, nz, ux1, vy0, w), i1 = b.vert(p1[0], y0, p1[1], nx, 0, nz, ux0, vy0, w), i2 = b.vert(p1[0], y1, p1[1], nx, 0, nz, ux0, vy1, w), i3 = b.vert(p0[0], y1, p0[1], nx, 0, nz, ux1, vy1, w);
    b.tri(i0, i2, i1); b.tri(i0, i3, i2);
  }

  private box(b: GeoBuf, x: number, y: number, z: number, sx: number, sy: number, sz: number, rot: number, col: number[]): void {
    const c = Math.cos(rot), s = Math.sin(rot); const hx = sx / 2, hz = sz / 2;
    const corner = (lx: number, lz: number): [number, number] => [x + lx * c - lz * s, z + lx * s + lz * c];
    const q = [corner(-hx, -hz), corner(hx, -hz), corner(hx, hz), corner(-hx, hz)];
    for (let k = 0; k < 4; k++) {
      const a = q[k], d = q[(k + 1) % 4]; const ex = d[0] - a[0], ez = d[1] - a[1], l = Math.hypot(ex, ez) || 1; const nx = ez / l, nz = -ex / l;
      const i0 = b.vert(a[0], y, a[1], nx, 0, nz, 0, 0, col), i1 = b.vert(d[0], y, d[1], nx, 0, nz, 0, 0, col), i2 = b.vert(d[0], y + sy, d[1], nx, 0, nz, 0, 0, col), i3 = b.vert(a[0], y + sy, a[1], nx, 0, nz, 0, 0, col);
      b.tri(i0, i2, i1); b.tri(i0, i3, i2);
    }
    const t = col.map((v) => v * 1.12);
    const j = q.map((p) => b.vert(p[0], y + sy, p[1], 0, 1, 0, 0, 0, t));
    b.tri(j[0], j[2], j[1]); b.tri(j[0], j[3], j[2]);
  }

  /** Water tanks on stands, AC units and satellite dishes on flat roofs. */
  private roofProps(b: GeoBuf, pts: [number, number][], cx: number, cz: number, y: number, use: number, r: number, area: number): void {
    const inside = (x: number, z: number) => { let ins = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], c = pts[j]; if ((a[1] > z) !== (c[1] > z) && x < ((c[0] - a[0]) * (z - a[1])) / (c[1] - a[1]) + a[0]) ins = !ins; } return ins; };
    const spot = (k: number): [number, number] | null => { for (let t = 0; t < 6; t++) { const x = cx + (rnd(r * 97 + k * 13 + t) - 0.5) * Math.sqrt(area) * 0.7, z = cz + (rnd(r * 53 + k * 7 + t) - 0.5) * Math.sqrt(area) * 0.7; if (inside(x, z)) return [x, z]; } return null; };
    const tank = spot(1);
    if (tank && (use === 2 || r < 0.5)) { this.box(b, tank[0], y, tank[1], 0.12, 0.9, 0.12, 0, [0.3, 0.3, 0.32]); this.box(b, tank[0], y + 0.9, tank[1], 1.5, 1.35, 1.5, r * 3, [0.12, 0.13, 0.15]); }
    const ac = spot(2); if (ac) this.box(b, ac[0], y, ac[1], 1.6, 0.9, 1.0, r * 5, [0.74, 0.76, 0.78]);
    if (use === 6 || use === 5 || use === 4) { const a2 = spot(3); if (a2) this.box(b, a2[0], y, a2[1], 2.4, 1.3, 1.4, r * 2, [0.65, 0.67, 0.7]); }
  }

  private churchTower(wb: GeoBuf, rb: GeoBuf, pts: [number, number][], i: number, hs: number[], top: number, tint: number[], win: number, pb: GeoBuf): void {
    const n = pts.length, a = pts[i], c = pts[(i + 1) % n]; const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    const nx = dz / len, nz = -dx / len, tx = dx / len, tz = dz / len; const mx = (a[0] + c[0]) / 2 + nx * 0.2, mz = (a[1] + c[1]) / 2 + nz * 0.2, base = Math.min(...hs) - 0.3, th = top + 5.5 - base;
    const hw = 1.5; let q: [number, number][] = [[mx - tx * hw, mz - tz * hw], [mx + tx * hw, mz + tz * hw], [mx + tx * hw - nx * 3, mz + tz * hw - nz * 3], [mx - tx * hw - nx * 3, mz - tz * hw - nz * 3]];
    let qa = 0; for (let k = 0; k < 4; k++) qa += q[k][0] * q[(k + 1) % 4][1] - q[(k + 1) % 4][0] * q[k][1]; if (qa < 0) q = q.reverse();
    for (let k = 0; k < 4; k++) {
      const p = q[k], d = q[(k + 1) % 4]; const ex = d[0] - p[0], ez = d[1] - p[1], l = Math.hypot(ex, ez) || 1, wx = ez / l, wz = -ex / l;
      const i0 = wb.vert(p[0], base, p[1], wx, 0, wz, 0, 0, tint, 6.2), i1 = wb.vert(d[0], base, d[1], wx, 0, wz, l / 3, 0, tint, 6.2), i2 = wb.vert(d[0], base + th, d[1], wx, 0, wz, l / 3, th / 3.2, tint, 6.2), i3 = wb.vert(p[0], base + th, p[1], wx, 0, wz, 0, th / 3.2, tint, 6.2);
      wb.tri(i0, i2, i1); wb.tri(i0, i3, i2);
    }
    const ccx = (q[0][0] + q[2][0]) / 2, ccz = (q[0][1] + q[2][1]) / 2, ap = base + th;
    for (let k = 0; k < 4; k++) { const p = q[k], d = q[(k + 1) % 4]; const ex = d[0] - p[0], ez = d[1] - p[1]; let nnx = ez, nny = 1.2, nnz = -ex; const l = Math.hypot(nnx, nny, nnz); nnx /= l; nny /= l; nnz /= l;
      const ia = rb.vert(p[0], ap, p[1], nnx, nny, nnz, 0, 0, [0.4, 0.2, 0.2], 0), ib = rb.vert(d[0], ap, d[1], nnx, nny, nnz, 1, 0, [0.4, 0.2, 0.2], 0), ic = rb.vert(ccx, ap + 3.2, ccz, nnx, nny, nnz, 0.5, 1, [0.4, 0.2, 0.2], 0); rb.tri(ia, ic, ib); }
    this.box(pb, ccx, ap + 3.2, ccz, 0.12, 1.5, 0.12, 0, [0.95, 0.95, 0.95]); this.box(pb, ccx, ap + 4.2, ccz, 0.8, 0.12, 0.12, Math.atan2(tz, tx), [0.95, 0.95, 0.95]);
    void win;
  }

  private petrolCanopy(pb: GeoBuf, pts: [number, number][], i: number, hs: number[], cx: number, cz: number): void {
    const n = pts.length, a = pts[i], c = pts[(i + 1) % n]; const dx = c[0] - a[0], dz = c[1] - a[1], len = Math.hypot(dx, dz);
    const nx = dz / len, nz = -dx / len, tx = dx / len, tz = dz / len, rot = Math.atan2(tz, tx), y = Math.min(...hs);
    const mx = (a[0] + c[0]) / 2 + nx * 8, mz = (a[1] + c[1]) / 2 + nz * 8;
    this.box(pb, mx, y + 4.6, mz, 16, 0.5, 9, rot, [0.96, 0.96, 0.96]); this.box(pb, mx, y + 4.35, mz, 16.2, 0.25, 9.2, rot, [0.85, 0.12, 0.12]);
    for (const [su, sv] of [[-5, -3], [5, -3], [-5, 3], [5, 3]]) {
      const px = mx + tx * su + nx * sv, pz = mz + tz * su + nz * sv; this.box(pb, px, y, pz, 0.45, 4.6, 0.45, rot, [0.82, 0.82, 0.84]); this.w.collision.addCircle(px, pz, 0.35);
    }
    for (const su of [-2.5, 2.5]) { const px = mx + tx * su, pz = mz + tz * su; this.box(pb, px, y, pz, 0.7, 1.4, 1.6, rot, [0.9, 0.18, 0.12]); }
    void cx; void cz;
  }
}
