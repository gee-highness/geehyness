import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-touch-controls',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 pointer-events-none select-none z-30 flex flex-col justify-between p-4 pb-16 font-sans">
      <!-- Quick Top Right Action Buttons -->
      <div class="flex justify-end gap-2 pointer-events-auto">
        <button
          (touchstart)="onResetTouch($event)"
          (mousedown)="onResetDown()"
          class="w-12 h-12 bg-black/60 active:bg-amber-500 active:text-black backdrop-blur-md rounded-2xl border border-white/20 text-white flex items-center justify-center shadow-lg transition-transform active:scale-90 cursor-pointer"
          title="Reset Car Upright"
        >
          <mat-icon class="text-sm">restart_alt</mat-icon>
        </button>
      </div>

      <!-- Bottom Control Clusters -->
      <div class="flex items-end justify-between pointer-events-none">
        <!-- Left Cluster: Steering (Left / Right) -->
        <div class="flex items-center gap-3 pointer-events-auto">
          <button
            (touchstart)="startSteer(-1, $event)"
            (touchend)="stopSteer($event)"
            (mousedown)="startSteer(-1)"
            (mouseup)="stopSteer()"
            class="w-20 h-20 bg-black/60 active:bg-cyan-500/80 active:text-black backdrop-blur-md rounded-3xl border border-white/20 text-white flex items-center justify-center shadow-2xl transition-transform active:scale-95 cursor-pointer"
          >
            <mat-icon class="text-3xl">arrow_back</mat-icon>
          </button>

          <button
            (touchstart)="startSteer(1, $event)"
            (touchend)="stopSteer($event)"
            (mousedown)="startSteer(1)"
            (mouseup)="stopSteer()"
            class="w-20 h-20 bg-black/60 active:bg-cyan-500/80 active:text-black backdrop-blur-md rounded-3xl border border-white/20 text-white flex items-center justify-center shadow-2xl transition-transform active:scale-95 cursor-pointer"
          >
            <mat-icon class="text-3xl">arrow_forward</mat-icon>
          </button>
        </div>

        <!-- Right Cluster: Gas, Brake & Handbrake -->
        <div class="flex items-end gap-3 pointer-events-auto">
          <!-- Handbrake Button -->
          <button
            (touchstart)="startHandbrake($event)"
            (touchend)="stopHandbrake($event)"
            (mousedown)="startHandbrake()"
            (mouseup)="stopHandbrake()"
            class="w-16 h-16 bg-black/60 active:bg-red-500 active:text-black backdrop-blur-md rounded-2xl border border-white/20 text-white flex flex-col items-center justify-center shadow-2xl transition-transform active:scale-90 cursor-pointer"
          >
            <span class="text-xs font-black uppercase tracking-tighter">E-BRAKE</span>
          </button>

          <!-- Foot Brake / Reverse -->
          <button
            (touchstart)="startBrake($event)"
            (touchend)="stopBrake($event)"
            (mousedown)="startBrake()"
            (mouseup)="stopBrake()"
            class="w-20 h-24 bg-red-950/70 active:bg-red-600 active:text-white backdrop-blur-md rounded-3xl border border-red-500/40 text-red-200 flex flex-col items-center justify-center shadow-2xl transition-transform active:scale-95 cursor-pointer"
          >
            <mat-icon class="text-2xl">arrow_downward</mat-icon>
            <span class="text-[10px] font-black uppercase mt-1">BRAKE</span>
          </button>

          <!-- Throttle Gas Pedal -->
          <button
            (touchstart)="startGas($event)"
            (touchend)="stopGas($event)"
            (mousedown)="startGas()"
            (mouseup)="stopGas()"
            class="w-20 h-32 bg-emerald-950/70 active:bg-emerald-500 active:text-black backdrop-blur-md rounded-3xl border border-emerald-500/40 text-emerald-200 flex flex-col items-center justify-center shadow-2xl transition-transform active:scale-95 cursor-pointer"
          >
            <mat-icon class="text-3xl">arrow_upward</mat-icon>
            <span class="text-[11px] font-black uppercase mt-1">GAS</span>
          </button>
        </div>
      </div>
    </div>
  `
})
export class TouchControlsComponent {
  steer = output<number>();
  throttle = output<number>();
  brake = output<number>();
  handbrake = output<boolean>();
  resetCar = output<void>();

  public startSteer(dir: number, event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.steer.emit(dir);
  }

  public stopSteer(event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.steer.emit(0);
  }

  public startGas(event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.throttle.emit(1.0);
  }

  public stopGas(event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.throttle.emit(0.0);
  }

  public startBrake(event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.brake.emit(1.0);
  }

  public stopBrake(event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.brake.emit(0.0);
  }

  public startHandbrake(event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.handbrake.emit(true);
  }

  public stopHandbrake(event?: TouchEvent): void {
    if (event) event.preventDefault();
    this.handbrake.emit(false);
  }

  public onResetTouch(event: TouchEvent): void {
    event.preventDefault();
    this.resetCar.emit();
  }

  public onResetDown(): void {
    this.resetCar.emit();
  }
}
