import { Injectable, signal } from '@angular/core';
import { RACES, RacePhase, RaceResult } from '../game/graphics/race';

/** Street-race HUD state (copied from the Race object ~10 Hz by the app), the event menu and personal bests. */
@Injectable({ providedIn: 'root' })
export class RaceService {
  readonly events = RACES;
  readonly menu = signal(false);
  readonly phase = signal<RacePhase>('IDLE');
  readonly name = signal('');
  readonly count = signal(0);
  readonly pos = signal(1);
  readonly total = signal(1);
  readonly time = signal(0);
  readonly cp = signal(0);
  readonly cps = signal(0);
  readonly remaining = signal(0);
  readonly offRoute = signal(false);
  readonly order = signal<string[]>([]);
  readonly result = signal<(RaceResult & { best: boolean }) | null>(null);
  readonly bests = signal<Record<string, number>>((() => { try { return JSON.parse(localStorage.getItem('shesha.races') ?? '{}') as Record<string, number>; } catch { return {}; } })());
  /** Set by the app: start event i / abandon the current one. */
  onStart?: (i: number) => void; onAbandon?: () => void;

  toggle(): void { if (this.phase() !== 'IDLE') this.onAbandon?.(); else this.menu.update((v) => !v); }
  start(i: number): void { this.menu.set(false); this.onStart?.(i); }
  finish(r: RaceResult): void {
    const old = this.bests()[r.id], best = !old || r.time < old;
    if (best) { const b = { ...this.bests(), [r.id]: r.time }; this.bests.set(b); try { localStorage.setItem('shesha.races', JSON.stringify(b)); } catch { /* private mode */ } }
    this.result.set({ ...r, best });
  }
  fmt(t: number): string { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; }
  ord(n: number): string { return n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`; }
}
