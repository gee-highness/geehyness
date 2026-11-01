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

  public getConnectedGamepad(): Gamepad | null {
    if (typeof navigator === 'undefined' || !navigator.getGamepads) return null;
    const pads = navigator.getGamepads();
    for (const p of pads) {
      if (p && p.connected) return p;
    }
    return null;
  }

  public pollControls(): GamepadControlsSnapshot {
    const pad = this.getConnectedGamepad();
    if (!pad) {
      return {
        connected: false,
        id: '',
        isDualShock: false,
        hasVibration: false,
        steer: 0,
        throttle: 0,
        brake: 0,
        handbrake: false,
        shiftUp: false,
        shiftDown: false,
        cycleCamera: false,
        lookBack: false,
        resetCar: false,
        toggleMap: false,
        toggleTelemetry: false,
        togglePhoto: false,
      };
    }

    // Left Stick X (axis 0)
    let rawSteer = pad.axes[0] || 0;
    if (Math.abs(rawSteer) < this.deadzone) rawSteer = 0;
    else rawSteer = (rawSteer - Math.sign(rawSteer) * this.deadzone) / (1 - this.deadzone);

    // Apply quadratic response curve for fine center control with rapid full-lock
    const steer = Math.sign(rawSteer) * Math.pow(Math.abs(rawSteer), 1.5);

    // Standard Mapping:
    // Buttons: 0: Cross, 1: Circle, 2: Square, 3: Triangle
    // 4: L1, 5: R1, 6: L2 (analog), 7: R2 (analog)
    // 8: Share, 9: Options, 10: L3, 11: R3
    // 12: D-Up, 13: D-Down, 14: D-Left, 15: D-Right
    const b = pad.buttons;
    const cross = b[0]?.pressed || false;
    const circle = b[1]?.pressed || false;
    const square = b[2]?.pressed || false;
    const triangle = b[3]?.pressed || false;
    const l1 = b[4]?.pressed || false;
    const r1 = b[5]?.pressed || false;
    const l2 = b[6]?.value ?? (b[6]?.pressed ? 1 : 0);
    const r2 = b[7]?.value ?? (b[7]?.pressed ? 1 : 0);
    const options = b[9]?.pressed || false;
    const dUp = b[12]?.pressed || false;
    const dDown = b[13]?.pressed || false;

    // Edge triggers for toggles
    const cycleCamera = square && !this.lastButtons[2];
    const toggleMap = options && !this.lastButtons[9];
    const toggleTelemetry = dUp && !this.lastButtons[12];
    const togglePhoto = dDown && !this.lastButtons[13];
    const shiftUp = r1 && !this.lastButtons[5];
    const shiftDown = l1 && !this.lastButtons[4];

    this.lastButtons[2] = square;
    this.lastButtons[9] = options;
    this.lastButtons[12] = dUp;
    this.lastButtons[13] = dDown;
    this.lastButtons[5] = r1;
    this.lastButtons[4] = l1;

    return {
      connected: true,
      id: pad.id,
      isDualShock: this.isDualShock(),
      hasVibration: !!(pad as unknown as { vibrationActuator?: VibrationActuatorLike }).vibrationActuator,
      steer: Math.max(-1, Math.min(1, steer)),
      throttle: Math.max(0, Math.min(1, r2)),
      brake: Math.max(0, Math.min(1, l2)),
      handbrake: cross,
      shiftUp,
      shiftDown,
      cycleCamera,
      lookBack: circle,
      resetCar: triangle,
      toggleMap,
      toggleTelemetry,
      togglePhoto,
    };
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
