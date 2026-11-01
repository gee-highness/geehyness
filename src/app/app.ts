import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  NgZone,
  OnDestroy,
  PLATFORM_ID,
  ViewChild,
  inject,
  signal
} from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import * as THREE from 'three';

// Services
import { GamepadService } from './services/gamepad.service';
import { HapticsService } from './services/haptics.service';
import { AudioService } from './services/audio.service';
import { TuningService } from './services/tuning.service';
import { TelemetryService } from './services/telemetry.service';
import { EnvironmentService } from './services/environment.service';
import { FestivalService } from './services/festival.service';
import { WorldPipelineService } from './services/world-pipeline.service';

// Graphics & Physics
import { SceneManager } from './game/graphics/scene-manager';
import { RaycastVehicle } from './game/physics/raycast-vehicle';
import { TrafficSimulator } from './services/traffic.service';

// Components
import { CarSelectComponent } from './components/car-select/car-select.component';
import { CAR_CATALOG, CarDef } from './game/cars';
import { IntroComponent } from './components/intro/intro.component';
import { HudComponent } from './components/hud/hud.component';
import { TelemetryComponent } from './components/telemetry/telemetry.component';
import { TuningComponent } from './components/tuning-dialog/tuning.component';
import { PhotoModeComponent } from './components/photo-mode/photo-mode.component';
import { MapModalComponent } from './components/map-modal/map-modal.component';
import { PipelineModalComponent } from './components/pipeline-modal/pipeline-modal.component';
import { TouchControlsComponent } from './components/touch-controls/touch-controls.component';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    MatIconModule,
    HudComponent,
    IntroComponent,
    CarSelectComponent,
    TelemetryComponent,
    TuningComponent,
    PhotoModeComponent,
    MapModalComponent,
    PipelineModalComponent,
    TouchControlsComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
  styleUrl: './app.css',
})
export class App implements AfterViewInit, OnDestroy {
  private ngZone = inject(NgZone);
  private platformId = inject(PLATFORM_ID);

  public gamepadService = inject(GamepadService);
  public hapticsService = inject(HapticsService);
  public audioService = inject(AudioService);
  public tuningService = inject(TuningService);
  public telemetryService = inject(TelemetryService);
  public envService = inject(EnvironmentService);
  public festivalService = inject(FestivalService);
  public worldPipeline = inject(WorldPipelineService);

  @ViewChild('canvasContainer', { static: true }) canvasContainerRef!: ElementRef<HTMLDivElement>;
  @ViewChild(HudComponent) hudComponent!: HudComponent;
  @ViewChild(MapModalComponent) mapModalComponent?: MapModalComponent;
  @ViewChild(PhotoModeComponent) photoModeComponent?: PhotoModeComponent;

  // Modals state
  readonly showMap = signal<boolean>(false);
  readonly showTuning = signal<boolean>(false);
  readonly showPipeline = signal<boolean>(false);
  readonly isPhotoMode = signal<boolean>(false);
  readonly started = signal<boolean>(false);
  readonly showCars = signal<boolean>(false);
  readonly currentCar = signal<CarDef>(CAR_CATALOG[0]);

  public onChooseCar(def: CarDef): void {
    this.currentCar.set(def);
    this.tuningService.setArchetype(def.archetype);
    const config = this.tuningService.getActiveConfig();
    const old = this.vehicle;
    this.vehicle = new RaycastVehicle(config, this.tuningService.tuning());
    this.vehicle.position.copy(old.position); this.vehicle.position.y += 0.6;
    const yaw = new THREE.Euler().setFromQuaternion(old.quaternion, 'YXZ').y;
    this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.sceneManager.spawnVehicle(config, this.tuningService.visuals(), def);
    this.showCars.set(false);
  }
  public begin(): void { this.audioService.unlockAudio(); this.started.set(true); }
  readonly showTouchControls = signal<boolean>(false);

  // Core Game Loop & Physics
  private sceneManager!: SceneManager;
  private vehicle!: RaycastVehicle;
  private trafficSimulator!: TrafficSimulator;

  private animFrameId = 0;
  private lastTime = 0;
  private physicsAccumulator = 0;
  private readonly FIXED_STEP = 1 / 60; // 60 Hz fixed timestep

  // Keyboard controls state
  private keySteerLeft = false;
  private keySteerRight = false;
  private keyThrottle = false;
  private keyBrake = false;
  private keyHandbrake = false;

  // Touch controls state
  private touchSteer = 0;
  private touchThrottle = 0;
  private touchBrake = 0;
  private touchHandbrake = false;

  ngAfterViewInit(): void {
    if (isPlatformBrowser(this.platformId)) {
      this.initGame();
    }
  }

  ngOnDestroy(): void {
    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
    }
  }

  private initGame(): void {
    const container = this.canvasContainerRef.nativeElement;

    // Run high-frequency graphics & physics outside Angular Zone for 60 FPS
    this.ngZone.runOutsideAngular(() => {
      this.sceneManager = new SceneManager(container);

      // Create Raycast Vehicle
      const config = this.tuningService.getActiveConfig();
      const tuning = this.tuningService.tuning();
      this.vehicle = new RaycastVehicle(config, tuning);

      // Spawn 3D Vehicle mesh in Three.js
      this.sceneManager.spawnVehicle(config, this.tuningService.visuals(), this.currentCar());

      // Create Traffic Simulator (paused until it follows the real OSM road graph)
      this.trafficSimulator = new TrafficSimulator(this.sceneManager.scene);

      // Drop the car on the real MR3 (Ngwane St, eastbound) once the world has streamed in
      (window as unknown as { __shesha: Record<string, unknown> }).__shesha = {
        ...((window as unknown as { __shesha?: Record<string, unknown> }).__shesha ?? {}),
        tpRoad: (x: number, z: number) => {
          const wb = this.sceneManager.worldBuilder; const r = wb.nearestRoadSegment(x, z, 5); if (!r) return null;
          this.vehicle.position.set(r.px, wb.groundHeightAt(r.px, r.pz) + 1, r.pz); this.vehicle.velocity.set(0, 0, 0);
          this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(r.tx, r.tz)); return [Math.round(r.px), Math.round(r.pz), r.way.n];
        },
        tpBay: (x: number, z: number) => {
          const wb = this.sceneManager.worldBuilder; let best: { px: number; pz: number; yaw: number; d: number; n: string } | null = null;
          for (const w of wb.roadWays) { if (!w.bay || w.p.length < 8) continue; const i = Math.floor(w.p.length / 4) * 2; const px = w.p[i] / 10, pz = w.p[i + 1] / 10, d = Math.hypot(px - x, pz - z);
            if (!best || d < best.d) best = { px, pz, yaw: Math.atan2(w.p[i + 2] - w.p[i], w.p[i + 3] - w.p[i + 1]), d, n: w.n }; }
          if (!best) return null; this.vehicle.position.set(best.px, wb.groundHeightAt(best.px, best.pz) + 1, best.pz); this.vehicle.velocity.set(0, 0, 0);
          this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), best.yaw); return [Math.round(best.px), Math.round(best.pz), best.n];
        },
        tpOver: (x: number, z: number, under: boolean) => {
          const wb = this.sceneManager.worldBuilder; let best: { px: number; pz: number; yaw: number; d: number; dz: number } | null = null;
          for (const w of wb.roadWays) { if (!w.dz) continue; const mx = Math.max(...w.dz); if (mx < 40) continue; const k = w.dz.indexOf(mx); const i = Math.min(k, w.p.length / 2 - 2) * 2;
            const px = w.p[i] / 10, pz = w.p[i + 1] / 10, d = Math.hypot(px - x, pz - z); if (!best || d < best.d) best = { px, pz, yaw: Math.atan2(w.p[i + 2] - w.p[i], w.p[i + 3] - w.p[i + 1]), d, dz: mx / 10 }; }
          if (!best) return null;
          // deck: stand on it; under: stand on whatever lower surface exists at the same x,z
          const y = under ? wb.groundHeightAt(best.px, best.pz, -50) : wb.groundHeightAt(best.px, best.pz);
          this.vehicle.position.set(best.px, y + 1, best.pz); this.vehicle.velocity.set(0, 0, 0);
          this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), best.yaw); return [Math.round(best.px), Math.round(best.pz), best.dz, Math.round(y * 10) / 10];
        },
        tp: (x: number, z: number, yaw: number) => {
          const wb = this.sceneManager.worldBuilder; this.vehicle.position.set(x, wb.groundHeightAt(x, z) + 1, z);
          this.vehicle.velocity.set(0, 0, 0); this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
        },
      };
      this.sceneManager.worldBuilder.onReady(() => {
        const sp = this.sceneManager.worldBuilder.meta.spawn;
        this.vehicle.position.set(sp.x, this.sceneManager.worldBuilder.calculateRawTerrainHeight(sp.x, sp.z) + 0.9, sp.z);
        this.vehicle.velocity.set(0, 0, 0);
        this.vehicle.angularVelocity.set(0, 0, 0);
        this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.yaw);
      });

      // Auto-detect touch device
      if (typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0)) {
        this.showTouchControls.set(true);
      }

      // Start animation loop
      this.lastTime = performance.now();
      this.loop(this.lastTime);
    });
  }

  private loop = (now: number): void => {
    const frameDelta = Math.min((now - this.lastTime) / 1000, 0.1);
    this.lastTime = now;

    if (!this.isPhotoMode()) {
      this.physicsAccumulator += frameDelta;

      // Fixed 60 Hz physics sub-stepping
      if (!this.sceneManager.worldBuilder.ready) this.physicsAccumulator = 0;
      while (this.physicsAccumulator >= this.FIXED_STEP) {
        this.stepPhysics(this.FIXED_STEP);
        this.physicsAccumulator -= this.FIXED_STEP;
      }

      // Day-Night environment tick
      this.envAccum += frameDelta;
      if (this.envAccum > 0.25) { // 4 Hz is plenty for the sun and fog
        this.envService.tickDayNight(this.envAccum);
        this.sceneManager.updateEnvironment(this.envService.envState());
        this.envAccum = 0;
      }

      // Audio engine update
      const telem = this.vehicle.getTelemetry();
      this.audioService.updateEngineAudio(telem.rpm, telem.throttle, telem.speedKmh, this.vehicle.config.engineMaxRpm);
      this.audioService.updateTireAudio(telem.wheels[0].slipAngleDeg, telem.wheels[0].isSkidding, telem.speedKmh);
      this.audioService.updateSurfaceAudio(telem.wheels[0].surfaceClass, telem.speedKmh);

      if (telem.backfirePop) {
        this.audioService.playBackfirePop();
        this.hapticsService.triggerImpulse('gearShift', 0.4, 0.7, 90);
      }

      // Blended DualShock 4 Haptic update
      this.updateHaptics(telem, now);

      // Posted speed limit + viewpoints (4 Hz is plenty)
      this.slowTick += frameDelta;
      if (this.slowTick > 0.25 && this.sceneManager.worldBuilder.ready) {
        this.slowTick = 0; const wb = this.sceneManager.worldBuilder, vp = this.vehicle.position;
        const lim = wb.limitAt(vp.x, vp.z, vp.y); if (lim !== this.telemetryService.speedLimit() && lim) this.telemetryService.speedLimit.set(lim);
        for (const v of wb.meta.views ?? []) {
          if (!this.seenViews.has(v.n) && Math.hypot(v.p[0] - vp.x, v.p[1] - vp.z) < 45) { this.seenViews.add(v.n); this.festivalService.announceViewpoint(v.n); }
        }
      }

      // Festival triggers (speed camera traps & drift zones)
      this.festivalService.checkSpeedTraps(this.vehicle.position.x, this.vehicle.position.z, telem.speedKmh);
      this.festivalService.updateDriftZoneProgress(
        this.vehicle.position.x,
        this.vehicle.position.z,
        telem.isDrifting,
        telem.driftAngleDeg,
        telem.speedKmh,
        frameDelta
      );

      // Update Camera & Visuals
      const pad = this.gamepadService.pollControls();
      this.sceneManager.cameraRig.update(
        frameDelta,
        this.vehicle.position,
        this.vehicle.quaternion,
        telem.speedKmh,
        pad.lookBack
      );
      this.sceneManager.syncVehicleVisuals(this.vehicle, frameDelta);

      // Push telemetry snapshot to Angular UI at ~20 Hz
      this.telemetryService.pushSnapshot(telem);
      if (this.hudComponent) {
        this.hudComponent.world = this.sceneManager.worldBuilder;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vehicle.quaternion);
        this.hudComponent.updateDistrictAndGps(this.vehicle.position.x, this.vehicle.position.z, Math.atan2(fwd.x, fwd.z));
      }
    } else {
      // In Photo Mode: orbit camera around car
      const photo = this.photoModeComponent;
      if (photo) {
        this.sceneManager.cameraRig.photoDistance = photo.distance();
        this.sceneManager.cameraRig.photoTheta = photo.theta();
        this.sceneManager.cameraRig.photoPhi = photo.phi();
        this.sceneManager.cameraRig.photoFov = photo.fov();
      }
      this.sceneManager.cameraRig.update(frameDelta, this.vehicle.position, this.vehicle.quaternion, 0, false);
    }

    // Render Scene
    this.sceneManager.render(frameDelta * 1000);

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private stepPhysics(dt: number): void {
    // 1. Poll Controller inputs (DS4 priority > Touch > Keyboard)
    const pad = this.gamepadService.pollControls();

    let steer = 0;
    let throttle = 0;
    let brake = 0;
    let handbrake = false;

    if (pad.connected) {
      steer = pad.steer;
      throttle = pad.throttle;
      brake = pad.brake;
      handbrake = pad.handbrake;

      if (pad.cycleCamera) this.onCycleCamera();
      if (pad.toggleTelemetry) this.telemetryService.toggleTelemetry();
      if (pad.toggleMap) this.showMap.update(m => !m);
      if (pad.togglePhoto) this.togglePhotoMode();
      if (pad.resetCar) this.resetCarUpright();
      if (pad.shiftUp && this.vehicle.currentGear < 6) {
        this.vehicle.currentGear++;
        this.audioService.playGearShift();
      }
      if (pad.shiftDown && this.vehicle.currentGear > 1) {
        this.vehicle.currentGear--;
        this.audioService.playGearShift();
      }
    } else if (this.showTouchControls()) {
      steer = this.touchSteer;
      throttle = this.touchThrottle;
      brake = this.touchBrake;
      handbrake = this.touchHandbrake;
    } else {
      // Keyboard
      if (this.keySteerLeft) steer -= 1;
      if (this.keySteerRight) steer += 1;
      if (this.keyThrottle) throttle = 1;
      if (this.keyBrake) brake = 1;
      handbrake = this.keyHandbrake;
    }

    this.vehicle.steerInput = steer;
    this.vehicle.throttle = throttle;
    this.vehicle.brake = brake;
    this.vehicle.handbrake = handbrake;

    // Apply active tuning parameters
    this.vehicle.tuning = this.tuningService.tuning();

    // Query Ground Height & Normals from WorldBuilder
    this.vehicle.updatePhysics(dt, (x, z, y) => {
      return this.sceneManager.worldBuilder.queryGround(x, z, y);
    });

    // Solid world: buildings, trees, poles and other cars
    const wb = this.sceneManager.worldBuilder;
    if (wb.ready) {
      const hit = wb.collision.resolve(this.vehicle, this.sceneManager.trafficColliders(), dt);
      if (hit.impactSpeed > 1.2) {
        if (hit.hitKind === 'car') this.sceneManager.hitTraffic(hit.hitId, hit.impactSpeed);
        this.crashRumble(hit.impactSpeed);
      }
    }
  }

  private lastCrashRumble = 0;
  private slowTick = 0;
  private seenViews = new Set<string>();
  private envAccum = 1;
  private updateHaptics(telem: ReturnType<RaycastVehicle['getTelemetry']>, now: number): void {
    const h = this.hapticsService;
    // Engine: silent at idle, a faint hum only when revving hard under throttle
    const normRpm = telem.rpm / this.vehicle.config.engineMaxRpm;
    const engine = telem.throttle > 0.3 && normRpm > 0.45 ? (normRpm - 0.45) * 0.35 : 0;
    if (engine > 0.02) h.setContinuous('engine', engine, 0.0, 90);

    // Tyre slip / drift buzz (weak motor), only while genuinely sliding
    if ((telem.wheels[0].isSkidding || telem.driftAngleDeg > 14) && telem.speedKmh > 25) {
      h.setContinuous('tireSlip', 0.08, Math.min(0.7, (telem.driftAngleDeg / 40) * 0.7), 90);
    }

    // Loose surfaces only (rock, dirt road, sand) and only when moving
    if ([6, 7, 10].includes(telem.wheels[0].surfaceClass) && telem.speedKmh > 30) {
      const k = Math.min(1, telem.speedKmh / 120);
      h.setContinuous('surfaceRoughness', 0.1 * k, 0.15 * k, 90);
    }
    h.update(now);
  }

  /** One short, rate-limited thump per crash instead of re-triggering every physics step. */
  private crashRumble(impact: number): void {
    const now = performance.now();
    if (now - this.lastCrashRumble < 350) return;
    this.lastCrashRumble = now;
    const f = Math.min(1, impact / 14);
    this.hapticsService.triggerImpulse('collision', 0.3 + f * 0.7, 0.2 + f * 0.6, 90 + f * 160);
  }

  // Window resize handler
  @HostListener('window:blur')
  @HostListener('document:visibilitychange')
  onFocusLost(): void { this.hapticsService.stopAll(); }

  @HostListener('window:resize')
  onResize(): void {
    if (this.sceneManager) {
      this.sceneManager.resize();
    }
  }

  // Keyboard controls listener
  @HostListener('window:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    this.audioService.unlockAudio();
    if (!this.started()) { if (event.code === 'Enter') this.begin(); return; }

    if (event.code === 'KeyH') { this.hapticsService.setEnabled(!this.hapticsService.enabled()); return; }
    if (event.code === 'KeyV') { this.showCars.update((v) => !v); return; }
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keySteerLeft = true;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keySteerRight = true;
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.keyThrottle = true;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keyBrake = true;
        break;
      case 'Space':
        this.keyHandbrake = true;
        break;
      case 'KeyR':
        this.resetCarUpright();
        break;
      case 'KeyC':
        this.onCycleCamera();
        break;
      case 'KeyT':
        this.telemetryService.toggleTelemetry();
        break;
      case 'KeyM':
        this.showMap.update(m => !m);
        break;
      case 'KeyP':
        this.togglePhotoMode();
        break;
      case 'KeyO':
        this.showPipeline.update(p => !p);
        break;
    }
  }

  @HostListener('window:keyup', ['$event'])
  onKeyUp(event: KeyboardEvent): void {
    switch (event.code) {
      case 'ArrowLeft':
      case 'KeyA':
        this.keySteerLeft = false;
        break;
      case 'ArrowRight':
      case 'KeyD':
        this.keySteerRight = false;
        break;
      case 'ArrowUp':
      case 'KeyW':
        this.keyThrottle = false;
        break;
      case 'ArrowDown':
      case 'KeyS':
        this.keyBrake = false;
        break;
      case 'Space':
        this.keyHandbrake = false;
        break;
    }
  }

  public resetCarUpright(): void {
    if (!this.vehicle) return;
    const y = this.sceneManager.worldBuilder.calculateRawTerrainHeight(this.vehicle.position.x, this.vehicle.position.z);
    this.vehicle.position.y = y + 0.6;
    this.vehicle.velocity.set(0, 0, 0);
    this.vehicle.angularVelocity.set(0, 0, 0);
    const yaw = new THREE.Euler().setFromQuaternion(this.vehicle.quaternion).y;
    this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.hapticsService.triggerImpulse('landing', 0.6, 0.6, 200);
  }

  public onCycleCamera(): void {
    this.sceneManager.cameraRig.cycleMode();
  }

  public togglePhotoMode(): void {
    const next = !this.isPhotoMode();
    this.isPhotoMode.set(next);
    if (next) {
      this.sceneManager.cameraRig.mode = 'PHOTO_FREE';
    } else {
      this.sceneManager.cameraRig.mode = 'CHASE_NEAR';
    }
  }

  public captureHighResPhoto(): void {
    const dataUrl = this.sceneManager.captureSnapshotPng();
    const link = document.createElement('a');
    link.download = `SHESHA_Eswatini_${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
  }

  public teleportToDistrict(pos: [number, number]): void {
    if (!this.vehicle) return;
    this.vehicle.position.set(pos[0], 2, pos[1]);
    this.resetCarUpright();
  }

  // Touch controls event dispatchers
  public onTouchSteer(val: number): void { this.touchSteer = val; }
  public onTouchThrottle(val: number): void { this.touchThrottle = val; }
  public onTouchBrake(val: number): void { this.touchBrake = val; }
  public onTouchHandbrake(val: boolean): void { this.touchHandbrake = val; }
}
