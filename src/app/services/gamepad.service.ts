import { Injectable, signal } from '@angular/core';
import { GamepadControlsSnapshot, HapticFrame } from '../models/haptics.types';

interface VibrationActuatorLike {
  playEffect(type: string, params: {
    startDelay: number;
    duration: number;
    weakMagnitude: number;
    strongMagnitude: number;
  }): Promise<unknown>;
}

@Injectable({
  providedIn: 'root'
})
export class GamepadService {
  readonly isConnected = signal<boolean>(false);
  readonly controllerName = signal<string>('No Controller Detected');
  readonly isDualShock = signal<boolean>(false);
  readonly hasVibration = signal<boolean>(false);
  readonly isTouchDevice = signal<boolean>(false);

  private deadzone = 0.08;
  private lastButtons: boolean[] = [];

  constructor() {
    if (typeof window !== 'undefined') {
      this.isTouchDevice.set('ontouchstart' in window || navigator.maxTouchPoints > 0);
      window.addEventListener('gamepadconnected', (e) => this.onGamepadConnected(e));
      window.addEventListener('gamepaddisconnected', () => this.onGamepadDisconnected());
    }
  }

  private onGamepadConnected(event: GamepadEvent) {
    const pad = event.gamepad;
    this.isConnected.set(true);
    this.controllerName.set(pad.id);
    const idLower = pad.id.toLowerCase();
    const isDs = idLower.includes('dualshock') || idLower.includes('dualsense') || idLower.includes('sony') || idLower.includes('054c');
    this.isDualShock.set(isDs);
    const actuator = (pad as unknown as { vibrationActuator?: VibrationActuatorLike }).vibrationActuator;
    this.hasVibration.set(!!actuator);
  }

  private onGamepadDisconnected() {
    const gamepads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : [];
    if (gamepads.length === 0) {
      this.isConnected.set(false);
      this.controllerName.set('No Controller Detected');
      this.isDualShock.set(false);
      this.hasVibration.set(false);
    }
  }

  /** The pad we are listening to: the one that was last touched, else the most gamepad-like device (browsers also list keyboards, headsets and motion sensors as "gamepads"). */
  private activeIdx = -1; private shownId = '';
  public getConnectedGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    let best: Gamepad | null = null, bs = -1;
    for (const p of Array.from(navigator.getGamepads())) {
      if (!p || !p.connected) continue;
      const touched = p.buttons.some((b) => b.pressed || b.value > 0.5) || p.axes.some((a, i) => Math.abs(a) > 0.5 && (p.mapping === 'standard' || i < 4));
      if (touched) this.activeIdx = p.index;
      const sc = (p.index === this.activeIdx ? 1000 : 0) + (p.mapping === 'standard' ? 100 : 0) + (p.buttons.length >= 10 ? 20 : 0) + (p.axes.length >= 4 ? 20 : 0) + (/xbox|dualshock|dualsense|wireless controller|gamepad|controller|054c|045e/i.test(p.id) ? 10 : 0);
      if (sc > bs) { bs = sc; best = p; }
    }
    // a device with no sticks and few buttons (keyboard / mouse / headset) is not a controller
    if (best && best.axes.length < 2 && best.buttons.length < 4) best = null;
    this.announce(best);
    return best;
  }
  /** Keeps the connected / name signals right even when the browser never fired `gamepadconnected` (it waits for a button press). */
  private announce(p: Gamepad | null): void {
    const id = p ? `${p.index}:${p.id}` : ''; if (id === this.shownId) return; this.shownId = id;
    if (p) this.onGamepadConnected({ gamepad: p } as GamepadEvent); else { this.isConnected.set(false); this.controllerName.set('No Controller Detected'); this.isDualShock.set(false); this.hasVibration.set(false); }
  }

  private static readonly NONE: GamepadControlsSnapshot = {
    connected: false, id: '', isDualShock: false, hasVibration: false, steer: 0, throttle: 0, brake: 0, handbrake: false, shiftUp: false, shiftDown: false,
    cycleCamera: false, lookBack: false, resetCar: false, toggleMap: false, toggleTelemetry: false, togglePhoto: false,
    lookX: 0, lookY: 0, indicateLeft: false, indicateRight: false, hazards: false, headlights: false, horn: false, recentreLook: false,
    toggleCars: false, cycleWeather: false, cycleQuality: false, toggleFps: false, toggleHaptics: false, toggleMute: false, toggleHelp: false, worldTools: false, garage: false, toggleRaces: false, padUp: false, padDown: false, padConfirm: false,
  };
  private shareUsed = false;
  private dz(v: number, d = this.deadzone): number { return Math.abs(v) < d ? 0 : (v - Math.sign(v) * d) / (1 - d); }

  /**
   * Standard-mapping layout (PS names; Xbox in brackets)
   *  Sticks      L: steer · R: look around (R3 recentre) · L3: horn
   *  Triggers    R2 throttle · L2 brake/reverse        Bumpers  R1 up-shift · L1 down-shift
   *  Face        Cross [A] handbrake · Circle [B] look back · Square [X] camera · Triangle [Y] reset (hold)
   *  D-Pad       Left/Right indicators · Up headlights (off/low/high) · Down hazards
   *  Options [Menu] map · Home photo mode · Share [View] = modifier layer:
   *    tap Share telemetry; Share+Up weather; Share+Down quality; Share+Left cars; Share+Right FPS;
   *    Share+Cross vibration; Share+Circle mute; Share+Square garage; Share+Triangle world tools; Share+Options help; Share+R1 races
   */
  public pollControls(): GamepadControlsSnapshot {
    const pad = this.getConnectedGamepad();
    if (!pad) return GamepadService.NONE;
    // Generic / non-standard pads (Android, Firefox, Switch, old DirectInput): triggers often arrive as axes 2 / 5 and the right stick as axes 3 / 4
    const odd = pad.mapping !== 'standard' && pad.axes.length >= 6 && pad.buttons.length < 8, trig = (v: number | undefined): number => Math.max(0, Math.min(1, ((v ?? -1) + 1) / 2));
    const b = pad.buttons, down = (i: number) => b[i]?.pressed || false;
    const edge = (i: number) => { const d = down(i), e = d && !this.lastButtons[i]; return e; };
    const share = down(8);
    const e = [] as boolean[]; for (let i = 0; i < 18; i++) e[i] = edge(i);
    const combo = (i: number) => share && e[i];
    if (combo(0) || combo(1) || combo(2) || combo(3) || combo(9) || combo(12) || combo(13) || combo(14) || combo(15) || combo(5)) this.shareUsed = true;
    const shareTap = !share && this.lastButtons[8] && !this.shareUsed; if (!share && !this.lastButtons[8]) this.shareUsed = false;
    if (!share && this.lastButtons[8]) this.shareUsed = false;

    // Left stick X steering with a gentle response curve
    const rawSteer = this.dz(pad.axes[0] || 0), steer = Math.sign(rawSteer) * Math.pow(Math.abs(rawSteer), 1.5);
    const l2 = odd ? trig(pad.axes[2]) : (b[6]?.value ?? (b[6]?.pressed ? 1 : 0)), r2 = odd ? trig(pad.axes[5]) : (b[7]?.value ?? (b[7]?.pressed ? 1 : 0));
    const out: GamepadControlsSnapshot = {
      ...GamepadService.NONE,
      connected: true, id: pad.id, isDualShock: this.isDualShock(), hasVibration: !!(pad as unknown as { vibrationActuator?: VibrationActuatorLike }).vibrationActuator,
      steer: Math.max(-1, Math.min(1, steer)), throttle: Math.max(0, Math.min(1, r2)), brake: Math.max(0, Math.min(1, l2)),
      handbrake: down(0) && !share, lookBack: down(1) && !share,
      shiftUp: e[5], shiftDown: e[4],
      cycleCamera: e[2] && !share, resetCar: down(3) && !share,
      toggleMap: e[9] && !share, togglePhoto: e[16],
      toggleTelemetry: shareTap,
      lookX: this.dz(pad.axes[odd ? 3 : 2] || 0, 0.12), lookY: this.dz(pad.axes[odd ? 4 : 3] || 0, 0.12),
      indicateLeft: e[14] && !share, indicateRight: e[15] && !share, headlights: e[12] && !share, hazards: e[13] && !share,
      horn: down(10), recentreLook: e[11],
      cycleWeather: combo(12), cycleQuality: combo(13), toggleCars: combo(14), toggleFps: combo(15),
      toggleHaptics: combo(0), toggleMute: combo(1), garage: combo(2), worldTools: combo(3), toggleHelp: combo(9), toggleRaces: combo(5), padUp: e[12] && !share, padDown: e[13] && !share, padConfirm: e[0] && !share,
    };
    for (let i = 0; i < 18; i++) this.lastButtons[i] = down(i);
    return out;
  }

  /** Cancel any rumble that is still playing. */
  public stopRumble(): void {
    for (const pad of (typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()) : [])) {
      const a = (pad as unknown as { vibrationActuator?: { reset?: () => Promise<unknown>; playEffect?: (t: string, p: object) => Promise<unknown> } } | null)?.vibrationActuator;
      if (!a) continue;
      try {
        if (typeof a.reset === 'function') a.reset().catch(() => undefined);
        else a.playEffect?.('dual-rumble', { startDelay: 0, duration: 1, weakMagnitude: 0, strongMagnitude: 0 }).catch(() => undefined);
      } catch { /* ignore */ }
    }
  }

  public playDualRumble(frame: HapticFrame): void {
    const pad = this.getConnectedGamepad();
    if (!pad) return;
    const actuator = (pad as unknown as { vibrationActuator?: VibrationActuatorLike }).vibrationActuator;
    if (actuator && typeof actuator.playEffect === 'function') {
      try {
        actuator.playEffect('dual-rumble', {
          startDelay: 0,
          duration: frame.durationMs,
          weakMagnitude: Math.min(1, Math.max(0, frame.weak)),
          strongMagnitude: Math.min(1, Math.max(0, frame.strong)),
        }).catch(() => {
          // Ignore transient gamepad busy error
        });
      } catch {
        // Fallback for non-compliant actuators
      }
    }
  }
}
