import { ChangeDetectionStrategy, Component, OnDestroy, output, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { AssetLibrary } from '../../game/graphics/asset-library';

@Component({
  selector: 'app-intro',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host{position:absolute;inset:0;z-index:50;display:block}
    .bg{background:radial-gradient(120% 90% at 20% 100%,rgba(251,146,60,.35),transparent 60%),radial-gradient(90% 80% at 90% 0%,rgba(56,189,248,.28),transparent 60%),linear-gradient(180deg,rgba(9,9,11,.55),rgba(9,9,11,.88));backdrop-filter:blur(6px)}
    .go{background:linear-gradient(135deg,#fbbf24,#f97316);box-shadow:0 12px 40px rgba(249,115,22,.55);transition:transform .15s,box-shadow .15s}
    .go:hover:not(:disabled){transform:translateY(-2px) scale(1.03)}
    .go:disabled{opacity:.55;cursor:wait}
    .tyre{width:112px;height:112px;margin:0 auto 14px;filter:drop-shadow(0 10px 30px rgba(249,115,22,.45))}
    .spin{transform-origin:100px 100px;animation:spin 2.4s linear infinite}
    .spin.fast{animation-duration:.7s}
    @keyframes spin{to{transform:rotate(360deg)}}
    .rise{animation:rise .8s cubic-bezier(.2,.9,.3,1) both}
    @keyframes rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
    kbd{padding:2px 8px;border-radius:6px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.22);font:600 11px ui-monospace,monospace;color:#fde68a}
  `],
  template: `
    <div class="bg absolute inset-0 text-white font-sans flex flex-col items-center justify-center px-6 text-center">
      <div class="rise">
        <svg class="tyre" viewBox="0 0 200 200" aria-hidden="true">
          <defs><linearGradient id="tg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>
          <circle cx="100" cy="100" r="92" fill="#0d0d10"/>
          <g class="spin" [class.fast]="!ready()"><circle cx="100" cy="100" r="86" fill="none" stroke="#2c2c31" stroke-width="12" stroke-dasharray="8 7.18"/>
            <circle cx="100" cy="100" r="70" fill="#17171b"/><circle cx="100" cy="100" r="66" fill="none" stroke="#f59e0b" stroke-width="2.2"/>
            <circle cx="100" cy="100" r="50" fill="#d4d4d8"/><circle cx="100" cy="100" r="46" fill="#1f1f24"/>
            <g fill="url(#tg1)"><path d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(72 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(144 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(216 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/><path transform="rotate(288 100 100)" d="M100 100 L91 52 Q100 45 109 52 Z"/></g>
            <circle cx="100" cy="100" r="14" fill="#3f3f46" stroke="#fbbf24" stroke-width="1.5"/><circle cx="100" cy="92" r="2.2" fill="#e4e4e7"/><circle cx="107.6" cy="97.5" r="2.2" fill="#e4e4e7"/><circle cx="104.7" cy="106.5" r="2.2" fill="#e4e4e7"/><circle cx="95.3" cy="106.5" r="2.2" fill="#e4e4e7"/><circle cx="92.4" cy="97.5" r="2.2" fill="#e4e4e7"/></g>
          <path d="M30 62 A78 78 0 0 1 92 22" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="6" stroke-linecap="round"/>
        </svg>
        <div class="text-[11px] tracking-[0.5em] text-amber-300 font-bold mb-3">SISWATI FOR “GO FAST”</div>
        <h1 class="text-5xl sm:text-7xl font-black tracking-tight leading-none">SHESHA</h1>
        <div class="text-lg sm:text-2xl font-light text-zinc-200 mt-2 tracking-wide">Eswatini open-road racing · Manzini <span class="text-amber-400">→</span> Mbabane</div>
      </div>

      <div class="rise mt-10 w-full max-w-xs" style="animation-delay:.25s">
        <button class="go w-full rounded-2xl py-4 text-zinc-950 font-black text-lg tracking-wider cursor-pointer" [disabled]="!ready()" (click)="start.emit()">
          {{ ready() ? 'START ENGINE' : 'LOADING WORLD…' }}
        </button>
        <div class="mt-3 h-1.5 rounded-full bg-white/10 overflow-hidden" role="progressbar" [attr.aria-valuenow]="pct()">
          <div class="h-full bg-gradient-to-r from-cyan-400 to-amber-300 transition-all duration-300" [style.width.%]="pct()"></div>
        </div>
        <div class="text-[11px] text-zinc-400 mt-1.5">{{ ready() ? 'Press Enter or tap to begin' : 'Streaming 3D models & textures ' + pct() + '%' }}</div>
      </div>

      <div class="rise mt-10 grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-3 text-xs text-zinc-300" style="animation-delay:.45s">
        <div><kbd>W</kbd> <kbd>S</kbd><div class="mt-1.5">Throttle / brake</div></div>
        <div><kbd>A</kbd> <kbd>D</kbd><div class="mt-1.5">Steer</div></div>
        <div><kbd>Space</kbd><div class="mt-1.5">Handbrake</div></div>
        <div><kbd>C</kbd> <kbd>M</kbd> <kbd>P</kbd><div class="mt-1.5">Camera · Map · Photo</div></div>
      </div>
      <div class="absolute bottom-4 text-[10px] text-zinc-500">Drive on the left · Real-world route · Controller &amp; touch supported</div>
    </div>
  `
})
export class IntroComponent implements OnDestroy {
  start = output<void>();
  readonly pct = signal(0);
  readonly ready = signal(false);
  private t = setInterval(() => {
    const { total, done } = AssetLibrary;
    const p = total ? Math.round((done / total) * 100) : 0;
    this.pct.set(p);
    if (total > 0 && done >= total) this.ready.set(true);
  }, 200);
  private fallback = setTimeout(() => { this.ready.set(true); this.pct.set(100); }, 25000);
  ngOnDestroy(): void { clearInterval(this.t); clearTimeout(this.fallback); }
}
