import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { CarDef } from '../cars';
import type { WorldBuilder } from './world-builder';
import { makeCar, playerPaintMat } from './car-gen';

/** Loads real CC0/CC-BY glTF models (see public/assets/CREDITS.txt) and dresses the world with them. */
export class AssetLibrary {
  private static loader = (() => { const l = new GLTFLoader(); const d = new DRACOLoader(); d.setDecoderPath('assets/draco/'); l.setDRACOLoader(d); return l; })();
  private static cache = new Map<string, Promise<THREE.Group>>();
  /** Loading progress for the splash screen. */
  public static total = 0;
  public static done = 0;

  public static load(url: string): Promise<THREE.Group> {
    let p = this.cache.get(url);
    if (!p) {
      this.total++;
      p = this.loader.loadAsync(url).finally(() => this.done++).then((g) => {
        g.scene.traverse((o) => {
          const m = o as THREE.Mesh;
          if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
        });
        return g.scene;
      });
      this.cache.set(url, p);
    }
    return p;
  }

  /** Uniformly scales so the model's height (or width if byWidth) equals target; sits base at y=0. */
  private static fit(model: THREE.Object3D, target: number, byWidth = false): THREE.Group {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const s = target / (byWidth ? Math.max(size.x, size.z) : size.y);
    const wrap = new THREE.Group();
    model.scale.setScalar(s);
    const b2 = new THREE.Box3().setFromObject(model);
    model.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    wrap.add(model);
    wrap.userData['size'] = b2.getSize(new THREE.Vector3());
    return wrap;
  }

  private static roadAt(wb: WorldBuilder, z: number): THREE.Vector3 {
    const t = Math.max(0, Math.min(1, (400 - z) / 8000));
    return wb.highwayCurve.getPointAt(t);
  }

  /** Real-world dressing now comes from OpenStreetMap data (see WorldBuilder). */
  public static async dressWorld(_scene: THREE.Scene, _wb: WorldBuilder): Promise<void> { return; }

  /** A generated catalogue body in the chosen paint (fixed paint + stripe for taxis and coaches). */
  public static genCar(def: CarDef, bodyColor: string): THREE.Group {
    const rgb = (c: THREE.ColorRepresentation): number[] => { const k = new THREE.Color(c); return [k.r, k.g, k.b]; };
    return makeCar(def.gen!, rgb(def.paintable ? bodyColor : def.paint ?? 0xf0f0ec), def.stripe !== undefined ? rgb(def.stripe) : undefined, playerPaintMat);
  }
  /** Showroom copy of any catalogue car (garage preview). */
  public static async preview(def: CarDef, bodyColor: string): Promise<THREE.Object3D> {
    return def.gen ? this.genCar(def, bodyColor) : (await this.load(def.file)).clone(true);
  }

  /** Wraps any catalogue car model around the physics rig. Returns wheel nodes (FL, FR, RL, RR) for animation. */
  public static async attachPlayerCar(
    root: THREE.Group, def: CarDef, wheelBase: number, bodyColor: string
  ): Promise<{ wheels: THREE.Object3D[]; tail: THREE.MeshStandardMaterial | null; spinSign: number; radius: number; holder: THREE.Group; wheelCentreY: number } | null> {
    try {
      if (def.gen) {
        const car = this.genCar(def, bodyColor), wheels = (car.userData['wheels'] as THREE.Object3D[]).slice(0, 4), radius = (car.userData['size'] as { wr: number }).wr;
        for (const w of wheels) w.rotation.order = 'YXZ';
        const holder = new THREE.Group(); holder.position.y = 0.33 - radius; holder.add(car); holder.name = 'PlayerCarModel'; root.add(holder);
        root.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh && !holder.getObjectById(m.id)) m.visible = false; });
        return { wheels, tail: null, spinSign: 1, radius, holder, wheelCentreY: radius };
      }
      // desktop gets the full-detail Ferrari (smooth panels, interior); phones keep the decimated one
      const hi = def.id === 'ferrari' && !/Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
      const car = (hi ? await this.load('assets/models/ferrari.glb').catch(() => this.load(def.file)) : await this.load(def.file)).clone(true);
      let tail: THREE.MeshStandardMaterial | null = null;
      car.traverse((o) => {
        const m = o as THREE.Mesh;
        // kit models: glossier paint that mirrors the sky (own clones, the cached source stays untouched)
        if (m.isMesh && !def.paintable && m.material && !Array.isArray(m.material)) {
          const k = (m.material as THREE.MeshStandardMaterial).clone();
          if (k.isMeshStandardMaterial) { k.envMapIntensity = 1.25; k.roughness = Math.min(k.roughness, 0.5); k.metalness = Math.max(k.metalness, 0.25); m.material = k; }
        }
        if (m.isMesh && m.material && def.paintable) {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.name === 'Body_Color' || (hi && o.name === 'body')) {
            // showroom paint: metallic flake base under a glossy clear coat that mirrors the sky
            const cl = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(bodyColor), metalness: 0.55, roughness: 0.38, clearcoat: 1, clearcoatRoughness: 0.035, envMapIntensity: 1.25, normalMap: mat.normalMap ?? null });
            cl.name = 'Body_Color'; m.material = cl;
          }
          else if (mat.name === 'Taillight_Glass') { tail = mat.clone(); tail.emissive = new THREE.Color(0xff0000); tail.emissiveIntensity = 0.2; m.material = tail; }
        }
      });
      // The open-top cabin is barely visible from the chase camera: drop the heavy interior meshes (~half the triangles)
      if (def.flip && !hi) car.traverse((o) => { if ((o as THREE.Mesh).isMesh && /interior|leather|carpet|leds|wiper|brake|carbon_fibre_trim/i.test(o.name)) o.visible = false; });
      const wheels: THREE.Object3D[] = [];
      for (const n of def.wheels) { const w = car.getObjectByName(n); if (w) { w.rotation.order = 'YXZ'; wheels.push(w); } }
      car.updateWorldMatrix(true, true);
      let s = 1, wy = 0.3, radius = 0.33;
      if (wheels.length === 4) {
        const p = wheels.map((w) => w.getWorldPosition(new THREE.Vector3()));
        const wb = Math.abs((p[0].z + p[1].z) / 2 - (p[2].z + p[3].z) / 2) || 1;
        s = wheelBase / wb; wy = (p[0].y + p[2].y) / 2;
        const bb = new THREE.Box3().setFromObject(wheels[0]); radius = Math.max(0.1, (bb.max.y - bb.min.y) / 2) * s;
      }
      const holder = new THREE.Group();
      holder.rotation.y = def.flip ? Math.PI : 0;
      holder.scale.setScalar(s);
      holder.position.y = 0.33 - wy * s;
      holder.add(car);
      holder.name = 'PlayerCarModel';
      root.add(holder);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !holder.getObjectById(m.id)) m.visible = false;
      });
      return { wheels, tail, spinSign: def.flip ? -1 : 1, radius, holder, wheelCentreY: wy * s };
    } catch { return null; }
  }
}
