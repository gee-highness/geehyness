import { Injectable, signal } from '@angular/core';
import { RoadGraph, Route, Turn, turnText } from '../game/road-graph';
import type { WorldBuilder } from '../game/graphics/world-builder';

export interface Guidance { turn: Turn; text: string; dist: number; remaining: number; etaMin: number; road: string }

/** The map waypoint plus GPS routing: A* over the OSM road graph, turn-by-turn guidance, automatic re-route. */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  /** Player pose, refreshed every frame by the app (plain object: read it, do not bind to it). */
  readonly pose = { x: 0, z: 0, yaw: 0, speedKmh: 0 };
  readonly waypoint = signal<[number, number] | null>(null);
  readonly route = signal<Route | null>(null);
  readonly guidance = signal<Guidance | null>(null);
  readonly routing = signal(false);
  private world?: WorldBuilder; private graph?: RoadGraph; private idx = 0; private lastRoute = 0;

  /** Index of the route point nearest the car. */
  get progress(): number { return this.idx; }
  attach(w: WorldBuilder): void { this.world = w; }
  /** Shared lazily-built road graph. */
  getGraph(): RoadGraph | undefined { if (!this.graph && this.world?.ready) this.graph = new RoadGraph(this.world.roadWays); return this.graph; }
  set(x: number, z: number): void { this.locked = false; this.waypoint.set([x, z]); this.compute(); }
  /** Follow a fixed route (a race course): guidance without re-routing. */
  follow(r: Route, end: [number, number]): void { this.locked = true; this.waypoint.set(end); this.route.set(r); this.idx = 0; this.update(this.pose.x, this.pose.z); }
  private locked = false;
  clear(): void { this.locked = false; this.waypoint.set(null); this.route.set(null); this.guidance.set(null); }

  private compute(): void {
    const wp = this.waypoint(); if (!wp || !this.world?.ready) return;
    this.lastRoute = performance.now(); this.routing.set(true);
    // build the graph lazily, then route (a few ms to ~100 ms on a phone); yield so the UI can paint "routing"
    setTimeout(() => {
      try {
        this.graph ??= new RoadGraph(this.world!.roadWays);
        const r = this.graph.route(this.pose.x, this.pose.z, wp[0], wp[1]); this.route.set(r); this.idx = 0; if (r) this.update(this.pose.x, this.pose.z); else this.guidance.set(null);
      } finally { this.routing.set(false); }
    }, 0);
  }

  /** Call ~4 times a second with the car position. */
  update(x: number, z: number): void {
    const r = this.route(); if (!r) return; const n = r.pts.length / 2;
    let best = this.idx, bd = 1e18; for (let i = this.idx; i < Math.min(n, this.idx + 80); i++) { const d = (r.pts[i * 2] - x) ** 2 + (r.pts[i * 2 + 1] - z) ** 2; if (d < bd) { bd = d; best = i; } }
    this.idx = best;
    if (!this.locked && Math.sqrt(bd) > 60 && performance.now() - this.lastRoute > 4000) { this.compute(); return; } // off route -> reroute
    const along = r.cum[this.idx], remaining = Math.max(0, r.length - along);
    if (remaining < 25 && !this.locked) { this.clear(); return; }
    const step = r.steps.find((s) => s.at > along + 4) ?? r.steps[r.steps.length - 1];
    this.guidance.set({ turn: step.turn, text: turnText(step.turn), dist: Math.max(0, step.at - along), remaining, etaMin: Math.max(1, Math.round(remaining / (Math.max(30, this.pose.speedKmh) / 3.6) / 60)), road: step.name });
  }
}
