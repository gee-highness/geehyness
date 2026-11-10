export type DistrictId = 'MANZINI' | 'MATSAPHA' | 'FAIRVIEW' | 'NGWANE_PARK' | 'KWALUSENI' | 'AIRPORT' | 'MONENI';

export interface DistrictInfo {
  id: DistrictId;
  name: string;
  tagline: string;
  elevationM: number;
  centerPos: [number, number]; // [x, z] in world metres from Manzini origin
  gpsLonLat: [number, number];
  primarySurfaces: string[];
  landmarks: string[];
  description: string;
}

export interface GroundClassDefinition {
  id: number;
  name: string;
  label: string;
  colorRgb: [number, number, number];
  gripMultiplier: number;
  rollingResistance: number;
  hapticSignature: {
    baseStrong: number;
    baseWeak: number;
    jitter: number;
  };
}

export interface SpeedTrap {
  id: string;
  name: string;
  district: DistrictId;
  position: [number, number]; // [x, z]
  speedLimitKmh: number;
  personalBestKmh: number;
  threeStarTargetKmh: number;
}

export interface DriftZone {
  id: string;
  name: string;
  district: DistrictId;
  startPos: [number, number];
  endPos: [number, number];
  lengthM: number;
  personalBestScore: number;
  threeStarTargetScore: number;
}

export interface DangerSignJump {
  id: string;
  name: string;
  district: DistrictId;
  rampPos: [number, number];
  personalBestDistanceM: number;
  threeStarTargetM: number;
}

export interface RaceEvent {
  id: string;
  title: string;
  type: 'CIRCUIT' | 'POINT_TO_POINT' | 'SPEED_CHALLENGE' | 'DRIFT_SHOWDOWN';
  district: DistrictId;
  laps: number;
  lengthKm: number;
  aiOpponentsCount: number;
  targetTimeMs: number;
  checkpoints: [number, number][]; // list of [x, z] checkpoints
  rewardsCr: number;
  rewardsXp: number;
}

export type WeatherState = 'SUNNY' | 'OVERCAST' | 'MIST' | 'TROPICAL_RAIN';

export interface WorldEnvironmentState {
  timeOfDayHours: number; // 0.0 to 24.0 (e.g. 17.5 = 5:30 PM sunset)
  weather: WeatherState;
  wetness: number; // 0 (dry) to 1.0 (water saturated puddles)
  ambientTempC: number;
  windSpeedKmh: number;
  fogDensity: number;
  sunPosition: [number, number, number];
  sunColorHex: string;
  skyColorHex: string;
}
