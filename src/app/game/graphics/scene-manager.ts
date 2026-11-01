import * as THREE from 'three';
import { Weather } from './weather';
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
  private maxPixelRatio = 1;
  private frameMs = 16;
  private weather!: Weather;
  private quality: QualityTier = 'AUTO';
  private windKmh = 12;
  private baseDaylight = 1;
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
    this.worldBuilder.onReady(() => { this.signals = new TrafficSignals(this.scene, this.worldBuilder); this.roadTraffic = new RoadTraffic(this.scene, this.worldBuilder); this.roadTraffic.signals = this.signals; this.pedestrians = new Pedestrians(this.scene, this.worldBuilder); this.pedestrians.setCount(this.pedFraction); });
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
      antialias: !mobile && !this.isSoftwareGl, // MSAA is too costly on phones; resolution scaling + FXAA-free crispness instead
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false, // photo mode renders then reads in the same task
    });
    this.maxPixelRatio = this.isSoftwareGl ? 1 : mobile ? Math.min(window.devicePixelRatio, 1.5) : Math.min(window.devicePixelRatio, 2);
    this.pixelRatio = mobile ? Math.min(this.maxPixelRatio, 1.0) : this.maxPixelRatio;
    this.renderer.setPixelRatio(this.pixelRatio);
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;

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
    // Real HDRI sky (Poly Haven, CC0) drives background + image-based lighting
    new RGBELoader().load('assets/hdri/sky.hdr', (hdr) => {
      hdr.mapping = THREE.EquirectangularReflectionMapping;
      this.scene.background = hdr;
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromEquirectangular(hdr).texture; pm.dispose();
      this.scene.environmentIntensity = 1.0;
    });

    // Warm African sunlight
    this.hemiLight = new THREE.HemisphereLight(0xbae6fd, 0x854d0e, 1.25);
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

  public updateEnvironment(env: WorldEnvironmentState): void {
    // Update Sun position & color
    this.sunLight.position.set(env.sunPosition[0], Math.max(10, env.sunPosition[1]), env.sunPosition[2]);
    this.sunLight.color.set(env.sunColorHex);

    // Update Sky & Fog
    const skyCol = new THREE.Color(env.skyColorHex);
    // Dim HDRI sky & IBL as the sun sinks below the horizon
    this.windKmh = env.windSpeedKmh; this.weather.set(env.weather);
    const gloom = env.weather === 'TROPICAL_RAIN' ? 0.45 : env.weather === 'OVERCAST' ? 0.7 : env.weather === 'MIST' ? 0.75 : 1;
    const daylight = THREE.MathUtils.clamp(0.06 + env.sunPosition[1] / 900, 0.06, 1.0) * gloom;
    this.baseDaylight = daylight;
    this.sunLight.intensity = 2.8 * gloom * gloom;
    this.scene.backgroundIntensity = daylight;
    if (this.worldBuilder.city) this.worldBuilder.city.night.value = THREE.MathUtils.clamp(1 - (daylight - 0.06) / 0.3, 0, 1);
    this.scene.environmentIntensity = daylight;
    if (this.scene.fog) {
      (this.scene.fog as THREE.FogExp2).color = skyCol.clone().lerp(new THREE.Color(0xdbe5e8), 0.8).multiplyScalar(Math.max(0.05, daylight));
      (this.scene.fog as THREE.FogExp2).density = env.fogDensity * 0.35;
    }

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
    (window as unknown as { __shesha?: Record<string, unknown> }).__shesha!['sig'] = this.signals;
    this.signals?.update(dt);
    this.roadTraffic?.update(dt, vehicle.position.x, vehicle.position.z);
    this.pedestrians?.update(dt, vehicle.position.x, vehicle.position.z, vehicle.velocity.x, vehicle.velocity.z);
    (window as unknown as { __shesha?: Record<string, unknown> }).__shesha!['peds'] = () => this.pedestrians?.debug();
    this.weather.update(dt, vehicle.position, this.windKmh);
    if (this.weather.lightning > 0.01) { this.scene.backgroundIntensity = this.baseDaylight + this.weather.lightning * 1.6; this.scene.environmentIntensity = this.baseDaylight + this.weather.lightning * 1.2; }
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

  public trafficColliders() { return this.roadTraffic?.colliders() ?? []; }
  public hitTraffic(id: number, impact: number): void { this.roadTraffic?.hit(id, impact); }

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
    let pr = this.pixelRatio;
    if (this.frameMs > 18.4) pr = Math.max(0.5, pr - (this.frameMs > 26 ? 0.2 : 0.08)); // aim for 60 fps (16.7 ms)
    else if (this.frameMs < 13.6 && pr < this.maxPixelRatio) pr = Math.min(this.maxPixelRatio, pr + 0.04);
    if (Math.abs(pr - this.pixelRatio) > 0.001) {
      this.pixelRatio = pr; this.renderer.setPixelRatio(pr);
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }

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
    this.weather.setDetail(q === 'LOW' ? 0.35 : q === 'MED' ? 0.65 : 1);
    this.worldBuilder.setDetailScale(q === 'LOW' ? 0.5 : q === 'MED' ? 0.75 : 1);
  }
  public get qualityTier(): QualityTier { return this.quality; }

  public get fps(): number { return Math.round(1000 / Math.max(1, this.frameMs)); }
  public get resolution(): number { return this.pixelRatio; }

  public render(dtMs = 16): void {
    this.govern(dtMs);
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  public captureSnapshotPng(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }
}
