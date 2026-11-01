import * as THREE from 'three';

/** Growable geometry buffers backed by typed arrays (no boxed numbers: fast to convert, half the memory). */
export class GeoBuf {
  private p = new Float32Array(3 * 512); private n = new Float32Array(3 * 512); private t = new Float32Array(2 * 512); private c = new Float32Array(3 * 512); private w = new Float32Array(512);
  private ix = new Uint32Array(3 * 512); private vc = 0; private ic = 0;
  /** Compatibility: callers use `buf.pos.length / 3` as the next vertex index. */
  get pos(): { length: number } { return { length: this.vc * 3 }; }
  get vertexCount(): number { return this.vc; }
  private grow(): void {
    const cap = this.w.length * 2;
    const g = (a: Float32Array, k: number) => { const r = new Float32Array(cap * k); r.set(a); return r; };
    this.p = g(this.p, 3); this.n = g(this.n, 3); this.t = g(this.t, 2); this.c = g(this.c, 3); this.w = g(this.w, 1);
  }
  vert(x: number, y: number, z: number, nx: number, ny: number, nz: number, u: number, v: number, c: number[], w = 0): number {
    if (this.vc >= this.w.length) this.grow();
    const i = this.vc++, i3 = i * 3;
    this.p[i3] = x; this.p[i3 + 1] = y; this.p[i3 + 2] = z; this.n[i3] = nx; this.n[i3 + 1] = ny; this.n[i3 + 2] = nz;
    this.t[i * 2] = u; this.t[i * 2 + 1] = v; this.c[i3] = c[0]; this.c[i3 + 1] = c[1]; this.c[i3 + 2] = c[2]; this.w[i] = w;
    return i;
  }
  tri(a: number, b: number, c: number): void {
    if (this.ic + 3 > this.ix.length) { const r = new Uint32Array(this.ix.length * 2); r.set(this.ix); this.ix = r; }
    this.ix[this.ic++] = a; this.ix[this.ic++] = b; this.ix[this.ic++] = c;
  }
  get empty(): boolean { return this.ic === 0; }
  toGeometry(withColor = true, withWin = false): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry(), n = this.vc;
    g.setAttribute('position', new THREE.BufferAttribute(this.p.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.n.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.t.slice(0, n * 2), 2));
    if (withColor) g.setAttribute('color', new THREE.BufferAttribute(this.c.slice(0, n * 3), 3));
    if (withWin) g.setAttribute('aWin', new THREE.BufferAttribute(this.w.slice(0, n), 1));
    g.setIndex(new THREE.BufferAttribute(this.ix.slice(0, this.ic), 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Quad with a chosen outward normal; winding is picked so the front face really faces that normal. */
export function addQuad(b: GeoBuf, p: number[][], n: number[], col: number[], uv?: number[][]): void {
  const ids = p.map((v, i) => b.vert(v[0], v[1], v[2], n[0], n[1], n[2], uv ? uv[i][0] : v[0] / 3, uv ? uv[i][1] : v[2] / 3, col));
  const e1 = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], e2 = [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]];
  const cx = e1[1] * e2[2] - e1[2] * e2[1], cy = e1[2] * e2[0] - e1[0] * e2[2], cz = e1[0] * e2[1] - e1[1] * e2[0];
  if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) { b.tri(ids[0], ids[1], ids[2]); b.tri(ids[0], ids[2], ids[3]); } else { b.tri(ids[0], ids[2], ids[1]); b.tri(ids[0], ids[3], ids[2]); }
}

/**
 * A wall/fence/hedge slab from (ax,az) to (cx,cz). It is cut into <=step metre pieces and every piece takes the
 * terrain height at its own two ends, so it hugs slopes: the base sinks `sink` below ground, the top stands `hgt` above it.
 */
export function slab(b: GeoBuf, h: (x: number, z: number) => number, ax: number, az: number, cx: number, cz: number, thick: number, hgt: number, col: number[], cap?: number[], sink = 0.14, step = 3): void {
  const L = Math.hypot(cx - ax, cz - az); if (L < 0.05) return;
  const tx = (cx - ax) / L, tz = (cz - az) / L, nx = -tz * thick / 2, nz = tx * thick / 2, n = Math.max(1, Math.ceil(L / step));
  const up = col.map((v) => Math.min(1, v * 1.08));
  for (let k = 0; k < n; k++) {
    const x0 = ax + (cx - ax) * (k / n), z0 = az + (cz - az) * (k / n), x1 = ax + (cx - ax) * ((k + 1) / n), z1 = az + (cz - az) * ((k + 1) / n);
    const g0 = h(x0, z0), g1 = h(x1, z1), b0 = g0 - sink, b1 = g1 - sink, t0 = g0 + hgt, t1 = g1 + hgt;
    addQuad(b, [[x0 + nx, b0, z0 + nz], [x1 + nx, b1, z1 + nz], [x1 + nx, t1, z1 + nz], [x0 + nx, t0, z0 + nz]], [-tz, 0, tx], col);
    addQuad(b, [[x0 - nx, b0, z0 - nz], [x1 - nx, b1, z1 - nz], [x1 - nx, t1, z1 - nz], [x0 - nx, t0, z0 - nz]], [tz, 0, -tx], col);
    addQuad(b, [[x0 + nx, t0, z0 + nz], [x1 + nx, t1, z1 + nz], [x1 - nx, t1, z1 - nz], [x0 - nx, t0, z0 - nz]], [0, 1, 0], cap ?? up);
  }
}
