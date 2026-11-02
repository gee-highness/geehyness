import * as THREE from 'three';
import {mergeGeometries} from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Low-poly Southern-African public transport: Toyota-Quantum-style minibus taxi and a long-distance coach (single merged mesh each, vertex colours). Forward = +z. */
const part = (sx: number, sy: number, sz: number, x: number, y: number, z: number, c: THREE.ColorRepresentation): THREE.BufferGeometry => {
  const g = new THREE.BoxGeometry(sx, sy, sz).toNonIndexed(); g.translate(x, y, z); g.deleteAttribute('uv');
  const col = new THREE.Color(c), a = new Float32Array(g.attributes['position'].count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const wheel = (r: number, w: number, x: number, z: number): THREE.BufferGeometry => {
  const g = new THREE.CylinderGeometry(r, r, w, 8).toNonIndexed(); g.rotateZ(Math.PI / 2); g.translate(x, r, z); g.deleteAttribute('uv');
  const a = new Float32Array(g.attributes['position'].count * 3).fill(0.06); g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g;
};
const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.25 });
const finish = (parts: THREE.BufferGeometry[], L: number, W: number, H: number): THREE.Group => {
  const g = new THREE.Group(); const body = new THREE.Mesh(mergeGeometries(parts)!, mat); body.castShadow = false; g.add(body); g.userData['car'] = body; g.userData['wheels'] = [];
  const proxy = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.8, L), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 })); proxy.position.y = H * 0.45; proxy.visible = false; g.add(proxy); g.userData['proxy'] = proxy; return g;
};

/** White 15-seater with a coloured side stripe and a blue-black glass band (the dominant vehicle on town streets). */
export function makeQuantum(stripe: number): THREE.Group {
  const P = [
    part(1.95, 0.85, 5.3, 0, 0.9, 0, 0xf2f2f0), part(1.9, 0.95, 4.7, 0, 1.8, -0.15, 0xf5f5f3), part(1.97, 0.5, 4.3, 0, 1.75, -0.2, 0x1c2733),
    part(1.7, 0.7, 0.12, 0, 1.75, 2.15, 0x1c2733), part(1.98, 0.14, 5.0, 0, 1.0, 0, stripe), part(1.9, 0.12, 4.6, 0, 2.3, -0.15, 0xdcdcda),
    part(1.7, 0.25, 0.12, 0, 0.55, 2.62, 0x333333), part(0.35, 0.18, 0.1, 0.6, 1.0, 2.66, 0xfff1b0), part(0.35, 0.18, 0.1, -0.6, 1.0, 2.66, 0xfff1b0),
    ...[[-0.95, 1.65], [0.95, 1.65], [-0.95, -1.7], [0.95, -1.7]].map(([x, z]) => wheel(0.38, 0.24, x, z)),
  ];
  return finish(P, 5.3, 1.95, 2.3);
}

/** 12 m white coach with a dark glass band and coloured side swoosh. */
export function makeCoach(stripe: number): THREE.Group {
  const P = [
    part(2.5, 1.3, 12, 0, 1.25, 0, 0xf4f4f2), part(2.45, 1.0, 11.4, 0, 2.4, -0.1, 0xf7f7f5), part(2.52, 0.85, 10.6, 0, 2.3, -0.1, 0x1a2330),
    part(2.2, 0.9, 0.12, 0, 2.3, 5.75, 0x1a2330), part(2.52, 0.3, 11, 0, 1.2, 0, stripe), part(2.45, 0.12, 11.2, 0, 2.95, -0.1, 0xe0e0de),
    part(2.2, 0.35, 0.15, 0, 0.9, 6.05, 0x2b2b2b),
    ...[[-1.15, 3.8], [1.15, 3.8], [-1.15, -2.8], [1.15, -2.8], [-1.15, -4.1], [1.15, -4.1]].map(([x, z]) => wheel(0.55, 0.3, x, z)),
  ];
  return finish(P, 12, 2.5, 3.4);
}
