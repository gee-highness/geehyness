export type VehicleArchetypeId = 'AWD_GRIP' | 'RWD_DRIFT' | 'HEAVY_CRUISER';

export interface VehicleArchetypeConfig {
  id: VehicleArchetypeId;
  name: string;
  tagline: string;
  driveType: 'AWD' | 'RWD' | 'FWD';
  massKg: number;
  engineMaxPowerKw: number;
  enginePeakRpm: number;
  engineMaxRpm: number;
  engineIdleRpm: number;
  gearRatios: number[];
  finalDrive: number;
  wheelBaseM: number;
  trackWidthM: number;
  suspensionRestLengthM: number;
  suspensionStiffness: number;
  suspensionDamping: number;
  tireGripPeak: number;
  downforceCoefficient: number;
  dragCoefficient: number;
}

export interface TuningSetup {
  tirePressureFrontPsi: number;
  tirePressureRearPsi: number;
  finalDriveRatio: number;
  gearRatios: [number, number, number, number, number, number];
  camberFrontDeg: number;
  camberRearDeg: number;
  toeFrontDeg: number;
  toeRearDeg: number;
  antiRollBarFront: number;
  antiRollBarRear: number;
  springRateFront: number;
  springRateRear: number;
  rideHeightFrontMm: number;
  rideHeightRearMm: number;
  bumpDampingFront: number;
  bumpDampingRear: number;
  reboundDampingFront: number;
  reboundDampingRear: number;
  aeroDownforceFrontKg: number;
  aeroDownforceRearKg: number;
  brakeBiasFrontPct: number;
  brakePressurePct: number;
  diffAccelLockPct: number;
  diffDecelLockPct: number;
}

export interface VisualCustomization {
  paintFinish: 'gloss' | 'metallic' | 'matte' | 'pearlescent';
  bodyColor: string;
  accentColor: string;
  rimColor: string;
  caliperColor: string;
  windowTint: number;
  underglowColor: string;
  underglowEnabled: boolean;
  activeSpoiler: boolean;
  liveryNumber: string;
}

export interface WheelState {
  index: number;
  name: 'FL' | 'FR' | 'RL' | 'RR';
  isSteerable: boolean;
  isDriven: boolean;
  compressionM: number;
  suspensionForceN: number;
  verticalLoadN: number;
  angularVelocityRadS: number;
  slipRatioPct: number;
  slipAngleDeg: number;
  lateralForceN: number;
  longitudinalForceN: number;
  temperatureC: number;
  rotorTemperatureC: number;
  isLocked: boolean;
  isSkidding: boolean;
  surfaceClass: number;
  surfaceName: string;
  surfaceGrip: number;
}

export interface VehicleTelemetry {
  speedKmh: number;
  rpm: number;
  gear: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
  steerAngleDeg: number;
  gForceLateral: number;
  gForceLongitudinal: number;
  gForceVertical: number;
  powerKw: number;
  torqueNm: number;
  isDrifting: boolean;
  driftAngleDeg: number;
  driftScoreSession: number;
  activeAeroAngleDeg: number;
  exhaustTempC: number;
  backfirePop: boolean;
  isAirborne: boolean;
  airTimeSeconds: number;
  jumpDistanceM: number;
  wheels: [WheelState, WheelState, WheelState, WheelState];
}
