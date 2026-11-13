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

import { makeCar, carSize } from './car-gen';
const hex = (h: number): number[] => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
const withProxy = (g: THREE.Group, kind: 'minibus' | 'coach'): THREE.Group => {
  const z = carSize(kind), proxy = new THREE.Mesh(new THREE.BoxGeometry(z.W, z.H * 0.8, z.L), new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.6 }));
  proxy.position.y = z.H * 0.45; proxy.visible = false; g.add(proxy); g.userData['proxy'] = proxy; return g;
};
/** White 15-seater Quantum-style minibus taxi with a coloured waist stripe (the dominant vehicle on town streets). */
export function makeQuantum(stripe: number): THREE.Group { return withProxy(makeCar('minibus', [0.94, 0.94, 0.92], hex(stripe)), 'minibus'); }
/** 12 m white coach with a coloured waist band. */
export function makeCoach(stripe: number): THREE.Group { return withProxy(makeCar('coach', [0.95, 0.95, 0.93], hex(stripe)), 'coach'); }
