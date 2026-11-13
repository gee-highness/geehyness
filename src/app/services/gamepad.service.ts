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

interface Ctl { kind: 'axis' | 'btn'; i: number; rest: number; dir: 1 | -1 }
interface PadMap { steer?: Ctl; throttle?: Ctl; brake?: Ctl; handbrake?: Ctl }
interface Layout { lx: number; ly: number; rx: number; ry: number; l2: number; r2: number; hat: number; hx: number; hy: number; wheel: boolean; trig: number[] }

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
      // Only a standard-mapped pad can be "touched" by its sticks: raw Steam Controller / HID devices rest at odd axis values and would hijack the choice
      const touched = p.buttons.some((b) => b.pressed || b.value > 0.5) || (p.mapping === 'standard' && p.axes.some((a) => Math.abs(a) > 0.5));
      if (touched) this.activeIdx = p.index;
      const sc = (p.index === this.activeIdx ? 1000 : 0) + (p.mapping === 'standard' ? 300 : 0) + (p.buttons.length >= 10 ? 20 : 0) + (p.axes.length >= 4 ? 20 : 0) + (/xbox|dualshock|dualsense|wireless controller|gamepad|controller|054c|045e/i.test(p.id) ? 10 : 0);
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

  // ---------- any controller: auto layout detection, saved custom map, guided setup ----------
  private rest = new Map<string, number[]>();
  private layouts = new Map<string, Layout>();
  /** Saved per-device maps (localStorage), made by the F2 setup. */
  private maps: Record<string, PadMap> = (() => { try { return JSON.parse(localStorage.getItem('shesha.padmap') ?? '{}'); } catch { return {}; } })();
  readonly learn = signal<{ step: number; prompt: string; done: string[] } | null>(null);
  private learnBase: { axes: number[]; btn: number[] } | null = null; private learnT = 0; private learnWait = false;
  private static readonly STEPS: { key: 'steer' | 'throttle' | 'brake' | 'handbrake'; prompt: string }[] = [
    { key: 'steer', prompt: 'Turn the wheel / left stick fully LEFT and hold it' },
    { key: 'throttle', prompt: 'Press and hold ACCELERATE (trigger, pedal or any button)' },
    { key: 'brake', prompt: 'Press and hold BRAKE / REVERSE' },
    { key: 'handbrake', prompt: 'Press the HANDBRAKE button' },
  ];
  hasCustomMap(): boolean { const p = this.getConnectedGamepad(); return !!p && !!this.maps[p.id]; }
  startLearn(): void { this.learn.set({ step: 0, prompt: GamepadService.STEPS[0].prompt, done: [] }); this.learnBase = null; this.learnT = performance.now(); this.learnWait = false; }
  cancelLearn(): void { this.learn.set(null); this.learnBase = null; }
  resetMap(): void { const p = this.getConnectedGamepad(); if (p) { delete this.maps[p.id]; this.saveMaps(); } this.layouts.clear(); }
  private saveMaps(): void { try { localStorage.setItem('shesha.padmap', JSON.stringify(this.maps)); } catch { /* private mode */ } }

  /** One frame of the setup wizard: watches for the biggest change in any axis / button. */
  private learnTick(pad: Gamepad): void {
    const L = this.learn(); if (!L) return; const now = performance.now();
    if (!this.learnBase) { if (now - this.learnT > 500) this.learnBase = { axes: Array.from(pad.axes), btn: pad.buttons.map((x) => x.value) }; return; }
    const base = this.learnBase, st = GamepadService.STEPS[L.step], m = (this.maps[pad.id] ??= {});
    const dAx = pad.axes.map((a, i) => (a - (base.axes[i] ?? 0)));
    if (this.learnWait) { if (dAx.every((d) => Math.abs(d) < 0.25) && pad.buttons.every((x) => !x.pressed)) { this.learnWait = false; this.learnBase = null; this.learnT = now; } return; }   // wait for release before the next step
    let hit: { kind: 'axis' | 'btn'; i: number; rest: number; dir: 1 | -1 } | null = null;
    let bi = -1, bd = 0.5; dAx.forEach((d, i) => { if (Math.abs(d) > bd && !(this.isHat(base.axes[i]))) { bd = Math.abs(d); bi = i; } });
    const bt = pad.buttons.findIndex((x, i) => x.pressed && (base.btn[i] ?? 0) < 0.3);
    if (st.key === 'steer') { if (bi >= 0) hit = { kind: 'axis', i: bi, rest: base.axes[bi], dir: dAx[bi] < 0 ? 1 : -1 }; }       // left must read negative
    else if (bt >= 0 && (bi < 0 || st.key === 'handbrake')) hit = { kind: 'btn', i: bt, rest: 0, dir: 1 };
    else if (bi >= 0 && bi !== m.steer?.i) hit = { kind: 'axis', i: bi, rest: base.axes[bi], dir: dAx[bi] > 0 ? 1 : -1 };
    if (!hit) return;
    (m as Record<string, unknown>)[st.key] = hit; this.saveMaps();
    const done = [...L.done, st.key], next = L.step + 1;
    if (next >= GamepadService.STEPS.length) { this.learn.set({ step: next, prompt: 'All set. Drive!', done }); setTimeout(() => this.learn()?.step === next && this.learn.set(null), 1400); this.learnBase = null; return; }
    this.learn.set({ step: next, prompt: GamepadService.STEPS[next].prompt, done }); this.learnWait = true;
  }
  private readCtl(pad: Gamepad, c: Ctl): number {
    if (c.kind === 'btn') return pad.buttons[c.i]?.value ?? (pad.buttons[c.i]?.pressed ? 1 : 0);
    const v = pad.axes[c.i] ?? c.rest, range = Math.abs(c.rest) > 0.9 ? 2 : 1;
    return Math.max(0, Math.min(1, ((v - c.rest) * c.dir) / range));
  }
  /** Axis as -1..1 with 0 at rest and "left" negative (dir from the learn step). */
  private readSigned(pad: Gamepad, c: Ctl): number { if (c.kind === 'btn') return 0; const v = (pad.axes[c.i] ?? c.rest) - c.rest; return Math.max(-1, Math.min(1, v * c.dir)); }
  private isHat(v: number | undefined): boolean { return v !== undefined && Math.abs(v) > 1.05; }

  /** Works out where sticks / triggers / D-pad live on a pad whose mapping is not "standard" (Firefox, Android, DirectInput, wheels, Steam raw...). */
  private layoutFor(pad: Gamepad): Layout {
    const key = `${pad.index}:${pad.id}`, hit = this.layouts.get(key); if (hit) return hit;
    const rest = this.rest.get(key) ?? (this.rest.set(key, Array.from(pad.axes)), this.rest.get(key)!);
    const trig: number[] = [], stick: number[] = []; let hat = -1;
    rest.forEach((r, i) => { if (Math.abs(r) > 1.05) hat = i; else if (Math.abs(r) > 0.9) trig.push(i); else stick.push(i); });
    const wheel = /wheel|g29|g920|g923|g27|g25|t150|t300|tx racing|fanatec|driving force|momo|speedlink|moza|simagic/i.test(pad.id);
    const L: Layout = { lx: stick[0] ?? 0, ly: stick[1] ?? 1, rx: -1, ry: -1, l2: -1, r2: -1, hat, hx: -1, hy: -1, wheel, trig };
    if (!wheel) { if (stick.length >= 4) { L.rx = stick[2]; L.ry = stick[3]; } if (stick.length >= 6) { L.hx = stick[4]; L.hy = stick[5]; } if (trig.length >= 2) { L.l2 = trig[0]; L.r2 = trig[1]; } }
    else { L.lx = stick[0] ?? 0; if (trig.length >= 2) { L.r2 = trig[trig.length - 2]; L.l2 = trig[trig.length - 1]; } }
    this.layouts.set(key, L); return L;
  }

  /** Normalised view of any pad: the four stick axes, triggers 0..1 and 18 standard-ordered button states. */
  private view(pad: Gamepad): { lx: number; ly: number; rx: number; ry: number; l2: number; r2: number; btn: boolean[]; val: number[] } {
    const btn: boolean[] = [], val: number[] = []; for (let i = 0; i < 18; i++) { btn[i] = pad.buttons[i]?.pressed ?? false; val[i] = pad.buttons[i]?.value ?? (btn[i] ? 1 : 0); }
    if (pad.mapping === 'standard') return { lx: pad.axes[0] || 0, ly: pad.axes[1] || 0, rx: pad.axes[2] || 0, ry: pad.axes[3] || 0, l2: val[6], r2: val[7], btn, val };
    const L = this.layoutFor(pad), ax = (i: number) => (i >= 0 ? pad.axes[i] || 0 : 0), rest = this.rest.get(`${pad.index}:${pad.id}`) ?? [];
    const trig = (i: number) => (i < 0 ? 0 : Math.max(0, Math.min(1, ((pad.axes[i] ?? rest[i] ?? -1) - (rest[i] ?? -1)) * (rest[i] > 0 ? -1 : 1) / 2)));
    let l2 = L.l2 >= 0 ? trig(L.l2) : val[6], r2 = L.r2 >= 0 ? trig(L.r2) : val[7];
    // D-pad: Chrome hat axis (one value per direction) or two plain axes (Firefox)
    if (!pad.buttons[12] || (pad.buttons.length < 14)) {
      let u = false, d = false, l = false, r = false;
      if (L.hat >= 0) { const h = pad.axes[L.hat], dirs = [-1, -0.714, -0.428, -0.143, 0.143, 0.428, 0.714, 1], k = dirs.findIndex((x) => Math.abs(h - x) < 0.1); if (k >= 0) { u = k === 0 || k === 1 || k === 7; r = k >= 1 && k <= 3; d = k >= 3 && k <= 5; l = k >= 5; } }
      else if (L.hx >= 0) { l = ax(L.hx) < -0.5; r = ax(L.hx) > 0.5; u = ax(L.hy) < -0.5; d = ax(L.hy) > 0.5; }
      btn[12] = u; btn[13] = d; btn[14] = l; btn[15] = r;
    }
    btn[6] = l2 > 0.5 || btn[6]; btn[7] = r2 > 0.5 || btn[7]; val[6] = l2; val[7] = r2;
    return { lx: ax(L.lx), ly: ax(L.ly), rx: L.rx >= 0 ? ax(L.rx) : (pad.axes.length >= 4 && !L.wheel ? ax(2) : 0), ry: L.ry >= 0 ? ax(L.ry) : (pad.axes.length >= 4 && !L.wheel ? ax(3) : 0), l2, r2, btn, val };
  }
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
    if (this.learn()) this.learnTick(pad);
    const v = this.view(pad), down = (i: number) => v.btn[i] || false;
    const edge = (i: number) => { const d = down(i), e = d && !this.lastButtons[i]; return e; };
    const share = down(8);
    const e = [] as boolean[]; for (let i = 0; i < 18; i++) e[i] = edge(i);
    const combo = (i: number) => share && e[i];
    if (combo(0) || combo(1) || combo(2) || combo(3) || combo(9) || combo(12) || combo(13) || combo(14) || combo(15) || combo(5)) this.shareUsed = true;
    const shareTap = !share && this.lastButtons[8] && !this.shareUsed; if (!share && !this.lastButtons[8]) this.shareUsed = false;
    if (!share && this.lastButtons[8]) this.shareUsed = false;

    // Left stick X steering with a gentle response curve
    const rawSteer = this.dz(v.lx), steer = Math.sign(rawSteer) * Math.pow(Math.abs(rawSteer), 1.5);
    const l2 = v.l2, r2 = v.r2;
    const out: GamepadControlsSnapshot = {
      ...GamepadService.NONE,
      connected: true, id: pad.id, isDualShock: this.isDualShock(), hasVibration: !!(pad as unknown as { vibrationActuator?: VibrationActuatorLike }).vibrationActuator,
      steer: Math.max(-1, Math.min(1, steer)), throttle: Math.max(0, Math.min(1, r2)), brake: Math.max(0, Math.min(1, l2)),
      handbrake: down(0) && !share, lookBack: down(1) && !share,
      shiftUp: e[5], shiftDown: e[4],
      cycleCamera: e[2] && !share, resetCar: down(3) && !share,
      toggleMap: e[9] && !share, togglePhoto: e[16],
      toggleTelemetry: shareTap,
      lookX: this.dz(v.rx, 0.12), lookY: this.dz(v.ry, 0.12),
      indicateLeft: e[14] && !share, indicateRight: e[15] && !share, headlights: e[12] && !share, hazards: e[13] && !share,
      horn: down(10), recentreLook: e[11],
      cycleWeather: combo(12), cycleQuality: combo(13), toggleCars: combo(14), toggleFps: combo(15),
      toggleHaptics: combo(0), toggleMute: combo(1), garage: combo(2), worldTools: combo(3), toggleHelp: combo(9), toggleRaces: combo(5), padUp: e[12] && !share, padDown: e[13] && !share, padConfirm: e[0] && !share,
    };
    // a saved custom map (F2 setup) overrides steering / pedals / handbrake
    const m = this.maps[pad.id];
    if (m && !this.learn()) {
      if (m.steer) { const r = this.readSigned(pad, m.steer); out.steer = Math.sign(r) * Math.pow(Math.abs(this.dz(r)), 1.5); }
      if (m.throttle) out.throttle = this.readCtl(pad, m.throttle);
      if (m.brake) out.brake = this.readCtl(pad, m.brake);
      if (m.handbrake) out.handbrake = this.readCtl(pad, m.handbrake) > 0.5 && !share;
    }
    if (this.learn()) { out.steer = 0; out.throttle = 0; out.brake = 0; out.handbrake = false; }   // the car stays still while you set up
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
