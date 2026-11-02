import * as THREE from 'three';
import { Weather } from './weather';
import { SLOT, LAMP, setEmitter, clearEmitter } from './lamp-light';
import { Police, Stealth, PlayerPose } from './police';
import type { RoadGraph } from '../road-graph';
import { Sky, skyPalette, SkyPalette } from './sky';
import { Pedestrians } from './pedestrians';
import { TrafficSignals } from './traffic-signals';
import { QualityTier } from '../../services/settings.service';
import { CameraRig } from './camera-rig';
import { WorldBuilder } from './world-builder';
import { ParticleSystem } from './particle-system';
import { AssetLibrary } from './asset-library';
import { RoadTraffic } from './road-traffic';
import { CAR_CATALOG, CarDef } from '../cars';
import { CarFactory } from './car-factory';
import { RaycastVehicle } from '../physics/raycast-vehicle';
import { VehicleArchetypeConfig, VisualCustomization } from '../../models/vehicle.types';
import { WorldEnvironmentState } from '../../models/world.types';

import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';

export class SceneManager {
  public scene: THREE.Scene;
  public renderer!: THREE.WebGLRenderer;
  public cameraRig!: CameraRig;
  public worldBuilder!: WorldBuilder;
  public particleSystem!: ParticleSystem;

  public vehicleMeshGroup!: THREE.Group;
  private modelWheels: THREE.Object3D[] = [];
  private modelTail: THREE.MeshStandardMaterial | null = null;
  private modelSpin = 0;
  private modelSpinSign = 1;
  private modelHolder: THREE.Group | null = null;
  private modelWheelCy = 0.33;
  private modelRadius = 0.33;
  private roadTraffic?: RoadTraffic;
  private pedestrians?: Pedestrians;
  public police?: Police; public graphProvider?: () => RoadGraph | undefined; private copsWanted = true;
  private signals?: TrafficSignals;
  private pedFraction = 1;
  private vehicleParts!: ReturnType<typeof CarFactory.createVehicleMesh>;

  // Lighting & Sky
  private sunLight!: THREE.DirectionalLight;
  private hemiLight!: THREE.HemisphereLight;

  // Software GL detection flag
  public isSoftwareGl = false;
  public isMobile = false;
  private pixelRatio = 1;
  private autoDetail = 1; private tierDetail = 1;
  private maxPixelRatio = 1;
  private frameMs = 16;
  private weather!: Weather;
  private quality: QualityTier = 'AUTO';
  private windKmh = 12;
  private baseDaylight = 1;
  private neo = false; private moon!: THREE.DirectionalLight; private sunDirSky = new THREE.Vector3(0, 1, 0);
  private sky!: Sky; private envScene!: THREE.Scene; private rim!: THREE.DirectionalLight; private envRT?: THREE.WebGLRenderTarget; private envKey = ''; private envT = 0;
  private pal: SkyPalette = { zenith: new THREE.Color(), horizon: new THREE.Color(), sun: new THREE.Color(), sunI: 1, day: 1 }; private skyClock = 0; private skyCover = 0.55; private skyGloom = 0;
  private govTimer = 0;

  constructor(private container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.detectSoftwareGl();
    this.initRenderer();
    this.initLighting();
    this.cameraRig = new CameraRig(container.clientWidth / container.clientHeight);

    this.worldBuilder = new WorldBuilder();
    this.worldBuilder.buildWorld(this.scene);
    this.worldBuilder.shadowsOn = this.renderer.shadowMap.enabled;
    if (!this.renderer.shadowMap.enabled) this.makeBlobShadow();

    this.particleSystem = new ParticleSystem(this.scene);
    this.weather = new Weather(this.scene);
    this.worldBuilder.onReady(() => { this.signals = new TrafficSignals(this.scene, this.worldBuilder); this.roadTraffic = new RoadTraffic(this.scene, this.worldBuilder); this.roadTraffic.signals = this.signals; this.pedestrians = new Pedestrians(this.scene, this.worldBuilder); this.police = new Police(this.scene, this.worldBuilder, () => this.graphProvider?.()); this.police.setEnabled(this.copsWanted); this.pedestrians.setCount(this.pedFraction); });
  }

  private detectSoftwareGl(): void {
    if (typeof document === 'undefined') return;
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
      if (!gl) {
        this.isSoftwareGl = true;
        return;
      }
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    } catch {
      this.isSoftwareGl = true;
    }
  }

  private initRenderer(): void {
    const mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints ?? 0) > 1;
    this.isMobile = mobile;
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl && !mobile, // MSAA off on phones (tile-GPU cost); resolution scaling carries the quality instead
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false, // photo mode renders then reads in the same task
    });
    this.maxPixelRatio = this.isSoftwareGl ? 1 : mobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
    this.pixelRatio = mobile ? Math.min(this.maxPixelRatio, 1.0) : this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;

    this.renderer.shadowMap.enabled = !this.isSoftwareGl && !this.isMobile;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Studio PBR reflections for car paint, chrome, glass, and wet tarmac
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    this.container.appendChild(this.renderer.domElement);
    (window as unknown as { __shesha?: unknown }).__shesha = { breakdown: () => this.breakdown(), info: () => ({ ...this.renderer.info.render, geometries: this.renderer.info.memory.geometries, textures: this.renderer.info.memory.textures, pr: this.pixelRatio }) };
  }

  private initLighting(): void {
    // Procedural stylized sky replaces the HDRI: background + image-based lighting both come from it
    this.sky = new Sky(this.scene); this.scene.background = null;
    this.envScene = new THREE.Scene(); this.envScene.add(this.sky.envMesh);
    this.moon = new THREE.DirectionalLight(0x8fa8ff, 0); this.scene.add(this.moon); this.rim = new THREE.DirectionalLight(0x9ab8ff, 0.0); this.rim.position.set(-200, 120, -300); this.scene.add(this.rim);

    // Warm African sunlight
    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x854d0e, 0.9);
    this.scene.add(this.hemiLight);

    // Sun directional light with soft shadows
    this.sunLight = new THREE.DirectionalLight(0xfef08a, 2.8);
    this.sunLight.position.set(120, 320, 220);
    this.sunLight.castShadow = !this.isSoftwareGl && !this.isMobile;
    this.sunLight.shadow.mapSize.width = 1024;
    this.sunLight.shadow.mapSize.height = 1024;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 850;
    const d = 55;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0006;
    this.scene.add(this.sunLight);

    // African distance fog blending mountains into the sky
    this.scene.fog = new THREE.FogExp2(0xcdd8dc, 0.00022);
  }

  public spawnVehicle(config: VehicleArchetypeConfig, visuals: VisualCustomization, def: CarDef = CAR_CATALOG[0]): void {
    if (this.vehicleMeshGroup) {
      this.scene.remove(this.vehicleMeshGroup);
    }
    this.vehicleParts = CarFactory.createVehicleMesh(config, visuals);
    this.vehicleMeshGroup = this.vehicleParts.root;
    this.scene.add(this.vehicleMeshGroup);
    this.buildLightRig(config.wheelBaseM, config.trackWidthM);
    this.modelWheels = [];
    this.modelTail = null;
    this.modelHolder = null;
    const parts = this.vehicleParts;
    AssetLibrary.attachPlayerCar(this.vehicleMeshGroup, def, config.wheelBaseM, visuals.bodyColor).then((r) => {
      if (r && parts === this.vehicleParts) { this.modelWheels = r.wheels; this.modelTail = r.tail; this.modelSpinSign = r.spinSign; this.modelRadius = r.radius; this.modelHolder = r.holder; this.modelWheelCy = r.wheelCentreY; }
    });
  }

  // ---- lights rig: head/tail/indicator lamps + one beam, driven by DriveStateService each frame
  private rig?: { head: THREE.Mesh[]; tail: THREE.Mesh[]; ind: { m: THREE.Mesh; side: number; front: boolean }[]; beam: THREE.SpotLight };
  private buildLightRig(wheelBase: number, track: number): void {
    const g = this.vehicleMeshGroup; if (!g) return;
    const fz = wheelBase / 2 + 0.95, rz = -wheelBase / 2 - 0.95, x = Math.max(0.55, track * 0.4), y = 0.62;
    const lamp = (px: number, py: number, pz: number, col: number, w = 0.3, h = 0.11) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), new THREE.MeshBasicMaterial({ color: col, toneMapped: false })); m.position.set(px, py, pz); g.add(m); return m; };
    const head = [lamp(-x, y, fz, 0xfff6d8), lamp(x, y, fz, 0xfff6d8)], tail = [lamp(-x, y, rz, 0x7a0000), lamp(x, y, rz, 0x7a0000)];
    const ind: { m: THREE.Mesh; side: number; front: boolean }[] = [];
    for (const side of [-1, 1]) { ind.push({ m: lamp(side * (x + 0.28), y, fz - 0.02, 0x3a2500, 0.14, 0.1), side, front: true }); ind.push({ m: lamp(side * (x + 0.28), y + 0.04, rz + 0.02, 0x3a2500, 0.14, 0.1), side, front: false }); }
    const beam = new THREE.SpotLight(0xfff3d6, 0, 75, 0.5, 0.55, 1.2); beam.position.set(0, 0.8, fz); beam.target.position.set(0, 0.2, fz + 25); g.add(beam, beam.target);
    this.rig = { head, tail, ind, beam };
  }
  /** left of the car is +x (it faces +z)  */
  public setLights(headlights: number, left: boolean, right: boolean, braking: boolean, reversing: boolean, daylight = 1): void {
    const r = this.rig; if (!r) return;
    const hm = (m: THREE.Mesh, c: number) => (m.material as THREE.MeshBasicMaterial).color.setHex(c);
    for (const m of r.head) hm(m, headlights ? (headlights === 2 ? 0xffffff : 0xfff0c8) : 0x9a9a8c);
    for (const m of r.tail) hm(m, braking ? 0xff1a1a : headlights ? 0xb01010 : 0x6a0000);
    for (const i of r.ind) hm(i.m, (i.side > 0 ? left : right) ? 0xffb000 : (!i.front && reversing && i.side > 0 ? 0xffffff : 0x3a2500));
    const night = 1 - Math.min(1, daylight);
    r.beam.intensity = headlights === 0 ? 0 : (headlights === 2 ? 30 : 14) * (0.35 + night * 0.9); r.beam.distance = headlights === 2 ? 110 : 70;
  }

  // ---- map waypoint beacon: a tall magenta light shaft
  private beacon?: THREE.Mesh;
  public setWaypoint(wp: [number, number] | null): void {
    if (!wp) { if (this.beacon) this.beacon.visible = false; return; }
    if (!this.beacon) {
      this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 400, 16, 1, true).translate(0, 200, 0), new THREE.MeshBasicMaterial({ color: 0xd946ef, transparent: true, opacity: 0.38, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      this.beacon.frustumCulled = false; this.beacon.renderOrder = 4; this.scene.add(this.beacon);
    }
    this.beacon.visible = true; this.beacon.position.set(wp[0], this.worldBuilder.calculateRawTerrainHeight(wp[0], wp[1]), wp[1]);
  }

  /** Real / Neo-Eswatini look: neon facades (shader uniform), glowing lane markings, violet night-grade sky. */
  public setTheme(t: 'REAL' | 'NEO'): void {
    this.neo = t === 'NEO';
    const wb = this.worldBuilder, mark = wb.markMat, asph = wb.asphMat;
    if (mark) { mark.emissive.setRGB(0.1, 0.9, 1.0); mark.emissiveMap = this.neo ? mark.map : null; mark.emissiveIntensity = this.neo ? 1.6 : 0; mark.needsUpdate = true; }
    if (asph) { asph.color.setScalar(this.neo ? 0.55 : 1); asph.needsUpdate = true; }
    this.hemiLight.color.set(this.neo ? 0x8a6bff : 0xbae6fd); this.hemiLight.groundColor.set(this.neo ? 0x1a0b3a : 0x854d0e);
    if (!this.neo && wb.city) wb.city.neo.value = 0;
  }

  /** Per-frame emitters: signals, AI headlights, siren strobes and the player's own tail glow. */
  private updateDynamicEmitters(vehicle: RaycastVehicle): void {
    if (LAMP.uLampOn.value < 0.01) return;
    const px = vehicle.position.x, pz = vehicle.position.z, gy = vehicle.position.y;
    const sg = this.signals?.nearestHeads(px, pz, SLOT.SIGNALS) ?? [];
    for (let k = 0; k < SLOT.SIGNALS; k++) { const h = sg[k]; if (h) setEmitter(SLOT.SIGNAL + k, h.x, h.y, h.z, 14, h.col[0], h.col[1], h.col[2], 1.1); else clearEmitter(SLOT.SIGNAL + k); }
    const cars = this.roadTraffic?.nearestCars(px, pz, SLOT.CARS) ?? [];
    for (let k = 0; k < SLOT.CARS; k++) { const c = cars[k]; if (c) setEmitter(SLOT.CAR + k, c.x, c.y, c.z, 17, 1, 0.94, 0.78, 1.5); else clearEmitter(SLOT.CAR + k); }
    const st = this.police?.strobe(px, pz);
    if (st) { setEmitter(SLOT.COP, st.x, st.y, st.z, 34, 1, 0.08, 0.08, st.red ? 2.4 : 0.15); setEmitter(SLOT.COP + 1, st.x, st.y, st.z, 34, 0.15, 0.3, 1, st.red ? 0.15 : 2.4); } else { clearEmitter(SLOT.COP); clearEmitter(SLOT.COP + 1); }
    if (vehicle.brake > 0.15) setEmitter(SLOT.PLAYER, px, gy + 0.8, pz, 8, 1, 0.08, 0.05, 0.9); else clearEmitter(SLOT.PLAYER);
  }

  /** Re-bake the image-based lighting from the sky when its look has changed (throttled; a PMREM of a 50 m dome is cheap). */
  private refreshEnvironmentMap(): void {
    const now = performance.now(); const key = `${Math.round(this.sunDirSky.y * 8)}|${this.skyGloom.toFixed(1)}|${this.neo ? 1 : 0}`;
    if (key === this.envKey && this.envRT) return; if (now - this.envT < 4000 && this.envRT) return; this.envKey = key; this.envT = now;
    this.sky.update(new THREE.Vector3(), this.sunDirSky, this.pal, this.skyClock, this.skyCover, this.skyGloom, 0);
    const pm = new THREE.PMREMGenerator(this.renderer); const rt = pm.fromScene(this.envScene, 0, 0.1, 100); pm.dispose();
    this.scene.environment = rt.texture; this.envRT?.dispose(); this.envRT = rt;
  }

  public updateEnvironment(env: WorldEnvironmentState): void {
    this.windKmh = env.windSpeedKmh; this.weather.set(env.weather);
    const elev = Math.sin(((env.timeOfDayHours - 6) / 24) * 2 * Math.PI);   // true solar elevation, not clamped by the env service
    const sd = new THREE.Vector3(env.sunPosition[0], 0, env.sunPosition[2]).normalize(); sd.x *= Math.sqrt(Math.max(0.0001, 1 - elev * elev)); sd.z *= Math.sqrt(Math.max(0.0001, 1 - elev * elev)); sd.y = elev;
    this.sunDirSky.copy(sd);
    const gloomK = env.weather === 'TROPICAL_RAIN' ? 0.18 : env.weather === 'OVERCAST' ? 0.45 : env.weather === 'MIST' ? 0.55 : 1;
    this.skyGloom = 1 - gloomK; this.skyCover = env.weather === 'SUNNY' ? 0.5 : env.weather === 'MIST' ? 0.7 : 0.95;
    const pal = skyPalette(sd.y, gloomK, this.neo, this.pal);
    const day = pal.day * (this.neo ? 0.75 : 1);
    const gloom = 0.45 + 0.55 * gloomK;
    // sun: warm key from the palette; shadows from it only when it is above the horizon
    this.sunLight.position.set(sd.x * 400, Math.max(40, sd.y * 400), sd.z * 400);
    this.sunLight.color.copy(pal.sun); this.sunLight.intensity = pal.sunI * (sd.y > -0.02 ? 1 : 0) * gloom * gloom * (this.neo ? 0.6 : 1);
    // ambient: sky colour above, warm bounce below; cool rim light opposite the sun for the stylised edge glow
    this.hemiLight.color.copy(pal.zenith).lerp(new THREE.Color(1, 1, 1), 0.45); this.hemiLight.groundColor.copy(pal.horizon).multiplyScalar(0.42).lerp(new THREE.Color(0.35, 0.26, 0.2), 0.3);
    const dark = Math.pow(day, 1.4); this.hemiLight.intensity = 0.045 + 0.85 * dark;                 // nights are properly dark: only faint moonlight
    this.moon.intensity = (1 - dark) * (sd.y < 0.05 ? 0.22 : 0) * gloom; this.moon.position.set(-sd.x * 300, 200, -sd.z * 300);
    this.rim.position.set(-sd.x * 300, 120, -sd.z * 300); this.rim.color.copy(pal.zenith).lerp(new THREE.Color(0.7, 0.8, 1), 0.5); this.rim.intensity = (0.03 + 0.4 * dark) * (this.neo ? 2 : 1);
    this.renderer.toneMappingExposure = 0.88 + 0.12 * (1 - day);
    const daylight = Math.max(0.06, day);
    this.baseDaylight = daylight; this.scene.environmentIntensity = 0.04 + 0.96 * dark;
    if (this.worldBuilder.city) { this.worldBuilder.city.night.value = THREE.MathUtils.clamp(1 - (daylight - 0.06) / 0.3, 0, 1); this.worldBuilder.city.neo.value += ((this.neo ? 1 : 0) - this.worldBuilder.city.neo.value) * 0.5; }
    this.worldBuilder.setNightGlow?.(this.worldBuilder.city ? this.worldBuilder.city.night.value : 0);
    if (this.scene.fog) { const f = this.scene.fog as THREE.FogExp2; f.color.copy(pal.horizon).multiplyScalar(0.55 + 0.45 * daylight); f.density = Math.max(env.fogDensity * 0.4 * (this.neo ? 1.4 : 1), 0.0014); } // floor: hides the cut-off distance (~65% haze at 700 m)
    this.refreshEnvironmentMap();

    // Wet road puddles and mirror reflections
    for (const mesh of this.worldBuilder.roadMeshes) {
      const mat = mesh.material as THREE.MeshStandardMaterial;
      if (mat) {
        mat.roughness = 0.72 - env.wetness * 0.62; // High gloss mirror sheen when wet
        mat.metalness = 0.15 + env.wetness * 0.5;
      }
    }
  }

  public syncVehicleVisuals(vehicle: RaycastVehicle, dt: number): void {
    if (!this.vehicleMeshGroup || !this.vehicleParts) return;

    this.worldBuilder.update(vehicle.position.x, vehicle.position.z);
    { const sh = (window as unknown as { __shesha?: Record<string, unknown> }).__shesha!; sh['sig'] = this.signals; sh['top'] = (x?: number, z?: number, h = 400) => { this.topView = x === undefined ? null : { x, z: z!, h }; if (x === undefined) this.cameraRig.camera.up.set(0, 1, 0); }; }
    this.signals?.update(dt);
    this.updateDynamicEmitters(vehicle);
    this.roadTraffic?.update(dt, vehicle.position.x, vehicle.position.z);
    this.pedestrians?.update(dt, vehicle.position.x, vehicle.position.z, vehicle.velocity.x, vehicle.velocity.z);
    (window as unknown as { __shesha?: Record<string, unknown> }).__shesha!['peds'] = () => this.pedestrians?.debug();
    this.weather.update(dt, vehicle.position, this.windKmh);
    this.skyClock += dt; this.sky.update(this.cameraRig.camera.position, this.sunDirSky, this.pal, this.skyClock, this.skyCover, this.skyGloom, this.weather.lightning * 0.5);
    if (this.weather.lightning > 0.01) this.scene.environmentIntensity = this.baseDaylight + this.weather.lightning * 1.2;
    const clouds = this.worldBuilder.streets?.clouds;
    if (clouds) {
      clouds.position.set(vehicle.position.x, 0, vehicle.position.z);
      for (const c of clouds.children) { c.position.x += dt * 6; if (c.position.x > 4500) c.position.x -= 9000; }
    }

    if (this.blob) {
      const gy = this.worldBuilder.groundHeightAt(vehicle.position.x, vehicle.position.z, vehicle.position.y);
      this.blob.position.set(vehicle.position.x, gy + 0.05, vehicle.position.z);
      this.blob.rotation.y = Math.atan2(2 * (vehicle.quaternion.w * vehicle.quaternion.y + vehicle.quaternion.x * vehicle.quaternion.z), 1 - 2 * (vehicle.quaternion.y * vehicle.quaternion.y + vehicle.quaternion.z * vehicle.quaternion.z));
    }

    // 1. Position and orientation of vehicle body
    this.vehicleMeshGroup.position.copy(vehicle.position);
    this.vehicleMeshGroup.quaternion.copy(vehicle.quaternion);

    // Move the sun shadow camera and sky dome with the car so shadows remain razor sharp anywhere in Eswatini
    this.sunLight.position.set(vehicle.position.x + 120, vehicle.position.y + 320, vehicle.position.z + 220);
    this.sunLight.target.position.copy(vehicle.position);
    this.sunLight.target.updateMatrixWorld();


    // 2. Wheels: position, suspension compression, steering rotation, and rolling spin
    for (let i = 0; i < 4; i++) {
      const wheelMesh = this.vehicleParts.wheels[i];
      const w = vehicle.wheels[i];

      // Suspension travel displacement
      wheelMesh.position.y = 0.33 - w.compressionM;

      // Steering angle on front wheels
      if (w.isSteerable) {
        wheelMesh.rotation.y = -vehicle.steerInput * THREE.MathUtils.degToRad(35);
      }

      // Wheel rolling rotation
      const speedMs = vehicle.velocity.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(vehicle.quaternion));
      wheelMesh.children[0].rotation.x += (speedMs / 0.33) * dt;

      // Brake rotor thermal glow (>450°C glowing red-orange)
      const rotor = this.vehicleParts.rotors[i];
      const rotorMat = rotor.material as THREE.MeshStandardMaterial;
      if (rotorMat) {
        if (w.rotorTemperatureC > 450) {
          const glowFactor = (w.rotorTemperatureC - 450) / 400;
          rotorMat.emissive.set(0xff4500); // Glowing orange/red
          rotorMat.emissiveIntensity = glowFactor * 2.5;
        } else {
          rotorMat.emissive.set(0x000000);
          rotorMat.emissiveIntensity = 0;
        }
      }

      // Tire smoke & dust emission
      if (w.isSkidding) {
        const contactPos = vehicle.position.clone().add(wheelMesh.position);
        const isWet = this.worldBuilder.classifySurfaceAt(contactPos.x, contactPos.z, contactPos.y) === 11 && false;
        const isDirt = [1, 4, 7, 10].includes(w.surfaceClass);
        this.particleSystem.emitTireSmoke(contactPos, isWet, isDirt);
      }
    }

    // 2a. Seat the real model on the actual surface: tyres touch the ground whatever the suspension is doing
    if (this.modelHolder) {
      const gy = this.worldBuilder.groundHeightAt(vehicle.position.x, vehicle.position.z, vehicle.position.y);
      this.modelHolder.position.y = (gy + this.modelRadius - vehicle.position.y) - this.modelWheelCy;
    }

    // 2b. Real Ferrari wheels: steer (front) + roll
    if (this.modelWheels.length === 4) {
      const fwd = vehicle.velocity.dot(new THREE.Vector3(0, 0, 1).applyQuaternion(vehicle.quaternion));
      this.modelSpin += this.modelSpinSign * (fwd / this.modelRadius) * dt;
      this.modelWheels.forEach((w, i) => {
        w.rotation.x = this.modelSpin;
        w.rotation.y = i < 2 ? -vehicle.steerInput * THREE.MathUtils.degToRad(30) : 0;
      });
    }
    if (this.modelTail) this.modelTail.emissiveIntensity = (vehicle.brake > 0.1 || vehicle.handbrake) ? 4 : 0.2;

    // 3. Active Aero Spoiler tilt
    this.vehicleParts.spoiler.rotation.x = THREE.MathUtils.degToRad(vehicle.activeAeroAngleDeg);

    // 4. Cockpit Steering wheel rotation
    this.vehicleParts.steeringWheel.rotation.z = vehicle.steerInput * Math.PI * 1.5;

    // 5. Brake lights activation
    const isBraking = vehicle.brake > 0.1 || vehicle.handbrake;
    for (const tl of this.vehicleParts.brakeLights) {
      (tl.material as THREE.MeshBasicMaterial).color.set(isBraking ? 0xff0000 : 0x7f1d1d);
    }

    // 6. Backfire exhaust flames
    const flameAlpha = vehicle.backfireTriggered ? 1.0 : 0.0;
    (this.vehicleParts.exhaustFlameLeft.material as THREE.MeshBasicMaterial).opacity = flameAlpha;
    (this.vehicleParts.exhaustFlameRight.material as THREE.MeshBasicMaterial).opacity = flameAlpha;

    // 7. Update particles
    this.particleSystem.update(dt);
  }

  private breakdown(): Record<string, number> {
    const out: Record<string, number> = {};
    this.scene.traverseVisible((o) => {
      const m = o as THREE.Mesh; if (!m.isMesh) return; const g = m.geometry; const t = (g.index ? g.index.count : g.attributes['position'].count) / 3 * ((o as THREE.InstancedMesh).count ?? 1);
      const k = o.name || (m.material as THREE.Material).type + ':' + ((m.material as THREE.MeshStandardMaterial).map ? 'tex' : 'plain'); out[k] = (out[k] ?? 0) + t; out['calls:' + k] = (out['calls:' + k] ?? 0) + 1;
    });
    return out;
  }

  /** Cheap soft contact shadow under the car where real shadow maps are off (phones). */
  private blob?: THREE.Mesh;
  private makeBlobShadow(): void {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.34)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -6, fog: false }));
    this.blob.scale.set(2.9, 1, 5.4); this.blob.renderOrder = 2; this.scene.add(this.blob);
  }

  public trafficColliders() { return [...(this.roadTraffic?.colliders() ?? []), ...(this.police?.colliders() ?? [])]; }
  public hitTraffic(id: number, impact: number): void { if (id >= 1000) this.police?.hit(id, impact); else this.roadTraffic?.hit(id, impact); }
  public setCops(on: boolean): void { this.copsWanted = on; this.police?.setEnabled(on); }
  public policeUpdate(dt: number, pl: PlayerPose, st: Stealth, night: number): void { this.police?.update(dt, pl, st, night); }

  public resize(): void {
    if (!this.container || !this.renderer) return;
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    this.renderer.setSize(w, h);
    this.cameraRig.setAspect(w / h);
  }

  /** Dynamic resolution: hold ~50 fps by trading pixel ratio (never below 0.5x, never above the device cap). */
  private govern(dtMs: number): void {
    this.frameMs += (dtMs - this.frameMs) * 0.1;
    this.govTimer += dtMs;
    if (this.govTimer < 700) return;
    this.govTimer = 0;
    let pr = this.pixelRatio, ad = this.autoDetail;
    const floorPr = this.isMobile ? 0.75 : 0.85;                                  // phones may drop to 0.75 render scale before missing 60 fps (GTA3-style softness beats stutter)
    if (this.frameMs > 18.4) {                                                    // over budget: first draw less (distance / chunk detail), only then lower resolution toward its floor
      if (ad > 0.45) ad = Math.max(0.45, ad - (this.frameMs > 26 ? 0.15 : 0.07));
      else pr = Math.max(floorPr, pr - (this.frameMs > 26 ? 0.1 : 0.04));
    } else if (this.frameMs < 13.6) {                                             // headroom: resolution back up first, then distance
      if (pr < this.maxPixelRatio) pr = Math.min(this.maxPixelRatio, pr + 0.04);
      else if (ad < 1) ad = Math.min(1, ad + 0.04);
    }
    if (Math.abs(ad - this.autoDetail) > 0.001) { this.autoDetail = ad; this.worldBuilder.setDetailScale(this.tierDetail * ad); }
    if (Math.abs(pr - this.pixelRatio) > 0.001) {
      this.pixelRatio = pr; this.renderer.setPixelRatio(pr);
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }

  /** Compile every shader program once, up front, so first sight of a material never hitches mid-drive. */
  public warm(): void { if (this.isSoftwareGl) return; try { void this.renderer.compileAsync(this.scene, this.cameraRig.camera).catch(() => undefined); } catch { /* best effort */ } }

  /** Apply a graphics tier. AUTO keeps the device defaults; the dynamic-resolution governor still runs inside each tier's cap. */
  public setQuality(q: QualityTier): void {
    this.quality = q;
    const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio;
    const devCap = this.isSoftwareGl ? 1 : this.isMobile ? Math.min(dpr, 1.5) : Math.min(dpr, 2);
    const cap = q === 'HIGH' ? Math.min(dpr, 2) : q === 'MED' ? Math.min(devCap, 1) : q === 'LOW' ? Math.min(devCap, 0.7) : devCap;
    this.maxPixelRatio = cap; this.pixelRatio = Math.min(this.pixelRatio, cap);
    if (q === 'HIGH' || q === 'LOW') this.pixelRatio = cap;
    this.renderer.setPixelRatio(this.pixelRatio); this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    const shadows = !this.isSoftwareGl && (q === 'HIGH' || (q === 'AUTO' && !this.isMobile));
    if (shadows !== this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = shadows; this.sunLight.castShadow = shadows; this.worldBuilder.shadowsOn = shadows;
      this.scene.traverse((o) => { const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined; if (m) (Array.isArray(m) ? m : [m]).forEach((x) => (x.needsUpdate = true)); });
    }
    this.sunLight.shadow.mapSize.set(q === 'HIGH' ? 2048 : 1024, q === 'HIGH' ? 2048 : 1024); this.sunLight.shadow.map?.dispose(); (this.sunLight.shadow as { map: unknown }).map = null;
    if (this.blob) this.blob.visible = !shadows; else if (!shadows) this.makeBlobShadow();
    this.pedFraction = q === 'LOW' ? 0.3 : q === 'MED' ? 0.65 : 1; this.pedestrians?.setCount(this.pedFraction);
    LAMP.uLampN.value = q === 'LOW' ? 14 : q === 'MED' || (q === 'AUTO' && this.isMobile) ? 22 : 24;
    this.weather.setDetail(q === 'LOW' ? 0.35 : q === 'MED' ? 0.65 : 1);
    this.tierDetail = q === 'LOW' ? 0.5 : q === 'MED' ? 0.75 : 1; this.worldBuilder.setDetailScale(this.tierDetail * this.autoDetail);
  }
  public get qualityTier(): QualityTier { return this.quality; }

  public get fps(): number { return Math.round(1000 / Math.max(1, this.frameMs)); }
  public get resolution(): number { return this.pixelRatio; }

  /** Debug: straight-down camera over a point (metres above ground), for comparing against satellite imagery. */
  public topView: { x: number; z: number; h: number } | null = null;
  public render(dtMs = 16): void {
    this.govern(dtMs);
    if (this.topView) { const c = this.cameraRig.camera, t = this.topView; c.up.set(0, 0, -1); c.position.set(t.x, this.worldBuilder.calculateRawTerrainHeight(t.x, t.z) + t.h, t.z); c.lookAt(t.x, c.position.y - 100, t.z); c.fov = 50; c.updateProjectionMatrix(); }
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  public captureSnapshotPng(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }
}
