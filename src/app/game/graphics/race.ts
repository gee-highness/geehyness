import * as THREE from 'three';
import type { WorldBuilder } from './world-builder';
import type { RoadGraph, Route, RouteStep } from '../road-graph';
import type { DynamicCollider } from '../physics/collision';
import { makeCar, CarKind } from './car-gen';

/** A street race: a chain of district snap points (meta.snaps keys) joined by the fastest roads. */
export interface RaceDef { id: string; name: string; blurb: string; via: string[] }
export const RACES: RaceDef[] = [
  { id: 'moneni', name: 'Moneni Dash', blurb: 'Manzini CBD east to Moneni', via: ['manzini', 'moneni'] },
  { id: 'mr3', name: 'MR3 Sprint', blurb: 'Flat out, Manzini to Matsapha', via: ['manzini', 'matsapha'] },
  { id: 'fairview', name: 'Fairview Climb', blurb: 'Up the hill out of town', via: ['manzini', 'fairview'] },
  { id: 'ngwane', name: 'Ngwane Park Descent', blurb: 'Fairview down to Ngwane Park', via: ['fairview', 'ngwane_park'] },
  { id: 'airport', name: 'Airport Run', blurb: 'Matsapha to the airport', via: ['matsapha', 'airport'] },
  { id: 'kwaluseni', name: 'Kwaluseni Ridge', blurb: 'Matsapha to the campus', via: ['matsapha', 'kwaluseni'] },
  { id: 'tour', name: 'Manzini Grand Tour', blurb: 'Moneni, Fairview, Ngwane Park and home', via: ['manzini', 'moneni', 'fairview', 'ngwane_park', 'manzini'] },
];

export type RacePhase = 'IDLE' | 'COUNTDOWN' | 'RACING' | 'FINISHED';
export interface RaceResult { pos: number; total: number; time: number; id: string; name: string }
export interface RaceStart { x: number; z: number; yaw: number; route: Route; finish: [number, number] }
export interface RacePose { x: number; z: number; vx: number; vz: number }

interface Racer {
  name: string; obj: THREE.Group; s: number; lat: number; speed: number; top: number; acc: number; skill: number; mood: number; moodT: number;
  react: number; fin: number; wait: number; hd: [number, number]; x: number; z: number; y: number; spin: number;
}
const STEP = 5, CP = 300, VMAX = 62, ALAT = 8.2, BRAKE = 7.5;
const FIELD: { name: string; kind: CarKind; col: number[]; stripe: number[]; top: number; acc: number; skill: number }[] = [
  { name: 'Thandi', kind: 'sedan', col: [0.05, 0.22, 0.75], stripe: [1, 1, 1], top: 57, acc: 6.6, skill: 1.0 },
  { name: 'Nomsa', kind: 'sedan', col: [0.05, 0.5, 0.2], stripe: [1, 0.85, 0.1], top: 55, acc: 6.4, skill: 0.97 },
  { name: 'Sipho', kind: 'hatch', col: [0.8, 0.05, 0.05], stripe: [1, 1, 1], top: 53, acc: 6.2, skill: 0.94 },
  { name: 'Mandla', kind: 'hatch', col: [0.95, 0.72, 0.05], stripe: [0.05, 0.05, 0.05], top: 51, acc: 5.9, skill: 0.9 },
];

/**
 * Street races against AI drivers. The race line is the routed road centre-line resampled every 5 m and smoothed; a curvature speed
 * profile with a braking pass gives each driver a believable pace. Drivers take the inside of bends, pull out to pass slower cars
 * (traffic, rivals, the player), tuck in behind when there is no gap, and make small pace mistakes. Mild catch-up keeps the field together.
 */
export class Race {
  /** Plain object for the HUD (read it, do not bind to it). */
  readonly status = { phase: 'IDLE' as RacePhase, idx: -1, name: '', count: 0, pos: 1, total: 1, time: 0, cp: 0, cps: 0, remaining: 0, offRoute: false, order: [] as string[], result: null as RaceResult | null };
  onEvent?: (e: 'count' | 'go' | 'checkpoint' | 'finish' | 'end') => void;
  private racers: Racer[] = []; private n = 0; private len = 0; private startS = 0; private finishS = 0; private spacing = CP;
  private xs = new Float32Array(0); private zs = new Float32Array(0); private tx = new Float32Array(0); private tz = new Float32Array(0);
  private k = new Float32Array(0); private vb = new Float32Array(0); private wid = new Float32Array(0); private ow = new Uint8Array(0);
  private pS = 0; private pI = 0; private pFin = 0; private timer = 0; private endT = 0; private ordT = 0;
  private gates: THREE.Group[] = []; private q = { x: 0, z: 0, tx: 0, tz: 1, i: 0 };
  private readonly up = new THREE.Vector3(0, 1, 0); private readonly ax = new THREE.Vector3(1, 0, 0); private readonly az = new THREE.Vector3(0, 0, 1);
  private readonly q1 = new THREE.Quaternion(); private readonly q2 = new THREE.Quaternion();

  constructor(private scene: THREE.Scene, private world: WorldBuilder, private graph: () => RoadGraph | undefined) {
    for (const f of FIELD) {
      const obj = makeCar(f.kind, f.col, f.stripe); obj.visible = false; scene.add(obj);
      this.racers.push({ name: f.name, obj, s: 0, lat: 0, speed: 0, top: f.top, acc: f.acc, skill: f.skill, mood: 1, moodT: 0, react: 0, fin: 0, wait: 0, hd: [0, 1], x: 0, z: 0, y: 0, spin: 0 });
    }
    this.gates = [this.makeGate(0xffb300, 0.9), this.makeGate(0xffb300, 0.35)];
  }

  get active(): boolean { return this.status.phase !== 'IDLE'; }
  /** The player must sit still on the grid. */
  get holding(): boolean { return this.status.phase === 'COUNTDOWN'; }

  private makeGate(col: number, op: number): THREE.Group {
    const g = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, toneMapped: false });
    const bm = m.clone(); bm.opacity = op * 0.25;
    const post = new THREE.BoxGeometry(0.35, 6, 0.35), beamG = new THREE.CylinderGeometry(0.7, 0.7, 70, 8, 1, true);
    const l = new THREE.Mesh(post, m), r = new THREE.Mesh(post, m), bar = new THREE.Mesh(new THREE.BoxGeometry(1, 0.7, 0.2), m), bl = new THREE.Mesh(beamG, bm), br = new THREE.Mesh(beamG, bm);
    g.add(l, r, bar, bl, br); g.userData = { l, r, bar, bl, br, m, bm }; g.visible = false; this.scene.add(g); return g;
  }
  private placeGate(g: THREE.Group, s: number, finish: boolean): void {
    this.at(s); const q = this.q, half = this.wid[q.i] / 2 + 1.6, u = g.userData as { l: THREE.Mesh; r: THREE.Mesh; bar: THREE.Mesh; bl: THREE.Mesh; br: THREE.Mesh; m: THREE.MeshBasicMaterial; bm: THREE.MeshBasicMaterial };
    g.position.set(q.x, this.world.groundHeightAt(q.x, q.z), q.z); g.rotation.y = Math.atan2(q.tx, q.tz);
    u.l.position.set(-half, 3, 0); u.r.position.set(half, 3, 0); u.bar.position.set(0, 6, 0); u.bar.scale.x = half * 2 + 0.35; u.bl.position.set(-half, 41, 0); u.br.position.set(half, 41, 0);
    const c = finish ? 0xffffff : 0xffb300; u.m.color.setHex(c); u.bm.color.setHex(c); g.visible = true;
  }
  private cpS(i: number): number { return i >= this.status.cps - 1 ? this.finishS : this.startS + (i + 1) * this.spacing; }
  private setGates(): void {
    const st = this.status, i = st.cp;
    if (i < st.cps) this.placeGate(this.gates[0], this.cpS(i), i === st.cps - 1); else this.gates[0].visible = false;
    if (i + 1 < st.cps) this.placeGate(this.gates[1], this.cpS(i + 1), i + 1 === st.cps - 1); else this.gates[1].visible = false;
  }

  /** Centre-line point and unit tangent at distance s. */
  private at(s: number): void {
    const f = Math.max(0, Math.min(this.n - 1.001, s / STEP)), i = Math.floor(f), t = f - i, q = this.q;
    q.i = i; q.x = this.xs[i] + (this.xs[i + 1] - this.xs[i]) * t; q.z = this.zs[i] + (this.zs[i + 1] - this.zs[i]) * t;
    const ax = this.tx[i] + (this.tx[i + 1] - this.tx[i]) * t, az = this.tz[i] + (this.tz[i + 1] - this.tz[i]) * t, l = Math.hypot(ax, az) || 1; q.tx = ax / l; q.tz = az / l;
  }

  private fixed = new Map<string, [number, number] | null>();
  /** A district point that is on the main road network (some snaps sit on a disconnected scrap of road): nudge it until it routes both ways to the hub. */
  private snap(key: string, g: RoadGraph): [number, number] | null {
    if (this.fixed.has(key)) return this.fixed.get(key)!;
    const sn = this.world.meta.snaps, p = sn[key], hub = sn['manzini']; let out: [number, number] | null = null;
    if (p && hub) {
      const ok = (x: number, z: number) => key === 'manzini' || (!!g.route(hub[0], hub[1], x, z) && !!g.route(x, z, hub[0], hub[1]));
      search: for (let r = 0; r <= 900; r += 150) for (let k = 0; k < (r ? 8 : 1); k++) { const an = k * Math.PI / 4, x = p[0] + Math.cos(an) * r, z = p[1] + Math.sin(an) * r; if (ok(x, z)) { out = [x, z]; break search; } }
    }
    this.fixed.set(key, out); return out;
  }

  private build(def: RaceDef): Route | null {
    const g = this.graph(); if (!g || !this.world.meta.snaps) return null;
    const pts: number[] = [], steps: RouteStep[] = []; let length = 0, eta = 0;
    for (let i = 0; i + 1 < def.via.length; i++) {
      const a = this.snap(def.via[i], g), b = this.snap(def.via[i + 1], g); if (!a || !b) return null;
      const r = g.route(a[0], a[1], b[0], b[1]); if (!r || r.pts.length < 4) return null;
      const last = i + 2 === def.via.length;
      for (let j = pts.length ? 2 : 0; j < r.pts.length; j++) pts.push(r.pts[j]);
      for (const s of r.steps) if (last || s.turn !== 'arrive') steps.push({ ...s, at: s.at + length });
      length += r.length; eta += r.etaS;
    }
    const cum = [0]; for (let i = 2; i < pts.length; i += 2) cum.push(cum[cum.length - 1] + Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]));
    length = cum[cum.length - 1]; if (length < 500) return null;
    // resample every STEP metres
    const n = Math.floor(length / STEP) + 1, xs = new Float32Array(n), zs = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++) {
      const s = i * STEP; while (j + 2 < cum.length && cum[j + 1] < s) j++;
      const L = cum[j + 1] - cum[j] || 1, t = Math.min(1, (s - cum[j]) / L); xs[i] = pts[j * 2] + (pts[j * 2 + 2] - pts[j * 2]) * t; zs[i] = pts[j * 2 + 1] + (pts[j * 2 + 3] - pts[j * 2 + 1]) * t;
    }
    // round the polyline corners (the smoothed line stays well inside the carriageway)
    for (let pass = 0; pass < 3; pass++) { let px = xs[0], pz = zs[0]; for (let i = 1; i < n - 1; i++) { const cx = xs[i], cz = zs[i]; xs[i] = 0.25 * px + 0.5 * cx + 0.25 * xs[i + 1]; zs[i] = 0.25 * pz + 0.5 * cz + 0.25 * zs[i + 1]; px = cx; pz = cz; } }
    const tx = new Float32Array(n), tz = new Float32Array(n), k = new Float32Array(n), vb = new Float32Array(n), wid = new Float32Array(n), ow = new Uint8Array(n);
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1), dx = xs[b] - xs[a], dz = zs[b] - zs[a], l = Math.hypot(dx, dz) || 1; tx[i] = dx / l; tz[i] = dz / l; }
    for (let i = 2; i < n - 2; i++) { const ax = xs[i] - xs[i - 2], az = zs[i] - zs[i - 2], bx = xs[i + 2] - xs[i], bz = zs[i + 2] - zs[i]; k[i] = Math.atan2(ax * bz - az * bx, ax * bx + az * bz) / (2 * STEP); }
    let w = 7, o = 0;
    for (let i = 0; i < n; i++) {
      if (i % 4 === 0) { const way = this.world.roadAt(xs[i], zs[i]); if (way) { w = way.w; o = way.o ? 1 : 0; } }
      wid[i] = w; ow[i] = o; vb[i] = Math.min(VMAX, Math.sqrt(ALAT / Math.max(Math.abs(k[i]), 1e-4)));
    }
    for (let i = n - 2; i >= 0; i--) vb[i] = Math.max(6, Math.min(vb[i], Math.sqrt(vb[i + 1] * vb[i + 1] + 2 * BRAKE * STEP)));
    this.n = n; this.xs = xs; this.zs = zs; this.tx = tx; this.tz = tz; this.k = k; this.vb = vb; this.wid = wid; this.ow = ow; this.len = (n - 1) * STEP;
    return { pts, cum, length, steps, etaS: eta };
  }

  /** Line everyone up on the grid and begin the countdown. Returns where to put the player, or null if the event cannot be routed. */
  start(idx: number): RaceStart | null {
    const def = RACES[idx]; if (!def) return null; this.stop(true);
    const route = this.build(def); if (!route) return null;
    const st = this.status; this.startS = 46; this.finishS = this.len - 30;
    st.cps = Math.max(1, Math.round((this.finishS - this.startS) / CP)); this.spacing = (this.finishS - this.startS) / st.cps;
    st.phase = 'COUNTDOWN'; st.idx = idx; st.name = def.name; st.count = 3; st.cp = 0; st.time = 0; st.pos = this.racers.length + 1; st.total = this.racers.length + 1; st.result = null; st.offRoute = false;
    st.remaining = this.finishS - this.startS; this.timer = -3.6; this.endT = 0; this.pFin = 0;
    const slot = (j: number): [number, number] => { const s = this.startS - 6 - j * 7.5; this.at(s); return [s, (j % 2 ? -1 : 1) * Math.min(1.6, Math.max(0, this.wid[this.q.i] / 2 - 1.3))]; };
    this.racers.forEach((r, j) => {
      const [s, lat] = slot(j); r.s = s; r.lat = lat; r.speed = 0; r.fin = 0; r.wait = 0; r.mood = 1; r.moodT = 2 + Math.random() * 4; r.react = 0.12 + Math.random() * 0.35; r.obj.visible = true; r.y = NaN; this.pose(r, 0);
    });
    const [ps, pl] = slot(this.racers.length); this.at(ps); const q = this.q; this.pS = ps; this.pI = q.i;
    const out: RaceStart = { x: q.x + q.tz * pl, z: q.z - q.tx * pl, yaw: Math.atan2(q.tx, q.tz), route, finish: [this.xs[this.n - 1], this.zs[this.n - 1]] };
    this.setGates(); return out;
  }

  /** End the event and clear the road. */
  stop(silent = false): void {
    const was = this.active; for (const r of this.racers) r.obj.visible = false; for (const g of this.gates) g.visible = false;
    this.status.phase = 'IDLE'; this.status.count = 0; if (was && !silent) this.onEvent?.('end');
  }

  colliders(): DynamicCollider[] {
    const out: DynamicCollider[] = []; if (!this.active) return out;
    this.racers.forEach((r, i) => { for (const off of [-1.3, 0, 1.3]) out.push({ x: r.x + r.hd[0] * off, z: r.z + r.hd[1] * off, r: 1.0, vx: r.hd[0] * r.speed, vz: r.hd[1] * r.speed, mass: 1300, id: 2000 + i }); });
    return out;
  }
  hit(id: number, impact: number): void { const r = this.racers[id - 2000]; if (r) r.speed = Math.max(0, r.speed - impact * 0.45); }

  /** Put a racer on the road at its (s, lat): position, pitch with the gradient, a touch of body roll in bends. */
  private pose(r: Racer, dt: number): void {
    this.at(r.s); const q = this.q, x = q.x + q.tz * r.lat, z = q.z - q.tx * r.lat, w = this.world;
    const first = Number.isNaN(r.y), yq = first ? undefined : r.y + 1.2; let h = w.groundHeightAt(x, z, yq);
    const hc = w.groundHeightAt(q.x, q.z, yq); if (hc - h > 0.5) h = hc;                         // off the edge of a deck or embankment: hold the road level
    if (!first) { const lim = 0.03 + r.speed * dt * 0.3; h = r.y + Math.max(-lim, Math.min(lim, h - r.y)); }   // never pop: at most a 30 % grade
    const hf = w.groundHeightAt(x + q.tx * 1.5, z + q.tz * 1.5, h + 1.2), hb = w.groundHeightAt(x - q.tx * 1.5, z - q.tz * 1.5, h + 1.2);
    r.x = x; r.z = z; r.y = h; r.hd[0] = q.tx; r.hd[1] = q.tz; r.obj.position.set(x, h, z);
    const roll = Math.max(-0.06, Math.min(0.06, r.speed * r.speed * this.k[q.i] * 0.004));
    r.obj.quaternion.setFromAxisAngle(this.up, Math.atan2(q.tx, q.tz)).multiply(this.q1.setFromAxisAngle(this.ax, -Math.atan2(hf - hb, 3))).multiply(this.q2.setFromAxisAngle(this.az, roll));
    r.spin += (r.speed / 0.32) * dt; for (const wh of (r.obj.userData['wheels'] as THREE.Object3D[]) ?? []) wh.rotation.x = r.spin;
  }

  private drive(r: Racer, dt: number, obs: RacePose[]): void {
    const st = this.status; this.at(r.s); const q = this.q, i = q.i, tx = q.tx, tz = q.tz, nx = tz, nz = -tx;   // n = left of travel
    r.moodT -= dt; if (r.moodT <= 0) { r.moodT = 3 + Math.random() * 6; r.mood = 0.955 + Math.random() * 0.045 * (0.5 + r.skill * 0.5); }
    // pace: corner speed profile x skill, with mild catch-up relative to the player
    const band = 1 + Math.max(-0.05, Math.min(0.07, (this.pS - r.s) / 500));
    let want = r.fin ? 0 : Math.min(r.top, this.vb[i] * r.skill * r.mood) * band;
    if (this.timer < r.react) want = 0;
    // racing line: drift to the inside of the bend ahead; stay off the oncoming lane on two-way roads
    const maxLat = Math.max(0.3, this.wid[i] / 2 - 1.15) + (r.wait > 2 ? 2.4 : 0), ka = this.k[Math.min(this.n - 1, i + 5)];
    let latT = Math.max(this.ow[i] ? -maxLat : -maxLat * 0.3, Math.min(maxLat, -Math.sign(ka) * Math.min(maxLat, Math.abs(ka) * 250)));
    // traffic, rivals and the player ahead: pass on the freer side or follow
    let near = 1e9;
    for (const o of obs) {
      const dx = o.x - r.x, dz = o.z - r.z, ah = dx * tx + dz * tz; if (ah < 1.5 || ah > 130) continue;
      const ov = o.vx * tx + o.vz * tz, closing = r.speed - ov; if (ah > 9 + Math.max(0, closing) * 1.7) continue;
      const sd = dx * nx + dz * nz; if (Math.abs(sd) > 2.3 || ah > near) continue;
      near = ah; const lo = r.lat + sd, left = lo + 2.5, right = lo - 2.5, okL = left <= maxLat, okR = right >= -maxLat;
      if (okL || okR) latT = okL && okR ? (Math.abs(left - r.lat) < Math.abs(right - r.lat) ? left : right) : okL ? left : right;
      if ((!okL && !okR) || Math.abs(sd) < 1.7) want = Math.min(want, Math.max(0, ov + (ah - 6.5) * 0.8));
    }
    if (near < 1e8 && r.speed < 2.5 && !r.fin && this.timer > 3) r.wait += dt; else if (near > 1e8) r.wait = Math.max(0, r.wait - dt * 2);
    r.lat += Math.max(-1, Math.min(1, (latT - r.lat) / 0.4)) * Math.min(3.6, 0.7 + r.speed * 0.12) * dt * (Math.abs(latT - r.lat) > 0.05 ? 1 : 0);
    r.lat = Math.max(-maxLat, Math.min(maxLat, r.lat));
    const tr = r.speed / r.top;
    if (r.speed < want) r.speed = Math.min(want, r.speed + r.acc * (1 - tr * tr * 0.9) * dt); else r.speed = Math.max(want, r.speed - (r.fin ? 6 : 9.5) * dt);
    r.s = Math.min(this.len - 1, r.s + r.speed * dt);
    if (!r.fin && r.s >= this.finishS) r.fin = st.time || 0.01;
    this.pose(r, dt);
  }

  /** Where the player is along the line; gates must be taken in order (drive through each one). */
  private track(p: RacePose): void {
    const st = this.status, a = Math.max(0, this.pI - 3), b = Math.min(this.n - 1, this.pI + 40); let bi = this.pI, bd = 1e18;
    for (let i = a; i <= b; i++) { const d = (this.xs[i] - p.x) ** 2 + (this.zs[i] - p.z) ** 2; if (d < bd) { bd = d; bi = i; } }
    const s = bi * STEP + (p.x - this.xs[bi]) * this.tx[bi] + (p.z - this.zs[bi]) * this.tz[bi], dist = Math.sqrt(bd), gate = this.cpS(st.cp);
    this.pI = Math.min(bi, Math.floor(gate / STEP) + 4); st.offRoute = dist > 45;
    if (dist < 60) this.pS = Math.min(s, gate);
    if (s >= gate - 1.5 && dist < Math.max(12, this.wid[bi] / 2 + 6)) {
      st.cp++;
      if (st.cp >= st.cps) { this.pFin = st.time; this.pS = this.finishS; } else this.onEvent?.('checkpoint');
      this.setGates();
    }
    st.remaining = Math.max(0, this.finishS - this.pS);
  }

  update(dt: number, p: RacePose, traffic: DynamicCollider[]): void {
    const st = this.status; if (st.phase === 'IDLE') return;
    this.timer += dt;
    if (st.phase === 'COUNTDOWN') {
      const c = Math.ceil(-this.timer - 0.6); if (c !== st.count && c >= 1) { st.count = c; this.onEvent?.('count'); }
      if (this.timer >= 0) { st.phase = 'RACING'; st.count = 0; this.onEvent?.('go'); }
      for (const r of this.racers) this.pose(r, 0);
      return;
    }
    if (st.phase === 'RACING') st.time = this.timer;
    const obs: RacePose[] = [p]; for (const c of traffic) obs.push(c); for (const r of this.racers) obs.push({ x: r.x, z: r.z, vx: r.hd[0] * r.speed, vz: r.hd[1] * r.speed });
    this.racers.forEach((r, j) => { const self = obs[1 + traffic.length + j]; self.x = 1e9; this.drive(r, dt, obs); self.x = r.x; self.z = r.z; });
    if (st.phase === 'RACING') {
      this.track(p);
      const mine = this.pFin ? 1e7 - this.pFin : this.pS; let pos = 1; for (const r of this.racers) if ((r.fin ? 1e7 - r.fin : r.s) > mine) pos++;
      st.pos = pos;
      this.ordT -= dt; if (this.ordT <= 0) { this.ordT = 0.5; st.order = [...this.racers.map((r) => ({ n: r.name, m: r.fin ? 1e7 - r.fin : r.s })), { n: 'YOU', m: mine }].sort((x, y) => y.m - x.m).map((e) => e.n); }
      if (this.pFin) { st.phase = 'FINISHED'; st.result = { pos, total: st.total, time: this.pFin, id: RACES[st.idx].id, name: st.name }; this.endT = 9; this.onEvent?.('finish'); }
    } else if (st.phase === 'FINISHED') { this.endT -= dt; if (this.endT <= 0) this.stop(); }
  }
}
