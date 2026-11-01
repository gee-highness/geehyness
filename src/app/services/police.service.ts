import { Injectable, signal } from '@angular/core';
import type { CopState } from '../game/graphics/police';

/** Cops & robbers HUD state (updated ~10 Hz by the app) and the on/off setting. */
@Injectable({ providedIn: 'root' })
export class PoliceService {
  readonly enabled = signal<boolean>((() => { try { return localStorage.getItem('shesha.cops') !== 'off'; } catch { return true; } })());
  readonly state = signal<CopState | 'OFF'>('PATROL');
  readonly suspicion = signal(0);
  readonly vis = signal(0);       // 0..1 of the max sight radius
  readonly noise = signal(0);     // 0..1 of the max hearing radius
  readonly chasers = signal(0);
  readonly nearest = signal(1e9);
  readonly message = signal('');
  readonly busted = signal(0);
  readonly escaped = signal(0);
  toggle(): void { const v = !this.enabled(); this.enabled.set(v); try { localStorage.setItem('shesha.cops', v ? 'on' : 'off'); } catch { /* private mode */ } }
  flash(msg: string, ms = 3200): void { this.message.set(msg); setTimeout(() => { if (this.message() === msg) this.message.set(''); }, ms); }
}
