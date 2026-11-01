import * as THREE from 'three';
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
  private govTimer = 0;

  constructor(private container: HTMLElement) {
    this.scene = new THREE.Scene();
    this.detectSoftwareGl();
    this.initRenderer();
    this.initLighting();
    this.cameraRig = new CameraRig(container.clientWidth / container.clientHeight);

    this.worldBuilder = new WorldBuilder();
    this.worldBuilder.buildWorld(this.scene);

    this.particleSystem = new ParticleSystem(this.scene);
    this.worldBuilder.onReady(() => { this.roadTraffic = new RoadTraffic(this.scene, this.worldBuilder); });
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
    this.modelWheels = [];
    this.modelTail = null;
    this.modelHolder = null;
    const parts = this.vehicleParts;
    AssetLibrary.attachPlayerCar(this.vehicleMeshGroup, def, config.wheelBaseM, visuals.bodyColor).then((r) => {
      if (r && parts === this.vehicleParts) { this.modelWheels = r.wheels; this.modelTail = r.tail; this.modelSpinSign = r.spinSign; this.modelRadius = r.radius; this.modelHolder = r.holder; this.modelWheelCy = r.wheelCentreY; }
    });
  }

  public updateEnvironment(env: WorldEnvironmentState): void {
    // Update Sun position & color
    this.sunLight.position.set(env.sunPosition[0], Math.max(10, env.sunPosition[1]), env.sunPosition[2]);
    this.sunLight.color.set(env.sunColorHex);

    // Update Sky & Fog
    const skyCol = new THREE.Color(env.skyColorHex);
    // Dim HDRI sky & IBL as the sun sinks below the horizon
    const daylight = THREE.MathUtils.clamp(0.06 + env.sunPosition[1] / 900, 0.06, 1.0);
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
    this.roadTraffic?.update(dt, vehicle.position.x, vehicle.position.z);
    const clouds = this.worldBuilder.streets?.clouds;
    if (clouds) {
      clouds.position.set(vehicle.position.x, 0, vehicle.position.z);
      for (const c of clouds.children) { c.position.x += dt * 6; if (c.position.x > 4500) c.position.x -= 9000; }
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
      const gy = this.worldBuilder.groundHeightAt(vehicle.position.x, vehicle.position.z);
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
    if (this.frameMs > 21.5) pr = Math.max(0.5, pr - (this.frameMs > 30 ? 0.2 : 0.1));
    else if (this.frameMs < 15.5 && pr < this.maxPixelRatio) pr = Math.min(this.maxPixelRatio, pr + 0.05);
    if (Math.abs(pr - this.pixelRatio) > 0.001) {
      this.pixelRatio = pr; this.renderer.setPixelRatio(pr);
      this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    }
  }

  public render(dtMs = 16): void {
    this.govern(dtMs);
    this.renderer.render(this.scene, this.cameraRig.camera);
  }

  public captureSnapshotPng(): string {
    this.render();
    return this.renderer.domElement.toDataURL('image/png');
  }
}
