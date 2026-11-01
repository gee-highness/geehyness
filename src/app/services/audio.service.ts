import { Injectable, signal } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  readonly isMuted = signal<boolean>(false);
  readonly masterVolume = signal<number>(0.8);
  readonly engineVolume = signal<number>(0.9);
  readonly tireVolume = signal<number>(0.8);
  readonly sfxVolume = signal<number>(0.85);

  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isUnlocked = false;

  // Engine audio nodes
  private engineGain: GainNode | null = null;
  private oscSub: OscillatorNode | null = null;
  private oscMid: OscillatorNode | null = null;
  private oscHigh: OscillatorNode | null = null;
  private engineFilter: BiquadFilterNode | null = null;

  // Tire skid audio nodes
  private tireGain: GainNode | null = null;
  private tireNoiseNode: AudioBufferSourceNode | null = null;
  private tireFilter: BiquadFilterNode | null = null;

  // Surface rumble audio nodes
  private surfaceGain: GainNode | null = null;
  private surfaceNoiseNode: AudioBufferSourceNode | null = null;

  // Wind audio nodes
  private windGain: GainNode | null = null;
  private windFilter: BiquadFilterNode | null = null;

  public unlockAudio(): void {
    if (this.isUnlocked) return;
    try {
      const windowWithWebkit = window as Window & { webkitAudioContext?: typeof AudioContext };
      const AudioCtxClass = window.AudioContext || windowWithWebkit.webkitAudioContext;
      if (!AudioCtxClass) return;
      this.ctx = new AudioCtxClass();
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }

      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(this.masterVolume(), this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.setupEngineSynth();
      this.setupTireNoise();
      this.setupSurfaceNoise();
      this.setupWindNoise();

      this.isUnlocked = true;
    } catch {
      // AudioContext unavailable
    }
  }

  private setupEngineSynth(): void {
    if (!this.ctx || !this.masterGain) return;

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.01, this.ctx.currentTime);

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
    this.engineFilter.Q.setValueAtTime(3.0, this.ctx.currentTime);

    // Sub oscillator (V8/I4 low rumble drone)
    this.oscSub = this.ctx.createOscillator();
    this.oscSub.type = 'triangle';
    this.oscSub.frequency.setValueAtTime(55, this.ctx.currentTime);

    // Mid oscillator (mechanical engine block growl)
    this.oscMid = this.ctx.createOscillator();
    this.oscMid.type = 'sawtooth';
    this.oscMid.frequency.setValueAtTime(110, this.ctx.currentTime);

    // High oscillator (cam / intake rasp)
    this.oscHigh = this.ctx.createOscillator();
    this.oscHigh.type = 'sawtooth';
    this.oscHigh.frequency.setValueAtTime(220, this.ctx.currentTime);

    const subGain = this.ctx.createGain();
    subGain.gain.value = 0.5;
    const midGain = this.ctx.createGain();
    midGain.gain.value = 0.35;
    const highGain = this.ctx.createGain();
    highGain.gain.value = 0.2;

    this.oscSub.connect(subGain).connect(this.engineFilter);
    this.oscMid.connect(midGain).connect(this.engineFilter);
    this.oscHigh.connect(highGain).connect(this.engineFilter);

    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.masterGain);

    this.oscSub.start();
    this.oscMid.start();
    this.oscHigh.start();
  }

  private setupTireNoise(): void {
    if (!this.ctx || !this.masterGain) return;

    this.tireGain = this.ctx.createGain();
    this.tireGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.tireFilter = this.ctx.createBiquadFilter();
    this.tireFilter.type = 'bandpass';
    this.tireFilter.frequency.setValueAtTime(1200, this.ctx.currentTime);
    this.tireFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    // Procedural white noise buffer
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.tireNoiseNode = this.ctx.createBufferSource();
    this.tireNoiseNode.buffer = buffer;
    this.tireNoiseNode.loop = true;

    this.tireNoiseNode.connect(this.tireFilter);
    this.tireFilter.connect(this.tireGain);
    this.tireGain.connect(this.masterGain);

    this.tireNoiseNode.start();
  }

  private setupSurfaceNoise(): void {
    if (!this.ctx || !this.masterGain) return;

    this.surfaceGain = this.ctx.createGain();
    this.surfaceGain.gain.setValueAtTime(0, this.ctx.currentTime);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, this.ctx.currentTime);

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    this.surfaceNoiseNode = this.ctx.createBufferSource();
    this.surfaceNoiseNode.buffer = buffer;
    this.surfaceNoiseNode.loop = true;

    this.surfaceNoiseNode.connect(filter);
    filter.connect(this.surfaceGain);
    this.surfaceGain.connect(this.masterGain);

    this.surfaceNoiseNode.start();
  }

  private setupWindNoise(): void {
    if (!this.ctx || !this.masterGain) return;

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.windFilter = this.ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.setValueAtTime(300, this.ctx.currentTime);

    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const windSource = this.ctx.createBufferSource();
    windSource.buffer = buffer;
    windSource.loop = true;

    windSource.connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.masterGain);

    windSource.start();
  }

  /**
   * Updates real-time synthesized engine audio tied to physics RPM, throttle, and speed.
   */
  public updateEngineAudio(rpm: number, throttle: number, speedKmh: number, maxRpm: number): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted()) return;

    const t = this.ctx.currentTime;
    const normRpm = Math.max(0.1, Math.min(1.0, rpm / maxRpm));

    // Base engine fundamental frequency
    const baseFreq = 30 + normRpm * 130; // 30Hz idle to 160Hz redline fundamental
    if (this.oscSub) this.oscSub.frequency.setTargetAtTime(baseFreq, t, 0.05);
    if (this.oscMid) this.oscMid.frequency.setTargetAtTime(baseFreq * 2.0, t, 0.05);
    if (this.oscHigh) this.oscHigh.frequency.setTargetAtTime(baseFreq * 3.5, t, 0.05);

    // Resonant intake filter opens with throttle and RPM
    if (this.engineFilter) {
      const cutoff = 400 + throttle * 2800 + normRpm * 3200;
      this.engineFilter.frequency.setTargetAtTime(cutoff, t, 0.04);
    }

    // Engine volume scales with throttle load
    if (this.engineGain) {
      const vol = (0.2 + throttle * 0.6 + normRpm * 0.2) * this.engineVolume();
      this.engineGain.gain.setTargetAtTime(vol, t, 0.04);
    }

    // Wind noise rises exponentially with speed
    if (this.windGain && this.windFilter) {
      const windVol = Math.pow(Math.min(1, speedKmh / 220), 2.2) * 0.45;
      this.windGain.gain.setTargetAtTime(windVol, t, 0.1);
      this.windFilter.frequency.setTargetAtTime(200 + speedKmh * 8, t, 0.1);
    }
  }

  /**
   * Updates tire slip squeal noise.
   */
  public updateTireAudio(maxSlipAngleDeg: number, isSkidding: boolean, speedKmh: number): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.tireGain) return;

    const t = this.ctx.currentTime;
    if (speedKmh > 10 && (isSkidding || maxSlipAngleDeg > 12)) {
      const intensity = Math.min(1.0, (maxSlipAngleDeg - 10) / 25);
      const vol = intensity * 0.6 * this.tireVolume();
      this.tireGain.gain.setTargetAtTime(vol, t, 0.04);

      if (this.tireFilter) {
        this.tireFilter.frequency.setTargetAtTime(900 + intensity * 800, t, 0.04);
      }
    } else {
      this.tireGain.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  /**
   * Updates surface chatter (gravel, dirt, grass).
   */
  public updateSurfaceAudio(surfaceClass: number, speedKmh: number): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.surfaceGain) return;

    const t = this.ctx.currentTime;
    // Classes 1, 4, 7, 10 are dirt/gravel/sand
    const isRough = [1, 4, 6, 7, 10, 12].includes(surfaceClass);
    if (isRough && speedKmh > 15) {
      const vol = Math.min(0.5, (speedKmh / 150) * 0.4);
      this.surfaceGain.gain.setTargetAtTime(vol, t, 0.05);
    } else {
      this.surfaceGain.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  /** Car horn: two detuned square tones (a "two-tone" horn), held while `on`. */
  private hornNodes: { o: OscillatorNode[]; g: GainNode } | null = null;
  public setHorn(on: boolean): void {
    if (!this.ctx || !this.isUnlocked || !this.masterGain) return;
    if (on && !this.hornNodes && !this.isMuted()) {
      const g = this.ctx.createGain(), f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2200;
      const o = [392, 494].map((hz) => { const x = this.ctx!.createOscillator(); x.type = 'square'; x.frequency.value = hz; x.connect(f); x.start(); return x; });
      g.gain.setValueAtTime(0, this.ctx.currentTime); g.gain.linearRampToValueAtTime(0.16, this.ctx.currentTime + 0.03);
      f.connect(g); g.connect(this.masterGain); this.hornNodes = { o, g };
    } else if (!on && this.hornNodes) {
      const { o, g } = this.hornNodes; this.hornNodes = null; const t = this.ctx.currentTime;
      g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(g.gain.value, t); g.gain.linearRampToValueAtTime(0, t + 0.06); o.forEach((x) => x.stop(t + 0.08));
    }
  }

  /** Indicator relay: a short click, higher on the "on" edge. */
  public playIndicatorTick(on: boolean): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.masterGain) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'square'; o.frequency.value = on ? 1900 : 1500; g.gain.setValueAtTime(0.05, t); g.gain.exponentialRampToValueAtTime(0.0005, t + 0.035);
    o.connect(g); g.connect(this.masterGain); o.start(t); o.stop(t + 0.04);
  }

  /**
   * Exhaust backfire pop & bang on deceleration.
   */
  public playBackfirePop(): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.masterGain) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140 + Math.random() * 80, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.12);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, t);

      gain.gain.setValueAtTime(0.7 * this.sfxVolume(), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.14);

      osc.connect(filter).connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.15);
    } catch {
      return;
    }
  }

  /**
   * Gear shift mechanical clunk.
   */
  public playGearShift(): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.masterGain) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(180, t);
      osc.frequency.exponentialRampToValueAtTime(60, t + 0.08);

      gain.gain.setValueAtTime(0.4 * this.sfxVolume(), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.09);
    } catch {
      return;
    }
  }

  /**
   * Collision impact clatter.
   */
  public playCollision(impulse: number): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.masterGain) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(120, t);
      osc.frequency.exponentialRampToValueAtTime(30, t + 0.25);

      const vol = Math.min(0.9, impulse * 0.8) * this.sfxVolume();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.25);

      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.26);
    } catch {
      return;
    }
  }

  /**
   * Speed camera radar flash beep.
   */
  public playSpeedTrapChirp(): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.masterGain) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1800, t);
      osc.frequency.setValueAtTime(2400, t + 0.08);

      gain.gain.setValueAtTime(0.35 * this.sfxVolume(), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.2);

      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.2);
    } catch {
      return;
    }
  }

  /**
   * Checkpoint chime.
   */
  public playCheckpointChime(): void {
    if (!this.ctx || !this.isUnlocked || this.isMuted() || !this.masterGain) return;

    try {
      const t = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, t); // A5
      osc.frequency.setValueAtTime(1174.66, t + 0.08); // D6

      gain.gain.setValueAtTime(0.4 * this.sfxVolume(), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

      osc.connect(gain).connect(this.masterGain);
      osc.start(t);
      osc.stop(t + 0.36);
    } catch {
      return;
    }
  }
}
