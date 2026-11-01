import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  effect,
  inject,
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
import { WorldPipelineService } from '../../services/world-pipeline.service';

@Component({
  selector: 'app-hud',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="absolute inset-0 pointer-events-none select-none overflow-hidden font-sans">
      <!-- Top Bar: Game Title, District Name & Environmental Conditions -->
      <header class="absolute top-3 left-4 right-4 flex items-center justify-between text-white pointer-events-auto">
        <div class="flex items-center gap-3 bg-black/60 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 shadow-lg">
          <div class="flex items-center gap-2">
            <span class="text-amber-500 font-black text-lg tracking-wider">SD</span>
            <span class="text-xs font-semibold text-zinc-300 tracking-wide uppercase">Slow Down</span>
          </div>
          <span class="text-zinc-600">|</span>
          <div class="flex items-center gap-1.5 text-xs text-zinc-300">
            <mat-icon class="text-amber-400 text-sm">location_on</mat-icon>
            <span class="font-medium text-white">{{ currentDistrictName() }}</span>
            <span class="text-zinc-500 font-mono text-[11px]">({{ gpsCoordinates() }})</span>
          </div>
        </div>

        <!-- Center Notification Banner for Speed Traps & Drift Records -->
        @if (festivalService.activeNotification(); as notif) {
          <div class="absolute left-1/2 -translate-x-1/2 top-1 bg-amber-500/95 text-zinc-950 px-6 py-2 rounded-xl shadow-2xl border border-amber-300 font-black text-center animate-bounce">
            <div class="text-[10px] tracking-widest uppercase opacity-80">{{ notif.title }}</div>
            <div class="text-xl font-black tracking-tight">{{ notif.scoreText }}</div>
            <div class="text-[11px] font-bold">{{ notif.subText }}</div>
          </div>
        }

        <!-- Top Right: Time of Day, Weather, and Controller Status -->
        <div class="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3.5 py-2 rounded-xl border border-white/10 shadow-lg">
          <div class="flex items-center gap-1 text-xs text-zinc-300">
            <mat-icon class="text-amber-400 text-sm">schedule</mat-icon>
            <span class="font-mono text-white">{{ formatTimeOfDay() }}</span>
          </div>
          <span class="text-zinc-600">·</span>
          <div class="flex items-center gap-1 text-xs text-zinc-300">
            <mat-icon class="text-sky-400 text-sm">{{ getWeatherIcon() }}</mat-icon>
            <span class="text-white capitalize">{{ envService.weather().toLowerCase().replace('_', ' ') }}</span>
          </div>
          <span class="text-zinc-600">·</span>
          <!-- Controller indicator -->
          <div class="flex items-center gap-1.5 text-xs" [class.text-emerald-400]="gamepadService.isConnected()" [class.text-zinc-500]="!gamepadService.isConnected()">
            <mat-icon class="text-sm">sports_esports</mat-icon>
            <span class="hidden sm:inline font-medium">
              {{ gamepadService.isConnected() ? (gamepadService.isDualShock() ? 'DualShock 4' : 'Controller') : 'Keyboard/Touch' }}
            </span>
          </div>
        </div>
      </header>

      <!-- Active Drift Score Pill (Center Top) -->
      @if (telemetryService.telemetry().isDrifting || festivalService.inDriftZone()) {
        <div class="absolute top-20 left-1/2 -translate-x-1/2 flex flex-col items-center pointer-events-auto">
          <div class="bg-gradient-to-r from-cyan-600 to-blue-600 text-white px-5 py-1.5 rounded-full font-black text-center shadow-lg border border-cyan-300">
            <div class="text-[10px] tracking-wider uppercase text-cyan-200">
              {{ festivalService.inDriftZone() ? 'DRIFT ZONE' : 'DRIFT' }} · {{ telemetryService.telemetry().driftAngleDeg }}°
            </div>
            <div class="text-2xl font-black font-mono tracking-tight text-white">
              {{ (festivalService.inDriftZone() ? festivalService.currentDriftZoneScore() : telemetryService.telemetry().driftScoreSession) | number:'1.0-0' }} PTS
            </div>
          </div>
        </div>
      }

      <!-- Bottom-Left: Live Mini-Map Canvas -->
      <div class="absolute bottom-6 left-6 pointer-events-auto">
        <div class="relative w-40 h-40 rounded-2xl overflow-hidden border border-white/20 bg-black/70 backdrop-blur-md shadow-2xl p-2 flex flex-col items-center justify-center">
          <canvas #minimapCanvas width="144" height="144" class="w-full h-full rounded-xl"></canvas>
          <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[10px] text-zinc-400 px-1 font-mono">
            <span>MR3 HIGHWAY</span>
            <span class="text-amber-400 font-bold">1:1 SCALE</span>
          </div>
        </div>
      </div>

      <!-- Bottom-Right: Forza Speedometer & Tachometer Cluster -->
      <div class="absolute bottom-6 right-6 pointer-events-auto flex items-end gap-3">
        <!-- Digital Cluster -->
        <div class="bg-black/75 backdrop-blur-md border border-white/15 rounded-2xl p-4 shadow-2xl text-right min-w-[190px]">
          <!-- Gear & Tachometer Bar -->
          <div class="flex items-center justify-between mb-1">
            <span class="text-xs uppercase font-bold text-zinc-400">GEAR</span>
            <div class="flex items-baseline gap-1">
              <span class="text-4xl font-black text-amber-400 font-mono">{{ telemetryService.currentGear() }}</span>
              <span class="text-[10px] font-bold text-zinc-500">/ 6</span>
            </div>
          </div>

          <!-- Speedometer in KM/H -->
          <div class="flex items-baseline justify-end gap-1.5">
            <span class="text-6xl font-black text-white font-mono tracking-tight tabular-nums">
              {{ telemetryService.speedKmh() }}
            </span>
            <span class="text-xs font-bold text-zinc-400 tracking-wider">KM/H</span>
          </div>

          <!-- RPM Gauge Bar -->
          <div class="mt-2 w-full bg-zinc-800 h-2 rounded-full overflow-hidden">
            <div
              class="h-full transition-all duration-75 rounded-full"
              [style.width.%]="(telemetryService.rpm() / 8500) * 100"
              [class.bg-amber-400]="telemetryService.rpm() < 7200"
              [class.bg-red-500]="telemetryService.rpm() >= 7200"
            ></div>
          </div>

          <!-- RPM readout & Road Surface Tag -->
          <div class="flex items-center justify-between text-[11px] font-mono text-zinc-400 mt-1.5">
            <span>{{ telemetryService.rpm() }} RPM</span>
            <span class="text-emerald-400 font-medium truncate max-w-[100px]">{{ telemetryService.currentSurface() }}</span>
          </div>
        </div>
      </div>

      <!-- Unified Ergonomic Bottom Dock (Center Bottom - Collapsible) -->
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-2xl border border-white/10 shadow-2xl">
        <button
          (click)="openMap.emit()"
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          title="Open Corridor Vector Map (M / Options)"
        >
          <mat-icon class="text-amber-400 text-sm">map</mat-icon>
          <span class="hidden sm:inline">Map</span>
        </button>

        <button
          (click)="openTuning.emit()"
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          title="Garage Tuning & Dyno"
        >
          <mat-icon class="text-cyan-400 text-sm">tune</mat-icon>
          <span class="hidden sm:inline">Garage</span>
        </button>

        <button
          (click)="toggleTelemetry.emit()"
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          title="Toggle Forza Telemetry (T / D-Pad Up)"
        >
          <mat-icon class="text-emerald-400 text-sm">query_stats</mat-icon>
          <span class="hidden sm:inline">Telemetry</span>
        </button>

        <button
          (click)="openPhotoMode.emit()"
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          title="Enter Photo Mode (P / D-Pad Down)"
        >
          <mat-icon class="text-purple-400 text-sm">photo_camera</mat-icon>
          <span class="hidden sm:inline">Photo</span>
        </button>

        <button
          (click)="cycleCamera.emit()"
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          title="Cycle Camera View (C / Square)"
        >
          <mat-icon class="text-zinc-300 text-sm">videocam</mat-icon>
          <span class="hidden sm:inline">Cam</span>
        </button>

        <button
          (click)="openPipeline.emit()"
          class="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          title="World Compiler Pipeline Tools"
        >
          <mat-icon class="text-yellow-400 text-sm">account_tree</mat-icon>
          <span class="hidden sm:inline">Pipeline</span>
        </button>

        <button
          (click)="toggleAudio()"
          class="flex items-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-zinc-200 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
          [title]="audioService.isMuted() ? 'Unmute Audio' : 'Mute Audio'"
        >
          <mat-icon class="text-sm" [class.text-red-400]="audioService.isMuted()" [class.text-zinc-300]="!audioService.isMuted()">
            {{ audioService.isMuted() ? 'volume_off' : 'volume_up' }}
          </mat-icon>
        </button>
      </div>
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

  @ViewChild('minimapCanvas', { static: false }) minimapCanvasRef!: ElementRef<HTMLCanvasElement>;

  // Outputs for opening modals / cycling modes
  openMap = output<void>();
  openTuning = output<void>();
  toggleTelemetry = output<void>();
  openPhotoMode = output<void>();
  cycleCamera = output<void>();
  openPipeline = output<void>();

  readonly currentDistrictName = signal<string>('Manzini Centre');
  readonly gpsCoordinates = signal<string>('31.36° E, -26.48° S');

  constructor() {
    effect(() => {
      // Whenever telemetry updates, update district & minimap
      this.drawMinimap();
    });
  }

  public updateDistrictAndGps(x: number, z: number): void {
    const gps = this.worldPipeline.worldToGps(x, z);
    this.gpsCoordinates.set(`${gps[0]}° E, ${gps[1]}° S`);

    if (z > -800) this.currentDistrictName.set('Manzini Centre');
    else if (z > -2600) this.currentDistrictName.set('Matsapha Industrial');
    else if (z > -3600) this.currentDistrictName.set('Lobamba & Malkerns');
    else if (z > -5800) this.currentDistrictName.set('Ezulwini Valley of Heaven');
    else this.currentDistrictName.set('Mbabane & Malagwane Hill');
  }

  public drawMinimap(): void {
    if (!this.minimapCanvasRef) return;
    const canvas = this.minimapCanvasRef.nativeElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dark radar background
    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw radar grid rings
    ctx.strokeStyle = '#27272a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(72, 72, 30, 0, Math.PI * 2);
    ctx.arc(72, 72, 60, 0, Math.PI * 2);
    ctx.stroke();

    // Draw Highway curve segment relative to player
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(72, 140);
    ctx.lineTo(72, 4);
    ctx.stroke();

    // Speed camera trap blips
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(72, 35, 4, 0, Math.PI * 2);
    ctx.fill();

    // Player position (centered triangle)
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.moveTo(72, 64);
    ctx.lineTo(66, 78);
    ctx.lineTo(78, 78);
    ctx.closePath();
    ctx.fill();
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
