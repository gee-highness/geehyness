// Headless physics benchmark. Build + run:
import * as THREE from 'three';
// Build + run: npx esbuild src/app/game/physics/raycast-vehicle.ts src/app/game/physics/collision.ts src/app/services/tuning.service.ts --bundle --platform=node --format=esm --outdir=.phys --tsconfig-raw='{"compilerOptions":{"experimentalDecorators":true}}' --external:@angular/core --external:three && node scripts/physics_test.mjs


const { RaycastVehicle } = await import('../.phys/game/physics/raycast-vehicle.js');
const { ARCHETYPES } = await import('../.phys/services/tuning.service.js');
const TUNE = (a) => ({ tirePressureFrontPsi: 32, tirePressureRearPsi: 32, finalDriveRatio: a.finalDrive, gearRatios: a.gearRatios, camberFrontDeg: -1.5, camberRearDeg: -1, toeFrontDeg: 0, toeRearDeg: 0,
  antiRollBarFront: 30, antiRollBarRear: 25, springRateFront: a.suspensionStiffness, springRateRear: a.suspensionStiffness * 0.9, rideHeightFrontMm: 120, rideHeightRearMm: 120,
  bumpDampingFront: a.suspensionDamping, bumpDampingRear: a.suspensionDamping, reboundDampingFront: a.suspensionDamping, reboundDampingRear: a.suspensionDamping,
  aeroDownforceFrontKg: 20, aeroDownforceRearKg: 40, brakeBiasFrontPct: 60, brakePressurePct: 100, diffAccelLockPct: 40, diffDecelLockPct: 20 });
const ground = () => ({ height: 0, normal: new THREE.Vector3(0, 1, 0), surfaceClass: 11 });
const DT = 1 / 60;
function mk(id) { const a = ARCHETYPES[id]; const v = new RaycastVehicle(a, TUNE(a)); v.position.set(0, 0.6, 0); return v; }
function settle(v, s = 3) { for (let i = 0; i < s / DT; i++) v.updatePhysics(DT, ground); }
const kmh = (v) => v.velocity.length() * 3.6;
const bad = (v) => [v.position, v.velocity, v.angularVelocity, v.quaternion].some((o) => Object.values(o.toJSON ? { ...o } : o).some?.((x) => typeof x === 'number' && !isFinite(x)));
for (const id of Object.keys(ARCHETYPES)) {
  console.log(`\n== ${id}  (${ARCHETYPES[id].massKg} kg, ${ARCHETYPES[id].engineMaxPowerKw} kW)`);
  let v = mk(id); settle(v);
  console.log('rest: y=%s  |v|=%s  tilt=%s', v.position.y.toFixed(3), v.velocity.length().toFixed(4), (Math.acos(Math.min(1, new THREE.Vector3(0, 1, 0).applyQuaternion(v.quaternion).y)) * 57.3).toFixed(3) + 'deg');
  // 0-100 and top speed
  v = mk(id); settle(v, 1); v.throttle = 1; let t = 0, t100 = null, vmax = 0;
  for (let i = 0; i < 60 / DT; i++) { v.updatePhysics(DT, ground); t += DT; if (t100 === null && kmh(v) >= 100) t100 = t; vmax = Math.max(vmax, kmh(v)); }
  console.log('0-100 km/h: %s s   top speed: %s km/h   yaw drift: %s deg   NaN: %s', t100?.toFixed(2), vmax.toFixed(0), (new THREE.Euler().setFromQuaternion(v.quaternion, 'YXZ').y * 57.3).toFixed(2), bad(v));
  // 100->0 braking
  v = mk(id); settle(v, 1); v.velocity.set(0, 0, 27.78); v.throttle = 0; v.brake = 1; let d = 0, tb = 0;
  while (kmh(v) > 2 && tb < 15) { v.updatePhysics(DT, ground); d += v.velocity.length() * DT; tb += DT; }
  console.log('100-0 braking: %s m in %s s (decel %s g)', d.toFixed(1), tb.toFixed(2), (27.78 / tb / 9.81).toFixed(2));
  // steady-state cornering at constant speed (P-controller on throttle/brake)
  for (const [spd, steer] of [[60, 0.3], [60, 1.0], [100, 0.3], [100, 0.6]]) {
    v = mk(id); settle(v, 1); v.velocity.set(0, 0, spd / 3.6); v.steerInput = steer; let gs = 0, n = 0, roll = 0, flip = false;
    for (let i = 0; i < 8 / DT; i++) {
      const err = spd - kmh(v); v.throttle = Math.max(0, Math.min(1, err * 0.08)); v.brake = Math.max(0, Math.min(1, -err * 0.08));
      v.updatePhysics(DT, ground);
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(v.quaternion); const tilt = Math.acos(Math.min(1, up.y)) * 57.3;
      if (tilt > 60) flip = true; if (i > 3 / DT) { gs += Math.abs(v.gForceLateral); n++; roll = Math.max(roll, tilt); }
    }
    console.log('corner %skm/h steer %s -> lat-g %s  max roll %sdeg  speed %s  %s', spd, steer, (gs / n).toFixed(2), roll.toFixed(1), kmh(v).toFixed(0), flip ? 'ROLLED OVER' : 'ok');
  }
  // handbrake turn + landing from a 2 m drop must stay finite
  v = mk(id); settle(v, 1); v.velocity.set(0, 0, 25); v.handbrake = true; v.steerInput = 1; for (let i = 0; i < 3 / DT; i++) v.updatePhysics(DT, ground);
  const f1 = !bad(v); v = mk(id); v.position.y = 2.5; for (let i = 0; i < 4 / DT; i++) v.updatePhysics(DT, ground);
  console.log('handbrake finite: %s   2m-drop settles: y=%s |v|=%s', f1, v.position.y.toFixed(2), v.velocity.length().toFixed(3));
}

// ---------------- collision tests
const { CollisionWorld } = await import('../.phys/game/physics/collision.js');
function crash(name, setup, steps = 240) {
  const cw = new CollisionWorld(); const dyn = [];
  const v = mk('AWD_GRIP'); settle(v, 1); v.position.set(0, 0.35, 0);
  setup(cw, v, dyn);
  let maxPen = 0, maxImpact = 0, tunnelled = false, nan = false; const e0 = 0.5 * v.config.massKg * v.velocity.lengthSq();
  for (let i = 0; i < steps; i++) {
    v.updatePhysics(DT, ground); const r = cw.resolve(v, dyn, DT); maxImpact = Math.max(maxImpact, r.impactSpeed);
    if ([v.position.x, v.position.z, v.velocity.x, v.velocity.z, v.angularVelocity.y].some((x) => !isFinite(x))) { nan = true; break; }
  }
  const e1 = 0.5 * v.config.massKg * v.velocity.lengthSq();
  console.log('%s: impact %s m/s, KE kept %s%%, final pos z=%s x=%s, |v|=%s m/s, yaw rate %s rad/s, %s', name, maxImpact.toFixed(1), (100 * e1 / e0).toFixed(0), v.position.z.toFixed(1), v.position.x.toFixed(1), v.velocity.length().toFixed(2), v.angularVelocity.y.toFixed(2), nan ? 'NaN!' : 'finite');
  return v;
}
console.log('\n== collisions (AWD car)');
const box = (x0, z0, x1, z1) => [x0, z0, x1, z0, x1, z1, x0, z1];
let v1 = crash('head-on 50 km/h into 10x10 building', (cw, v) => { cw.addPolygon(box(-5, 20, 5, 30)); v.velocity.set(0, 0, 13.9); });
console.log('   stayed outside building: %s', v1.position.z + 2.2 <= 20.3);
crash('head-on 150 km/h (tunnelling check)', (cw, v) => { cw.addPolygon(box(-5, 60, 5, 62)); v.velocity.set(0, 0, 41.7); });
crash('glancing 60 km/h, 15deg into a long wall', (cw, v) => { cw.addPolygon(box(3, -10, 8, 400)); v.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.26); v.velocity.set(Math.sin(0.26) * 16.7, 0, Math.cos(0.26) * 16.7); }, 300);
crash('tree trunk 70 km/h', (cw, v) => { cw.addCircle(0, 25, 0.38); v.velocity.set(0, 0, 19.4); });
crash('slow bump (11 km/h) into wall', (cw, v) => { cw.addPolygon(box(-5, 5, 5, 9)); v.velocity.set(0, 0, 3.0); }, 200);
crash('car ahead at 20 km/h, we do 80', (cw, v, dyn) => { v.velocity.set(0, 0, 22.2); dyn.push({ x: 0, z: 30, r: 1, vx: 0, vz: 5.5, mass: 1500, id: 1 }, { x: 0, z: 31.3, r: 1, vx: 0, vz: 5.5, mass: 1500, id: 1 }); }, 120);
crash('start INSIDE a building (eject)', (cw, v) => { cw.addPolygon(box(-6, -6, 6, 6)); }, 60);

// ---------------- ground-floor guarantee on hostile terrain
console.log('\n== never under ground');
for (const [label, hf] of [['steep sine hills (6 m amplitude, 40 m period)', (x, z) => 6 * Math.sin(z / 6.4)], ['2 m cliff step', (x, z) => (z > 60 ? 2 : 0)], ['pothole field', (x, z) => -0.8 * Math.max(0, Math.sin(z / 3) * Math.sin(x / 2))]]) {
  const gq = (x, z) => { const e = 0.5, h = hf(x, z); return { height: h, normal: new THREE.Vector3(hf(x - e, z) - hf(x + e, z), 2 * e, hf(x, z - e) - hf(x, z + e)).normalize(), surfaceClass: 11 }; };
  for (const id of ['AWD_GRIP', 'HEAVY_CRUISER']) {
    const v = mk(id); v.position.set(0, hf(0, 0) + 0.6, 0); v.throttle = 1; let minClear = 9, flip = false;
    for (let i = 0; i < 12 / DT; i++) {
      v.updatePhysics(DT, gq);
      const hl = v.config.wheelBaseM / 2 + 0.85, hw = v.config.trackWidthM / 2;
      for (const [ox, oy, oz] of [[-hw, -0.26, hl], [hw, -0.26, hl], [-hw, -0.26, -hl], [hw, -0.26, -hl], [0, 0, 0]]) {
        const p = new THREE.Vector3(ox, oy, oz).applyQuaternion(v.quaternion).add(v.position); minClear = Math.min(minClear, p.y - gq(p.x, p.z).height);
      }
      if (new THREE.Vector3(0, 1, 0).applyQuaternion(v.quaternion).y < -0.2) flip = true;
    }
    console.log('%s / %s: min clearance of body points %s m  %s  ended z=%s', label, id, minClear.toFixed(3), minClear >= -0.001 ? 'OK (never below ground)' : 'PENETRATED', v.position.z.toFixed(0));
  }
}
