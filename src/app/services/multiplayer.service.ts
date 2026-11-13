import { Injectable, signal } from '@angular/core';
import type { RaycastVehicle } from '../game/physics/raycast-vehicle';

export interface Peer { id: number; name: string; car: string; color: string; }
/** Latest pose of a remote player (+ when it arrived), consumed by RemotePlayers. */
export interface PeerState extends Peer {
  p: [number, number, number]; q: [number, number, number, number]; v: [number, number, number];
  g: number; s: number; w: number; f: number; at: number; fresh: boolean;
}
export interface ChatLine { id: number; name: string; text: string; at: number; }
/** pose flag bits */
export const FLAG = { BRAKE: 1, HEAD: 2, HIGH: 4, HORN: 8, HAZARD: 16, SIREN: 32 };

/** Online free-roam: a thin WebSocket client for server/mp-server.mjs. The car's physics stays local; only pose goes over the wire (~15 Hz). */
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
  readonly url = signal(this.load('url', 'ws://localhost:8787'));
  readonly name = signal(this.load('name', `Driver${Math.floor(Math.random() * 900 + 100)}`));
  readonly code = signal(this.load('room', 'manzini'));
  /** Live poses by player id (mutated in place, read every frame by the scene). */
  readonly states = new Map<number, PeerState>();
  /** Called when someone joins / leaves (for the HUD toast). */
  onEvent?: (msg: string) => void;
  /** Supplied by the app: current car id and paint colour. */
  getLoadout: () => { car: string; color: string } = () => ({ car: 'ferrari', color: '#ef4444' });

  private ws: WebSocket | null = null;
  private lastSend = 0; private pingAt = 0;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  private load(k: string, d: string): string { try { return localStorage.getItem('shesha.mp.' + k) ?? d; } catch { return d; } }
  private save(k: string, v: string): void { try { localStorage.setItem('shesha.mp.' + k, v); } catch { /* private mode */ } }

  connect(): void {
    if (this.ws) return;
    const url = this.url().trim(); if (!/^wss?:\/\//i.test(url)) { this.error.set('Server address must start with ws:// or wss://'); return; }
    this.error.set(''); this.status.set('connecting');
    this.save('url', url); this.save('name', this.name()); this.save('room', this.code());
    let ws: WebSocket; try { ws = new WebSocket(url); } catch { this.error.set('Invalid server address'); this.status.set('offline'); return; }
    this.ws = ws;
    ws.onopen = () => { const l = this.getLoadout(); ws.send(JSON.stringify({ t: 'join', room: this.code(), name: this.name(), car: l.car, color: l.color })); };
    ws.onmessage = (e) => this.onMessage(e.data as string);
    ws.onerror = () => { if (this.status() !== 'online') this.error.set('Could not reach the server'); };
    ws.onclose = () => { if (this.ws === ws) this.cleanup(); };
    this.pingTimer = setInterval(() => { this.pingAt = performance.now(); this.raw({ t: 'ping' }); }, 5000);
  }
  disconnect(): void { const w = this.ws; this.ws = null; w?.close(); this.cleanup(); }
  private cleanup(): void { this.ws = null; clearInterval(this.pingTimer); this.status.set('offline'); this.roster.set([]); this.states.clear(); this.myId.set(0); this.room.set(''); }
  private raw(o: unknown): void { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(o)); }

  private onMessage(data: string): void {
    let m: any; try { m = JSON.parse(data); } catch { return; }   // eslint-disable-line @typescript-eslint/no-explicit-any
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
