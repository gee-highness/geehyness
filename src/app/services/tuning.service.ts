import { Injectable, signal } from '@angular/core';
import {
  TuningSetup,
  VehicleArchetypeConfig,
  VehicleArchetypeId,
  VisualCustomization
} from '../models/vehicle.types';

export const ARCHETYPES: Record<VehicleArchetypeId, VehicleArchetypeConfig> = {
  AWD_GRIP: {
    id: 'AWD_GRIP',
    name: 'Apex Horizon GT-4',
    tagline: 'Precision All-Wheel Drive track attacker with razor-sharp turn-in',
    driveType: 'AWD',
    massKg: 1380,
    engineMaxPowerKw: 380, // ~510 hp
    enginePeakRpm: 7200,
    engineMaxRpm: 8400,
    engineIdleRpm: 900,
    gearRatios: [3.82, 2.36, 1.68, 1.31, 1.05, 0.84],
    finalDrive: 3.73,
    wheelBaseM: 2.65,
    trackWidthM: 1.82,
    suspensionRestLengthM: 0.38,
    suspensionStiffness: 42000,
    suspensionDamping: 3400,
    tireGripPeak: 1.25,
    downforceCoefficient: 1.8,
    dragCoefficient: 0.32,
  },
  RWD_DRIFT: {
    id: 'RWD_DRIFT',
    name: 'Silvia K-Spec Kouki',
    tagline: 'Turbocharged Rear-Wheel Drive drift weapon engineered for massive slip angles',
    driveType: 'RWD',
    massKg: 1220,
    engineMaxPowerKw: 340, // ~455 hp
    enginePeakRpm: 6800,
    engineMaxRpm: 8200,
    engineIdleRpm: 950,
    gearRatios: [3.62, 2.18, 1.54, 1.21, 1.00, 0.79],
    finalDrive: 4.08,
    wheelBaseM: 2.52,
    trackWidthM: 1.78,
    suspensionRestLengthM: 0.35,
    suspensionStiffness: 35000,
    suspensionDamping: 2900,
    tireGripPeak: 1.05,
    downforceCoefficient: 1.1,
    dragCoefficient: 0.34,
  },
  HEAVY_CRUISER: {
    id: 'HEAVY_CRUISER',
    name: 'Manzini V8 Bruiser',
    tagline: 'Supercharged widebody muscle coupe with overwhelming straight-line torque',
    driveType: 'RWD',
    massKg: 1780,
    engineMaxPowerKw: 480, // ~645 hp
    enginePeakRpm: 6200,
    engineMaxRpm: 7600,
    engineIdleRpm: 850,
    gearRatios: [3.45, 2.05, 1.48, 1.18, 0.96, 0.76],
    finalDrive: 3.42,
    wheelBaseM: 2.85,
    trackWidthM: 1.95,
    suspensionRestLengthM: 0.42,
    suspensionStiffness: 52000,
    suspensionDamping: 4100,
    tireGripPeak: 1.15,
    downforceCoefficient: 1.4,
    dragCoefficient: 0.38,
  },
};

export const DEFAULT_TUNING: TuningSetup = {
  tirePressureFrontPsi: 32.0,
  tirePressureRearPsi: 30.0,
  finalDriveRatio: 3.73,
  gearRatios: [3.82, 2.36, 1.68, 1.31, 1.05, 0.84],
  camberFrontDeg: -1.8,
  camberRearDeg: -1.2,
  toeFrontDeg: 0.1,
  toeRearDeg: -0.1,
  antiRollBarFront: 24.5,
  antiRollBarRear: 22.0,
  springRateFront: 42000,
  springRateRear: 38000,
  rideHeightFrontMm: 120,
  rideHeightRearMm: 125,
  bumpDampingFront: 3400,
  bumpDampingRear: 3100,
  reboundDampingFront: 5200,
  reboundDampingRear: 4800,
  aeroDownforceFrontKg: 85,
  aeroDownforceRearKg: 140,
  brakeBiasFrontPct: 56,
  brakePressurePct: 100,
  diffAccelLockPct: 65,
  diffDecelLockPct: 35,
};

export const DEFAULT_VISUALS: VisualCustomization = {
  paintFinish: 'metallic',
  bodyColor: '#ef4444', // Rosso Corsa Racing Red
  accentColor: '#18181b', // Obsidian Black Trim
  rimColor: '#e4e4e7', // Brushed Silver
  caliperColor: '#eab308', // Brembo Gold
  windowTint: 0.65,
  underglowColor: '#06b6d4', // Cyan Neon
  underglowEnabled: false,
  activeSpoiler: true,
  liveryNumber: '77',
};

@Injectable({
  providedIn: 'root'
})
export class TuningService {
  readonly activeArchetypeId = signal<VehicleArchetypeId>('AWD_GRIP');
  readonly tuning = signal<TuningSetup>({ ...DEFAULT_TUNING });
  readonly visuals = signal<VisualCustomization>({ ...DEFAULT_VISUALS });

  // Dyno performance ratings computed from setup
  readonly estimatedTopSpeedKmh = signal<number>(295);
  readonly estimatedZeroToHundredSeconds = signal<number>(3.2);
  readonly estimatedSkidpadG = signal<number>(1.28);

  constructor() {
    this.recalculateDyno();
  }

  public setArchetype(id: VehicleArchetypeId): void {
    this.activeArchetypeId.set(id);
    const arch = ARCHETYPES[id];
    this.tuning.update(t => ({
      ...t,
      finalDriveRatio: arch.finalDrive,
      gearRatios: arch.gearRatios as [number, number, number, number, number, number],
      springRateFront: arch.suspensionStiffness,
      springRateRear: arch.suspensionStiffness * 0.9,
    }));
    this.recalculateDyno();
  }

  public updateTuning(patch: Partial<TuningSetup>): void {
    this.tuning.update(t => ({ ...t, ...patch }));
    this.recalculateDyno();
  }

  public updateVisuals(patch: Partial<VisualCustomization>): void {
    this.visuals.update(v => ({ ...v, ...patch }));
  }

  public getActiveConfig(): VehicleArchetypeConfig {
    return ARCHETYPES[this.activeArchetypeId()];
  }

  private recalculateDyno(): void {
    const arch = this.getActiveConfig();
    const t = this.tuning();

    // Top speed is determined by final drive, top gear, aerodynamic drag and power
    const topGear = t.gearRatios[5];
    const totalRatio = topGear * t.finalDriveRatio;
    const wheelRadiusM = 0.33;
    const maxSpeedTheoretical = ((arch.engineMaxRpm * 2 * Math.PI * wheelRadiusM) / (totalRatio * 60)) * 3.6;
    const aeroDragLimitKmh = Math.pow((arch.engineMaxPowerKw * 1000) / (0.5 * 1.225 * arch.dragCoefficient * 2.2), 1 / 3) * 3.6;

    const topSpeed = Math.round(Math.min(maxSpeedTheoretical, aeroDragLimitKmh * 1.05));
    this.estimatedTopSpeedKmh.set(topSpeed);

    // 0-100 km/h estimated from power-to-weight and grip
    const powerToWeight = (arch.engineMaxPowerKw * 1.341) / (arch.massKg / 1000); // hp/ton
    const gripFactor = (t.diffAccelLockPct / 100) * (arch.driveType === 'AWD' ? 1.25 : 1.0);
    const base0100 = 1200 / (powerToWeight * gripFactor);
    this.estimatedZeroToHundredSeconds.set(Math.max(2.4, Math.round(base0100 * 10) / 10));

    // Skidpad G
    const aeroFactor = 1 + (t.aeroDownforceFrontKg + t.aeroDownforceRearKg) / arch.massKg;
    const camberBonus = Math.abs(t.camberFrontDeg) * 0.04;
    const skidpadG = Math.round((arch.tireGripPeak * aeroFactor + camberBonus) * 100) / 100;
    this.estimatedSkidpadG.set(skidpadG);
  }
}
