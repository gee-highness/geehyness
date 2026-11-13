import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { MultiplayerService } from '../../services/multiplayer.service';

/** Online lobby (J): server address, name, room code, roster and chat. Also the small always-on player list + chat feed while connected. */
@Component({
  selector: 'app-multiplayer',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`:host{position:absolute;inset:0;z-index:45;display:block;pointer-events:none}
    .card{background:linear-gradient(160deg,rgba(24,24,27,.9),rgba(9,9,11,.85));backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12);pointer-events:auto}
    input{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:10px 12px;color:#fff;width:100%;font-size:14px;outline:none}
    input:focus{border-color:#34d399}
    .go{background:linear-gradient(135deg,#34d399,#22d3ee);color:#022c22}`],
  template: `
    @if (mp.status() === 'online') {
      <div class="absolute top-16 right-3 w-52 text-white text-xs pointer-events-none select-none" aria-live="polite">
        <div class="font-bold tracking-widest text-emerald-300 text-[10px] mb-1">ONLINE · {{ mp.room() }} · {{ mp.ping() }} ms</div>
        <div class="rounded-lg bg-black/40 px-2 py-1">
          <div class="font-semibold">{{ mp.name() }} (you)</div>
          @for (p of mp.roster(); track p.id) { <div class="text-zinc-200 flex items-center gap-1.5"><i class="inline-block w-2 h-2 rounded-full" [style.background]="p.color"></i>{{ p.name }}</div> }
        </div>
      </div>
      <div class="absolute left-3 bottom-24 sm:bottom-6 w-72 text-white text-xs pointer-events-none select-none">
        @for (c of mp.chat(); track c.at) { <div class="rounded bg-black/45 px-2 py-0.5 mb-0.5"><b class="text-emerald-300">{{ c.name }}</b> {{ c.text }}</div> }
      </div>
    }
    @if (mp.menu()) {
      <div class="absolute inset-0 bg-black/65 flex items-center justify-center p-3 text-white font-sans pointer-events-auto" (click)="mp.menu.set(false)">
        <div class="card w-full max-w-md rounded-3xl p-5 max-h-full overflow-y-auto" (click)="$event.stopPropagation()" role="dialog" aria-label="Multiplayer">
          <div class="flex items-center justify-between"><div><div class="text-[10px] tracking-[0.3em] text-emerald-300 font-bold">ONLINE</div><div class="text-xl font-black">Multiplayer</div></div>
            <button class="w-9 h-9 rounded-full bg-white/10 grid place-items-center cursor-pointer" (click)="mp.menu.set(false)" aria-label="Close"><mat-icon>close</mat-icon></button></div>
          @if (mp.status() === 'offline') {
            <label class="block mt-4 text-[11px] font-bold tracking-wider text-zinc-400">YOUR NAME<input [value]="mp.name()" maxlength="16" (input)="mp.name.set($any($event.target).value)"/></label>
            <label class="block mt-3 text-[11px] font-bold tracking-wider text-zinc-400">ROOM CODE (friends type the same one)<input [value]="mp.code()" maxlength="24" (input)="mp.code.set($any($event.target).value)"/></label>
            @if (mp.error()) { <div class="mt-3 text-sm text-rose-300">{{ mp.error() }}</div> }
            <button class="go w-full mt-4 rounded-2xl py-3 font-black tracking-wider cursor-pointer hover:brightness-110" (click)="mp.connect()">JOIN OR HOST ROOM</button>
            <div class="mt-3 text-[11px] text-zinc-500">No server needed: it works like Ludo Sync. The first player into a room code hosts it, everyone else with the same code joins them directly.</div>
          } @else if (mp.status() === 'connecting') {
            <div class="mt-6 text-center text-zinc-300">Connecting…</div>
            <button class="w-full mt-4 rounded-2xl py-3 font-bold border border-white/20 cursor-pointer" (click)="mp.disconnect()">Cancel</button>
          } @else {
            <div class="mt-4 text-sm text-zinc-300">Room <b class="text-white">{{ mp.room() }}</b> · {{ mp.role() === 'host' ? 'you host' : 'joined' }} · {{ mp.roster().length + 1 }} driving · {{ mp.ping() }} ms</div>
            <form class="mt-3 flex gap-2" (submit)="$event.preventDefault(); say()"><input [value]="msg()" placeholder="Say something…" maxlength="120" (input)="msg.set($any($event.target).value)"/><button class="go rounded-xl px-4 font-black cursor-pointer" type="submit">Send</button></form>
            <button class="w-full mt-4 rounded-2xl py-3 font-bold border border-white/20 cursor-pointer hover:bg-white/10" (click)="mp.disconnect()">Leave room</button>
          }
        </div>
      </div>
    }
  `
})
export class MultiplayerComponent {
  readonly mp = inject(MultiplayerService);
  readonly msg = signal('');
  say(): void { this.mp.say(this.msg()); this.msg.set(''); }
}
