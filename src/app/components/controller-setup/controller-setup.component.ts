import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { GamepadService } from '../../services/gamepad.service';

/** F2: teach the game any controller, wheel or pedal set. Each step watches for the biggest movement, saves it per device. */
@Component({
  selector: 'app-controller-setup',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="absolute inset-0 z-[60] bg-black/70 flex items-center justify-center p-4 text-white font-sans" (click)="closeModal.emit()">
      <div class="w-full max-w-md rounded-3xl p-6 border border-white/15 bg-zinc-900/95" (click)="$event.stopPropagation()" role="dialog" aria-label="Controller setup">
        <div class="text-[10px] tracking-[0.3em] text-cyan-300 font-bold">CONTROLS</div>
        <div class="text-xl font-black mb-3">Controller setup</div>
        @if (!pad.isConnected()) {
          <p class="text-sm text-zinc-300">No controller detected. Plug it in (or turn it on), then <b>press any button on it</b> while this window is focused. Keyboard always works: W A S D or arrow keys, Space = handbrake, B = horn.</p>
        } @else if (pad.learn(); as l) {
          <div class="text-xs text-zinc-400 mb-1">{{ pad.controllerName() }}</div>
          <div class="text-lg font-bold text-amber-300 my-3 min-h-[3.5rem]">{{ l.prompt }}</div>
          <div class="flex gap-1.5 mb-4">@for (s of steps; track s) { <span class="flex-1 h-1.5 rounded" [class.bg-cyan-400]="l.done.includes(s)" [class.bg-white/15]="!l.done.includes(s)"></span> }</div>
          <button class="w-full rounded-2xl py-3 font-bold border border-white/20 cursor-pointer hover:bg-white/10" (click)="pad.cancelLearn()">Cancel</button>
        } @else {
          <div class="text-xs text-zinc-400">{{ pad.controllerName() }}</div>
          <p class="text-sm text-zinc-300 mt-2">{{ pad.hasCustomMap() ? 'This controller uses your saved setup.' : 'Detected automatically (Xbox, PlayStation, Switch, generic, wheels). If steering or pedals feel wrong, teach the game in four quick steps.' }}</p>
          <button class="w-full mt-4 rounded-2xl py-3 font-black text-zinc-950 cursor-pointer hover:brightness-110" style="background:linear-gradient(135deg,#22d3ee,#34d399)" (click)="pad.startLearn()">SET UP THIS CONTROLLER</button>
          @if (pad.hasCustomMap()) { <button class="w-full mt-2 rounded-2xl py-3 font-bold border border-white/20 cursor-pointer hover:bg-white/10" (click)="pad.resetMap()">Back to automatic</button> }
          <button class="w-full mt-2 rounded-2xl py-3 font-bold border border-white/20 cursor-pointer hover:bg-white/10" (click)="closeModal.emit()">Close</button>
        }
      </div>
    </div>
  `
})
export class ControllerSetupComponent {
  readonly pad = inject(GamepadService);
  readonly steps = ['steer', 'throttle', 'brake', 'handbrake'];
  closeModal = output<void>();
  current = input<boolean>(true);
}
