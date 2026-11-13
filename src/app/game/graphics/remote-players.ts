import * as THREE from 'three';
import { makeCar, CarKind } from './car-gen';
import { CAR_CATALOG } from '../cars';
import type { DynamicCollider } from '../physics/collision';
import type { PeerState } from '../../services/multiplayer.service';

/** Which generated body stands in for a catalogue car on other players' screens (same shapes everywhere, so nothing extra to download). */
function kindOf(id: string): CarKind {
  const d = CAR_CATALOG.find((c) => c.id === id); if (d?.gen) return d.gen;
  if (/ferrari|race|sports|kart/.test(id)) return /hatch/.test(id) ? 'hatch' : 'coupe';
  if (/suv|police/.test(id)) return /police/.test(id) ? 'sedan' : 'suv';
  if (/van|ambulance/.test(id)) return 'minibus';
  if (/truck|delivery|tractor|garbage|fire/.test(id)) return 'bakkie';
  return 'sedan';
}
const rgb = (hex: string): number[] => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };

function nameTag(name: string): THREE.Sprite {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const x = cv.getContext('2d')!;
  x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(0,0,0,0.55)'; const w = Math.min(250, x.measureText(name).width + 28); x.beginPath(); x.roundRect(128 - w / 2, 8, w, 48, 14); x.fill();
  x.fillStyle = '#fff'; x.fillText(name, 128, 33, 230);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(3.2, 0.8, 1); s.renderOrder = 20; return s;
}

interface Remote { id: number; group: THREE.Group; tag: THREE.Sprite; car: string; color: string; spin: number; init: boolean; vx: number; vz: number; speed: number; }

/** Other players' cars: dead-reckoned from the last pose, smoothed, wheels rolling and steering, a name tag above each. */
export class RemotePlayers {
  private remotes = new Map<number, Remote>();
  private q = new THREE.Quaternion(); private tq = new THREE.Quaternion(); private tmp = new THREE.Vector3();
  constructor(private scene: THREE.Scene) {}

  private build(s: PeerState): Remote {
    const g = makeCar(kindOf(s.car), rgb(s.color), undefined);
    const size = g.userData['size'] as { H: number }; const tag = nameTag(s.name); tag.position.set(0, size.H + 0.9, 0); g.add(tag);
    for (const w of g.userData['wheels'] as THREE.Object3D[]) w.rotation.order = 'YXZ';
    g.visible = false; this.scene.add(g);
    return { id: s.id, group: g, tag, car: s.car, color: s.color, spin: 0, init: false, vx: 0, vz: 0, speed: 0 };
  }
  private drop(r: Remote): void { this.scene.remove(r.group); r.group.traverse((o) => { const m = o as THREE.Mesh | THREE.Sprite; if ((m as THREE.Sprite).isSprite) { const mat = (m as THREE.Sprite).material; mat.map?.dispose(); mat.dispose(); } }); this.remotes.delete(r.id); }

  update(states: Map<number, PeerState>, dt: number, now: number): void {
    for (const r of [...this.remotes.values()]) if (!states.has(r.id)) this.drop(r);
    for (const s of states.values()) {
      let r = this.remotes.get(s.id);
      if (r && (s.fresh && (s.car !== r.car || s.color !== r.color))) { this.drop(r); r = undefined; }
      if (!r) r = this.remotes.set(s.id, this.build(s)).get(s.id)!;
      s.fresh = false;
      if (s.at === 0) { r.group.visible = false; continue; }                       // no pose received yet
      const age = Math.min(0.3, (now - s.at) / 1000);
      const px = s.p[0] + s.v[0] * age, pz = s.p[2] + s.v[2] * age, py = Math.max(s.g, s.p[1] + s.v[1] * age - 0.34);
      const g = r.group, k = r.init ? 1 - Math.exp(-14 * dt) : 1;
      if (!r.init || Math.hypot(g.position.x - px, g.position.z - pz) > 40) { g.position.set(px, py, pz); this.q.set(s.q[0], s.q[1], s.q[2], s.q[3]); g.quaternion.copy(this.q); r.init = true; }
      else { g.position.x += (px - g.position.x) * k; g.position.z += (pz - g.position.z) * k; g.position.y += (py - g.position.y) * k; this.tq.set(s.q[0], s.q[1], s.q[2], s.q[3]); g.quaternion.slerp(this.tq, k); }
      g.visible = true; r.vx = s.v[0]; r.vz = s.v[2];
      const fwd = this.tmp.set(0, 0, 1).applyQuaternion(g.quaternion); r.speed = s.v[0] * fwd.x + s.v[2] * fwd.z;
      const ws = g.userData['wheels'] as THREE.Object3D[], wr = (g.userData['size'] as { wr: number }).wr;
      r.spin += (r.speed / wr) * dt;
      ws.forEach((w, i) => { w.rotation.x = r.spin; if (i < 2) w.rotation.y = -s.s * 0.5; });
    }
  }

  /** Moving circles so remote cars are solid for the local player (3 per car along its heading). */
  colliders(): DynamicCollider[] {
    const out: DynamicCollider[] = [];
    for (const r of this.remotes.values()) {
      if (!r.group.visible) continue;
      const hd = this.tmp.set(0, 0, 1).applyQuaternion(r.group.quaternion), l = Math.hypot(hd.x, hd.z) || 1, hx = hd.x / l, hz = hd.z / l, sz = (r.group.userData['size'] as { L: number }).L / 2 - 0.9;
      for (const off of [-sz, 0, sz]) out.push({ x: r.group.position.x + hx * off, z: r.group.position.z + hz * off, r: 1.0, vx: r.vx, vz: r.vz, mass: 1500, id: 3000 + r.id });
    }
    return out;
  }
  dispose(): void { for (const r of [...this.remotes.values()]) this.drop(r); }
}
