import * as THREE from 'three';
import { AssetLibrary } from './asset-library';
import type { WorldBuilder } from './world-builder';
import type { RoadGraph, Route } from '../road-graph';
import { CAR_CATALOG } from '../cars';
import type { DynamicCollider } from '../physics/collision';

export type CopState = 'PATROL' | 'ALERT' | 'CHASE' | 'SEARCH';
/** How far (metres) the player can be seen / heard right now. Computed by the app from lights, speed, horn, skids. */
export interface Stealth { visRadius: number; noiseRadius: number }
export interface PlayerPose { x: number; z: number; vx: number; vz: number; speedKmh: number }

interface Cop {
  obj: THREE.Group; ready: boolean; state: CopState; route: Route | null; s: number; speed: number; susp: number; known: [number, number] | null;
  timer: number; reroute: number; unseen: number; bust: number; pos: THREE.Vector3; hd: [number, number]; yaw: number; bar: THREE.Mesh[]; lamps: THREE.Mesh[]; spin: number; seen: boolean;
}

/**
 * Cops & robbers: patrol cars that notice the player by sight (headlights, silhouette, line of sight, field of view) and by hearing
 * (engine, skids, horn, crashes). Suspicion builds, they investigate the last known position, chase over the real road graph and
 * radio nearby units. Lose them by killing the lights, slowing down and getting out of earshot.
 */
export class Police {
  readonly cops: Cop[] = [];
  enabled = true;
  onBusted?: () => void; onEscaped?: () => void;
  /** Plain object for the HUD / audio (read it, do not bind to it). */
  readonly status = { state: 'PATROL' as CopState | 'OFF', suspicion: 0, nearest: 1e9, chasers: 0, nearestChaser: 1e9 };
  private chaseEver = false; private calmT = 0; private light: THREE.PointLight; private flash = 0; private acc = 0;
  private readonly red = new THREE.Color(1, 0.05, 0.05); private readonly blue = new THREE.Color(0.1, 0.25, 1);

  constructor(private scene: THREE.Scene, private world: WorldBuilder, private graph: () => RoadGraph | undefined, private count = 4) {
    this.light = new THREE.PointLight(0xff2020, 0, 45, 1.6); scene.add(this.light);
    this.load();
  }

  private async load(): Promise<void> {
    const def = CAR_CATALOG.find((c) => c.id === 'police'); if (!def) return;
    const model = await AssetLibrary.load(def.file).catch(() => null); if (!model) return;
    for (let i = 0; i < this.count; i++) {
      const car = model.clone(true); const wheels = def.wheels.map((n) => car.getObjectByName(n)).filter(Boolean) as THREE.Object3D[];
      let sc = 2.2; if (wheels.length === 4) { car.updateWorldMatrix(true, true); const p = wheels.map((w) => w.getWorldPosition(new THREE.Vector3())); sc = 2.7 / (Math.abs((p[0].z + p[1].z) / 2 - (p[2].z + p[3].z) / 2) || 1); }
      const g = new THREE.Group(); car.scale.setScalar(sc); car.updateWorldMatrix(true, true); const bb = new THREE.Box3().setFromObject(car); car.position.y = -bb.min.y; g.add(car);
      const top = bb.max.y - bb.min.y, hw = (bb.max.x - bb.min.x) / 2, len = (bb.max.z - bb.min.z) / 2;
      const lamp = (x: number, y: number, z: number, w: number, col: number) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, 0.1), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); m.position.set(x, y, z); g.add(m); return m; };
      const bar = [lamp(-0.28, top + 0.08, -0.1, 0.4, 0x330000), lamp(0.28, top + 0.08, -0.1, 0.4, 0x000033)];
      const lamps = [lamp(-hw * 0.6, 0.62, len, 0.3, 0xfff2cc), lamp(hw * 0.6, 0.62, len, 0.3, 0xfff2cc), lamp(-hw * 0.6, 0.66, -len, 0.26, 0xaa0000), lamp(hw * 0.6, 0.66, -len, 0.26, 0xaa0000)];
      g.visible = false; this.scene.add(g);
      this.cops.push({ obj: g, ready: false, state: 'PATROL', route: null, s: 0, speed: 0, susp: 0, known: null, timer: 0, reroute: 0, unseen: 0, bust: 0, pos: new THREE.Vector3(), hd: [0, 1], yaw: 0, bar, lamps, spin: 0, seen: false });
    }
  }

  setEnabled(on: boolean): void { this.enabled = on; for (const c of this.cops) { c.obj.visible = on && c.ready; if (!on) { c.ready = false; c.obj.visible = false; } } if (!on) { this.status.state = 'OFF'; this.light.intensity = 0; } }
  /** Pull everything back to patrol (after being busted / respawned). */
  reset(): void { for (const c of this.cops) { c.ready = false; c.obj.visible = false; c.state = 'PATROL'; c.susp = 0; c.known = null; c.route = null; } this.chaseEver = false; }

  colliders(): DynamicCollider[] {
    const out: DynamicCollider[] = [];
    this.cops.forEach((c, i) => { if (!c.ready) return; for (const off of [-1.3, 0, 1.3]) out.push({ x: c.pos.x + c.hd[0] * off, z: c.pos.z + c.hd[1] * off, r: 1.0, vx: c.hd[0] * c.speed, vz: c.hd[1] * c.speed, mass: 1800, id: 1000 + i }); });
    return out;
  }
  hit(id: number, impact: number): void { const c = this.cops[id - 1000]; if (c) { c.speed = Math.max(0, c.speed - impact * 0.5); c.susp = 1.3; } }

  // ------------------------------------------------------------------ helpers
  private clearLos(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az); let blocked = 0; const n = Math.min(14, Math.floor(d / 10));
    for (let i = 1; i < n; i++) { const t = i / n; if (this.world.buildingsNear(ax + (bx - ax) * t, az + (bz - az) * t) > 0 && this.world.nearBuildingPublic(ax + (bx - ax) * t, az + (bz - az) * t)) blocked++; if (blocked >= 2) return false; }
    return true;
  }
  private go(c: Cop, tx: number, tz: number): void {
    const g = this.graph(); if (!g) return; const r = g.route(c.pos.x, c.pos.z, tx, tz); if (r && r.pts.length >= 4) { c.route = r; c.s = 0; }
  }
  private place(c: Cop, px: number, pz: number): boolean {
    const g = this.graph(); if (!g) return false;
    for (let t = 0; t < 8; t++) {
      const n = g.randomNode(px, pz, 260, 650); if (n < 0) continue; const [x, z] = g.pos(n);
      if (this.cops.some((o) => o !== c && o.ready && Math.hypot(o.pos.x - x, o.pos.z - z) < 60)) continue;
      c.pos.set(x, this.world.groundHeightAt(x, z) + 0.1, z); c.ready = true; c.state = 'PATROL'; c.susp = 0; c.known = null; c.speed = 0; c.route = null; this.patrolRoute(c); c.obj.visible = this.enabled; return true;
    }
    return false;
  }
  private patrolRoute(c: Cop): void { const g = this.graph(); if (!g) return; const n = g.randomNode(c.pos.x, c.pos.z, 350, 900); if (n >= 0) { const [x, z] = g.pos(n); this.go(c, x, z); } }

  // ------------------------------------------------------------------ per frame
  update(dt: number, pl: PlayerPose, st: Stealth, night: number): void {
    if (!this.enabled || !this.world.ready || !this.graph()) return;
    this.flash += dt; this.acc += dt;
    let nearest = 1e9, chasers = 0, nearestChaser = 1e9, topSusp = 0, topState: CopState = 'PATROL';
    const rank: Record<CopState, number> = { PATROL: 0, SEARCH: 1, ALERT: 2, CHASE: 3 };
    for (const c of this.cops) {
      if (!c.ready) { if (this.acc > 0.5) this.place(c, pl.x, pl.z); continue; }
      const dx = pl.x - c.pos.x, dz = pl.z - c.pos.z, d = Math.hypot(dx, dz) || 1; nearest = Math.min(nearest, d);
      // ---- perception
      const cosA = (dx * c.hd[0] + dz * c.hd[1]) / d, inView = d < 24 || cosA > 0.3;
      const sight = d < st.visRadius && inView && this.clearLos(c.pos.x, c.pos.z, pl.x, pl.z) ? 1 - d / st.visRadius : 0;
      const hear = d < st.noiseRadius ? 1 - d / st.noiseRadius : 0;
      const stim = sight * 1.7 + hear * 0.85;
      c.seen = sight > 0.02;
      if (stim > 0.02) c.susp = Math.min(1.3, c.susp + stim * dt); else c.susp = Math.max(0, c.susp - 0.18 * dt);
      if (sight > 0.02 || hear > 0.25) { c.known = [pl.x, pl.z]; c.unseen = 0; } else c.unseen += dt;
      // ---- state machine
      const prev = c.state;
      if (c.state === 'PATROL' && c.susp > 0.32) { c.state = 'ALERT'; c.reroute = 0; }
      else if (c.state === 'ALERT') {
        if (c.susp >= 1 && (sight > 0.03 || d < 45)) c.state = 'CHASE';
        else if (c.known && Math.hypot(c.known[0] - c.pos.x, c.known[1] - c.pos.z) < 28) { c.state = 'SEARCH'; c.timer = 9; }
        else if (c.susp < 0.05 && c.unseen > 7) { c.state = 'SEARCH'; c.timer = 5; }
      } else if (c.state === 'CHASE') { if (c.unseen > 6 && hear < 0.1) { c.state = 'SEARCH'; c.timer = 12; c.reroute = 0; } }
      else if (c.state === 'SEARCH') { c.timer -= dt; if (c.susp > 0.45) c.state = 'ALERT'; else if (c.timer <= 0) { c.state = 'PATROL'; c.route = null; } }
      if (c.state === 'CHASE' && prev !== 'CHASE') { this.chaseEver = true; for (const o of this.cops) if (o !== c && o.ready && o.state === 'PATROL' && Math.hypot(o.pos.x - c.pos.x, o.pos.z - c.pos.z) < 600) { o.susp = Math.max(o.susp, 0.7); o.known = [pl.x, pl.z]; } } // radio
      // ---- driving goals
      c.reroute -= dt; let want = 11;
      if (c.state === 'PATROL') { if (!c.route || c.s > c.route.length - 10) this.patrolRoute(c); want = 11; }
      else if (c.state === 'ALERT') { want = 18; if (c.known && c.reroute <= 0) { this.go(c, c.known[0], c.known[1]); c.reroute = 2.2; } }
      else if (c.state === 'CHASE') { want = d < 70 ? 33 : 29; if (c.reroute <= 0) { this.go(c, pl.x, pl.z); c.reroute = 1.1; } chasers++; nearestChaser = Math.min(nearestChaser, d); }
      else if (c.state === 'SEARCH') { want = 9; if (c.reroute <= 0 && c.known) { this.go(c, c.known[0] + (Math.random() - 0.5) * 80, c.known[1] + (Math.random() - 0.5) * 80); c.reroute = 4; } }
      if (c.susp > topSusp) topSusp = c.susp; if (rank[c.state] > rank[topState]) topState = c.state;
      // ---- bust check
      if (c.state === 'CHASE' && d < 8 && pl.speedKmh < 20) { c.bust += dt; if (c.bust > 2.2) { c.bust = 0; this.onBusted?.(); } } else c.bust = Math.max(0, c.bust - dt);
      this.drive(c, dt, want, d < 26 && c.state === 'CHASE' ? pl : null);
      this.animate(c, dt, night);
      if (d > 1400) { c.ready = false; c.obj.visible = false; }
    }
    if (this.acc > 0.5) this.acc = 0;
    // escaped: nobody chasing for a while after a chase
    if (this.chaseEver) { if (chasers === 0 && topState !== 'ALERT') { this.calmT += dt; if (this.calmT > 18) { this.chaseEver = false; this.calmT = 0; this.onEscaped?.(); } } else this.calmT = 0; }
    this.status.state = topState; this.status.suspicion = Math.min(1, topSusp); this.status.nearest = nearest; this.status.chasers = chasers; this.status.nearestChaser = nearestChaser;
    // one real light for the nearest chaser: red/blue strobe on the street
    const flip = Math.floor(this.flash * 5) % 2 === 0; const ch = this.cops.filter((c) => c.ready && (c.state === 'CHASE' || c.state === 'ALERT')).sort((a, b) => Math.hypot(a.pos.x - pl.x, a.pos.z - pl.z) - Math.hypot(b.pos.x - pl.x, b.pos.z - pl.z))[0];
    if (ch) { this.light.position.set(ch.pos.x, ch.pos.y + 3.2, ch.pos.z); this.light.color.copy(flip ? this.red : this.blue); this.light.intensity = 26 * (0.4 + night * 0.6); } else this.light.intensity = 0;
  }

  private drive(c: Cop, dt: number, want: number, direct: PlayerPose | null): void {
    let tx = c.pos.x, tz = c.pos.z, dirx = c.hd[0], dirz = c.hd[1];
    if (direct) { const dx = direct.x - c.pos.x, dz = direct.z - c.pos.z, l = Math.hypot(dx, dz) || 1; dirx = dx / l; dirz = dz / l; tx = c.pos.x + dirx * 6; tz = c.pos.z + dirz * 6; }
    else if (c.route) {
      const r = c.route, n = r.cum.length; let i = 1; while (i < n - 1 && r.cum[i] < c.s) i++;
      // slow for corners ahead
      let j = i; while (j < n - 1 && r.cum[j] - c.s < 22) j++; const a0 = Math.atan2(r.pts[i * 2] - r.pts[(i - 1) * 2], r.pts[i * 2 + 1] - r.pts[(i - 1) * 2 + 1]), a1 = Math.atan2(r.pts[j * 2] - r.pts[(j - 1) * 2], r.pts[j * 2 + 1] - r.pts[(j - 1) * 2 + 1]);
      let da = Math.abs(a1 - a0); if (da > Math.PI) da = 2 * Math.PI - da; want = Math.min(want, 30 / (1 + da * 2.6));
      c.s = Math.min(r.length, c.s + c.speed * dt);
      const ax = r.pts[(i - 1) * 2], az = r.pts[(i - 1) * 2 + 1], bx = r.pts[i * 2], bz = r.pts[i * 2 + 1], seg = r.cum[i] - r.cum[i - 1] || 1, t = THREE.MathUtils.clamp((c.s - r.cum[i - 1]) / seg, 0, 1);
      const sx = (bx - ax) / seg, sz = (bz - az) / seg; tx = ax + (bx - ax) * t - sz * 1.7; tz = az + (bz - az) * t + sx * 1.7; dirx = sx; dirz = sz;     // keep left
    } else want = 0;
    c.speed += THREE.MathUtils.clamp(want - c.speed, -14 * dt, 8 * dt);
    // steer toward the target point
    const k = Math.min(1, dt * (direct ? 6 : 9)); c.pos.x += (tx - c.pos.x) * k; c.pos.z += (tz - c.pos.z) * k;
    const hl = Math.hypot(dirx, dirz) || 1; c.hd[0] += (dirx / hl - c.hd[0]) * Math.min(1, dt * 6); c.hd[1] += (dirz / hl - c.hd[1]) * Math.min(1, dt * 6);
    const m = Math.hypot(c.hd[0], c.hd[1]) || 1; c.hd[0] /= m; c.hd[1] /= m; c.yaw = Math.atan2(c.hd[0], c.hd[1]);
    const y = this.world.groundHeightAt(c.pos.x, c.pos.z, c.pos.y + 1); c.pos.y += (y + 0.1 - c.pos.y) * Math.min(1, dt * 10);
  }

  private animate(c: Cop, dt: number, night: number): void {
    c.obj.position.copy(c.pos); c.obj.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.yaw); c.spin += (c.speed / 0.33) * dt; c.obj.traverse((o) => { if (o.name.startsWith('wheel-')) o.rotation.x = c.spin; });
    const siren = c.state === 'CHASE' || c.state === 'ALERT', flip = Math.floor(this.flash * 6) % 2 === 0;
    (c.bar[0].material as THREE.MeshBasicMaterial).color.setHex(siren ? (flip ? 0xff1010 : 0x220000) : 0x220000); (c.bar[1].material as THREE.MeshBasicMaterial).color.setHex(siren ? (flip ? 0x000022 : 0x2a50ff) : 0x000022);
    const hl = night > 0.15 ? 0xfff2cc : 0x8a8a80; (c.lamps[0].material as THREE.MeshBasicMaterial).color.setHex(hl); (c.lamps[1].material as THREE.MeshBasicMaterial).color.setHex(hl);
  }
}
