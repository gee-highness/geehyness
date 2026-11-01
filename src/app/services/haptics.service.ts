import { Injectable, signal, inject } from '@angular/core';
import { GamepadService } from './gamepad.service';
import { HapticEventSource, HapticFrame } from '../models/haptics.types';

@Injectable({
  providedIn: 'root'
})
export class HapticsService {
  private gamepadService = inject(GamepadService);

  readonly masterIntensity = signal<number>(1.0); // 0.0 to 1.5
  readonly enabled = signal<boolean>(typeof localStorage === 'undefined' ? true : localStorage.getItem('shesha.rumble') !== 'off');
  private wasActive = false;
  public setEnabled(on: boolean): void { this.enabled.set(on); try { localStorage.setItem('shesha.rumble', on ? 'on' : 'off'); } catch { /* private mode */ } if (!on) this.stopAll(); }
  /** Hard stop: clear every channel and cancel the actuator (also on blur/hidden). */
  public stopAll(): void {
    for (const k of Object.keys(this.channels) as HapticEventSource[]) this.channels[k] = { strong: 0, weak: 0, expiryTime: 0 };
    this.wasActive = false; this.gamepadService.stopRumble();
  }
  readonly lastActiveFrame = signal<HapticFrame>({ strong: 0, weak: 0, durationMs: 80 });

  // Channel states
  private channels: Record<HapticEventSource, { strong: number; weak: number; expiryTime: number }> = {
    engine: { strong: 0, weak: 0, expiryTime: 0 },
    tireSlip: { strong: 0, weak: 0, expiryTime: 0 },
    surfaceRoughness: { strong: 0, weak: 0, expiryTime: 0 },
    kerb: { strong: 0, weak: 0, expiryTime: 0 },
    gearShift: { strong: 0, weak: 0, expiryTime: 0 },
    absStutter: { strong: 0, weak: 0, expiryTime: 0 },
    landing: { strong: 0, weak: 0, expiryTime: 0 },
    collision: { strong: 0, weak: 0, expiryTime: 0 },
    speedTrap: { strong: 0, weak: 0, expiryTime: 0 },
  };

  private lastSentTime = 0;
  private readonly REFRESH_INTERVAL_MS = 80;

  /**
   * Sets continuous haptic excitation (e.g. engine RPM, tire slip).
   */
  public setContinuous(source: HapticEventSource, strong: number, weak: number, holdMs = 120): void {
    const now = performance.now();
    this.channels[source] = {
      strong: Math.max(0, Math.min(1, strong)),
      weak: Math.max(0, Math.min(1, weak)),
      expiryTime: now + holdMs,
    };
  }

  /**
   * Triggers a one-shot haptic impulse (gear shift, crash, speed trap radar).
   */
  public triggerImpulse(source: HapticEventSource, strong: number, weak: number, durationMs = 150): void {
    const now = performance.now();
    this.channels[source] = {
      strong: Math.max(0, Math.min(1, strong)),
      weak: Math.max(0, Math.min(1, weak)),
      expiryTime: now + durationMs,
    };
    // If it's a high-priority crash or trigger, immediately push a frame
    if (strong > 0.6 || weak > 0.6) {
      this.flushMixer(now, true);
    }
  }

  /**
   * Updates the blended haptic stream and dispatches to gamepad vibration actuator every ~80ms.
   */
  public update(now: number): void {
    if (now - this.lastSentTime < this.REFRESH_INTERVAL_MS) {
      return;
    }
    this.flushMixer(now, false);
  }

  private flushMixer(now: number, force: boolean): void {
    let sumStrong = 0;
    let sumWeak = 0;

    for (const key of Object.keys(this.channels) as HapticEventSource[]) {
      const ch = this.channels[key];
      if (now < ch.expiryTime) {
        // Linear fade out for impulses
        const remaining = (ch.expiryTime - now) / 100;
        const factor = Math.min(1, Math.max(0.1, remaining));
        sumStrong = Math.max(sumStrong, ch.strong * factor);
        sumWeak = Math.max(sumWeak, ch.weak * factor);
      } else {
        ch.strong = 0;
        ch.weak = 0;
      }
    }

    if (!this.enabled()) { if (this.wasActive) this.stopAll(); return; }
    const mult = this.masterIntensity();
    const finalStrong = Math.min(1, sumStrong * mult);
    const finalWeak = Math.min(1, sumWeak * mult);

    const frame: HapticFrame = {
      strong: finalStrong,
      weak: finalWeak,
      durationMs: 100, // 100ms with 80ms refresh gives continuous smooth overlap without stutter
    };

    this.lastActiveFrame.set(frame);
    this.lastSentTime = now;

    if (finalStrong > 0.03 || finalWeak > 0.03 || force) {
      this.wasActive = true;
      this.gamepadService.playDualRumble(frame);
    } else if (this.wasActive) {
      this.wasActive = false;
      this.gamepadService.stopRumble();
    }
  }

  /**
   * Diagnostic test bench runner for settings screen.
   */
  public testMotor(type: 'weak' | 'strong' | 'both' | 'pulse'): void {
    if (type === 'weak') {
      this.triggerImpulse('speedTrap', 0.0, 0.9, 300);
    } else if (type === 'strong') {
      this.triggerImpulse('collision', 0.9, 0.0, 300);
    } else if (type === 'both') {
      this.triggerImpulse('collision', 0.8, 0.8, 400);
    } else {
      // Pulse sequence
      this.triggerImpulse('gearShift', 0.9, 0.9, 100);
      setTimeout(() => this.triggerImpulse('gearShift', 0.6, 0.8, 100), 150);
      setTimeout(() => this.triggerImpulse('gearShift', 0.9, 0.4, 150), 300);
    }
  }
}
