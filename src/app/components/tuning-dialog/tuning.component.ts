import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { ARCHETYPES, TuningService } from '../../services/tuning.service';

@Component({
  selector: 'app-tuning',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans">
      <div class="bg-zinc-950 border border-white/15 rounded-3xl max-w-4xl w-full p-6 text-white shadow-2xl overflow-y-auto max-h-[92vh]">
        <!-- Header -->
        <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div class="flex items-center gap-3">
            <span class="bg-cyan-500/20 text-cyan-400 p-2 rounded-xl border border-cyan-500/30">
              <mat-icon class="text-xl">tune</mat-icon>
            </span>
            <div>
              <h2 class="text-lg font-black tracking-wide uppercase">Forza Workshop & Garage</h2>
              <p class="text-xs text-zinc-400">Mechanical tuning, alignment, gear ratios, differential & paint</p>
            </div>
          </div>
          <button
            (click)="closeModal.emit()"
            class="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Vehicle Archetype Selector -->
        <div class="mt-6">
          <div class="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">Select Vehicle Archetype</div>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            @for (arch of archetypesList; track arch.id) {
              <button
                (click)="tuningService.setArchetype(arch.id)"
                class="p-4 rounded-2xl border text-left transition-all cursor-pointer flex flex-col justify-between"
                [class.bg-zinc-900]="tuningService.activeArchetypeId() === arch.id"
                [class.border-cyan-400]="tuningService.activeArchetypeId() === arch.id"
                [class.shadow-[0_0_15px_rgba(6,182,212,0.2)]]="tuningService.activeArchetypeId() === arch.id"
                [class.bg-zinc-950]="tuningService.activeArchetypeId() !== arch.id"
                [class.border-zinc-800]="tuningService.activeArchetypeId() !== arch.id"
              >
                <div>
                  <div class="flex items-center justify-between">
                    <span class="font-black text-sm text-white">{{ arch.name }}</span>
                    <span class="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-zinc-800 text-cyan-300">{{ arch.driveType }}</span>
                  </div>
                  <p class="text-[11px] text-zinc-400 mt-1 line-clamp-2 leading-relaxed">{{ arch.tagline }}</p>
                </div>
                <div class="mt-3 flex items-center justify-between text-[11px] font-mono text-zinc-400 pt-2 border-t border-zinc-800/80">
                  <span>{{ Math.round(arch.engineMaxPowerKw * 1.341) }} HP</span>
                  <span>{{ arch.massKg }} KG</span>
                </div>
              </button>
            }
          </div>
        </div>

        <!-- Dyno Performance Ratings -->
        <div class="grid grid-cols-3 gap-4 mt-6 bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800 text-center font-mono">
          <div>
            <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Top Speed</span>
            <div class="text-2xl font-black text-white mt-0.5">{{ tuningService.estimatedTopSpeedKmh() }} <span class="text-xs font-normal text-zinc-400">KM/H</span></div>
          </div>
          <div>
            <span class="text-[10px] text-zinc-500 uppercase tracking-wider">0 - 100 KM/H</span>
            <div class="text-2xl font-black text-amber-400 mt-0.5">{{ tuningService.estimatedZeroToHundredSeconds() }} <span class="text-xs font-normal text-zinc-400">SEC</span></div>
          </div>
          <div>
            <span class="text-[10px] text-zinc-500 uppercase tracking-wider">Skidpad Grip</span>
            <div class="text-2xl font-black text-cyan-400 mt-0.5">{{ tuningService.estimatedSkidpadG() }} <span class="text-xs font-normal text-zinc-400">G</span></div>
          </div>
        </div>

        <!-- Workshop Tabs -->
        <div class="flex items-center gap-2 mt-6 pb-2 border-b border-zinc-800 overflow-x-auto">
          <button
            (click)="activeTab.set('alignment')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
            [class.bg-white]="activeTab() === 'alignment'"
            [class.text-zinc-950]="activeTab() === 'alignment'"
            [class.text-zinc-400]="activeTab() !== 'alignment'"
          >
            Alignment & ARB
          </button>
          <button
            (click)="activeTab.set('springs')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
            [class.bg-white]="activeTab() === 'springs'"
            [class.text-zinc-950]="activeTab() === 'springs'"
            [class.text-zinc-400]="activeTab() !== 'springs'"
          >
            Springs & Dampers
          </button>
          <button
            (click)="activeTab.set('gearing')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
            [class.bg-white]="activeTab() === 'gearing'"
            [class.text-zinc-950]="activeTab() === 'gearing'"
            [class.text-zinc-400]="activeTab() !== 'gearing'"
          >
            Gearing & Diff
          </button>
          <button
            (click)="activeTab.set('visuals')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer whitespace-nowrap"
            [class.bg-white]="activeTab() === 'visuals'"
            [class.text-zinc-950]="activeTab() === 'visuals'"
            [class.text-zinc-400]="activeTab() !== 'visuals'"
          >
            Paint & Livery
          </button>
        </div>

        <!-- Tab 1: Alignment & ARB -->
        @if (activeTab() === 'alignment') {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
            <!-- Front Camber -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Front Camber Angle</span>
                <span class="font-mono text-cyan-400">{{ tuningService.tuning().camberFrontDeg }}°</span>
              </div>
              <input
                type="range" min="-3.5" max="0.0" step="0.1"
                [value]="tuningService.tuning().camberFrontDeg"
                (input)="onSliderChange('camberFrontDeg', $event)"
                class="w-full accent-cyan-400 cursor-pointer"
              />
              <span class="text-[10px] text-zinc-500">More negative camber sharpens corner turn-in at high lateral G</span>
            </div>

            <!-- Rear Camber -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Rear Camber Angle</span>
                <span class="font-mono text-cyan-400">{{ tuningService.tuning().camberRearDeg }}°</span>
              </div>
              <input
                type="range" min="-3.0" max="0.0" step="0.1"
                [value]="tuningService.tuning().camberRearDeg"
                (input)="onSliderChange('camberRearDeg', $event)"
                class="w-full accent-cyan-400 cursor-pointer"
              />
              <span class="text-[10px] text-zinc-500">Balances rear traction stability vs progressive breakaway</span>
            </div>

            <!-- Anti-Roll Bar Front -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Front Anti-Roll Bar</span>
                <span class="font-mono text-amber-400">{{ tuningService.tuning().antiRollBarFront }}</span>
              </div>
              <input
                type="range" min="10" max="50" step="0.5"
                [value]="tuningService.tuning().antiRollBarFront"
                (input)="onSliderChange('antiRollBarFront', $event)"
                class="w-full accent-amber-400 cursor-pointer"
              />
              <span class="text-[10px] text-zinc-500">Stiffer front reduces body roll but induces understeer</span>
            </div>

            <!-- Anti-Roll Bar Rear -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Rear Anti-Roll Bar</span>
                <span class="font-mono text-amber-400">{{ tuningService.tuning().antiRollBarRear }}</span>
              </div>
              <input
                type="range" min="10" max="50" step="0.5"
                [value]="tuningService.tuning().antiRollBarRear"
                (input)="onSliderChange('antiRollBarRear', $event)"
                class="w-full accent-amber-400 cursor-pointer"
              />
              <span class="text-[10px] text-zinc-500">Stiffer rear aids rotation and drift initiation</span>
            </div>
          </div>
        }

        <!-- Tab 2: Springs & Dampers -->
        @if (activeTab() === 'springs') {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
            <!-- Front Ride Height -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Front Ride Height</span>
                <span class="font-mono text-emerald-400">{{ tuningService.tuning().rideHeightFrontMm }} mm</span>
              </div>
              <input
                type="range" min="80" max="180" step="5"
                [value]="tuningService.tuning().rideHeightFrontMm"
                (input)="onSliderChange('rideHeightFrontMm', $event)"
                class="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <!-- Rear Ride Height -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Rear Ride Height</span>
                <span class="font-mono text-emerald-400">{{ tuningService.tuning().rideHeightRearMm }} mm</span>
              </div>
              <input
                type="range" min="80" max="180" step="5"
                [value]="tuningService.tuning().rideHeightRearMm"
                (input)="onSliderChange('rideHeightRearMm', $event)"
                class="w-full accent-emerald-400 cursor-pointer"
              />
            </div>

            <!-- Front Bump Damping -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Bump Damping (Compression)</span>
                <span class="font-mono text-cyan-400">{{ tuningService.tuning().bumpDampingFront }} N·s/m</span>
              </div>
              <input
                type="range" min="1500" max="6000" step="100"
                [value]="tuningService.tuning().bumpDampingFront"
                (input)="onSliderChange('bumpDampingFront', $event)"
                class="w-full accent-cyan-400 cursor-pointer"
              />
            </div>

            <!-- Rear Rebound Damping -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Rebound Damping (Extension)</span>
                <span class="font-mono text-cyan-400">{{ tuningService.tuning().reboundDampingRear }} N·s/m</span>
              </div>
              <input
                type="range" min="2000" max="8000" step="100"
                [value]="tuningService.tuning().reboundDampingRear"
                (input)="onSliderChange('reboundDampingRear', $event)"
                class="w-full accent-cyan-400 cursor-pointer"
              />
            </div>
          </div>
        }

        <!-- Tab 3: Gearing & Differential -->
        @if (activeTab() === 'gearing') {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
            <!-- Final Drive Ratio -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Final Drive Ratio</span>
                <span class="font-mono text-amber-400">{{ tuningService.tuning().finalDriveRatio }}</span>
              </div>
              <input
                type="range" min="2.80" max="4.80" step="0.05"
                [value]="tuningService.tuning().finalDriveRatio"
                (input)="onSliderChange('finalDriveRatio', $event)"
                class="w-full accent-amber-400 cursor-pointer"
              />
              <span class="text-[10px] text-zinc-500">Higher ratio gives blistering acceleration; lower ratio gives higher top speed</span>
            </div>

            <!-- Differential Accel Lock -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-zinc-300 font-bold">Differential Acceleration Lock</span>
                <span class="font-mono text-amber-400">{{ tuningService.tuning().diffAccelLockPct }}%</span>
              </div>
              <input
                type="range" min="20" max="100" step="5"
                [value]="tuningService.tuning().diffAccelLockPct"
                (input)="onSliderChange('diffAccelLockPct', $event)"
                class="w-full accent-amber-400 cursor-pointer"
              />
              <span class="text-[10px] text-zinc-500">Locks driven wheels together under throttle for sustained drifts</span>
            </div>
          </div>
        }

        <!-- Tab 4: Paint & Visuals -->
        @if (activeTab() === 'visuals') {
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-6">
            <!-- Body Paint Finish & Color -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
              <span class="text-xs font-bold text-zinc-300 block mb-2">Body Color & Finish</span>
              <div class="flex items-center gap-3 mb-4">
                @for (finish of paintFinishes; track finish) {
                  <button
                    (click)="setPaintFinish(finish)"
                    class="px-2.5 py-1 text-[11px] font-bold rounded-lg uppercase cursor-pointer transition-colors"
                    [class.bg-white]="tuningService.visuals().paintFinish === finish"
                    [class.text-zinc-950]="tuningService.visuals().paintFinish === finish"
                    [class.text-zinc-400]="tuningService.visuals().paintFinish !== finish"
                  >
                    {{ finish }}
                  </button>
                }
              </div>

              <!-- Color Swatches -->
              <div class="flex items-center gap-3">
                @for (color of ['#ef4444', '#0284c7', '#18181b', '#eab308', '#16a34a', '#8b5cf6', '#f97316']; track color) {
                  <button
                    (click)="tuningService.updateVisuals({ bodyColor: color })"
                    class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center"
                    [style.background-color]="color"
                    [attr.aria-label]="'Body color ' + color"
                    [class.border-white]="tuningService.visuals().bodyColor === color"
                    [class.border-transparent]="tuningService.visuals().bodyColor !== color"
                  >
                    <span class="sr-only">{{ color }}</span>
                  </button>
                }
              </div>
            </div>

            <!-- Underglow Neon -->
            <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 flex flex-col justify-between">
              <div>
                <div class="flex items-center justify-between mb-2">
                  <span class="text-xs font-bold text-zinc-300">Underglow Neon</span>
                  <input
                    type="checkbox"
                    [checked]="tuningService.visuals().underglowEnabled"
                    (change)="toggleUnderglow($event)"
                    class="w-4 h-4 accent-cyan-400 cursor-pointer"
                  />
                </div>
                <p class="text-[11px] text-zinc-500 mb-4">Emissive ground illumination beneath chassis</p>
              </div>

              <div class="flex items-center gap-3">
                @for (color of ['#06b6d4', '#ec4899', '#a855f7', '#22c55e', '#facc15']; track color) {
                  <button
                    (click)="tuningService.updateVisuals({ underglowColor: color })"
                    class="w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 cursor-pointer flex items-center justify-center"
                    [style.background-color]="color"
                    [attr.aria-label]="'Underglow color ' + color"
                    [class.border-white]="tuningService.visuals().underglowColor === color"
                    [class.border-transparent]="tuningService.visuals().underglowColor !== color"
                  >
                    <span class="sr-only">{{ color }}</span>
                  </button>
                }
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `
})
export class TuningComponent {
  public tuningService = inject(TuningService);
  closeModal = output<void>();

  readonly archetypesList = Object.values(ARCHETYPES);
  readonly activeTab = signal<'alignment' | 'springs' | 'gearing' | 'visuals'>('alignment');
  readonly paintFinishes: ('metallic' | 'gloss' | 'matte' | 'pearlescent')[] = ['metallic', 'gloss', 'matte', 'pearlescent'];
  public Math = Math;

  public setPaintFinish(finish: 'metallic' | 'gloss' | 'matte' | 'pearlescent'): void {
    this.tuningService.updateVisuals({ paintFinish: finish });
  }

  public onSliderChange(field: string, event: Event): void {
    const val = parseFloat((event.target as HTMLInputElement).value);
    this.tuningService.updateTuning({ [field]: val });
  }

  public toggleUnderglow(event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    this.tuningService.updateVisuals({ underglowEnabled: checked });
  }
}
