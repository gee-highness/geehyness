import type { Link } from './transport';

/** One player in a room. `link` is undefined for the hosting player (they are the hub's own process). */
interface Member { id: number; name: string; car: string; color: string; link?: Link; pose: Record<string, unknown> | null; dirty: boolean }
class Conn { me: Member | null = null; msgs = 0; win = Date.now(); constructor(readonly link?: Link) {} }

const MAX = 16;
const clean = (s: unknown, n: number): string => String(s ?? '').replace(/[^\p{L}\p{N} _.\-!?',:;()]/gu, '').trim().slice(0, n);
const num = (v: unknown, lim: number): number => (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < lim ? v : 0);
const colour = (c: unknown): c is string => typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c);

/**
 * The room's authority, running inside the hosting player's browser (like a Ludo Sync host: no game server, PeerJS only introduces the phones).
 * Guests' messages arrive over their WebRTC links; the host's own messages go through `local()`. Validates, rate-limits and fans poses out ~15 Hz.
 */
export class RoomHub {
  private members = new Map<number, Member>();
  private nextId = 1;
  private local_ = new Conn();
  private conns = new Set<Conn>();
  private timer: ReturnType<typeof setInterval> | undefined;
  /** `localRx` receives everything addressed to the host's own player. */
  constructor(readonly code: string, private localRx: (m: Record<string, unknown>) => void) { this.timer = setInterval(() => this.flush(), 66); }

  /** A guest's link opened. */
  attach(link: Link): void {
    const c = new Conn(link); this.conns.add(c);
    link.onMessage((d) => { if (typeof d === 'string') this.incoming(c, d); });
    link.onClose(() => this.drop(c));
  }
  /** A message from the hosting player. */
  local(m: Record<string, unknown>): void { this.handle(this.local_, m); }
  close(): void { clearInterval(this.timer); for (const c of [...this.conns]) { try { c.link?.close(); } catch { /* gone */ } } this.conns.clear(); this.members.clear(); }

  private incoming(c: Conn, raw: string): void {
    const now = Date.now(); if (now - c.win > 1000) { c.win = now; c.msgs = 0; } if (++c.msgs > 60 || raw.length > 4096) return;
    let m: Record<string, unknown>; try { m = JSON.parse(raw); } catch { return; }
    if (m && typeof m === 'object') this.handle(c, m);
  }
  private send(p: Member, o: unknown): void { if (!p.link) this.localRx(o as Record<string, unknown>); else if (p.link.open) p.link.send(JSON.stringify(o)); }
  private cast(o: unknown, except?: number): void { for (const p of this.members.values()) if (p.id !== except) this.send(p, o); }
  private info = (p: Member) => ({ id: p.id, name: p.name, car: p.car, color: p.color });

  private handle(c: Conn, m: Record<string, unknown>): void {
    const me = c.me;
    if (m['t'] === 'join' && !me) {
      if (this.members.size >= MAX) { if (c.link) { c.link.send(JSON.stringify({ t: 'error', msg: 'Room is full' })); setTimeout(() => c.link?.close(), 200); } else this.localRx({ t: 'error', msg: 'Room is full' }); return; }
      const id = this.nextId++;
      const p: Member = { id, link: c.link, name: clean(m['name'], 16) || `Driver${id}`, car: clean(m['car'], 32) || 'ferrari', color: colour(m['color']) ? m['color'] : '#ef4444', pose: null, dirty: false };
      c.me = p; this.members.set(id, p);
      this.send(p, { t: 'welcome', id, room: this.code, peers: [...this.members.values()].filter((x) => x !== p).map(this.info) });
      this.cast({ t: 'join', peer: this.info(p) }, id);
    } else if (!me) return;
    else if (m['t'] === 'pose' && Array.isArray(m['p']) && Array.isArray(m['q'])) {
      const arr = (a: unknown, n: number, lim: number): number[] => (Array.isArray(a) ? a.slice(0, n).map((v) => num(v, lim)) : new Array(n).fill(0));
      me.pose = { p: arr(m['p'], 3, 5e5), q: arr(m['q'], 4, 2), v: arr(m['v'], 3, 400), g: num(m['g'], 5e3), s: num(m['s'], 2), w: num(m['w'], 1e4), f: Number(m['f']) | 0 };
      me.dirty = true;
    } else if (m['t'] === 'car') { me.car = clean(m['car'], 32) || me.car; if (colour(m['color'])) me.color = m['color']; this.cast({ t: 'car', id: me.id, car: me.car, color: me.color }, me.id); }
    else if (m['t'] === 'ping') this.send(me, { t: 'pong' });
    else if (m['t'] === 'chat') { const text = clean(m['text'], 120); if (text) this.cast({ t: 'chat', id: me.id, name: me.name, text }); }
  }
  private drop(c: Conn): void {
    this.conns.delete(c); const me = c.me; if (!me) return;
    this.members.delete(me.id); this.cast({ t: 'leave', id: me.id });
  }
  private flush(): void {
    const batch: Record<string, unknown>[] = []; for (const p of this.members.values()) if (p.dirty && p.pose) { batch.push({ id: p.id, ...p.pose }); p.dirty = false; }
    if (!batch.length) return;
    for (const p of this.members.values()) { const others = batch.filter((b) => b['id'] !== p.id); if (others.length) this.send(p, { t: 'poses', poses: others }); }
  }
}
