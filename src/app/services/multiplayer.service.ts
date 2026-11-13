import { Injectable, signal } from '@angular/core';
import type { RaycastVehicle } from '../game/physics/raycast-vehicle';
import { PeerNetwork } from '../net/peer-transport';
import { RoomHub } from '../net/room-hub';
import type { Endpoint, Link } from '../net/transport';

export interface Peer { id: number; name: string; car: string; color: string; }
/** Latest pose of a remote player (+ when it arrived), consumed by RemotePlayers. */
export interface PeerState extends Peer {
  p: [number, number, number]; q: [number, number, number, number]; v: [number, number, number];
  g: number; s: number; w: number; f: number; at: number; fresh: boolean;
}
export interface ChatLine { id: number; name: string; text: string; at: number; }
/** pose flag bits */
export const FLAG = { BRAKE: 1, HEAD: 2, HIGH: 4, HORN: 8, HAZARD: 16, SIREN: 32 };

/** Room id on the PeerJS broker: whoever claims it first hosts the room (same scheme as Ludo Sync: no game server, WebRTC straight between players). */
const ROOM_PREFIX = 'shesha-';

/** Online free-roam over PeerJS/WebRTC, the same transport Ludo Sync uses. The first player into a room code hosts it (a RoomHub in their browser); everyone else dials the host. Physics stays local; only pose goes over the wire (~15 Hz). */
@Injectable({ providedIn: 'root' })
export class MultiplayerService {
  readonly status = signal<'offline' | 'connecting' | 'online'>('offline');
  readonly error = signal('');
  readonly room = signal('');
  readonly myId = signal(0);
  readonly roster = signal<Peer[]>([]);
  readonly chat = signal<ChatLine[]>([]);
  readonly ping = signal(0);
  readonly menu = signal(false);
  readonly role = signal<'' | 'host' | 'guest'>('');
  readonly name = signal(this.load('name', `Driver${Math.floor(Math.random() * 900 + 100)}`));
  readonly code = signal(this.load('room', 'manzini'));
  /** Live poses by player id (mutated in place, read every frame by the scene). */
  readonly states = new Map<number, PeerState>();
  /** Called when someone joins / leaves (for the HUD toast). */
  onEvent?: (msg: string) => void;
  /** Supplied by the app: current car id and paint colour. */
  getLoadout: () => { car: string; color: string } = () => ({ car: 'ferrari', color: '#ef4444' });

  private ep: Endpoint | null = null; private link: Link | null = null; private hub: RoomHub | null = null; private gen = 0;
  private lastSend = 0; private pingAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  private load(k: string, d: string): string { try { return localStorage.getItem('shesha.mp.' + k) ?? d; } catch { return d; } }
  private save(k: string, v: string): void { try { localStorage.setItem('shesha.mp.' + k, v); } catch { /* private mode */ } }

  /** Join `room`: try to claim it as host; if somebody already holds it, dial them as a guest. */
  async connect(): Promise<void> {
    if (this.status() !== 'offline') return;
    const code = this.code().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24) || 'manzini';
    this.error.set(''); this.status.set('connecting'); this.code.set(code);
    this.save('name', this.name()); this.save('room', code);
    const gen = ++this.gen, net = new PeerNetwork(), hostId = ROOM_PREFIX + code, l = this.getLoadout();
    const join = { t: 'join', name: this.name(), car: l.car, color: l.color };
    try {
      let ep: Endpoint | null = null;
      try { ep = await net.open(hostId); } catch (e) { if ((e as { kind?: string }).kind !== 'unavailable-id') throw e; }
      if (gen !== this.gen) { ep?.close(); return; }
      if (ep) {                                                                  // we are first in: host the room
        this.ep = ep; this.role.set('host');
        this.hub = new RoomHub(code, (m) => this.onMessage(m));
        ep.onIncoming((link) => this.hub?.attach(link));
        ep.onStatus((st) => { if (st === 'lost' && this.status() === 'online') this.onEvent?.('Lost the connection to the match broker; new players cannot join until it returns'); });
        this.hub.local(join);
      } else {                                                                   // somebody hosts it: dial them
        const mine = await net.open(`${hostId}-${Math.random().toString(36).slice(2, 8)}`);
        if (gen !== this.gen) { mine.close(); return; }
        this.ep = mine;
        const link = await mine.dial(hostId, 15000);
        if (gen !== this.gen) { link.close(); mine.close(); return; }
        this.link = link; this.role.set('guest');
        link.onMessage((d) => { if (typeof d === 'string') { try { this.onMessage(JSON.parse(d)); } catch { /* bad frame */ } } });
        link.onClose(() => { if (this.link === link && this.status() !== 'offline') { this.onEvent?.('The host left the room'); this.disconnect(); } });
        link.send(JSON.stringify(join));
      }
      this.pingTimer = setInterval(() => { this.pingAt = performance.now(); this.raw({ t: 'ping' }); }, 5000);
    } catch (e) {
      if (gen !== this.gen) return;
      const kind = (e as { kind?: string }).kind;
      this.error.set(kind === 'peer-unavailable' ? 'The room host disappeared, try again' : kind === 'blocked' ? 'Could not connect directly to the host (network blocks peer-to-peer)' : kind === 'unsupported' ? 'This browser cannot do peer-to-peer' : 'Could not reach the match broker, check your internet');
      this.disconnect();
    }
  }
  disconnect(): void { this.gen++; this.cleanup(); }
  private cleanup(): void {
    clearInterval(this.pingTimer); this.hub?.close(); this.hub = null; try { this.link?.close(); } catch { /* gone */ } this.link = null; try { this.ep?.close(); } catch { /* gone */ } this.ep = null;
    this.status.set('offline'); this.role.set(''); this.roster.set([]); this.states.clear(); this.myId.set(0); this.room.set('');
  }
  private raw(o: Record<string, unknown>): void { if (this.hub) this.hub.local(o); else if (this.link?.open) this.link.send(JSON.stringify(o)); }

  private onMessage(m: any): void {   // eslint-disable-line @typescript-eslint/no-explicit-any
    switch (m.t) {
      case 'welcome': this.myId.set(m.id); this.room.set(m.room); this.status.set('online'); this.roster.set(m.peers); for (const p of m.peers as Peer[]) this.ensure(p); this.menu.set(false); this.onEvent?.(`Joined room "${m.room}"`); break;
      case 'join': this.roster.update((r) => [...r, m.peer]); this.ensure(m.peer); this.onEvent?.(`${m.peer.name} joined`); break;
      case 'leave': { const p = this.roster().find((x) => x.id === m.id); this.roster.update((r) => r.filter((x) => x.id !== m.id)); this.states.delete(m.id); if (p) this.onEvent?.(`${p.name} left`); break; }
      case 'car': { const s = this.states.get(m.id); if (s) { s.car = m.car; s.color = m.color; s.fresh = true; } this.roster.update((r) => r.map((x) => (x.id === m.id ? { ...x, car: m.car, color: m.color } : x))); break; }
      case 'poses': { const now = performance.now(); for (const p of m.poses) { const s = this.states.get(p.id); if (s) { s.p = p.p; s.q = p.q; s.v = p.v; s.g = p.g; s.s = p.s; s.w = p.w; s.f = p.f; s.at = now; } } break; }
      case 'chat': this.chat.update((c) => [...c.slice(-7), { id: m.id, name: m.name, text: m.text, at: performance.now() }]); break;
      case 'pong': this.ping.set(Math.round(performance.now() - this.pingAt)); break;
      case 'error': this.error.set(m.msg); this.disconnect(); break;
    }
  }
  private ensure(p: Peer): void { if (!this.states.has(p.id)) this.states.set(p.id, { ...p, p: [0, -9999, 0], q: [0, 0, 0, 1], v: [0, 0, 0], g: 0, s: 0, w: 0, f: 0, at: 0, fresh: true }); }

  /** Per frame: push our pose at ~15 Hz. `ground` = surface height under the car, `flags` = FLAG bits. */
  sendPose(v: RaycastVehicle, ground: number, flags: number, now: number): void {
    if (this.status() !== 'online' || now - this.lastSend < 66) return; this.lastSend = now;
    const r = (n: number, d = 100): number => Math.round(n * d) / d;
    this.raw({ t: 'pose', p: [r(v.position.x), r(v.position.y), r(v.position.z)], q: [r(v.quaternion.x, 1e4), r(v.quaternion.y, 1e4), r(v.quaternion.z, 1e4), r(v.quaternion.w, 1e4)],
      v: [r(v.velocity.x, 10), r(v.velocity.y, 10), r(v.velocity.z, 10)], g: r(ground), s: r(v.steerInput, 100), w: r(v.wheels[0]?.angularVelocityRadS ?? 0, 10), f: flags });
  }
  announceCar(): void { if (this.status() === 'online') { const l = this.getLoadout(); this.raw({ t: 'car', car: l.car, color: l.color }); } }
  say(text: string): void { const t = text.trim(); if (t && this.status() === 'online') this.raw({ t: 'chat', text: t }); }
}
