/** Drivable road graph built from the OSM ways (shared vertices = junctions), with A* routing and turn-by-turn steps. */
export interface GraphWay { c: number; o: number; n: string; p: number[]; u?: number }
export type Turn = 'left' | 'right' | 'slight-left' | 'slight-right' | 'sharp-left' | 'sharp-right' | 'straight' | 'uturn' | 'arrive';
export interface RouteStep { x: number; z: number; at: number; turn: Turn; name: string }
export interface Route { pts: number[]; cum: number[]; length: number; steps: RouteStep[]; etaS: number }

const SPEED = [25, 22, 18, 15, 13, 10, 7, 5]; // m/s by road class (cost only)

export class RoadGraph {
  private x: Float32Array; private z: Float32Array;
  private off: Int32Array; private to: Int32Array; private cost: Float32Array; private wayOf: Int32Array;
  private cells = new Map<number, number[]>();
  readonly nodeCount: number;
  constructor(private ways: GraphWay[]) {
    const ids = new Map<number, number>(); const xs: number[] = [], zs: number[] = [];
    const key = (a: number, b: number) => (a + 400000) * 1_000_000 + (b + 400000);
    const idOf = (a: number, b: number) => { const k = key(a, b); let i = ids.get(k); if (i === undefined) { i = xs.length; ids.set(k, i); xs.push(a / 10); zs.push(b / 10); } return i; };
    const ef: number[] = [], et: number[] = [], ec: number[] = [], ew: number[] = [];
    ways.forEach((w, wi) => {
      if (w.c > 7 || w.u || w.p.length < 4) return;
      let prev = idOf(w.p[0], w.p[1]);
      for (let i = 2; i < w.p.length; i += 2) {
        const cur = idOf(w.p[i], w.p[i + 1]); if (cur === prev) continue;
        const len = Math.hypot(xs[cur] - xs[prev], zs[cur] - zs[prev]), c = len / SPEED[w.c];
        ef.push(prev); et.push(cur); ec.push(c); ew.push(wi);
        if (!w.o) { ef.push(cur); et.push(prev); ec.push(c); ew.push(wi); }
        prev = cur;
      }
    });
    const n = xs.length; this.nodeCount = n; this.x = Float32Array.from(xs); this.z = Float32Array.from(zs);
    const deg = new Int32Array(n + 1); for (const f of ef) deg[f + 1]++; for (let i = 0; i < n; i++) deg[i + 1] += deg[i];
    this.off = deg; const fill = deg.slice(0, n); this.to = new Int32Array(ef.length); this.cost = new Float32Array(ef.length); this.wayOf = new Int32Array(ef.length);
    for (let e = 0; e < ef.length; e++) { const p = fill[ef[e]]++; this.to[p] = et[e]; this.cost[p] = ec[e]; this.wayOf[p] = ew[e]; }
    for (let i = 0; i < n; i++) { const k = Math.floor(xs[i] / 100) * 100003 + Math.floor(zs[i] / 100); let l = this.cells.get(k); if (!l) { l = []; this.cells.set(k, l); } l.push(i); }
  }

  /** Nearest graph vertex that has outgoing edges, within maxR metres. */
  nearest(x: number, z: number, maxR = 600): number {
    let best = -1, bd = 1e18;
    for (let r = 0; r <= Math.ceil(maxR / 100); r++) {
      const cx = Math.floor(x / 100), cz = Math.floor(z / 100);
      for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) {
        if (Math.max(Math.abs(a), Math.abs(b)) !== r) continue;
        const l = this.cells.get((cx + a) * 100003 + (cz + b)); if (!l) continue;
        for (const i of l) { if (this.off[i + 1] === this.off[i]) continue; const d = (this.x[i] - x) ** 2 + (this.z[i] - z) ** 2; if (d < bd) { bd = d; best = i; } }
      }
      if (best >= 0 && Math.sqrt(bd) <= r * 100) break;
    }
    return best;
  }

  /** A* shortest-time route between two world points, or null. */
  route(fx: number, fz: number, tx: number, tz: number): Route | null {
    const s = this.nearest(fx, fz), t = this.nearest(tx, tz); if (s < 0 || t < 0) return null;
    const n = this.nodeCount, g = new Float32Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), prevEdge = new Int32Array(n).fill(-1), closed = new Uint8Array(n);
    const hx = this.x[t], hz = this.z[t], h = (i: number) => Math.hypot(this.x[i] - hx, this.z[i] - hz) / 25;
    const heap: number[] = [], hp: number[] = []; // parallel arrays: node, priority
    const push = (node: number, pr: number) => { let i = heap.length; heap.push(node); hp.push(pr); while (i > 0) { const p = (i - 1) >> 1; if (hp[p] <= hp[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hp[p], hp[i]] = [hp[i], hp[p]]; i = p; } };
    const pop = (): number => { const top = heap[0], ln = heap.pop()!, lp = hp.pop()!; if (heap.length) { heap[0] = ln; hp[0] = lp; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && hp[l] < hp[m]) m = l; if (r < heap.length && hp[r] < hp[m]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hp[m], hp[i]] = [hp[i], hp[m]]; i = m; } } return top; };
    g[s] = 0; push(s, h(s));
    while (heap.length) {
      const u = pop(); if (closed[u]) continue; closed[u] = 1; if (u === t) break;
      for (let e = this.off[u]; e < this.off[u + 1]; e++) { const v = this.to[e], ng = g[u] + this.cost[e]; if (ng < g[v]) { g[v] = ng; prev[v] = u; prevEdge[v] = e; push(v, ng + h(v)); } }
    }
    if (!closed[t]) return null;
    const nodes: number[] = [], edges: number[] = []; for (let v = t; v !== -1; v = prev[v]) { nodes.push(v); if (prevEdge[v] >= 0) edges.push(prevEdge[v]); } nodes.reverse(); edges.reverse();
    const pts: number[] = [], cum: number[] = [0];
    nodes.forEach((v, i) => { pts.push(this.x[v], this.z[v]); if (i) cum.push(cum[i - 1] + Math.hypot(this.x[v] - this.x[nodes[i - 1]], this.z[v] - this.z[nodes[i - 1]])); });
    return { pts, cum, length: cum[cum.length - 1], steps: this.steps(pts, cum, edges), etaS: g[t] };
  }

  private steps(pts: number[], cum: number[], edges: number[]): RouteStep[] {
    const out: RouteStep[] = []; const nv = pts.length / 2;
    const dirAt = (i: number, forward: boolean): [number, number] => { // heading over ~18 m
      let j = i; const lim = 18; if (forward) { while (j < nv - 1 && cum[j] - cum[i] < lim) j++; } else { while (j > 0 && cum[i] - cum[j] < lim) j--; }
      const dx = forward ? pts[j * 2] - pts[i * 2] : pts[i * 2] - pts[j * 2], dz = forward ? pts[j * 2 + 1] - pts[i * 2 + 1] : pts[i * 2 + 1] - pts[j * 2 + 1]; const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
    const nameOf = (e: number) => this.ways[this.wayOf[e]].n || '';
    let lastName = edges.length ? nameOf(edges[0]) : '';
    for (let i = 1; i < nv - 1; i++) {
      const eIn = edges[i - 1], eOut = edges[i]; const nm = nameOf(eOut), changed = this.wayOf[eIn] !== this.wayOf[eOut];
      const a = dirAt(i, false), b = dirAt(i, true); const cross = a[0] * b[1] - a[1] * b[0], dot = a[0] * b[0] + a[1] * b[1], ang = Math.atan2(cross, dot) * 180 / Math.PI; // + = right (z points south)
      const abs = Math.abs(ang); let turn: Turn | null = null;
      if (abs > 150) turn = 'uturn'; else if (abs > 110) turn = ang > 0 ? 'sharp-right' : 'sharp-left'; else if (abs > 45) turn = ang > 0 ? 'right' : 'left'; else if (abs > 22 && changed) turn = ang > 0 ? 'slight-right' : 'slight-left';
      else if (changed && nm && nm !== lastName) turn = 'straight';
      if (turn) { out.push({ x: pts[i * 2], z: pts[i * 2 + 1], at: cum[i], turn, name: nm }); }
      if (nm) lastName = nm;
    }
    for (let k = out.length - 1; k >= 0; k--) if (out[k].turn === 'uturn' && cum[nv - 1] - out[k].at < 300) out.splice(k, 1); // snap-to-dead-end artefact near the destination
    out.push({ x: pts[(nv - 1) * 2], z: pts[(nv - 1) * 2 + 1], at: cum[nv - 1], turn: 'arrive', name: '' });
    // merge steps closer than 25 m (keep the later, sharper one)
    const merged: RouteStep[] = []; for (const s of out) { const l = merged[merged.length - 1]; if (l && l.turn !== 'arrive' && s.at - l.at < 25 && s.turn !== 'arrive') merged[merged.length - 1] = s; else merged.push(s); }
    return merged;
  }
}

export function turnText(t: Turn): string {
  switch (t) { case 'left': return 'Turn left'; case 'right': return 'Turn right'; case 'slight-left': return 'Bear left'; case 'slight-right': return 'Bear right'; case 'sharp-left': return 'Sharp left'; case 'sharp-right': return 'Sharp right'; case 'uturn': return 'Make a U-turn'; case 'arrive': return 'Arrive at destination'; default: return 'Continue'; }
}
