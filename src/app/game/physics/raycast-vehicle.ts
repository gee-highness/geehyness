import * as THREE from 'three';
import { TuningSetup, VehicleArchetypeConfig, VehicleTelemetry, WheelState } from '../../models/vehicle.types';

export class RaycastVehicle {
  public position = new THREE.Vector3(3.6, 0.45, 0); // lane centre, clear of median barrier
  public velocity = new THREE.Vector3();
  public angularVelocity = new THREE.Vector3();
  public quaternion = new THREE.Quaternion();

  // Controls input
  public throttle = 0;
  public brake = 0;
  public steerInput = 0;
  public handbrake = false;

  // Drivetrain state
  public currentGear = 1;
  public currentRpm = 900;
  public engineLoad = 0;
  public isAutomatic = true;

  // Active aero
  public activeAeroAngleDeg = 10;

  // Thermals
  public exhaustTempC = 380;
  public backfireTriggered = false;

  // Flight & jump stats
  public isAirborne = false;
  public airTimeSeconds = 0;
  public jumpLaunchPos: THREE.Vector3 | null = null;
  public lastJumpDistanceM = 0;

  // Drift score
  public isDrifting = false;
  public driftAngleDeg = 0;
  public driftScore = 0;

  // G-Forces
  public gForceLateral = 0;
  public gForceLongitudinal = 0;
  public gForceVertical = 1.0;

  // 4 wheels: FL, FR, RL, RR
  public wheels: WheelState[];

  // Reusable math scratch vectors (zero-allocation in loop)
  // scratch objects: the physics step must not allocate (garbage-collection hitches ruin 60 fps on phones)
  private _tq = new THREE.Vector3(); private _nf = new THREE.Vector3(); private _off = new THREE.Vector3(); private _wp = new THREE.Vector3();
  private _sf = new THREE.Vector3(); private _ta = new THREE.Vector3(); private _po = new THREE.Vector3(); private _wv = new THREE.Vector3();
  private _wf = new THREE.Vector3(); private _wr = new THREE.Vector3(); private _lf = new THREE.Vector3(); private _tb = new THREE.Vector3();
  private _wb = new THREE.Vector3(); private _ab = new THREE.Vector3(); private _ax = new THREE.Vector3();
  private _q1 = new THREE.Quaternion(); private _q2 = new THREE.Quaternion(); private _qs = new THREE.Quaternion(); private _qw = new THREE.Quaternion();
  private static Y = new THREE.Vector3(0, 1, 0);
  private _forward = new THREE.Vector3();
  private _up = new THREE.Vector3();
  private _right = new THREE.Vector3();
  private _wheelOffset = [
    new THREE.Vector3(-0.9, -0.1, 1.35),  // FL
    new THREE.Vector3(0.9, -0.1, 1.35),   // FR
    new THREE.Vector3(-0.9, -0.1, -1.35), // RL
    new THREE.Vector3(0.9, -0.1, -1.35),  // RR
  ];

  constructor(
    public config: VehicleArchetypeConfig,
    public tuning: TuningSetup
  ) {
    this.wheels = [
      this.initWheel(0, 'FL', true, config.driveType !== 'RWD'),
      this.initWheel(1, 'FR', true, config.driveType !== 'RWD'),
      this.initWheel(2, 'RL', false, config.driveType !== 'FWD'),
      this.initWheel(3, 'RR', false, config.driveType !== 'FWD'),
    ];
    this.updateWheelGeometry();
  }

  private initWheel(index: number, name: 'FL' | 'FR' | 'RL' | 'RR', isSteer: boolean, isDriven: boolean): WheelState {
    return {
      index,
      name,
      isSteerable: isSteer,
      isDriven,
      compressionM: 0.1,
      suspensionForceN: (this.config.massKg * 9.81) / 4,
      verticalLoadN: (this.config.massKg * 9.81) / 4,
      angularVelocityRadS: 0,
      slipRatioPct: 0,
      slipAngleDeg: 0,
      lateralForceN: 0,
      longitudinalForceN: 0,
      temperatureC: 70,
      rotorTemperatureC: 150,
      isLocked: false,
      isSkidding: false,
      surfaceClass: 11,
      surfaceName: 'Asphalt Highway',
      surfaceGrip: 1.0,
    };
  }

  public updateWheelGeometry(): void {
    const halfTrack = this.config.trackWidthM * 0.5;
    const halfBase = this.config.wheelBaseM * 0.5;
    this._wheelOffset[0].set(-halfTrack, -0.05, halfBase);
    this._wheelOffset[1].set(halfTrack, -0.05, halfBase);
    this._wheelOffset[2].set(-halfTrack, -0.05, -halfBase);
    this._wheelOffset[3].set(halfTrack, -0.05, -halfBase);
  }

  /**
   * Fixed-step physics update.
   */
  public updatePhysics(dt: number, groundQuery: (x: number, z: number, y?: number) => { height: number; normal: THREE.Vector3; surfaceClass: number; surfaceName?: string }, terrainHeight?: (x: number, z: number) => number): void {
    this._forward.set(0, 0, 1).applyQuaternion(this.quaternion);
    this._up.set(0, 1, 0).applyQuaternion(this.quaternion);
    this._right.set(1, 0, 0).applyQuaternion(this.quaternion);

    const speedMs = this.velocity.dot(this._forward);
    const speedKmh = Math.abs(speedMs * 3.6);

    // 1. Suspension & Wheel Raycasting
    const totalTorque = this._tq.set(0, 0, 0);
    let groundedWheels = 0;

    const netForce = this._nf.set(0, -9.81 * this.config.massKg, 0);

    // Anti-Roll Bar calculation (transfer load between left and right)
    const arbFront = (this.wheels[0].compressionM - this.wheels[1].compressionM) * this.tuning.antiRollBarFront * 100;
    const arbRear = (this.wheels[2].compressionM - this.wheels[3].compressionM) * this.tuning.antiRollBarRear * 100;

    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const offsetWorld = this._off.copy(this._wheelOffset[i]).applyQuaternion(this.quaternion);
      const wheelPos = this._wp.copy(this.position).add(offsetWorld);

      // Raycast downward
      const ground = groundQuery(wheelPos.x, wheelPos.z, wheelPos.y);
      const restLength = this.config.suspensionRestLengthM;
      const rayDist = wheelPos.y - ground.height;

      const isContact = rayDist <= restLength && rayDist > -0.5;
      w.surfaceClass = ground.surfaceClass;
      if (ground.surfaceName) w.surfaceName = ground.surfaceName;

      if (isContact) {
        groundedWheels++;
        const compression = Math.max(0, restLength - Math.max(0.05, rayDist));
        w.compressionM = compression;

        // Spring + Damper force
        const k = i < 2 ? this.tuning.springRateFront : this.tuning.springRateRear;
        const pointVelY = this.velocity.y + this.angularVelocity.z * offsetWorld.x - this.angularVelocity.x * offsetWorld.z;
        const bump = i < 2 ? this.tuning.bumpDampingFront : this.tuning.bumpDampingRear;
        const rebound = i < 2 ? this.tuning.reboundDampingFront : this.tuning.reboundDampingRear;
        const springForce = compression * k;
        const damperForce = -pointVelY * (pointVelY < 0 ? bump : rebound);

        // Apply anti-roll bar offset
        let arbOffset = 0;
        if (i === 0) arbOffset = -arbFront;
        else if (i === 1) arbOffset = arbFront;
        else if (i === 2) arbOffset = -arbRear;
        else if (i === 3) arbOffset = arbRear;

        const normalForce = Math.max(0, springForce + damperForce + arbOffset);
        w.verticalLoadN = normalForce;

        const suspForceVec = this._sf.copy(ground.normal).multiplyScalar(normalForce);
        netForce.add(suspForceVec);

        // Calculate lever arm torque
        totalTorque.add(this._ta.copy(offsetWorld).cross(suspForceVec));

        // 2. Pacejka Tire Friction & Slip
        const patchOffset = this._po.copy(offsetWorld); patchOffset.y = ground.height - this.position.y;
        this.computeTireForces(w, i, speedMs, normalForce, ground, dt, netForce, totalTorque, patchOffset);
      } else {
        w.compressionM = 0;
        w.verticalLoadN = 0;
        w.lateralForceN = 0;
        w.longitudinalForceN = 0;
        w.slipAngleDeg = 0;
        w.isSkidding = false;
      }

      // Rotor thermal decay & cooling
      const ambientC = 25;
      w.rotorTemperatureC = Math.max(ambientC, w.rotorTemperatureC - dt * 25);
      w.temperatureC = Math.max(ambientC, w.temperatureC - dt * 2);
    }

    // Airborne & Jump distance tracking
    if (groundedWheels === 0) {
      if (!this.isAirborne) {
        this.isAirborne = true;
        this.airTimeSeconds = 0;
        this.jumpLaunchPos = this.position.clone();
      } else {
        this.airTimeSeconds += dt;
      }
    } else {
      if (this.isAirborne && this.jumpLaunchPos) {
        this.lastJumpDistanceM = Math.round(this.position.distanceTo(this.jumpLaunchPos));
        this.isAirborne = false;
        this.jumpLaunchPos = null;
      }
    }

    // 3. Aerodynamics (Downforce & Drag)
    const dynPressure = 0.5 * 1.225 * Math.pow(Math.max(0, speedMs), 2);
    const aeroDownforceN = (this.tuning.aeroDownforceFrontKg + this.tuning.aeroDownforceRearKg) * 9.81 * (dynPressure / 500);
    netForce.y -= aeroDownforceN;

    // Active Aero wing tilt
    if (this.brake > 0.4 && speedKmh > 90) {
      this.activeAeroAngleDeg = Math.min(65, this.activeAeroAngleDeg + dt * 180); // Airbrake mode
    } else if (speedKmh > 140) {
      this.activeAeroAngleDeg = Math.min(35, this.activeAeroAngleDeg + dt * 45); // Downforce mode
    } else {
      this.activeAeroAngleDeg = Math.max(10, this.activeAeroAngleDeg - dt * 40); // Cruising mode
    }

    const aeroDragN = dynPressure * this.config.dragCoefficient * 2.2;
    netForce.addScaledVector(this._forward, -Math.sign(speedMs) * aeroDragN);

    // 4. Engine & Transmission updates
    this.updatePowertrain(dt, speedMs);

    // 5. Integrate Linear & Angular accelerations
    const linearAccel = netForce.divideScalar(this.config.massKg);
    this.velocity.addScaledVector(linearAccel, dt);

    // Rigid-body rotation with a box inertia tensor (pitch, yaw, roll differ), solved in the body frame
    const m = this.config.massKg, L = this.config.wheelBaseM * 1.65, Wd = this.config.trackWidthM * 1.1, Ht = 1.35;
    const inv = this._q1.copy(this.quaternion).invert();
    const tb = this._tb.copy(totalTorque).applyQuaternion(inv);
    const wb = this._wb.copy(this.angularVelocity).applyQuaternion(inv);
    const Ix = (m * (Ht * Ht + L * L)) / 12, Iy = (m * (Wd * Wd + L * L)) / 12, Iz = (m * (Wd * Wd + Ht * Ht)) / 12;
    const ab = this._ab.set(
      (tb.x - (Iz - Iy) * wb.y * wb.z) / Ix,
      (tb.y - (Ix - Iz) * wb.z * wb.x) / Iy,
      (tb.z - (Iy - Ix) * wb.x * wb.y) / Iz
    );
    this.angularVelocity.addScaledVector(ab.applyQuaternion(this.quaternion), dt);
    this.angularVelocity.multiplyScalar(Math.pow(0.985, dt * 60)); // small structural damping only

    // Parking sleep: a stationary car must not creep or jitter
    if (groundedWheels >= 3 && this.throttle === 0 && Math.hypot(this.velocity.x, this.velocity.z) < 0.5) {
      const k = Math.pow(0.02, dt);
      this.velocity.x *= k; this.velocity.z *= k; this.angularVelocity.y *= k;
      if (this.brake > 0 || this.handbrake) { this.velocity.x = 0; this.velocity.z = 0; }
    }

    // Apply linear translation
    this.position.addScaledVector(this.velocity, dt);

    // Apply rotation (angular velocity is in the world frame, so pre-multiply)
    const angLen = this.angularVelocity.length();
    if (angLen > 1e-6) {
      this.quaternion.premultiply(this._q2.setFromAxisAngle(this._ax.copy(this.angularVelocity).divideScalar(angLen), angLen * dt));
      this.quaternion.normalize();
    }

    this.enforceGround(groundQuery, terrainHeight);

    // Keep car upright stabilization if flipped
    const roll = this._up.y;
    if (roll < 0.3) {
      // Auto righting assist
      const rightingTorque = new THREE.Vector3(0, 1, 0).cross(this._up).multiplyScalar(-dt * 4);
      this.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rightingTorque.x, 0, rightingTorque.z)));
    }

    // Compute G-forces
    this.gForceLateral = -linearAccel.dot(this._right) / 9.81;
    this.gForceLongitudinal = linearAccel.dot(this._forward) / 9.81;
    this.gForceVertical = 1.0 + linearAccel.y / 9.81;

    // Drift Detection
    const lateralVel = Math.abs(this.velocity.dot(this._right));
    this.driftAngleDeg = Math.round(Math.atan2(lateralVel, Math.max(0.1, Math.abs(speedMs))) * (180 / Math.PI));
    this.isDrifting = this.driftAngleDeg > 14 && speedKmh > 30;
    if (this.isDrifting) {
      this.driftScore += Math.round(this.driftAngleDeg * speedKmh * dt * 0.5);
    }
  }

  /**
   * Hard constraint: no wheel mount or underbody/bumper point may ever sit below the terrain.
   * Suspension normally prevents this; this catches hard landings, steep crests and teleports.
   */
  private _pts = [
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
    new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(),
  ];
  private enforceGround(groundQuery: (x: number, z: number, y?: number) => { height: number; normal: THREE.Vector3; surfaceClass: number }, terrainHeight?: (x: number, z: number) => number): void {
    const hl = this.config.wheelBaseM / 2 + 0.85, hw = this.config.trackWidthM / 2 + 0.05, low = -0.26, hb = this.config.wheelBaseM / 2;
    let lift = 0;
    for (let i = 0; i < 8; i++) {
      const bumper = i >= 4, sx = i % 2 ? hw : -hw, sz = (i >> 1) % 2 ? (bumper ? -hl : -hb) : (bumper ? hl : hb);
      const p = this._pts[i].set(sx, bumper ? low : -0.05, sz).applyQuaternion(this.quaternion).add(this.position);
      // cheap terrain test first; the (costlier) road/deck query only matters near the surface
      const th = terrainHeight ? terrainHeight(p.x, p.z) : -1e9;
      if (terrainHeight && p.y > th + 1.1) continue;
      const g = groundQuery(p.x, p.z, p.y).height;
      lift = Math.max(lift, (bumper ? g + 0.03 : g + 0.06) - p.y);
    }
    // centre of mass too, and a deep-void safety net (bad teleport / NaN recovery)
    const thc = terrainHeight ? terrainHeight(this.position.x, this.position.z) : -1e9;
    const gc = terrainHeight && this.position.y > thc + 1.6 ? thc : groundQuery(this.position.x, this.position.z, this.position.y).height;
    lift = Math.max(lift, gc + 0.2 - this.position.y);
    if (!isFinite(this.position.y) || this.position.y < gc - 3) { this.position.y = gc + 1; this.velocity.y = 0; return; }
    if (lift > 0) {
      this.position.y += lift;
      if (this.velocity.y < 0) this.velocity.y *= 0.2; // absorb the impact, no tunnelling
    }
  }

  private computeTireForces(
    w: WheelState,
    wheelIndex: number,
    speedMs: number,
    normalForceN: number,
    ground: { normal: THREE.Vector3; surfaceClass: number },
    dt: number,
    netForce: THREE.Vector3,
    totalTorque: THREE.Vector3,
    offsetWorld: THREE.Vector3
  ): void {
    // Determine wheel forward & right vectors with steering angle
    let steerRad = 0;
    if (w.isSteerable) {
      // Speed-sensitive steering angle (less angle at top speed)
      const speedKmh = Math.abs(speedMs * 3.6);
      const lockMultiplier = Math.max(0.35, 1.0 - speedKmh / 280);
      steerRad = -this.steerInput * THREE.MathUtils.degToRad(35) * lockMultiplier;
    }

    const wheelRot = this._qw.copy(this.quaternion).multiply(this._qs.setFromAxisAngle(RaycastVehicle.Y, steerRad));
    const wheelForward = this._wf.set(0, 0, 1).applyQuaternion(wheelRot);
    const wheelRight = this._wr.set(1, 0, 0).applyQuaternion(wheelRot);

    // Wheel contact velocity
    const wheelVel = this._wv.copy(this.angularVelocity).cross(offsetWorld).add(this.velocity);
    const vLong = wheelVel.dot(wheelForward);
    const vLat = wheelVel.dot(wheelRight);

    // Slip angle (Pacejka input)
    const slipAngle = Math.atan2(vLat, Math.max(0.5, Math.abs(vLong)));
    w.slipAngleDeg = Math.abs(THREE.MathUtils.radToDeg(slipAngle));

    // Base surface grip from ground class
    const surfaceGrip = this.getSurfaceGrip(ground.surfaceClass);
    w.surfaceGrip = surfaceGrip;

    // Camber thrust bonus
    const camber = (wheelIndex % 2 === 0 ? this.tuning.camberFrontDeg : -this.tuning.camberFrontDeg) * (Math.PI / 180);
    const effectivePeakGrip = this.config.tireGripPeak * surfaceGrip * (1.0 + Math.abs(camber) * 0.1);

    // Pacejka Magic Formula curve parameters
    const B = 10.0;
    const C = 1.65;
    const D = normalForceN * effectivePeakGrip;
    const E = -0.6;

    // Drive torque & braking (longitudinal) first, so the lateral force sees the friction circle
    let longForceN = 0;
    const tractionLimit = normalForceN * effectivePeakGrip;
    if (w.isDriven && this.throttle > 0) {
      const driveFraction = this.config.driveType === 'AWD' ? 0.25 : 0.5;
      const engineTorque = this.calculateEngineTorque(this.currentRpm) * this.throttle;
      const gearRatio = this.tuning.gearRatios[this.currentGear - 1] * this.tuning.finalDriveRatio;
      const wheelDriveForce = (engineTorque * gearRatio * 0.9 /* driveline efficiency */) / 0.33 * driveFraction;
      // Locking diff keeps power on the grippy wheel
      longForceN = Math.min(wheelDriveForce, tractionLimit * (0.92 + (this.tuning.diffAccelLockPct / 100) * 0.2));
    }

    if (this.brake > 0) {
      // Bias is per axle, so double it for the per-wheel share; the tyre can never give more than mu * N
      const brakeBias = 2 * (wheelIndex < 2 ? this.tuning.brakeBiasFrontPct / 100 : (100 - this.tuning.brakeBiasFrontPct) / 100);
      const brakeForceN = Math.min(tractionLimit * 0.97, this.brake * (this.tuning.brakePressurePct / 100) * brakeBias * tractionLimit);
      longForceN -= Math.sign(vLong) * Math.min(Math.abs(vLong * this.config.massKg * 0.25), brakeForceN);

      // Heating brake rotors
      w.rotorTemperatureC += this.brake * (normalForceN / 2000) * dt * 90;
      if (w.rotorTemperatureC > 850) w.rotorTemperatureC = 850;
    }

    // Rolling resistance (worse on soft ground) + engine braking when off throttle
    const crr = this.getRollingResistance(ground.surfaceClass);
    longForceN -= Math.sign(vLong) * Math.min(Math.abs(vLong) * this.config.massKg * 0.1, normalForceN * crr);
    if (this.throttle === 0 && w.isDriven && this.brake === 0) longForceN -= Math.sign(vLong) * Math.min(Math.abs(vLong) * 40, normalForceN * 0.04);

    const usage = Math.min(1, Math.abs(longForceN) / Math.max(1, tractionLimit));
    let latForceMagnitude = D * Math.sin(C * Math.atan(B * slipAngle - E * (B * slipAngle - Math.atan(B * slipAngle)))) * Math.sqrt(Math.max(0.04, 1 - usage * usage));

    // Handbrake drops rear lateral grip for drift initiation
    if (this.handbrake && wheelIndex >= 2) {
      latForceMagnitude *= 0.35;
      w.isLocked = true;
      w.isSkidding = true;
    }

    w.lateralForceN = latForceMagnitude;
    const latForceVec = this._lf.copy(wheelRight).multiplyScalar(-latForceMagnitude);
    netForce.add(latForceVec);
    totalTorque.add(this._ta.copy(offsetWorld).cross(latForceVec));

    w.longitudinalForceN = longForceN;
    const longForceVec = this._lf.copy(wheelForward).multiplyScalar(longForceN);
    netForce.add(longForceVec);
    totalTorque.add(this._ta.copy(offsetWorld).cross(longForceVec));

    // Skid detection & tire heat
    w.isSkidding = w.slipAngleDeg > 12 || Math.abs(longForceN) > normalForceN * 0.95;
    if (w.isSkidding) {
      w.temperatureC = Math.min(145, w.temperatureC + dt * 18);
    }
  }

  private updatePowertrain(dt: number, speedMs: number): void {
    const wheelRadiusM = 0.33;
    const currentGearRatio = this.tuning.gearRatios[this.currentGear - 1] * this.tuning.finalDriveRatio;

    // RPM calculated from road speed with engine clutch slip
    const roadRpm = ((Math.abs(speedMs) / (2 * Math.PI * wheelRadiusM)) * 60) * currentGearRatio;
    const targetRpm = Math.max(this.config.engineIdleRpm, Math.min(this.config.engineMaxRpm, roadRpm + this.throttle * 900));

    this.currentRpm = THREE.MathUtils.damp(this.currentRpm, targetRpm, 14, dt);

    // Automatic Gear Shifting
    if (this.isAutomatic) {
      if (this.currentRpm > this.config.enginePeakRpm * 1.08 && this.currentGear < 6) {
        this.currentGear++;
        this.currentRpm *= 0.72; // Gear drop
      } else if (this.currentRpm < this.config.engineIdleRpm * 2.2 && this.currentGear > 1) {
        this.currentGear--;
        this.currentRpm *= 1.35; // Downshift blip
      }
    }

    // Exhaust Backfire & Pop-and-Bang Logic (when releasing throttle from high RPM)
    this.backfireTriggered = false;
    if (this.throttle === 0 && this.currentRpm > 4800 && Math.random() < 0.18) {
      this.backfireTriggered = true;
      this.exhaustTempC = Math.min(750, this.exhaustTempC + 45);
    } else {
      this.exhaustTempC = Math.max(380, this.exhaustTempC - dt * 15);
    }
  }

  private calculateEngineTorque(rpm: number): number {
    const peakRpm = this.config.enginePeakRpm;
    const peakPowerWatts = this.config.engineMaxPowerKw * 1000;
    const peakTorqueNm = (peakPowerWatts * 9.5488) / peakRpm;

    // Torque curve parabola
    const normalized = rpm / peakRpm;
    const curve = Math.max(0.4, Math.sin(normalized * Math.PI * 0.75));
    return peakTorqueNm * curve;
  }

  private getRollingResistance(surfaceClass: number): number {
    switch (surfaceClass) {
      case 11: case 8: case 9: return 0.012;
      case 6: case 7: return 0.04;
      case 10: return 0.1;
      case 12: return 0.12;
      default: return 0.055; // grass, bush, farmland
    }
  }

  private getSurfaceGrip(surfaceClass: number): number {
    switch (surfaceClass) {
      case 11: return 1.0;  // Asphalt
      case 8:  return 0.95; // Urban
      case 9:  return 0.92; // Industrial hardstanding
      case 6:  return 0.75; // Rock/Scree
      case 7:  return 0.70; // Bare soil
      case 3:  return 0.65; // Valley pasture
      case 2:  return 0.62; // Highveld grass
      case 1:  return 0.58; // Bushveld
      case 5:  return 0.55; // Timber pine needles
      case 10: return 0.52; // River sand
      case 4:  return 0.50; // Cane soil
      case 12: return 0.38; // Wetland mud
      default: return 0.90;
    }
  }

  public getTelemetry(): VehicleTelemetry {
    const speedMs = this.velocity.dot(this._forward);
    const speedKmh = Math.abs(speedMs * 3.6);
    const torque = this.calculateEngineTorque(this.currentRpm) * this.throttle;
    const power = (torque * this.currentRpm) / 9548.8;

    return {
      speedKmh,
      rpm: this.currentRpm,
      gear: this.currentGear,
      throttle: this.throttle,
      brake: this.brake,
      handbrake: this.handbrake,
      steerAngleDeg: -this.steerInput * 35,
      gForceLateral: this.gForceLateral,
      gForceLongitudinal: this.gForceLongitudinal,
      gForceVertical: this.gForceVertical,
      powerKw: Math.round(power),
      torqueNm: Math.round(torque),
      isDrifting: this.isDrifting,
      driftAngleDeg: this.driftAngleDeg,
      driftScoreSession: this.driftScore,
      activeAeroAngleDeg: Math.round(this.activeAeroAngleDeg),
      exhaustTempC: Math.round(this.exhaustTempC),
      backfirePop: this.backfireTriggered,
      isAirborne: this.isAirborne,
      airTimeSeconds: Math.round(this.airTimeSeconds * 10) / 10,
      jumpDistanceM: this.lastJumpDistanceM,
      wheels: this.wheels as [WheelState, WheelState, WheelState, WheelState],
    };
  }
}
