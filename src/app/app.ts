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
  signal, effect } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import * as THREE from 'three';

// Services
import { GamepadService } from './services/gamepad.service';
import { HapticsService } from './services/haptics.service';
import { SettingsService } from './services/settings.service';
import { DriveStateService } from './services/drive-state.service';
import { PoliceService } from './services/police.service';
import { HelpComponent } from './components/help/help.component';
import { NavigationService } from './services/navigation.service';
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
  imports: [HelpComponent, 
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
  public settings = inject(SettingsService);
  public drive = inject(DriveStateService);
  public policeSvc = inject(PoliceService);
  private crashNoise = 0; private copHooked = false; private polAcc = 0;
  public nav = inject(NavigationService);
  readonly showHelp = signal<boolean>(false);
  private pad = this.gamepadService.pollControls();
  private mouseLook = false; private mlx = 0; private mly = 0;
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
  private themeFx = effect(() => { const t = this.settings.theme(); this.sceneManager?.setTheme(t); });
  private copsFx = effect(() => { const on = this.policeSvc.enabled(); this.sceneManager?.setCops(on); });
  private qualityFx = effect(() => { const q = this.settings.quality(); this.sceneManager?.setQuality(q); });
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
    this.drive.onTick = (on) => this.audioService.playIndicatorTick(on);
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
        wb: this.sceneManager.worldBuilder, nav: this.nav, env: this.envService, drive: this.drive, police: () => this.sceneManager.police,
        perf: () => Object.fromEntries(Object.entries(this.perf).map(([k, v]) => [k, Math.round(v * 100) / 100])),
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
      this.sceneManager.setQuality(this.settings.quality()); this.sceneManager.setTheme(this.settings.theme()); this.sceneManager.graphProvider = () => this.nav.getGraph(); this.sceneManager.setCops(this.policeSvc.enabled());
      this.nav.attach(this.sceneManager.worldBuilder);
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

  private perf: Record<string, number> = {};
  private mark(k: string, t0: number): number { const t = performance.now(); this.perf[k] = (this.perf[k] ?? 0) * 0.9 + (t - t0) * 0.1; return t; }

  private loop = (now: number): void => {
    let tp = performance.now();
    const frameDelta = Math.min((now - this.lastTime) / 1000, 0.066);   // never feed physics more than ~4 steps: a slow frame must not snowball
    this.lastTime = now;
    this.pad = this.gamepadService.pollControls();
    this.handlePad(this.pad);

    if (!this.isPhotoMode()) {
      this.physicsAccumulator += frameDelta;

      // Fixed 60 Hz physics sub-stepping
      if (!this.sceneManager.worldBuilder.ready) this.physicsAccumulator = 0;
      let guard = 0;
      while (this.physicsAccumulator >= this.FIXED_STEP && guard++ < 4) {
        this.stepPhysics(this.FIXED_STEP);
        this.physicsAccumulator -= this.FIXED_STEP;
      }
      if (this.physicsAccumulator > this.FIXED_STEP) this.physicsAccumulator = 0;
      tp = this.mark('physics', tp);

      // Day-Night environment tick
      this.envAccum += frameDelta;
      if (this.envAccum > 0.25) { // 4 Hz is plenty for the sun and fog
        this.envService.tickDayNight(this.envAccum);
        this.sceneManager.updateEnvironment(this.envService.envState());
        { const h = this.envService.envState().timeOfDayHours; this.nightFactor = h < 5.5 || h > 19 ? 0 : h < 6.5 || h > 18 ? 0.5 : 1; this.drive.autoLights(this.nightFactor < 0.6 || this.envService.weather() === 'TROPICAL_RAIN'); }
        this.envAccum = 0;
      }

      // Audio engine update
      const telem = this.vehicle.getTelemetry();
      this.audioService.updateEngineAudio(telem.rpm, telem.throttle, telem.speedKmh, this.vehicle.config.engineMaxRpm);
      this.audioService.updateTireAudio(telem.wheels[0].slipAngleDeg, telem.wheels[0].isSkidding, telem.speedKmh);
      this.audioService.updateSurfaceAudio(telem.wheels[0].surfaceClass, telem.speedKmh);

      // ---- cops & robbers: how visible / audible the player is right now, then let the cops react
      {
        const sm = this.sceneManager; const h = this.envService.envState().timeOfDayHours, elev = Math.sin(((h - 6) / 24) * 2 * Math.PI);
        const dark = 1 - THREE.MathUtils.smoothstep(elev, -0.12, 0.25) * (this.envService.weather() === 'TROPICAL_RAIN' ? 0.75 : 1);
        const hl = this.drive.headlights(); this.crashNoise = Math.max(0, this.crashNoise - frameDelta / 2);
        const lightNight = 20 + (hl === 2 ? 230 : hl === 1 ? 105 : 0) + (this.vehicle.brake > 0.15 ? 22 : 0) + (this.drive.leftOn || this.drive.rightOn ? 10 : 0);
        const vis = THREE.MathUtils.lerp(170, lightNight, dark);
        const skid = telem.wheels[0].isSkidding || (this.vehicle.handbrake && telem.speedKmh > 20);
        const noise = 12 + telem.speedKmh * 0.85 + telem.throttle * 26 + (skid ? 70 : 0) + (this.drive.horn() ? 260 : 0) + this.crashNoise * 130;
        sm.policeUpdate(frameDelta, { x: this.vehicle.position.x, z: this.vehicle.position.z, vx: this.vehicle.velocity.x, vz: this.vehicle.velocity.z, speedKmh: telem.speedKmh }, { visRadius: vis, noiseRadius: noise }, dark);
        if (sm.police && !this.copHooked) {
          this.copHooked = true;
          sm.police.onBusted = () => { this.policeSvc.busted.update((n) => n + 1); this.policeSvc.flash('BUSTED! Back to the start'); const sp = sm.worldBuilder.meta.spawn; this.vehicle.position.set(sp.x, sm.worldBuilder.groundHeightAt(sp.x, sp.z) + 0.9, sp.z); this.vehicle.velocity.set(0, 0, 0); this.vehicle.angularVelocity.set(0, 0, 0); this.vehicle.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.yaw); sm.police?.reset(); };
          sm.police.onEscaped = () => { this.policeSvc.escaped.update((n) => n + 1); this.policeSvc.flash('YOU LOST THEM'); };
        }
        const st = sm.police?.status; this.audioService.setSiren(st && st.nearestChaser < 380 ? Math.pow(1 - st.nearestChaser / 380, 1.2) : 0);
        this.polAcc += frameDelta; if (st && this.polAcc > 0.1) { this.polAcc = 0; const ps = this.policeSvc; ps.state.set(st.state); ps.suspicion.set(st.suspicion); ps.vis.set(Math.min(1, vis / 260)); ps.noise.set(Math.min(1, noise / 260)); ps.chasers.set(st.chasers); ps.nearest.set(st.nearest); }
      }

      if (telem.backfirePop) {
        this.audioService.playBackfirePop();
        this.hapticsService.triggerImpulse('gearShift', 0.4, 0.7, 90);
      }

      // Blended DualShock 4 Haptic update
      this.updateHaptics(telem, now);
      tp = this.mark('audio+haptics', tp);

      // Posted speed limit + viewpoints (4 Hz is plenty)
      this.slowTick += frameDelta;
      if (this.slowTick > 0.25 && this.sceneManager.worldBuilder.ready) {
        this.slowTick = 0; const wb = this.sceneManager.worldBuilder, vp = this.vehicle.position;
        this.nav.update(vp.x, vp.z); const lim = wb.limitAt(vp.x, vp.z, vp.y); if (lim !== this.telemetryService.speedLimit() && lim) this.telemetryService.speedLimit.set(lim);
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
      const pad = this.pad;
      this.sceneManager.cameraRig.look(pad.lookX + this.mlx, pad.lookY + this.mly, frameDelta); this.mlx = this.mly = 0;
      this.sceneManager.setWaypoint(this.nav.waypoint());
      this.drive.tick(frameDelta, this.vehicle.steerInput);
      this.audioService.setHorn(this.drive.horn());
      this.sceneManager.setLights(this.drive.headlights(), this.drive.leftOn, this.drive.rightOn, this.vehicle.brake > 0.15 || this.vehicle.handbrake, false, this.nightFactor);
      this.sceneManager.cameraRig.update(
        frameDelta,
        this.vehicle.position,
        this.vehicle.quaternion,
        telem.speedKmh,
        pad.lookBack
      );
      tp = this.mark('camera', tp);
      this.sceneManager.syncVehicleVisuals(this.vehicle, frameDelta);
      tp = this.mark('sync(world,traffic,wheels)', tp);

      // Push telemetry snapshot to Angular UI at ~20 Hz
      this.telemetryService.pushSnapshot(telem);
      if (this.hudComponent) {
        this.hudComponent.world = this.sceneManager.worldBuilder;
        const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(this.vehicle.quaternion);
        const np = this.nav.pose; np.x = this.vehicle.position.x; np.z = this.vehicle.position.z; np.yaw = Math.atan2(fwd.x, fwd.z); np.speedKmh = telem.speedKmh;
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
    tp = this.mark('hud+misc', tp);
    if (this.hudComponent?.showFps() && now - this.fpsT > 500) { this.fpsT = now; const sm = this.sceneManager; this.hudComponent.fpsText.set(`${sm.fps} fps · ${Math.round(sm.resolution * 100)}% res · ${Math.round((this.perf['physics'] ?? 0) * 10) / 10}ms phys`); }
    this.sceneManager.render(frameDelta * 1000);
    this.mark('render(cpu submit)', tp);

    this.animFrameId = requestAnimationFrame(this.loop);
  };

  private nightFactor = 1;
  /** One-shot controller actions (edge triggers), handled once per rendered frame. */
  private handlePad(pad: ReturnType<GamepadService['pollControls']>): void {
    if (!pad.connected || !this.started()) return;
    if (pad.cycleCamera) this.onCycleCamera();
    if (pad.toggleTelemetry) this.telemetryService.toggleTelemetry();
    if (pad.toggleMap) this.showMap.update((m) => !m);
    if (pad.togglePhoto) this.togglePhotoMode();
    if (pad.resetCar) this.resetCarUpright();
    if (pad.shiftUp && this.vehicle.currentGear < 6) { this.vehicle.currentGear++; this.audioService.playGearShift(); }
    if (pad.shiftDown && this.vehicle.currentGear > 1) { this.vehicle.currentGear--; this.audioService.playGearShift(); }
    if (pad.indicateLeft) this.drive.toggleLeft();
    if (pad.indicateRight) this.drive.toggleRight();
    if (pad.hazards) this.drive.toggleHazards();
    if (pad.headlights) this.drive.cycleHeadlights();
    this.drive.setHorn(pad.horn || this.keyHorn);
    if (pad.recentreLook) this.sceneManager.cameraRig.recentreLook();
    if (pad.cycleWeather) this.envService.cycleWeather();
    if (pad.cycleQuality) this.settings.cycleQuality();
    if (pad.toggleCars) this.showCars.update((v) => !v);
    if (pad.toggleFps) this.hudComponent?.showFps.update((v) => !v);
    if (pad.toggleHaptics) this.hapticsService.setEnabled(!this.hapticsService.enabled());
    if (pad.toggleMute) this.audioService.isMuted.update((m) => !m);
    if (pad.garage) this.showTuning.update((v) => !v);
    if (pad.worldTools) this.showPipeline.update((v) => !v);
    if (pad.toggleHelp) this.showHelp.update((v) => !v);
  }
  private keyHorn = false;

  private stepPhysics(dt: number): void {
    // 1. Poll Controller inputs (DS4 priority > Touch > Keyboard)
    const pad = this.pad;

    let steer = 0;
    let throttle = 0;
    let brake = 0;
    let handbrake = false;

    if (pad.connected) {
      steer = pad.steer;
      throttle = pad.throttle;
      brake = pad.brake;
      handbrake = pad.handbrake;

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
    }, (x, z) => this.sceneManager.worldBuilder.calculateRawTerrainHeight(x, z));

    // Solid world: buildings, trees, poles and other cars
    const wb = this.sceneManager.worldBuilder;
    if (wb.ready) {
      const hit = wb.collision.resolve(this.vehicle, this.sceneManager.trafficColliders(), dt);
      if (hit.impactSpeed > 1.2) {
        if (hit.hitKind === 'car') this.sceneManager.hitTraffic(hit.hitId, hit.impactSpeed);
        this.crashRumble(hit.impactSpeed); this.crashNoise = Math.max(this.crashNoise, Math.min(1, hit.impactSpeed / 8));
      }
    }
  }

  private lastCrashRumble = 0;
  private slowTick = 0;
  private fpsT = 0;
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

    if (event.code === 'KeyF') { this.hudComponent?.showFps.update((v) => !v); return; }
    if (event.code === 'KeyY') { this.settings.toggleTheme(); return; }
    if (event.code === 'KeyQ') { this.settings.cycleQuality(); return; }
    if (event.code === 'KeyG') { this.envService.cycleWeather(); return; }
    if (event.code === 'KeyH') { this.hapticsService.setEnabled(!this.hapticsService.enabled()); return; }
    if (event.code === 'Comma') { this.drive.toggleLeft(); return; }
    if (event.code === 'Period') { this.drive.toggleRight(); return; }
    if (event.code === 'KeyX') { this.drive.toggleHazards(); return; }
    if (event.code === 'KeyJ') { this.policeSvc.toggle(); return; }
    if (event.code === 'KeyL') { this.drive.cycleHeadlights(); return; }
    if (event.code === 'KeyB') { this.keyHorn = true; this.drive.setHorn(true); return; }
    if (event.code === 'KeyK') { this.sceneManager.cameraRig.recentreLook(); return; }
    if (event.code === 'F1' || event.code === 'Slash' || event.code === 'KeyI') { event.preventDefault(); this.showHelp.update((v) => !v); return; }
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
    if (event.code === 'KeyB') { this.keyHorn = false; this.drive.setHorn(false); }
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

  @HostListener('window:mousedown', ['$event']) onMouseDown(e: MouseEvent): void { if (e.button === 2) this.mouseLook = true; }
  @HostListener('window:mouseup', ['$event']) onMouseUp(e: MouseEvent): void { if (e.button === 2) this.mouseLook = false; }
  @HostListener('window:contextmenu', ['$event']) onCtx(e: Event): void { if (this.started()) e.preventDefault(); }
  @HostListener('window:mousemove', ['$event']) onMouseMove(e: MouseEvent): void { if (this.mouseLook) { this.mlx += e.movementX * 0.012; this.mly += e.movementY * 0.012; } }

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
