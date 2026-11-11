import * as THREE from 'three';

export type CameraViewMode = 'CHASE_NEAR' | 'CHASE_FAR' | 'COCKPIT' | 'BUMPER' | 'PHOTO_FREE';

export class CameraRig {
  public mode: CameraViewMode = 'CHASE_NEAR';
  public camera: THREE.PerspectiveCamera;

  // Smoothing states
  private _f = new THREE.Vector3(); private _u = new THREE.Vector3(); private _t = new THREE.Vector3(); private _l = new THREE.Vector3(); private _k = new THREE.Vector3();
  private currentPos = new THREE.Vector3(0, 3, 7);
  private currentTarget = new THREE.Vector3(0, 1, 0);
  private currentFov = 65;

  // Photo mode free orbit variables
  public photoDistance = 5.5;
  public photoTheta = 0;
  public photoPhi = Math.PI / 4;
  public photoFov = 50;

  // Free-look (right stick / mouse drag): yaw about the car, pitch up/down; eases back to centre when released.
  public lookYaw = 0; public lookPitch = 0; private lookIdle = 0;
  /** x,y in -1..1 (stick) per frame. */
  public look(x: number, y: number, dt: number): void {
    if (Math.abs(x) > 0.001 || Math.abs(y) > 0.001) {
      this.lookIdle = 0;
      this.lookYaw = THREE.MathUtils.clamp(this.lookYaw - x * 2.8 * dt, -Math.PI, Math.PI);
      this.lookPitch = THREE.MathUtils.clamp(this.lookPitch - y * 1.5 * dt, -0.35, 0.85);
    } else { this.lookIdle += dt; if (this.lookIdle > 1.4) { this.lookYaw = THREE.MathUtils.damp(this.lookYaw, 0, 3.5, dt); this.lookPitch = THREE.MathUtils.damp(this.lookPitch, 0, 3.5, dt); } }
  }
  public recentreLook(): void { this.lookYaw = 0; this.lookPitch = 0; this.lookIdle = 99; }

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(65, aspect, 0.3, 4500);
    this.camera.position.copy(this.currentPos);
  }

  public setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  public cycleMode(): CameraViewMode {
    const modes: CameraViewMode[] = ['CHASE_NEAR', 'CHASE_FAR', 'COCKPIT', 'BUMPER'];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
    return this.mode;
  }

  public update(
    dt: number,
    vehiclePos: THREE.Vector3,
    vehicleQuat: THREE.Quaternion,
    speedKmh: number,
    isLookingBack = false
  ): void {
    if (this.mode === 'PHOTO_FREE') {
      // Free orbit around car
      const x = vehiclePos.x + this.photoDistance * Math.sin(this.photoPhi) * Math.sin(this.photoTheta);
      const y = vehiclePos.y + this.photoDistance * Math.cos(this.photoPhi);
      const z = vehiclePos.z + this.photoDistance * Math.sin(this.photoPhi) * Math.cos(this.photoTheta);

      this.camera.position.set(x, Math.max(vehiclePos.y + 0.3, y), z);
      this.camera.lookAt(vehiclePos.clone().add(new THREE.Vector3(0, 0.6, 0)));
      this.camera.fov = this.photoFov;
      this.camera.updateProjectionMatrix();
      return;
    }

    const forward = this._f.set(0, 0, 1).applyQuaternion(vehicleQuat), up = this._u.set(0, 1, 0).applyQuaternion(vehicleQuat), tmp = this._k;

    // Look back toggle (Circle button)
    if (isLookingBack) {
      forward.negate();
    }
    if (this.lookYaw !== 0) forward.applyAxisAngle(up, this.lookYaw);
    const pitchLift = Math.sin(this.lookPitch);

    const targetPos = this._t, lookTarget = this._l.copy(vehiclePos); lookTarget.y += 0.7;
    let desiredFov = 65;

    // Speed-dependent FOV widening for high-speed sensation (Forza style)
    const fovBonus = Math.min(18, (speedKmh / 250) * 18);

    switch (this.mode) {
      case 'CHASE_NEAR':
        // 5.5m behind, 1.8m above, looking 4m ahead of car
        targetPos.copy(vehiclePos).addScaledVector(forward, -5.5).addScaledVector(up, 1.8 + pitchLift * 4.5);
        lookTarget.copy(vehiclePos).addScaledVector(forward, 4.0); lookTarget.y += 0.8;
        desiredFov = 65 + fovBonus;
        break;

      case 'CHASE_FAR':
        // 8.5m behind, 2.8m above
        targetPos.copy(vehiclePos).addScaledVector(forward, -8.5).addScaledVector(up, 2.8 + pitchLift * 6);
        lookTarget.copy(vehiclePos).addScaledVector(forward, 5.0); lookTarget.y += 1.0;
        desiredFov = 68 + fovBonus;
        break;

      case 'COCKPIT': {
        // Inside cockpit at driver eye height (Right-Hand Drive for Eswatini: x +0.28, y +0.75, z +0.1)
        targetPos.copy(vehiclePos).add(tmp.set(0.28, 0.75, 0.1).applyQuaternion(vehicleQuat));
        lookTarget.copy(targetPos).addScaledVector(forward, 15.0).addScaledVector(up, Math.tan(this.lookPitch) * 15.0);
        desiredFov = 74 + fovBonus * 0.5;
        break;
      }

      case 'BUMPER': {
        // Low on front bumper
        targetPos.copy(vehiclePos).add(tmp.set(0, 0.35, 1.95).applyQuaternion(vehicleQuat));
        lookTarget.copy(targetPos).addScaledVector(forward, 20.0).addScaledVector(up, Math.tan(this.lookPitch) * 20.0);
        desiredFov = 80 + fovBonus;
        break;
      }
    }

    if (this.mode === 'COCKPIT' || this.mode === 'BUMPER') { // first person is rigidly attached to the car: a world-space lag puts the eye behind the driver's seat at speed
      this.currentPos.copy(targetPos);
      this.currentTarget.x = THREE.MathUtils.damp(this.currentTarget.x, lookTarget.x, 60, dt); this.currentTarget.y = THREE.MathUtils.damp(this.currentTarget.y, lookTarget.y, 60, dt); this.currentTarget.z = THREE.MathUtils.damp(this.currentTarget.z, lookTarget.z, 60, dt);
      this.currentFov = THREE.MathUtils.damp(this.currentFov, desiredFov, 6, dt);
      this.camera.position.copy(this.currentPos); this.camera.lookAt(this.currentTarget); this.camera.fov = this.currentFov; this.camera.updateProjectionMatrix();
      return;
    }
    // Silky-smooth exponential damping
    const posDampSpeed = 12;
    this.currentPos.x = THREE.MathUtils.damp(this.currentPos.x, targetPos.x, posDampSpeed, dt);
    this.currentPos.y = THREE.MathUtils.damp(this.currentPos.y, targetPos.y, posDampSpeed, dt);
    this.currentPos.z = THREE.MathUtils.damp(this.currentPos.z, targetPos.z, posDampSpeed, dt);

    this.currentTarget.x = THREE.MathUtils.damp(this.currentTarget.x, lookTarget.x, 14, dt);
    this.currentTarget.y = THREE.MathUtils.damp(this.currentTarget.y, lookTarget.y, 14, dt);
    this.currentTarget.z = THREE.MathUtils.damp(this.currentTarget.z, lookTarget.z, 14, dt);

    this.currentFov = THREE.MathUtils.damp(this.currentFov, desiredFov, 6, dt);

    this.camera.position.copy(this.currentPos);
    this.camera.lookAt(this.currentTarget);
    this.camera.fov = this.currentFov;
    this.camera.updateProjectionMatrix();
  }
}
