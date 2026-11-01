import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { TelemetryService } from '../../services/telemetry.service';

@Component({
  selector: 'app-telemetry',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-40 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans">
      <div class="bg-zinc-950/95 border border-white/15 rounded-3xl max-w-4xl w-full p-6 text-white shadow-2xl overflow-y-auto max-h-[90vh]">
        <!-- Header -->
        <div class="flex items-center justify-between pb-4 border-b border-zinc-800">
          <div class="flex items-center gap-3">
            <span class="bg-emerald-500/20 text-emerald-400 p-2 rounded-xl border border-emerald-500/30">
              <mat-icon class="text-xl">query_stats</mat-icon>
            </span>
            <div>
              <h2 class="text-lg font-black tracking-wide uppercase">Forza Live Telemetry</h2>
              <p class="text-xs text-zinc-400">Real-time friction circle, tire thermals, loads & suspension travel</p>
            </div>
          </div>
          <button
            (click)="closeModal.emit()"
            class="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Telemetry Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
          <!-- Column 1: Friction Circle (G-G Diagram) -->
          <div class="bg-zinc-900/70 border border-zinc-800 p-4 rounded-2xl flex flex-col items-center">
            <span class="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2">Friction Circle (G-G)</span>
            <div class="relative w-48 h-48 bg-zinc-950 rounded-full border border-zinc-700 flex items-center justify-center shadow-inner overflow-hidden">
              <!-- Rings for 0.5G, 1.0G, 1.5G -->
              <div class="absolute w-16 h-16 rounded-full border border-zinc-800"></div>
              <div class="absolute w-32 h-32 rounded-full border border-dashed border-zinc-800"></div>
              <div class="absolute w-44 h-44 rounded-full border border-zinc-700"></div>

              <!-- Crosshairs -->
              <div class="absolute w-full h-[1px] bg-zinc-800"></div>
              <div class="absolute h-full w-[1px] bg-zinc-800"></div>

              <!-- Live G-Force Dot -->
              <div
                class="absolute w-3.5 h-3.5 bg-cyan-400 rounded-full shadow-[0_0_12px_#06b6d4] transition-all duration-75"
                [style.transform]="getGForceTransform()"
              ></div>
            </div>

            <!-- Readout -->
            <div class="grid grid-cols-2 gap-4 w-full mt-4 text-center font-mono text-xs">
              <div class="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                <div class="text-[10px] text-zinc-500 uppercase">Lateral G</div>
                <div class="text-base font-black text-cyan-400">{{ telemetryService.telemetry().gForceLateral | number:'1.2-2' }} G</div>
              </div>
              <div class="bg-zinc-950 p-2 rounded-xl border border-zinc-800">
                <div class="text-[10px] text-zinc-500 uppercase">Longitudinal G</div>
                <div class="text-base font-black text-amber-400">{{ telemetryService.telemetry().gForceLongitudinal | number:'1.2-2' }} G</div>
              </div>
            </div>
          </div>

          <!-- Column 2 & 3: 4-Wheel Thermals & Load -->
          <div class="md:col-span-2 grid grid-cols-2 gap-4">
            @for (wheel of telemetryService.telemetry().wheels; track wheel.index) {
              <div class="bg-zinc-900/70 border border-zinc-800 p-3.5 rounded-2xl flex flex-col gap-2">
                <div class="flex items-center justify-between">
                  <span class="font-black text-xs text-white">{{ wheel.name }} ({{ wheel.index < 2 ? 'Front' : 'Rear' }})</span>
                  <span
                    class="text-[10px] px-2 py-0.5 rounded font-bold uppercase"
                    [class.bg-emerald-500-20]="wheel.temperatureC >= 75 && wheel.temperatureC <= 105"
                    [class.text-emerald-400]="wheel.temperatureC >= 75 && wheel.temperatureC <= 105"
                    [class.bg-red-500-20]="wheel.temperatureC > 105"
                    [class.text-red-400]="wheel.temperatureC > 105"
                    [class.bg-sky-500-20]="wheel.temperatureC < 75"
                    [class.text-sky-400]="wheel.temperatureC < 75"
                  >
                    {{ wheel.temperatureC | number:'1.1-1' }} °C
                  </span>
                </div>

                <!-- Vertical Load in Newtons -->
                <div class="flex items-center justify-between text-xs text-zinc-400">
                  <span>Normal Load:</span>
                  <span class="font-mono text-white font-bold">{{ wheel.verticalLoadN | number:'1.0-0' }} N</span>
                </div>

                <!-- Suspension Travel Bar -->
                <div>
                  <div class="flex items-center justify-between text-[11px] text-zinc-400 mb-1">
                    <span>Travel (mm):</span>
                    <span class="font-mono text-zinc-300">{{ (wheel.compressionM * 1000) | number:'1.0-0' }} mm</span>
                  </div>
                  <div class="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800">
                    <div
                      class="h-full bg-emerald-400 rounded-full transition-all duration-75"
                      [style.width.%]="Math.min(100, (wheel.compressionM / 0.25) * 100)"
                    ></div>
                  </div>
                </div>

                <!-- Slip Angle & Brake Rotor Temp -->
                <div class="grid grid-cols-2 gap-2 text-[11px] text-zinc-400 mt-1">
                  <div>
                    <span>Slip Angle:</span>
                    <div class="font-mono text-amber-400 font-bold">{{ wheel.slipAngleDeg | number:'1.1-1' }}°</div>
                  </div>
                  <div>
                    <span>Rotor Heat:</span>
                    <div class="font-mono font-bold" [class.text-red-400]="wheel.rotorTemperatureC > 450" [class.text-zinc-300]="wheel.rotorTemperatureC <= 450">
                      {{ wheel.rotorTemperatureC | number:'1.0-0' }} °C
                    </div>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Drivetrain Dyno Bar (Bottom) -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-4 border-t border-zinc-800 text-center font-mono text-xs">
          <div class="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
            <span class="text-[10px] text-zinc-500 uppercase">Power Output</span>
            <div class="text-lg font-black text-white mt-1">{{ telemetryService.telemetry().powerKw }} kW ({{ Math.round(telemetryService.telemetry().powerKw * 1.341) }} hp)</div>
          </div>
          <div class="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
            <span class="text-[10px] text-zinc-500 uppercase">Flywheel Torque</span>
            <div class="text-lg font-black text-amber-400 mt-1">{{ telemetryService.telemetry().torqueNm }} Nm</div>
          </div>
          <div class="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
            <span class="text-[10px] text-zinc-500 uppercase">Active Aero Tilt</span>
            <div class="text-lg font-black text-cyan-400 mt-1">{{ telemetryService.telemetry().activeAeroAngleDeg }}°</div>
          </div>
          <div class="bg-zinc-900/60 p-3 rounded-2xl border border-zinc-800">
            <span class="text-[10px] text-zinc-500 uppercase">Exhaust Temp</span>
            <div class="text-lg font-black text-red-400 mt-1">{{ telemetryService.telemetry().exhaustTempC }} °C</div>
          </div>
        </div>
      </div>
    </div>
  `
})
export class TelemetryComponent {
  public telemetryService = inject(TelemetryService);
  closeModal = output<void>();

  public Math = Math;

  public getGForceTransform(): string {
    const t = this.telemetryService.telemetry();
    // Clamp to 1.5G radius (96px)
    const pxScale = 64; // 1G = 64px
    const x = Math.max(-90, Math.min(90, t.gForceLateral * pxScale));
    const y = Math.max(-90, Math.min(90, -t.gForceLongitudinal * pxScale));
    return `translate(${x}px, ${y}px)`;
  }
}
