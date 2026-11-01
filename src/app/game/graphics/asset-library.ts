import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { WorldBuilder } from './world-builder';

/** Loads real CC0/CC-BY glTF models (see public/assets/CREDITS.txt) and dresses the world with them. */
export class AssetLibrary {
  private static loader = new GLTFLoader();
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

  /** Replaces procedural props with real models once they have streamed in. */
  public static async dressWorld(scene: THREE.Scene, wb: WorldBuilder): Promise<void> {
    const group = new THREE.Group();
    group.name = 'RealModels';
    scene.add(group);
    const base = 'assets/models/';
    const gltf = (n: string) => `${base}${n}/${n}.gltf`;

    // --- Street lamps (every ~63 m, alternating sides, arm over the carriageway)
    this.load(gltf('street_lamp_01')).then((lamp) => {
      const pts = wb.highwayCurve.getSpacedPoints(130);
      pts.forEach((pt, i) => {
        if (i < 2 || i % 1 !== 0) return;
        const side = i % 2 ? 1 : -1;
        const nxt = pts[Math.min(i + 1, pts.length - 1)], prv = pts[Math.max(i - 1, 0)];
        const tan = nxt.clone().sub(prv).setY(0).normalize();
        const nrm = new THREE.Vector3(-tan.z, 0, tan.x);
        const m = this.fit(lamp.clone(true), 9);
        m.position.copy(pt).addScaledVector(nrm, side * 13.5);
        m.rotation.y = Math.atan2(nrm.x * -side, nrm.z * -side);
        group.add(m);
      });
      wb.roadInfrastructureGroup.children.forEach((c) => { if (c.userData['procLamp']) c.visible = false; });
    }).catch(() => undefined);

    // --- Southern-African scrub/acacia replacements (Searsia)
    this.load(gltf('searsia_lucida')).then((tree) => {
      let n = 0;
      for (const t of wb.acaciaSpots) {
        if (n++ % 2) continue; // swap half, keep the procedural mix for variety
        const m = this.fit(tree.clone(true), 5 + Math.random() * 3);
        m.position.copy(t.position);
        m.rotation.y = Math.random() * 6.28;
        group.add(m);
        t.visible = false;
      }
    }).catch(() => undefined);

    // --- Manzini: apartment blocks flanking the approach
    this.load(gltf('modular_urban_apartments_facade')).then((fac) => {
      for (const side of [-1, 1]) {
        let z = 380;
        while (z > 30) {
          const m = this.fit(fac.clone(true), 18);
          const w = (m.userData['size'] as THREE.Vector3).x;
          const road = this.roadAt(wb, z);
          m.position.set(road.x + side * 42, wb.calculateRawTerrainHeight(road.x + side * 42, z), z);
          m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          group.add(m);
          z -= Math.max(w, 10) * 1.02;
        }
      }
    }).catch(() => undefined);

    // --- Matsapha: factory frontages + chain-link security fence
    this.load(gltf('modular_factory_facade')).then((fac) => {
      for (const side of [-1, 1]) {
        let z = -1050;
        while (z > -1800) {
          const m = this.fit(fac.clone(true), 14);
          const w = (m.userData['size'] as THREE.Vector3).x;
          const road = this.roadAt(wb, z);
          const x = road.x + side * 55;
          m.position.set(x, wb.calculateRawTerrainHeight(x, z), z);
          m.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
          group.add(m);
          z -= Math.max(w, 8) * 1.02;
        }
      }
    }).catch(() => undefined);
    this.load(gltf('modular_chainlink_fence')).then((fence) => {
      for (const side of [-1, 1]) {
        let z = -1000;
        while (z > -1800) {
          const m = this.fit(fence.clone(true), 3, true);
          const road = this.roadAt(wb, z);
          const x = road.x + side * 20;
          m.position.set(x, wb.calculateRawTerrainHeight(x, z), z);
          m.rotation.y = Math.PI / 2;
          group.add(m);
          z -= 3;
        }
      }
    }).catch(() => undefined);

    // --- Power-line poles along the Malkerns/Lobamba valley
    this.load(gltf('modular_electricity_poles')).then((poles) => {
      for (let z = -2000; z > -3800; z -= 110) {
        const road = this.roadAt(wb, z);
        const x = road.x + 30;
        const m = this.fit(poles.clone(true), 11);
        m.position.set(x, wb.calculateRawTerrainHeight(x, z), z);
        group.add(m);
      }
    }).catch(() => undefined);

    // --- Parked Cesium milk truck (reads as a roadside kombi/delivery vehicle)
    this.load(base + 'milktruck.glb').then((truck) => {
      for (const z of [250, -700, -2500]) {
        const road = this.roadAt(wb, z);
        const m = this.fit(truck.clone(true), 2.6);
        m.position.set(road.x - 17, road.y, z);
        m.rotation.y = Math.PI;
        group.add(m);
      }
    }).catch(() => undefined);
  }

  /** Real Ferrari 458 body (CC-BY) wrapped around the physics rig. Returns wheel nodes for animation. */
  public static async attachPlayerCar(
    root: THREE.Group, wheelBase: number, bodyColor: string
  ): Promise<{ wheels: THREE.Object3D[]; tail: THREE.MeshStandardMaterial | null } | null> {
    try {
      const car = (await this.load('assets/models/ferrari.glb')).clone(true);
      const wheels: THREE.Object3D[] = [];
      let tail: THREE.MeshStandardMaterial | null = null;
      car.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && m.material) {
          const mat = (m.material as THREE.MeshStandardMaterial);
          if (mat.name === 'Body_Color') {
            const c = mat.clone(); c.color.set(bodyColor); m.material = c;
          } else if (mat.name === 'Taillight_Glass') {
            tail = mat.clone(); tail.emissive = new THREE.Color(0xff0000); tail.emissiveIntensity = 0.2; m.material = tail;
          }
        }
      });
      for (const n of ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr']) {
        const w = car.getObjectByName(n);
        if (w) { w.rotation.order = 'YXZ'; wheels.push(w); }
      }
      const holder = new THREE.Group();
      holder.rotation.y = Math.PI; // Ferrari faces -Z; the sim drives toward +Z
      holder.scale.setScalar(wheelBase / 2.99);
      holder.add(car);
      holder.name = 'FerrariModel';
      root.add(holder);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh && !holder.getObjectById(m.id)) m.visible = false; // hide blocky procedural body
      });
      return { wheels, tail };
    } catch { return null; }
  }
}
