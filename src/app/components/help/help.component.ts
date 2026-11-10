import { ChangeDetectionStrategy, Component, output } from '@angular/core';

interface Row { k: string; a: string }
@Component({
  selector: 'app-help',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 bg-black/80 backdrop-blur-md grid place-items-center p-4 select-none" (click)="closeModal.emit()" (keydown.escape)="closeModal.emit()" tabindex="-1" role="dialog" aria-label="Controls">
      <div class="bg-zinc-950 border border-white/15 rounded-3xl w-full max-w-5xl max-h-[92vh] overflow-y-auto p-6 text-white shadow-2xl" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()" tabindex="0" role="document">
        <div class="flex items-center justify-between mb-4"><h2 class="text-lg font-black tracking-widest uppercase">Controls</h2><button (click)="closeModal.emit()" class="text-zinc-400 hover:text-white text-2xl leading-none" aria-label="Close">×</button></div>
        <div class="grid md:grid-cols-2 gap-6 text-sm">
          <section>
            <h3 class="text-amber-300 font-bold uppercase text-xs tracking-wider mb-2">Controller (PlayStation / Xbox)</h3>
            <table class="w-full">@for (r of pad; track r.k) { <tr class="border-b border-white/5"><td class="py-1 pr-3 font-mono text-cyan-200 whitespace-nowrap">{{ r.k }}</td><td class="py-1 text-zinc-300">{{ r.a }}</td></tr> }</table>
          </section>
          <section>
            <h3 class="text-amber-300 font-bold uppercase text-xs tracking-wider mb-2">Keyboard &amp; mouse</h3>
            <table class="w-full">@for (r of keys; track r.k) { <tr class="border-b border-white/5"><td class="py-1 pr-3 font-mono text-cyan-200 whitespace-nowrap">{{ r.k }}</td><td class="py-1 text-zinc-300">{{ r.a }}</td></tr> }</table>
            <h3 class="text-amber-300 font-bold uppercase text-xs tracking-wider mt-5 mb-2">On the map</h3>
            <table class="w-full">@for (r of map; track r.k) { <tr class="border-b border-white/5"><td class="py-1 pr-3 font-mono text-cyan-200 whitespace-nowrap">{{ r.k }}</td><td class="py-1 text-zinc-300">{{ r.a }}</td></tr> }</table>
          </section>
        </div>
        <p class="text-[11px] text-zinc-500 mt-4">Hold <b>Share / View</b> as a modifier for the second layer. Press Share alone for telemetry.</p>
      </div>
    </div>
  `,
})
export class HelpComponent {
  closeModal = output<void>();
  readonly pad: Row[] = [
    { k: 'Left stick', a: 'Steer' }, { k: 'Right stick', a: 'Look around (eases back to centre)' }, { k: 'R3', a: 'Recentre view' }, { k: 'L3', a: 'Horn (hold)' },
    { k: 'R2 / L2', a: 'Accelerate / brake & reverse' }, { k: 'R1 / L1', a: 'Gear up / down' },
    { k: 'Cross (A)', a: 'Handbrake' }, { k: 'Circle (B)', a: 'Look back (hold)' }, { k: 'Square (X)', a: 'Change camera' }, { k: 'Triangle (Y)', a: 'Reset car upright (hold)' },
    { k: 'D-pad ◀ / ▶', a: 'Left / right indicator (cancels itself after the turn)' }, { k: 'D-pad ▲', a: 'Headlights: off → low → high' }, { k: 'D-pad ▼', a: 'Hazard lights' },
    { k: 'Options (Menu)', a: 'GPS map' }, { k: 'Home (PS)', a: 'Photo mode' },
    { k: 'Share + ▲ / ▼', a: 'Weather / graphics quality' }, { k: 'Share + ◀ / ▶', a: 'Car select / FPS counter' },
    { k: 'Share + Cross', a: 'Vibration on/off' }, { k: 'Share + Circle', a: 'Mute' }, { k: 'Share + Square', a: 'Garage' }, { k: 'Share + Triangle', a: 'World tools' }, { k: 'Share + Options', a: 'This help' },
  ];
  readonly keys: Row[] = [
    { k: 'W A S D / arrows', a: 'Drive' }, { k: 'Space', a: 'Handbrake' }, { k: 'Right-mouse drag', a: 'Look around' }, { k: 'K', a: 'Recentre view' },
    { k: ', and .', a: 'Left / right indicator' }, { k: 'X', a: 'Hazard lights' }, { k: 'L', a: 'Headlights' }, { k: 'B', a: 'Horn (hold)' },
    { k: 'C', a: 'Camera' }, { k: 'R', a: 'Reset car' }, { k: 'M', a: 'Map' }, { k: 'P', a: 'Photo mode' }, { k: 'T', a: 'Telemetry' }, { k: 'V', a: 'Cars' },
    { k: 'G', a: 'Weather' }, { k: 'J', a: 'Cops & robbers on/off (cops hear engine, skids, horn; see lights)' }, { k: 'Q', a: 'Graphics quality' }, { k: 'H', a: 'Vibration' }, { k: 'N', a: 'Street races (1-7 picks an event; N again abandons)' }, { k: 'F', a: 'FPS' }, { k: 'I / F1 / ?', a: 'This help' },
  ];
  readonly map: Row[] = [
    { k: 'Left stick / drag', a: 'Pan' }, { k: 'R2 / L2 · wheel', a: 'Zoom in / out' }, { k: 'Cross (A) · click', a: 'Set waypoint' }, { k: 'Square (X) · Del', a: 'Clear waypoint' },
    { k: 'Triangle (Y) · space', a: 'Centre on me' }, { k: 'Circle (B) · Esc', a: 'Close' },
  ];
}
