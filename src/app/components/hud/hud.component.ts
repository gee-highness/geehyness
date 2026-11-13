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
import { RaceService } from '../../services/race.service';
import { NavigationService } from '../../services/navigation.service';
import { DriveStateService } from '../../services/drive-state.service';
import { SettingsService } from '../../services/settings.service';
import { HapticsService } from '../../services/haptics.service';
import { WorldPipelineService } from '../../services/world-pipeline.service';

@Component({
  selector: 'app-hud',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    .hud-card{background:linear-gradient(160deg,rgba(28,28,32,.82),rgba(9,9,11,.74));border:1px solid rgba(255,255,255,.12);border-radius:16px;box-shadow:0 6px 16px rgba(0,0,0,.35)}
    .rail-btn{position:relative;width:44px;height:44px;border-radius:12px;display:grid;place-items:center;cursor:pointer;transition:background .15s,transform .15s}
    .rail-btn:hover{background:rgba(255,255,255,.12);transform:scale(1.06)}
    .rail-btn:focus-visible{outline:2px solid #fbbf24}
    .compact .rail-btn{width:34px;height:34px}
    .hud-tyre{width:36px;height:36px;display:block}
    .hud-tyre .spin{transform-origin:100px 100px;animation:hspin 2.8s linear infinite}
    @keyframes hspin{to{transform:rotate(360deg)}}
    .compact .rail-tip{display:none}
    nav.compact{z-index:40;max-width:calc(100vw - 340px);overflow-x:auto;scrollbar-width:none}
    nav.compact::-webkit-scrollbar{display:none}
    nav.compact .rail-btn{flex:0 0 auto}
    .rail-tip{position:absolute;right:54px;white-space:nowrap;background:rgba(9,9,11,.92);border:1px solid rgba(255,255,255,.12);padding:6px 10px;border-radius:8px;font-size:11px;font-weight:600;opacity:0;transform:translateX(6px);pointer-events:none;transition:.15s}
    .rail-btn:hover .rail-tip,.rail-btn:focus-visible .rail-tip{opacity:1;transform:none}
    kbd{display:inline-block;margin:0 2px;padding:1px 6px;border-radius:5px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.2);font:600 10px ui-monospace,monospace;color:#fde68a}
    .limit-over{animation:lim .5s infinite alternate}
    @keyframes lim{from{box-shadow:0 0 0 0 rgba(239,68,68,.9)}to{box-shadow:0 0 18px 8px rgba(239,68,68,.6)}}
    .banner-in{animation:bin .45s cubic-bezier(.2,1.4,.4,1)}
    @keyframes bin{from{opacity:0;transform:translate(-50%,-14px) scale(.9)}to{opacity:1;transform:translate(-50%,0) scale(1)}}
    .hint-fade{animation:hf 14s forwards}
    @keyframes hf{0%,80%{opacity:1}100%{opacity:0}}
  `],
  template: `
    <div class="absolute inset-0 pointer-events-none select-none overflow-hidden font-sans text-white">
      <!-- Top-left: location card -->
      <div class="absolute top-4 left-4 pointer-events-auto hud-card px-4 py-2.5 flex items-center gap-3">
        <div class="w-9 h-9 shrink-0"><svg class="hud-tyre" viewBox="0 0 200 200" aria-hidden="true">
<defs><linearGradient id="tg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>
<circle cx="100" cy="100" r="92" fill="#0d0d10"/>
<g class="spin" [class.fast]="false"><circle cx="100" cy="100" r="86" fill="none" stroke="#2c2c31" stroke-width="12" stroke-dasharray="8 7.18"/>
  <circle cx="100" cy="100" r="70" fill="#17171b"/><circle cx="100" cy="100" r="66" fill="none" stroke="#f59e0b" stroke-width="2.2"/>
  <circle cx="100" cy="100" r="50" fill="#d4d4d8"/><circle cx="100" cy="100" r="46" fill="#1f1f24"/>
  <g fill="url(#tg2)"><path d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(72 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(144 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(216 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(288 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/></g>
  <circle cx="100" cy="100" r="14" fill="#3f3f46" stroke="#fbbf24" stroke-width="1.5"/><circle cx="100" cy="92" r="2.2" fill="#e4e4e7"/><circle cx="107.6" cy="97.5" r="2.2" fill="#e4e4e7"/><circle cx="104.7" cy="106.5" r="2.2" fill="#e4e4e7"/><circle cx="95.3" cy="106.5" r="2.2" fill="#e4e4e7"/><circle cx="92.4" cy="97.5" r="2.2" fill="#e4e4e7"/></g>
<path d="M30 62 A78 78 0 0 1 92 22" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="6" stroke-linecap="round"/>
        </svg></div>
        <div class="leading-tight">
          <div class="text-[10px] uppercase tracking-[0.2em] text-amber-300/90 font-bold">{{ currentDistrictName() }}</div>
          <div class="text-[11px] text-zinc-400 font-mono" [class.hidden]="compact()">{{ gpsCoordinates() }}</div>
        </div>
      </div>

      <!-- Top-right: time / weather / input -->
      <div class="absolute top-3 sm:top-4 pointer-events-auto hud-card px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-3 sm:gap-4 text-xs" [ngClass]="compact() ? 'right-[64px]' : 'right-3 sm:right-4'">
        <div class="flex items-center gap-1.5"><mat-icon class="text-amber-300 !text-base">schedule</mat-icon><span class="font-mono font-semibold">{{ formatTimeOfDay() }}</span></div>
        <div class="flex items-center gap-1.5"><mat-icon class="text-sky-300 !text-base">{{ getWeatherIcon() }}</mat-icon><span class="capitalize" [class.hidden]="compact()">{{ envService.weather().toLowerCase().replace('_', ' ') }}</span></div>
        <div class="items-center gap-1.5" [ngClass]="compact() ? 'hidden' : 'hidden md:flex'" [class.text-emerald-300]="gamepadService.isConnected()" [class.text-zinc-500]="!gamepadService.isConnected()">
          <mat-icon class="!text-base">sports_esports</mat-icon>
          <span>{{ gamepadService.isConnected() ? (gamepadService.isDualShock() ? 'DualShock 4' : 'Controller') : 'Keyboard' }}</span>
        </div>
      </div>

      @if (showFps()) {
        <div class="absolute left-4 top-[74px] hud-card px-3 py-1.5 text-[11px] font-mono pointer-events-none" [class.text-emerald-300]="fpsText().startsWith('6') || fpsText().startsWith('5')" [class.text-amber-300]="!fpsText().startsWith('6') && !fpsText().startsWith('5')">{{ fpsText() }}</div>
      }

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
        <button (click)="envService.cycleWeather()" class="rail-btn group" aria-label="Change weather">
          <mat-icon class="!text-[22px] text-sky-300">{{ getWeatherIcon() }}</mat-icon>
          <span class="rail-tip">Weather <kbd>G</kbd></span>
        </button>
        <button (click)="race.toggle()" class="rail-btn group" aria-label="Races">
          <mat-icon class="!text-[22px]" [class.text-amber-300]="race.phase() === 'IDLE'" [class.text-red-400]="race.phase() !== 'IDLE'">sports_score</mat-icon>
          <span class="rail-tip">{{ race.phase() === 'IDLE' ? 'Races' : 'Abandon race' }} <kbd>N</kbd></span>
        </button>
        <button (click)="settings.toggleTheme()" class="rail-btn group" aria-label="Neo-Eswatini theme">
          <mat-icon class="!text-[22px]" [class.text-fuchsia-300]="settings.theme() === 'NEO'" [class.text-zinc-400]="settings.theme() !== 'NEO'">auto_awesome</mat-icon>
          <span class="rail-tip">Neo-Eswatini {{ settings.theme() === 'NEO' ? 'on' : 'off' }} <kbd>Y</kbd></span>
        </button>
        <button (click)="settings.cycleQuality()" class="rail-btn group" aria-label="Graphics quality">
          <mat-icon class="!text-[22px] text-amber-300">tune</mat-icon>
          <span class="rail-tip">Quality: {{ settings.quality() }} <kbd>Q</kbd></span>
        </button>
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
        <canvas #minimapCanvas width="224" height="224" class="w-full aspect-square rounded-xl"></canvas>
      </div>

      <!-- Bottom-right: gauge cluster -->
      <div class="absolute pointer-events-none" [ngClass]="compact() ? 'top-[72px] right-3' : 'bottom-5 right-20 max-sm:right-16'">
        <div class="relative" [ngClass]="compact() ? 'w-[128px] h-[128px]' : 'w-[250px] h-[250px] max-sm:w-[190px] max-sm:h-[190px]'">
          <canvas #gaugeCanvas width="320" height="320" class="absolute inset-0 w-full h-full"></canvas>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <div class="text-[64px] max-sm:text-[46px] leading-none font-black tabular-nums tracking-tight drop-shadow-[0_2px_12px_rgba(0,0,0,.6)]" [class.!text-[32px]]="compact()">{{ telemetryService.speedKmh() }}</div>
            <div class="text-[11px] font-bold tracking-[0.3em] text-zinc-300 -mt-0.5">KM/H</div>
            <div class="mt-2 flex items-baseline gap-1"><span class="text-3xl max-sm:text-xl font-black text-amber-300">{{ telemetryService.currentGear() < 0 ? 'R' : telemetryService.currentGear() }}</span><span class="text-[10px] text-zinc-400 font-bold">GEAR</span></div>
            <div class="text-[10px] text-emerald-300 font-semibold mt-1 max-w-[120px] truncate">{{ telemetryService.currentSurface() }}</div>
          </div>
        </div>
      </div>

      <!-- Posted speed limit -->
      @if (telemetryService.speedLimit() > 0) {
        <div class="absolute pointer-events-none" [ngClass]="compact() ? 'top-[72px] right-[150px]' : 'bottom-6 right-[292px] max-sm:right-[230px]'">
          <div class="w-[58px] h-[58px] rounded-full bg-white grid place-items-center text-zinc-900 font-black text-[22px] shadow-lg border-[5px]"
               [class.border-red-600]="true" [class.limit-over]="telemetryService.speedKmh() > telemetryService.speedLimit() + 4">{{ telemetryService.speedLimit() }}</div>
        </div>
      }

      @if (race.message(); as pm) {
        <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 top-[22%] px-6 py-3 rounded-2xl bg-black/70 border border-white/20 text-2xl font-black tracking-[0.2em]" [class.text-red-400]="pm.startsWith('BUSTED')" [class.text-emerald-300]="!pm.startsWith('BUSTED')">{{ pm }}</div>
      }

      <!-- Street races -->
      @if (race.menu() && race.phase() === 'IDLE') {
        <div class="absolute pointer-events-auto left-1/2 -translate-x-1/2 top-1/2 -translate-y-1/2 hud-card p-3 w-[min(92vw,380px)] max-h-[80vh] overflow-y-auto">
          <div class="flex items-center justify-between mb-2"><span class="text-[11px] font-black tracking-[0.25em] text-amber-300">STREET RACES</span>
            <button (click)="race.menu.set(false)" class="text-zinc-400 hover:text-white" aria-label="Close"><mat-icon class="!text-[18px] !w-[18px] !h-[18px]">close</mat-icon></button></div>
          @for (e of race.events; track e.id; let i = $index) {
            <button (click)="race.start(i)" class="w-full text-left px-3 py-2 mb-1 rounded-xl hover:bg-white/15 flex items-center gap-3" [ngClass]="race.sel() === i ? 'bg-amber-300/25 ring-1 ring-amber-300/60' : 'bg-white/5'">
              <kbd class="text-[10px] text-zinc-400">{{ i + 1 }}</kbd>
              <span class="flex-1"><span class="block text-sm font-bold text-white">{{ e.name }}</span><span class="block text-[10px] text-zinc-400">{{ e.blurb }}</span></span>
              @if (race.bests()[e.id]; as b) { <span class="text-[10px] text-emerald-300 font-mono">{{ race.fmt(b) }}</span> }
            </button>
          }
          <div class="text-[9px] text-zinc-500 mt-1">4 rivals, open traffic. Drive through every gate. <kbd>N</kbd> abandons.</div>
        </div>
      }
      @if (race.phase() !== 'IDLE') {
        <div class="absolute pointer-events-none hud-card px-3 py-2 w-[170px]" [ngClass]="compact() ? 'top-[68px] right-3' : 'top-[84px] right-24'">
          <div class="text-[9px] font-black tracking-widest text-amber-300 truncate">{{ race.name() }}</div>
          <div class="flex items-end justify-between mt-0.5"><span class="text-3xl font-black text-white leading-none">{{ race.pos() }}<span class="text-sm text-zinc-400">/{{ race.total() }}</span></span>
            <span class="text-lg font-mono text-white leading-none">{{ race.fmt(race.time()) }}</span></div>
          <div class="mt-1.5 h-1.5 rounded-full bg-white/10 overflow-hidden"><div class="h-full rounded-full bg-amber-300" [style.width.%]="race.cps() ? race.cp() / race.cps() * 100 : 0"></div></div>
          <div class="mt-1 text-[9px] text-zinc-400 flex justify-between"><span>gate {{ race.cp() }}/{{ race.cps() }}</span><span>{{ (race.remaining() / 1000).toFixed(1) }} km</span></div>
          <div class="mt-1 text-[9px] leading-tight">@for (n of race.order(); track n; let i = $index) { <div [class.text-amber-300]="n === 'YOU'" [class.font-black]="n === 'YOU'" [class.text-zinc-400]="n !== 'YOU'">{{ i + 1 }}. {{ n }}</div> }</div>
        </div>
        @if (race.phase() === 'COUNTDOWN') {
          <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 top-[26%] text-8xl font-black text-amber-300 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">{{ race.count() }}</div>
        } @else if (race.phase() === 'RACING' && race.time() < 1.2) {
          <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 top-[26%] text-8xl font-black text-emerald-300 drop-shadow-[0_4px_12px_rgba(0,0,0,0.8)]">GO</div>
        } @else if (race.phase() === 'RACING' && race.offRoute()) {
          <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 top-[26%] px-5 py-2 rounded-2xl bg-black/70 border border-red-400/60 text-lg font-black tracking-[0.2em] text-red-400 animate-pulse">BACK TO THE ROUTE</div>
        }
        @if (race.phase() === 'FINISHED' && race.result(); as r) {
          <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 top-[22%] px-8 py-4 rounded-2xl bg-black/75 border border-amber-300/50 text-center">
            <div class="text-[10px] font-black tracking-[0.3em] text-zinc-300">{{ r.name }}</div>
            <div class="text-5xl font-black" [class.text-amber-300]="r.pos === 1" [class.text-white]="r.pos !== 1">{{ race.ord(r.pos) }}</div>
            <div class="text-xl font-mono text-white">{{ race.fmt(r.time) }}</div>
            @if (r.best) { <div class="text-[10px] font-black tracking-[0.25em] text-emerald-300 mt-1">NEW PERSONAL BEST</div> }
          </div>
        }
      }

      <!-- Turn-by-turn guidance -->
      @if (nav.guidance(); as gd) {
        <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 hud-card px-4 py-2 flex items-center gap-3" [ngClass]="compact() ? 'top-[96px]' : 'top-20'">
          <svg width="40" height="40" viewBox="-20 -20 40 40" [style.transform]="'rotate(' + turnAngle(gd.turn) + 'deg)'"><path d="M0 -16 L12 0 H5 V16 H-5 V0 H-12 Z" fill="#34d399"/></svg>
          <div><div class="text-[15px] font-black leading-tight">{{ gd.text }} <span class="text-amber-300">{{ gd.turn === 'arrive' ? '' : 'in ' + fmtDist(gd.dist) }}</span></div>
            <div class="text-[11px] text-zinc-300">{{ gd.road || 'ahead' }} · {{ fmtDist(gd.remaining) }} · {{ gd.etaMin }} min</div></div>
        </div>
      } @else if (nav.routing()) {
        <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 top-20 hud-card px-4 py-2 text-xs text-zinc-300">Calculating route…</div>
      }

      <!-- Indicators, hazards, headlights, waypoint -->
      <div class="absolute pointer-events-none left-1/2 -translate-x-1/2 flex items-center gap-3" [ngClass]="compact() ? 'top-[68px]' : 'bottom-24 max-sm:bottom-20'">
        <svg width="34" height="28" viewBox="0 0 34 28" aria-label="Left indicator"><path d="M2 14 L16 2 V9 H32 V19 H16 V26 Z" [attr.fill]="drive.leftOn ? '#34d399' : 'rgba(255,255,255,.14)'" /></svg>
        @if (drive.headlights() > 0) { <span class="text-[11px] font-black px-2 py-0.5 rounded-md" [class.bg-sky-500]="drive.headlights() === 2" [class.bg-emerald-600]="drive.headlights() === 1">{{ drive.headlights() === 2 ? 'HIGH' : 'LIGHTS' }}</span> }
        @if (drive.hazards()) { <span class="text-[11px] font-black px-2 py-0.5 rounded-md bg-red-600" [class.opacity-30]="!drive.blink()">HAZ</span> }
        @if (nav.waypoint(); as wp) { <span class="text-[11px] font-black px-2 py-0.5 rounded-md bg-fuchsia-600 flex items-center gap-1"><svg width="12" height="12" viewBox="-6 -6 12 12" [style.transform]="'rotate(' + wpAngle() + 'rad)'"><path d="M0 -6 L5 5 L0 2 L-5 5 Z" fill="#fff"/></svg>{{ wpDistance() }}</span> }
        <svg width="34" height="28" viewBox="0 0 34 28" aria-label="Right indicator"><path d="M32 14 L18 2 V9 H2 V19 H18 V26 Z" [attr.fill]="drive.rightOn ? '#34d399' : 'rgba(255,255,255,.14)'" /></svg>
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
  public settings = inject(SettingsService);
  public nav = inject(NavigationService);
  public race = inject(RaceService);
  public drive = inject(DriveStateService);
  compact = input<boolean>(false);

  @ViewChild('minimapCanvas', { static: false }) minimapCanvasRef!: ElementRef<HTMLCanvasElement>;

  // Outputs for opening modals / cycling modes
  openMap = output<void>();
  openCars = output<void>();
  openOnline = output<void>();
  openTuning = output<void>();
  toggleTelemetry = output<void>();
  openPhotoMode = output<void>();
  cycleCamera = output<void>();
  openPipeline = output<void>();

  readonly currentDistrictName = signal<string>('Manzini Centre');
  readonly gpsCoordinates = signal<string>('31.36° E, -26.48° S');
  readonly hintVisible = signal<boolean>(true);
  readonly showFps = signal<boolean>(false);
  readonly fpsText = signal<string>('');
  @ViewChild('gaugeCanvas', { static: false }) gaugeCanvasRef!: ElementRef<HTMLCanvasElement>;

  readonly actions = [
    { id: 'cars', label: 'Choose car', key: 'V', icon: 'directions_car', color: 'text-rose-300' },
    { id: 'online', label: 'Multiplayer', key: 'J', icon: 'groups', color: 'text-emerald-300' },
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
  private lastMap = 0; private lastGauge = 0;

  constructor() {
    setTimeout(() => this.hintVisible.set(false), 14000);
  }

  /** Distance to the map waypoint, and its bearing relative to the car (radians, 0 = straight ahead). */
  public wpDistance(): string { const w = this.nav.waypoint(); if (!w) return ''; const d = Math.hypot(w[0] - this.poseX, w[1] - this.poseZ); return d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'; }
  public wpAngle(): number { const w = this.nav.waypoint(); if (!w) return 0; const b = Math.atan2(w[0] - this.poseX, w[1] - this.poseZ); let a = b - this.poseYaw; while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; }

  public fmtDist(d: number): string { return d >= 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d / 10) * 10 + ' m'; }
  /** Arrow rotation (deg, 0 = straight on) for a manoeuvre. */
  public turnAngle(t: string): number { switch (t) { case 'left': return -90; case 'right': return 90; case 'slight-left': return -45; case 'slight-right': return 45; case 'sharp-left': return -135; case 'sharp-right': return 135; case 'uturn': return 180; default: return 0; } }

  public fire(id: string): void {
    switch (id) {
      case 'cars': this.openCars.emit(); break;
      case 'online': this.openOnline.emit(); break;
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

    const t = performance.now();
    if (t - this.lastMap > 90) { this.lastMap = t; this.drawMinimap(); }
    if (t - this.lastGauge > 50) { this.lastGauge = t; this.drawGauge(); }
  }

  /** Heading-up minimap: real MR3 route, player fixed at the centre-bottom. */
  public drawMinimap(): void {
    if (!this.minimapCanvasRef) return;
    const c = this.minimapCanvasRef.nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width, cx = W / 2, cy = W * 0.62, scale = 0.42 * (W / 288); // px per metre
    ctx.clearRect(0, 0, W, W);
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, W / 2, W / 2 - 2, 0, Math.PI * 2); ctx.clip();
    const night = this.drive.headlights() > 0 ? 0.55 : 1;
    ctx.fillStyle = night < 1 ? '#6f7a80' : '#d6cfb9'; ctx.fillRect(0, 0, W, W);
    ctx.translate(cx, cy);
    ctx.rotate(-this.poseYaw); // sim forward (+Z when yaw=0) points up the map
    ctx.scale(scale, scale);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    if (this.world?.ready && Math.hypot(this.poseX - this.nearX, this.poseZ - this.nearZ) > 40) {
      this.near = this.world.nearbyRoads(this.poseX, this.poseZ, 420); this.nearX = this.poseX; this.nearZ = this.poseZ;
    }
    const WID = [20, 16, 15, 14, 12, 9, 6, 6, 3, 8];
    const COL = ['#f6c945', '#f6c945', '#fbe9a0', '#fbe9a0', '#ffffff', '#ffffff', '#f4f1e6', '#cbb892', '#e9e4d2', '#8db8d0'];
    const CASE = ['#8a6a12', '#8a6a12', '#9d9580', '#9d9580', '#9d9580', '#a8a18c', '#a8a18c', '#a8a18c', '#b8b29c', '#8db8d0'];
    const order = [...this.near].sort((a, b) => b.c - a.c);
    for (const pass of [0, 1]) {
      for (const r of order) {
        ctx.beginPath();
        for (let i = 0; i < r.pts.length; i += 2) {
          const x = r.pts[i] / 10 - this.poseX, z = r.pts[i + 1] / 10 - this.poseZ;
          if (i) ctx.lineTo(x, -z); else ctx.moveTo(x, -z);
        }
        if (pass === 0) { if (r.c === 9) continue; ctx.strokeStyle = CASE[r.c]; ctx.lineWidth = WID[r.c] + 5; }
        else { ctx.strokeStyle = COL[r.c]; ctx.lineWidth = WID[r.c]; }
        ctx.stroke();
      }
    }
    const rt = this.nav.route();
    if (rt) { ctx.strokeStyle = '#d946ef'; ctx.lineWidth = 7 / scale; ctx.globalAlpha = 0.9; ctx.beginPath(); let first = true;
      for (let i = 0; i < rt.pts.length; i += 2) { const px = rt.pts[i] - this.poseX, pz = -(rt.pts[i + 1] - this.poseZ); if (Math.abs(px) > 700 || Math.abs(pz) > 700) { first = true; continue; } if (first) { ctx.moveTo(px, pz); first = false; } else ctx.lineTo(px, pz); }
      ctx.stroke(); ctx.globalAlpha = 1; }
    // blips (nearby key POIs) + waypoint clamped to the radar edge, drawn in the rotated metre space
    const Rm = (W * 0.36) / scale, KEY: Record<string, string> = { hospital: '#e11d48', police: '#2563eb', fuel: '#f97316', mall: '#a855f7' };
    if (this.world?.ready) for (const poi of this.world.meta.pois) {
      const col = KEY[poi.k]; if (!col) continue; const px = poi.p[0] - this.poseX, pz = -(poi.p[1] - this.poseZ); if (Math.abs(px) > Rm || Math.abs(pz) > Rm || Math.hypot(px, pz) > Rm) continue;
      ctx.fillStyle = col; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2 / scale; ctx.beginPath(); ctx.arc(px, pz, 6 / scale, 0, 7); ctx.fill(); ctx.stroke();
    }
    const wp = this.nav.waypoint();
    if (wp) {
      let px = wp[0] - this.poseX, pz = -(wp[1] - this.poseZ); const d = Math.hypot(px, pz), cl = d > Rm; if (cl) { px *= Rm / d; pz *= Rm / d; }
      ctx.fillStyle = '#d946ef'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 / scale; ctx.beginPath(); ctx.arc(px, pz, (cl ? 8 : 11) / scale, 0, 7); ctx.fill(); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#38bdf8'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy - 20); ctx.lineTo(cx - 13, cy + 14); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx + 13, cy + 14); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(20,24,28,.85)'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(cx, W / 2, W / 2 - 3, 0, Math.PI * 2); ctx.stroke();
    // north marker rides the ring
    { const rx = cx + Math.sin(this.poseYaw) * (W / 2 - 14), ry = W / 2 + Math.cos(this.poseYaw) * (W / 2 - 14);
      ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(rx, ry, 11, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = '800 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('N', rx, ry + 1); }
  }

  /** Circular RPM arc with redline, ticks and speed ring. */
  public drawGauge(): void {
    if (!this.gaugeCanvasRef) return;
    const c = this.gaugeCanvasRef.nativeElement;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const S = 500, m = S / 2;
    ctx.setTransform(c.width / 500, 0, 0, c.width / 500, 0, 0);
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
    ctx.strokeStyle = this.smoothRpm > red ? '#ef4444' : g; 
    ctx.beginPath(); ctx.arc(m, m, m - 34, start, start + sweep * Math.max(0.005, this.smoothRpm)); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.5)';
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
      case 'MIST': return 'foggy';
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
