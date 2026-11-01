import * as THREE from 'three';

export /** Growable geometry buffers. */
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

