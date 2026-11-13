// Shesha multiplayer relay. Rooms by code, up to 16 players each; clients own their physics and send their pose,
// the server validates, rate-limits and fans it out. Run: node server/mp-server.mjs  (PORT env, default 8787)
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';

const PORT = Number(process.env.PORT) || 8787, MAX = 16, TICK_MS = 66;
const rooms = new Map();   // code -> Map<id, player>
let nextId = 1;
const clean = (s, n) => String(s ?? '').replace(/[^\p{L}\p{N} _.\-!?',:;()]/gu, '').trim().slice(0, n);
const num = (v, lim) => (Number.isFinite(v) && Math.abs(v) < lim ? v : 0);

const http = createServer((req, res) => {
  res.writeHead(200, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify({ ok: true, rooms: [...rooms].map(([c, m]) => ({ room: c, players: m.size })) }));
});
const wss = new WebSocketServer({ server: http, maxPayload: 4096 });
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const cast = (room, o, except) => { for (const p of room.values()) if (p.id !== except) send(p.ws, o); };
const info = (p) => ({ id: p.id, name: p.name, car: p.car, color: p.color });

wss.on('connection', (ws) => {
  let me = null, room = null, msgs = 0, win = Date.now();
  ws.on('message', (raw) => {
    const now = Date.now(); if (now - win > 1000) { win = now; msgs = 0; } if (++msgs > 60) return;   // 60 msg/s cap
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'join' && !me) {
      const code = clean(m.room, 24).toLowerCase() || 'manzini';
      room = rooms.get(code) ?? new Map(); if (room.size >= MAX) { send(ws, { t: 'error', msg: 'Room is full' }); ws.close(); return; }
      rooms.set(code, room);
      me = { id: nextId++, ws, name: clean(m.name, 16) || `Driver${nextId}`, car: clean(m.car, 32) || 'ferrari', color: /^#[0-9a-f]{6}$/i.test(m.color) ? m.color : '#ef4444', pose: null, dirty: false, code };
      room.set(me.id, me);
      send(ws, { t: 'welcome', id: me.id, room: code, peers: [...room.values()].filter((p) => p !== me).map(info) });
      cast(room, { t: 'join', peer: info(me) }, me.id);
    } else if (!me) return;
    else if (m.t === 'pose' && Array.isArray(m.p) && Array.isArray(m.q)) {
      me.pose = { p: m.p.slice(0, 3).map((v) => num(v, 5e5)), q: m.q.slice(0, 4).map((v) => num(v, 2)), v: m.v?.slice(0, 3).map((x) => num(x, 400)) ?? [0, 0, 0], g: num(m.g, 5e3), s: num(m.s, 2), w: num(m.w, 1e4), f: m.f | 0 };
      me.dirty = true;
    } else if (m.t === 'car') { me.car = clean(m.car, 32) || me.car; if (/^#[0-9a-f]{6}$/i.test(m.color)) me.color = m.color; cast(room, { t: 'car', id: me.id, car: me.car, color: me.color }, me.id); }
    else if (m.t === 'ping') send(ws, { t: 'pong' });
    else if (m.t === 'chat') { const text = clean(m.text, 120); if (text) cast(room, { t: 'chat', id: me.id, name: me.name, text }); }
  });
  ws.on('close', () => { if (!me) return; room.delete(me.id); cast(room, { t: 'leave', id: me.id }); if (!room.size) rooms.delete(me.code); });
  ws.on('error', () => ws.close());
});

// fan poses out ~15 Hz as one batch per room
setInterval(() => {
  for (const room of rooms.values()) {
    const batch = []; for (const p of room.values()) if (p.dirty) { batch.push({ id: p.id, ...p.pose }); p.dirty = false; }
    if (batch.length) for (const p of room.values()) { const others = batch.filter((b) => b.id !== p.id); if (others.length) send(p.ws, { t: 'poses', poses: others }); }
  }
}, TICK_MS);
setInterval(() => { for (const room of rooms.values()) for (const p of room.values()) { if (p.ws.isAlive === false) { p.ws.terminate(); continue; } p.ws.isAlive = false; p.ws.ping(); p.ws.once('pong', () => { p.ws.isAlive = true; }); } }, 20000);

http.listen(PORT, () => console.log(`Shesha multiplayer on :${PORT}`));
