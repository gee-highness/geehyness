import { ChangeDetectionStrategy, Component, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

export type PhotoFilter = 'NONE' | 'VIBRANT' | 'SUNSET' | 'NOIR' | 'VINTAGE';

@Component({
  selector: 'app-photo-mode',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 pointer-events-none select-none font-sans">
      <!-- Top Bar: Photo Mode Heading & Exit -->
      <div class="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
        <div class="flex items-center gap-2 bg-black/70 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-white shadow-xl">
          <mat-icon class="text-purple-400">photo_camera</mat-icon>
          <span class="font-black text-sm uppercase tracking-wider">Cinematic Photo Mode</span>
          <span class="text-xs text-zinc-500 font-mono">· Drag to orbit</span>
        </div>

        <button
          (click)="exitPhotoMode.emit()"
          class="flex items-center gap-1.5 bg-black/70 hover:bg-black/90 backdrop-blur-md px-4 py-2 rounded-2xl border border-white/10 text-white text-xs font-bold transition-colors cursor-pointer"
        >
          <mat-icon class="text-sm">close</mat-icon>
          <span>Exit Photo Mode</span>
        </button>
      </div>

      <!-- Rule of Thirds Viewfinder Overlay -->
      <div class="absolute inset-0 pointer-events-none opacity-20">
        <div class="absolute top-1/3 left-0 right-0 h-[1px] bg-white"></div>
        <div class="absolute top-2/3 left-0 right-0 h-[1px] bg-white"></div>
        <div class="absolute left-1/3 top-0 bottom-0 w-[1px] bg-white"></div>
        <div class="absolute left-2/3 top-0 bottom-0 w-[1px] bg-white"></div>
      </div>

      <!-- Bottom Control Bar -->
      <div class="absolute bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto bg-black/85 backdrop-blur-md border border-white/15 p-4 rounded-3xl shadow-2xl text-white max-w-2xl w-full">
        <!-- Controls Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-4 border-b border-zinc-800 text-xs">
          <!-- Focal Length / FOV -->
          <div>
            <div class="flex justify-between text-zinc-400 mb-1">
              <span>Zoom / FOV</span>
              <span class="font-mono text-purple-400 font-bold">{{ fov() }}°</span>
            </div>
            <input
              type="range" min="24" max="95" step="1"
              [value]="fov()"
              (input)="onFovChange($event)"
              class="w-full accent-purple-400 cursor-pointer"
            />
          </div>

          <!-- Camera Distance -->
          <div>
            <div class="flex justify-between text-zinc-400 mb-1">
              <span>Distance</span>
              <span class="font-mono text-purple-400 font-bold">{{ distance() | number:'1.1-1' }} m</span>
            </div>
            <input
              type="range" min="3.0" max="15.0" step="0.5"
              [value]="distance()"
              (input)="onDistanceChange($event)"
              class="w-full accent-purple-400 cursor-pointer"
            />
          </div>

          <!-- Camera Orbit Angle -->
          <div>
            <div class="flex justify-between text-zinc-400 mb-1">
              <span>Orbit Angle</span>
              <span class="font-mono text-purple-400 font-bold">{{ Math.round(theta() * 57.3) }}°</span>
            </div>
            <input
              type="range" min="-3.14" max="3.14" step="0.05"
              [value]="theta()"
              (input)="onThetaChange($event)"
              class="w-full accent-purple-400 cursor-pointer"
            />
          </div>

          <!-- Camera Height / Elevation -->
          <div>
            <div class="flex justify-between text-zinc-400 mb-1">
              <span>Height</span>
              <span class="font-mono text-purple-400 font-bold">{{ Math.round(phi() * 57.3) }}°</span>
            </div>
            <input
              type="range" min="0.1" max="1.5" step="0.05"
              [value]="phi()"
              (input)="onPhiChange($event)"
              class="w-full accent-purple-400 cursor-pointer"
            />
          </div>
        </div>

        <!-- Action Row: Shutter Button -->
        <div class="flex items-center justify-between pt-3">
          <div class="flex items-center gap-2">
            @for (filter of ['NONE', 'VIBRANT', 'SUNSET', 'NOIR']; track filter) {
              <button
                (click)="activeFilter.set(filter)"
                class="px-2.5 py-1 text-[11px] font-bold rounded-lg uppercase cursor-pointer transition-colors"
                [class.bg-purple-600]="activeFilter() === filter"
                [class.text-white]="activeFilter() === filter"
                [class.bg-zinc-800]="activeFilter() !== filter"
                [class.text-zinc-400]="activeFilter() !== filter"
              >
                {{ filter }}
              </button>
            }
          </div>

          <!-- Big Shutter Button -->
          <button
            (click)="capturePhoto.emit()"
            class="flex items-center gap-2 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white font-black px-5 py-2.5 rounded-2xl shadow-lg transition-transform hover:scale-105 active:scale-95 cursor-pointer text-xs"
          >
            <mat-icon class="text-sm">camera</mat-icon>
            <span>Capture Photo</span>
          </button>
        </div>
      </div>
    </div>
  `
})
export class PhotoModeComponent {
  exitPhotoMode = output<void>();
  capturePhoto = output<void>();

  readonly fov = signal<number>(55);
  readonly distance = signal<number>(6.5);
  readonly theta = signal<number>(0.4);
  readonly phi = signal<number>(0.85);
  readonly activeFilter = signal<string>('NONE');

  public Math = Math;

  public onFovChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.fov.set(val);
  }

  public onDistanceChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.distance.set(val);
  }

  public onThetaChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.theta.set(val);
  }

  public onPhiChange(event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.phi.set(val);
  }
}
