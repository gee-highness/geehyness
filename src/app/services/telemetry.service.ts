import { Injectable, signal } from '@angular/core';
import { VehicleTelemetry, WheelState } from '../models/vehicle.types';

const createDefaultWheel = (name: 'FL' | 'FR' | 'RL' | 'RR', index: number): WheelState => ({
  index,
  name,
  isSteerable: index < 2,
  isDriven: true,
  compressionM: 0.12,
  suspensionForceN: 3400,
  verticalLoadN: 3400,
  angularVelocityRadS: 0,
  slipRatioPct: 0,
  slipAngleDeg: 0,
  lateralForceN: 0,
  longitudinalForceN: 0,
  temperatureC: 75.0,
  rotorTemperatureC: 180.0,
  isLocked: false,
  isSkidding: false,
  surfaceClass: 11,
  surfaceName: 'Asphalt Highway',
  surfaceGrip: 1.0,
});

export const INITIAL_TELEMETRY: VehicleTelemetry = {
  speedKmh: 0,
  rpm: 900,
  gear: 1,
  throttle: 0,
  brake: 0,
  handbrake: false,
  steerAngleDeg: 0,
  gForceLateral: 0,
  gForceLongitudinal: 0,
  gForceVertical: 1.0,
  powerKw: 0,
  torqueNm: 0,
  isDrifting: false,
  driftAngleDeg: 0,
  driftScoreSession: 0,
  activeAeroAngleDeg: 12,
  exhaustTempC: 380,
  backfirePop: false,
  isAirborne: false,
  airTimeSeconds: 0,
  jumpDistanceM: 0,
  wheels: [
    createDefaultWheel('FL', 0),
    createDefaultWheel('FR', 1),
    createDefaultWheel('RL', 2),
    createDefaultWheel('RR', 3),
  ],
};

@Injectable({
  providedIn: 'root'
})
export class TelemetryService {
  readonly telemetry = signal<VehicleTelemetry>({ ...INITIAL_TELEMETRY });
  readonly showTelemetryOverlay = signal<boolean>(false);
  readonly speedKmh = signal<number>(0);
  readonly rpm = signal<number>(900);
  readonly currentGear = signal<number>(1);
  readonly currentSurface = signal<string>('Asphalt Highway');

  // G-Force trail history for friction circle display
  readonly gHistory = signal<{ x: number; y: number }[]>([]);

  private lastThrottledUpdate = 0;
  private readonly THROTTLE_MS = 50; // ~20 Hz snapshot for Angular signals

  public pushSnapshot(data: VehicleTelemetry): void {
    const now = performance.now();
    if (now - this.lastThrottledUpdate < this.THROTTLE_MS) return;
    this.lastThrottledUpdate = now;

    this.telemetry.set(data);
    this.speedKmh.set(Math.round(data.speedKmh));
    this.rpm.set(Math.round(data.rpm));
    this.currentGear.set(data.gear);
    this.currentSurface.set(data.wheels[0].surfaceName);

    // Update G-force trail
    this.gHistory.update(hist => {
      const next = [...hist, { x: data.gForceLateral, y: data.gForceLongitudinal }];
      if (next.length > 25) next.shift();
      return next;
    });
  }

  public toggleTelemetry(): void {
    this.showTelemetryOverlay.update(v => !v);
  }
}
