import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { CarDef } from '../cars';
import type { WorldBuilder } from './world-builder';

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

  /** Wraps any catalogue car model around the physics rig. Returns wheel nodes (FL, FR, RL, RR) for animation. */
  public static async attachPlayerCar(
    root: THREE.Group, def: CarDef, wheelBase: number, bodyColor: string
  ): Promise<{ wheels: THREE.Object3D[]; tail: THREE.MeshStandardMaterial | null; spinSign: number; radius: number } | null> {
    try {
      const car = (await this.load(def.file)).clone(true);
      let tail: THREE.MeshStandardMaterial | null = null;
      car.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material && def.paintable) {
          const mat = m.material as THREE.MeshStandardMaterial;
          if (mat.name === 'Body_Color') { const cl = mat.clone(); cl.color.set(bodyColor); m.material = cl; }
          else if (mat.name === 'Taillight_Glass') { tail = mat.clone(); tail.emissive = new THREE.Color(0xff0000); tail.emissiveIntensity = 0.2; m.material = tail; }
        }
      });
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
      return { wheels, tail, spinSign: def.flip ? -1 : 1, radius };
    } catch { return null; }
  }
}
