import { Injectable, signal } from '@angular/core';

export type Indicator = 'off' | 'left' | 'right';

/** Lights, indicators, hazards and horn state for the player's car. */
@Injectable({ providedIn: 'root' })
export class DriveStateService {
  readonly indicator = signal<Indicator>('off');
  readonly hazards = signal<boolean>(false);
  readonly headlights = signal<0 | 1 | 2>(0); // off / low beam / high beam
  readonly horn = signal<boolean>(false);
  /** Blink phase (true = lamps lit). Flips ~1.5 Hz while an indicator or the hazards are active. */
  readonly blink = signal<boolean>(false);
  /** Set when the player manually touched the headlights, which disables the automatic night-time switch-on. */
  private manualLights = false;
  private phase = 0; private armedTurn = 0; private onTime = 0;
  /** Called on each blink flip so the app can play the relay tick. */
  public onTick?: (on: boolean) => void;

  toggleLeft(): void { this.hazards.set(false); this.set(this.indicator() === 'left' ? 'off' : 'left'); }
  toggleRight(): void { this.hazards.set(false); this.set(this.indicator() === 'right' ? 'off' : 'right'); }
  toggleHazards(): void { this.indicator.set('off'); this.hazards.update((h) => !h); this.restartBlink(); }
  cycleHeadlights(): void { this.manualLights = true; this.headlights.update((h) => ((h + 1) % 3) as 0 | 1 | 2); }
  setHorn(on: boolean): void { if (this.horn() !== on) this.horn.set(on); }

  /** Switch low beams on at dusk / off at dawn unless the player has taken manual control. */
  autoLights(dark: boolean): void { if (!this.manualLights) this.headlights.set(dark ? 1 : 0); }

  private set(i: Indicator): void { this.indicator.set(i); this.armedTurn = 0; this.onTime = 0; this.restartBlink(); }
  private restartBlink(): void { this.phase = 0; this.blink.set(this.indicator() !== 'off' || this.hazards()); if (this.blink()) this.onTick?.(true); }

  get leftOn(): boolean { return this.blink() && (this.hazards() || this.indicator() === 'left'); }
  get rightOn(): boolean { return this.blink() && (this.hazards() || this.indicator() === 'right'); }

  /** Per-frame: advance the blink and self-cancel an indicator after the turn is made, like a real stalk. */
  tick(dt: number, steer: number): void {
    const active = this.indicator() !== 'off' || this.hazards();
    if (!active) { if (this.blink()) this.blink.set(false); return; }
    this.phase += dt;
    if (this.phase >= 0.34) { this.phase = 0; this.blink.update((b) => !b); this.onTick?.(this.blink()); }
    const ind = this.indicator(); if (ind === 'off') return;
    this.onTime += dt;
    const into = ind === 'left' ? -steer : steer;
    if (into > 0.45) this.armedTurn = 1; else if (this.armedTurn === 1 && Math.abs(steer) < 0.12 && this.onTime > 1.5) this.set('off');
    if (this.onTime > 25) this.set('off');
  }
}
