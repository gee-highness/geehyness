export interface HapticFrame {
  strong: number; // Low frequency (engine torque, landing, collisions) [0..1]
  weak: number;   // High frequency (tire slip, drift, ABS, kerbs) [0..1]
  durationMs: number;
}

export interface HapticChannelState {
  strong: number;
  weak: number;
  priority: number;
  decayPerSecond: number;
  durationMs: number;
  startTimeMs: number;
}

export type HapticEventSource =
  | 'engine'
  | 'tireSlip'
  | 'surfaceRoughness'
  | 'kerb'
  | 'gearShift'
  | 'absStutter'
  | 'landing'
  | 'collision'
  | 'speedTrap';

export interface GamepadControlsSnapshot {
  connected: boolean;
  id: string;
  isDualShock: boolean;
  hasVibration: boolean;
  steer: number;      // -1 (full left) to +1 (full right)
  throttle: number;   // 0 to 1 (R2 analog)
  brake: number;      // 0 to 1 (L2 analog)
  handbrake: boolean; // Cross button
  shiftUp: boolean;   // R1
  shiftDown: boolean; // L1
  cycleCamera: boolean; // Square
  lookBack: boolean;  // Circle
  resetCar: boolean;  // Triangle (hold)
  toggleMap: boolean; // Options
  toggleTelemetry: boolean; // D-Pad Up
  togglePhoto: boolean;     // D-Pad Down
}
