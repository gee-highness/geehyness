import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  input,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TelemetryService } from '../../services/telemetry.service';
import { GamepadService } from '../../services/gamepad.service';
import { FestivalService } from '../../services/festival.service';
import { AudioService } from '../../services/audio.service';
import { EnvironmentService } from '../../services/environment.service';
import type { WorldBuilder } from '../../game/graphics/world-builder';
import { HapticsService } from '../../services/haptics.service';
import { WorldPipelineService } from '../../services/world-pipeline.service';

@Component({
  selector: 'app-hud',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .hud-card{background:linear-gradient(160deg,rgba(24,24,27,.72),rgba(9,9,11,.6));backdrop-filter:blur(14px) saturate(1.3);border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 12px 40px rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.08)}
    .rail-btn{position:relative;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;cursor:pointer;transition:background .15s,transform .15s}
    .rail-btn:hover{background:rgba(255,255,255,.12);transform:scale(1.06)}
    .rail-btn:focus-visible{outline:2px solid #fbbf24}
    .compact .rail-btn{width:34px;height:34px}
    .compact .rail-tip{display:none}
    .rail-tip{position:absolute;right:54px;white-space:nowrap;background:rgba(9,9,11,.92);border:1px solid rgba(255,255,255,.12);padding:6px 10px;border-radius:8px;font-size:11px;font-weight:600;opacity:0;transform:translateX(6px);pointer-events:none;transition:.15s}
    .rail-btn:hover .rail-tip,.rail-btn:focus-visible .rail-tip{opacity:1;transform:none}
    kbd{display:inline-block;margin:0 2px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);font:600 10px ui-monospace,monospace;color:#fde68a}
    .banner-in{animation:bin .45s cubic-bezier(.2,1.4,.4,1)}
    @keyframes bin{from{opacity:0;transform:translate(-50%,-14px) scale(.9)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
    .hint-fade{animation:hf 14s forwards}
    @keyframes hf{0%,80%{opacity:1}100%{opacity:0}}
  `],
  template: `
    <div class="absolute inset-0 pointer-events-none select-none overflow-hidden font-sans text-white">
      <!-- Top-left: location card -->
      <div class="absolute top-4 left-4 pointer-events-auto hud-card px-4 py-2.5 flex items-center gap-3">
        <div class="w-9 h-9 rounded-lg bg-gradient-to-br from-amber-400 to-orange-600 grid place-items-center font-black text-zinc-950 text-sm shadow-lg">SH</div>
        <div class="leading-tight">
          <div class="text-[10px] uppercase tracking-[0.2em] text-amber-300/90 font-bold">{{ currentDistrictName() }}</div>
          <div class="text-[11px] text-zinc-400 font-mono">{{ gpsCoordinates() }}</div>
        </div>
      </div>

      <!-- Top-right: time / weather / input -->
      <div class="absolute top-3 right-3 sm:top-4 sm:right-4 pointer-events-auto hud-card px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-3 sm:gap-4 text-xs">
        <div class="flex items-center gap-1.5"><mat-icon class="text-amber-300 !text-base">schedule</mat-icon><span class="font-mono font-semibold">{{ formatTimeOfDay() }}</span></div>
        <div class="flex items-center gap-1.5"><mat-icon class="text-sky-300 !text-base">{{ getWeatherIcon() }}</mat-icon><span class="capitalize" [class.hidden]="compact()">{{ envService.weather().toLowerCase().replace('_', ' ') }}</span></div>
        <div class="hidden md:flex items-center gap-1.5" [class.text-emerald-300]="gamepadService.isConnected()" [class.text-zinc-500]="!gamepadService.isConnected()">
          <mat-icon class="!text-base">sports_esports</mat-icon>
          <span>{{ gamepadService.isConnected() ? (gamepadService.isDualShock() ? 'DualShock 4' : 'Controller') : 'Keyboard' }}</span>
        </div>
      </div>

      <!-- Event banner -->
      @if (festivalService.activeNotification(); as notif) {
        <div class="absolute left-1/2 -translate-x-1/2 top-5 banner-in px-8 py-2.5 rounded-2xl text-center text-zinc-950 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-400 shadow-[0_10px_40px_rgba(251,146,60,.5)]">
          <div class="text-[10px] tracking-[0.25em] uppercase font-bold opacity-70">{{ notif.title }}</div>
          <div class="text-2xl font-black tracking-tight leading-none my-0.5">{{ notif.scoreText }}</div>
          <div class="text-[11px] font-semibold">{{ notif.subText }}</div>
        </div>
      }

      <!-- Drift pill -->
      @if (telemetryService.telemetry().isDrifting || festivalService.inDriftZone()) {
        <div class="absolute top-24 left-1/2 -translate-x-1/2 banner-in px-6 py-2 rounded-full text-center bg-gradient-to-r from-cyan-500 to-blue-600 border border-cyan-200/60 shadow-[0_8px_30px_rgba(34,211,238,.45)]">
          <div class="text-[10px] tracking-[0.2em] uppercase text-cyan-100 font-bold">{{ festivalService.inDriftZone() ? 'Drift zone' : 'Drift' }} · {{ telemetryService.telemetry().driftAngleDeg }}°</div>
          <div class="text-2xl font-black font-mono tabular-nums">{{ (festivalService.inDriftZone() ? festivalService.currentDriftZoneScore() : telemetryService.telemetry().driftScoreSession) | number:'1.0-0' }} <span class="text-sm">PTS</span></div>
        </div>
      }

      <!-- Right rail: actions -->
      <nav class="absolute pointer-events-auto hud-card p-1.5 flex gap-1" [ngClass]="compact() ? 'top-3 left-1/2 -translate-x-1/2 flex-row compact' : 'right-4 top-1/2 -translate-y-1/2 flex-col'" aria-label="Game menu">
        @for (b of actions; track b.id) {
          <button (click)="fire(b.id)" class="rail-btn group" [attr.aria-label]="b.label">
            <mat-icon [class]="b.color + ' !text-[22px]'">{{ b.icon }}</mat-icon>
            <span class="rail-tip">{{ b.label }} <kbd>{{ b.key }}</kbd></span>
          </button>
        }
        <button (click)="hapticsService.setEnabled(!hapticsService.enabled())" class="rail-btn group" aria-label="Toggle controller vibration">
          <mat-icon class="!text-[22px]" [class.text-zinc-500]="!hapticsService.enabled()" [class.text-emerald-300]="hapticsService.enabled()">{{ hapticsService.enabled() ? 'vibration' : 'phonelink_erase' }}</mat-icon>
          <span class="rail-tip">Vibration {{ hapticsService.enabled() ? 'on' : 'off' }} <kbd>H</kbd></span>
        </button>
        <button (click)="toggleAudio()" class="rail-btn group" aria-label="Toggle sound">
          <mat-icon class="!text-[22px]" [class.text-red-400]="audioService.isMuted()" [class.text-zinc-300]="!audioService.isMuted()">{{ audioService.isMuted() ? 'volume_off' : 'volume_up' }}</mat-icon>
          <span class="rail-tip">{{ audioService.isMuted() ? 'Unmute' : 'Mute' }} <kbd>N</kbd></span>
        </button>
      </nav>

      <!-- Bottom-left: live rotating minimap -->
      <div class="absolute pointer-events-auto hud-card p-1.5" [ngClass]="compact() ? 'top-[68px] left-3 w-[96px]' : 'bottom-5 left-5 w-[168px] max-sm:w-[120px]'">
        <canvas #minimapCanvas width="288" height="288" class="w-full aspect-square rounded-xl"></canvas>
      </div>

      <!-- Bottom-right: gauge cluster -->
      <div class="absolute pointer-events-none" [ngClass]="compact() ? 'bottom-2 left-1/2 -translate-x-1/2' : 'bottom-5 right-20 max-sm:right-16'">
        <div class="relative" [ngClass]="compact() ? 'w-[150px] h-[150px]' : 'w-[250px] h-[250px] max-sm:w-[190px] max-sm:h-[190px]'">
          <canvas #gaugeCanvas width="500" height="500" class="absolute inset-0 w-full h-full"></canvas>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <div class="text-[64px] max-sm:text-[46px] leading-none font-black tabular-nums tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,.6)]" [class.!text-[38px]]="compact()">{{ telemetryService.speedKmh() }}</div>
            <div class="text-[11px] font-bold tracking-[0.3em] text-zinc-300 -mt-0.5">KM/H</div>
            <div class="mt-2 flex items-baseline gap-1"><span class="text-3xl max-sm:text-xl font-black text-amber-300">{{ telemetryService.currentGear() }}</span><span class="text-[10px] text-zinc-400 font-bold">GEAR</span></div>
            <div class="text-[10px] text-emerald-300 font-semibold mt-1 max-w-[120px] truncate">{{ telemetryService.currentSurface() }}</div>
          </div>
        </div>
      </div>

      <!-- Bottom-centre: contextual hint (fades) -->
      @if (hintVisible()) {
        <div class="absolute bottom-5 left-1/2 -translate-x-1/2 hint-fade hud-card px-4 py-2 text-[11px] text-zinc-300 flex items-center gap-3 max-md:hidden">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> drive</span><span><kbd>Space</kbd> handbrake</span><span><kbd>C</kbd> camera</span><span><kbd>R</kbd> reset</span><span><kbd>M</kbd> map</span>
        </div>
      }
    </div>
  `
})
export class HudComponent {
  public telemetryService = inject(TelemetryService);
  public gamepadService = inject(GamepadService);
  public festivalService = inject(FestivalService);
  public audioService = inject(AudioService);
  public envService = inject(EnvironmentService);
  public worldPipeline = inject(WorldPipelineService);
  public hapticsService = inject(HapticsService);
  compact = input<boolean>(false);

  @ViewChild('minimapCanvas', { static: false }) minimapCanvasRef!: ElementRef<HTMLCanvasElement>;

  // Outputs for opening modals / cycling modes
  openMap = output<void>();
  openCars = output<void>();
  openTuning = output<void>();
  toggleTelemetry = output<void>();
  openPhotoMode = output<void>();
  cycleCamera = output<void>();
  openPipeline = output<void>();

  readonly currentDistrictName = signal<string>('Manzini Centre');
  readonly gpsCoordinates = signal<string>('31.36° E, -26.48° S');
  readonly hintVisible = signal<boolean>(true);
  @ViewChild('gaugeCanvas', { static: false }) gaugeCanvasRef!: ElementRef<HTMLCanvasElement>;

  readonly actions = [
    { id: 'cars', label: 'Choose car', key: 'V', icon: 'directions_car', color: 'text-rose-300' },
    { id: 'map', label: 'Map', key: 'M', icon: 'map', color: 'text-amber-300' },
    { id: 'garage', label: 'Garage', key: 'G', icon: 'tune', color: 'text-cyan-300' },
    { id: 'telemetry', label: 'Telemetry', key: 'T', icon: 'query_stats', color: 'text-emerald-300' },
    { id: 'photo', label: 'Photo mode', key: 'P', icon: 'photo_camera', color: 'text-fuchsia-300' },
    { id: 'cam', label: 'Camera', key: 'C', icon: 'videocam', color: 'text-zinc-200' },
    { id: 'pipeline', label: 'World tools', key: 'O', icon: 'account_tree', color: 'text-yellow-300' },
  ];

  /** Highway centreline (world x,z) pushed by the app for the live minimap. */
  public world?: WorldBuilder;
  private near: { c: number; pts: number[] }[] = [];
  private nearX = 1e9; private nearZ = 1e9;
  private poseX = 0; private poseZ = 0; private poseYaw = 0;
  private smoothRpm = 0;

  constructor() {
    setTimeout(() => this.hintVisible.set(false), 14000);
  }

  public fire(id: string): void {
    switch (id) {
      case 'cars': this.openCars.emit(); break;
      case 'map': this.openMap.emit(); break;
      case 'garage': this.openTuning.emit(); break;
      case 'telemetry': this.toggleTelemetry.emit(); break;
      case 'photo': this.openPhotoMode.emit(); break;
      case 'cam': this.cycleCamera.emit(); break;
      case 'pipeline': this.openPipeline.emit(); break;
    }
  }

  public updateDistrictAndGps(x: number, z: number, yaw = 0): void {
    this.poseX = x; this.poseZ = z; this.poseYaw = yaw;
    const gps = this.worldPipeline.worldToGps(x, z);
    const txt = `${gps[0]}° E, ${gps[1]}° S`;
    if (txt !== this.gpsCoordinates()) this.gpsCoordinates.set(txt);

    const d = this.world?.ready ? this.world.districtAt(x, z) : 'Manzini';
    if (d !== this.currentDistrictName()) this.currentDistrictName.set(d);

    this.drawMinimap();
    this.drawGauge();
  }

  /** Heading-up minimap: real MR3 route, player fixed at the centre-bottom. */
  public drawMinimap(): void {
    if (!this.minimapCanvasRef) return;
    const c = this.minimapCanvasRef.nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, cx = W / 2, cy = W * 0.62, scale = 0.42; // px per metre
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    const g = ctx.createRadialGradient(cx, W / 2, 10, cx, W / 2, W / 2);
    g.addColorStop(0, '#1f2a24'); g.addColorStop(1, '#0b100d');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, W);
    ctx.translate(cx, cy);
    ctx.rotate(-this.poseYaw); // sim forward (+Z when yaw=0) points up the map
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (this.world?.ready && Math.hypot(this.poseX - this.nearX, this.poseZ - this.nearZ) > 40) {
      this.near = this.world.nearbyRoads(this.poseX, this.poseZ, 420); this.nearX = this.poseX; this.nearZ = this.poseZ;
    }
    const WID = [20, 16, 15, 14, 12, 9, 6, 6, 3, 5];
    const COL = ['#fbbf24', '#fbbf24', '#f59e0b', '#e5e7eb', '#d4d4d8', '#a1a1aa', '#71717a', '#78716c', '#52525b', '#38bdf8'];
    const order = [...this.near].sort((a, b) => b.c - a.c);
    for (const pass of [0, 1]) {
      for (const r of order) {
        ctx.beginPath();
        for (let i = 0; i < r.pts.length; i += 2) {
          const x = r.pts[i] / 10 - this.poseX, z = r.pts[i + 1] / 10 - this.poseZ;
          if (i) ctx.lineTo(x, -z); else ctx.moveTo(x, -z);
        }
        if (pass === 0) { ctx.strokeStyle = 'rgba(0,0,0,.75)'; ctx.lineWidth = WID[r.c] + 6; }
        else { ctx.strokeStyle = COL[r.c]; ctx.lineWidth = WID[r.c]; }
        ctx.stroke();
      }
    }
    ctx.restore();
    ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx - 13, cy + 14); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx + 13, cy + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,.25)'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(cx, W / 2, W / 2 - 3, 0, Math.PI * 2); ctx.stroke();
  }

  /** Circular RPM arc with redline, ticks and speed ring. */
  public drawGauge(): void {
    if (!this.gaugeCanvasRef) return;
    const c = this.gaugeCanvasRef.nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const S = c.width, m = S / 2;
    const start = Math.PI * 0.75, sweep = Math.PI * 1.5;
    const rpmT = Math.min(1, this.telemetryService.rpm() / 8500);
    this.smoothRpm += (rpmT - this.smoothRpm) * 0.35;
    ctx.clearRect(0, 0, S, S);
    ctx.fillStyle = 'rgba(9,9,11,.55)'; ctx.beginPath(); ctx.arc(m, m, m - 22, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round'; ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.beginPath(); ctx.arc(m, m, m - 34, start, start + sweep); ctx.stroke();
    const red = 7200 / 8500;
    ctx.strokeStyle = 'rgba(239,68,68,.45)'; ctx.beginPath(); ctx.arc(m, m, m - 34, start + sweep * red, start + sweep); ctx.stroke();
    const g = ctx.createLinearGradient(0, S, S, 0);
    g.addColorStop(0, '#22d3ee'); g.addColorStop(0.6, '#fbbf24'); g.addColorStop(1, '#ef4444');
    ctx.strokeStyle = this.smoothRpm > red ? '#ef4444' : g; ctx.shadowColor = this.smoothRpm > red ? '#ef4444' : '#fbbf24'; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.arc(m, m, m - 34, start, start + sweep * Math.max(0.005, this.smoothRpm)); ctx.stroke();
    ctx.shadowBlur = 0; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.5)';
    for (let i = 0; i <= 8; i++) {
      const a = start + (sweep * i) / 8;
      ctx.beginPath(); ctx.moveTo(m + Math.cos(a) * (m - 62), m + Math.sin(a) * (m - 62)); ctx.lineTo(m + Math.cos(a) * (m - 54), m + Math.sin(a) * (m - 54)); ctx.stroke();
    }
  }

  public formatTimeOfDay(): string {
    const hours = this.envService.timeOfDayHours();
    const h = Math.floor(hours);
    const m = Math.floor((hours - h) * 60);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayH = h % 12 === 0 ? 12 : h % 12;
    return `${displayH}:${m < 10 ? '0' : ''}${m} ${ampm}`;
  }

  public getWeatherIcon(): string {
    switch (this.envService.weather()) {
      case 'SUNNY': return 'wb_sunny';
      case 'OVERCAST': return 'cloud';
      case 'TROPICAL_RAIN': return 'thunderstorm';
    }
  }

  public toggleAudio(): void {
    this.audioService.isMuted.update(m => !m);
    if (!this.audioService.isMuted()) {
      this.audioService.unlockAudio();
    }
  }
}
