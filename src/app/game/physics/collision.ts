import * as THREE from 'three';
import type { RaycastVehicle } from './raycast-vehicle';

/** A moving circle obstacle (AI car), with its own velocity and mass. */
export interface DynamicCollider { x: number; z: number; r: number; vx: number; vz: number; mass: number; id: number }
export interface CollisionResult { impactSpeed: number; hitKind: 'none' | 'static' | 'car'; hitId: number }

/**
 * Static world collision (building footprints, tree trunks, poles) in a spatial hash, plus an impulse solver
 * that treats the car as a chain of circles (works on non-convex building outlines, no tunnelling at 60 Hz+ with sub-steps).
 */
export class CollisionWorld {
  private readonly CELL = 32;
  private polys: Float32Array[] = [];
  private polyBox: number[] = [];
  private polyRoof: boolean[] = []; // solid flat roof the car may land on / drive over
  private polyY: number[] = []; // [y0,y1] per polygon (absolute metres); +-1e9 = always
  private circleY: number[] = [];
  private circles: number[] = [];
  private polyGrid = new Map<number, number[]>();
  private circleGrid = new Map<number, number[]>();

  private key(cx: number, cz: number): number { return cx * 100003 + cz; }

  addPolygon(pts: number[], y0 = -1e9, y1 = 1e9, roof = false): void {
    const idx = this.polys.length; this.polys.push(Float32Array.from(pts)); this.polyY.push(y0, y1); this.polyRoof.push(roof);
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (let i = 0; i < pts.length; i += 2) { x0 = Math.min(x0, pts[i]); x1 = Math.max(x1, pts[i]); z0 = Math.min(z0, pts[i + 1]); z1 = Math.max(z1, pts[i + 1]); }
    this.polyBox.push(x0, z0, x1, z1);
    for (let a = Math.floor(x0 / this.CELL); a <= Math.floor(x1 / this.CELL); a++) for (let b = Math.floor(z0 / this.CELL); b <= Math.floor(z1 / this.CELL); b++) {
      const k = this.key(a, b); let l = this.polyGrid.get(k); if (!l) { l = []; this.polyGrid.set(k, l); } l.push(idx);
    }
  }

  addCircle(x: number, z: number, r: number, y0 = -1e9, y1 = 1e9): void {
    const idx = this.circles.length / 3; this.circles.push(x, z, r); this.circleY.push(y0, y1);
    const k = this.key(Math.floor(x / this.CELL), Math.floor(z / this.CELL)); let l = this.circleGrid.get(k); if (!l) { l = []; this.circleGrid.set(k, l); } l.push(idx);
  }

  /** Height of a flat roof under (x,z) that a car at height y can be standing on, or null. */
  roofAt(x: number, z: number, y: number): number | null {
    const l = this.polyGrid.get(this.key(Math.floor(x / this.CELL), Math.floor(z / this.CELL))); if (!l) return null;
    let best: number | null = null;
    for (const i of l) {
      if (!this.polyRoof[i]) continue; const top = this.polyY[i * 2 + 1]; if (y < top - 1.5 || (best !== null && top <= best)) continue;
      const bb = i * 4; if (x < this.polyBox[bb] || x > this.polyBox[bb + 2] || z < this.polyBox[bb + 1] || z > this.polyBox[bb + 3]) continue;
      const p = this.polys[i], n = p.length / 2; let inside = false;
      for (let a = 0, b = n - 1; a < n; b = a++) if ((p[a * 2 + 1] > z) !== (p[b * 2 + 1] > z) && x < ((p[b * 2] - p[a * 2]) * (z - p[a * 2 + 1])) / (p[b * 2 + 1] - p[a * 2 + 1]) + p[a * 2]) inside = !inside;
      if (inside) best = top;
    }
    return best;
  }

  get polygonCount(): number { return this.polys.length; }
  get circleCount(): number { return this.circles.length / 3; }

  /** Signed contact of circle (cx,cz,r) with polygon i: push direction (towards free space) and penetration, or null. */
  private polyContact(i: number, cx: number, cz: number, r: number, out: { nx: number; nz: number; pen: number }): boolean {
    const p = this.polys[i], n = p.length / 2;
    let best = 1e18, bx = 0, bz = 0, inside = false;
    for (let a = 0, b = n - 1; a < n; b = a++) {
      const ax = p[a * 2], az = p[a * 2 + 1], bx2 = p[b * 2], bz2 = p[b * 2 + 1];
      if ((az > cz) !== (bz2 > cz) && cx < ((bx2 - ax) * (cz - az)) / (bz2 - az) + ax) inside = !inside;
      const ex = bx2 - ax, ez = bz2 - az, l2 = ex * ex + ez * ez || 1e-9;
      const t = Math.max(0, Math.min(1, ((cx - ax) * ex + (cz - az) * ez) / l2));
      const qx = ax + ex * t, qz = az + ez * t, d2 = (cx - qx) ** 2 + (cz - qz) ** 2;
      if (d2 < best) { best = d2; bx = qx; bz = qz; }
    }
    const d = Math.sqrt(best);
    if (inside) { const inv = 1 / Math.max(d, 1e-6); out.nx = (bx - cx) * inv; out.nz = (bz - cz) * inv; out.pen = r + d; return true; }
    if (d >= r) return false;
    const inv = 1 / Math.max(d, 1e-6); out.nx = (cx - bx) * inv; out.nz = (cz - bz) * inv; out.pen = r - d; return true;
  }

  /** Resolve the car against statics and moving colliders. Call once per physics step, after integration. */
  resolve(v: RaycastVehicle, dynamics: DynamicCollider[] = [], dt = 1 / 60): CollisionResult {
    const res: CollisionResult = { impactSpeed: 0, hitKind: 'none', hitId: -1 };
    const L = v.config.wheelBaseM + 1.45, rad = Math.max(0.9, v.config.trackWidthM * 0.52);
    const count = Math.max(3, Math.round(L / (rad * 1.2)));
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(v.quaternion);
    const m = v.config.massKg, Iy = (m * (L * L + (rad * 2) ** 2)) / 12;
    const c = { nx: 0, nz: 0, pen: 0 }; const py = v.position.y;

    const apply = (cx: number, cz: number, nx: number, nz: number, pen: number, otherVx: number, otherVz: number, otherMass: number, kind: 'static' | 'car', id: number) => {
      const rx = cx - v.position.x, rz = cz - v.position.z;
      // positional correction
      const corr = Math.max(0, pen - 0.005) * 0.7;
      v.position.x += nx * corr; v.position.z += nz * corr;
      // relative velocity at the contact
      const vx = v.velocity.x - v.angularVelocity.y * rz - otherVx, vz = v.velocity.z + v.angularVelocity.y * rx - otherVz;
      const vn = vx * nx + vz * nz;
      if (vn >= 0) return;
      const rn = rx * nz - rz * nx; // r x n (y component)
      const invM = 1 / m + (otherMass > 0 ? 1 / otherMass : 0);
      const e = Math.max(0.03, 0.2 - 0.012 * -vn); // crashes absorb most energy; gentle bumps bounce a little
      const j = (-(1 + e) * vn) / (invM + (rn * rn) / Iy);
      v.velocity.x += (nx * j) / m; v.velocity.z += (nz * j) / m;
      v.angularVelocity.y += (rn * j) / Iy;
      // Coulomb friction along the surface
      const tx = -nz, tz = nx, vt = vx * tx + vz * tz, rt = rx * tz - rz * tx;
      const jt = Math.max(-0.35 * j, Math.min(0.35 * j, -vt / (invM + (rt * rt) / Iy)));
      v.velocity.x += (tx * jt) / m; v.velocity.z += (tz * jt) / m; v.angularVelocity.y += (rt * jt) / Iy;
      if (-vn > res.impactSpeed) { res.impactSpeed = -vn; res.hitKind = kind; res.hitId = id; }
    };

    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k < count; k++) {
        const off = (count === 1 ? 0 : (k / (count - 1) - 0.5) * (L - 2 * rad));
        const cx = v.position.x + fwd.x * off, cz = v.position.z + fwd.z * off;
        const gx = Math.floor(cx / this.CELL), gz = Math.floor(cz / this.CELL);
        for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
          const key = this.key(gx + a, gz + b);
          const pl = this.polyGrid.get(key);
          if (pl) for (const i of pl) {
            if (py > this.polyY[i * 2 + 1] + (this.polyRoof[i] ? -0.6 : 1.3) || py < this.polyY[i * 2] - 1.3) continue; // different level (bridge vs road below); on a roof you clear the walls
            const bb = i * 4; if (cx < this.polyBox[bb] - rad || cx > this.polyBox[bb + 2] + rad || cz < this.polyBox[bb + 1] - rad || cz > this.polyBox[bb + 3] + rad) continue;
            if (this.polyContact(i, cx, cz, rad, c)) apply(cx, cz, c.nx, c.nz, c.pen, 0, 0, 0, 'static', i);
          }
          const cl = this.circleGrid.get(key);
          if (cl) for (const i of cl) {
            if (py > this.circleY[i * 2 + 1] + 1.3 || py < this.circleY[i * 2] - 1.3) continue;
            const ox = this.circles[i * 3], oz = this.circles[i * 3 + 1], orr = this.circles[i * 3 + 2];
            const dx = cx - ox, dz = cz - oz, d = Math.hypot(dx, dz), need = rad + orr;
            if (d < need) { const inv = 1 / Math.max(d, 1e-5); apply(cx, cz, dx * inv, dz * inv, need - d, 0, 0, 0, 'static', -2); }
          }
        }
        for (const o of dynamics) {
          const dx = cx - o.x, dz = cz - o.z, d = Math.hypot(dx, dz), need = rad + o.r;
          if (d < need) { const inv = 1 / Math.max(d, 1e-5); apply(cx, cz, dx * inv, dz * inv, need - d, o.vx, o.vz, o.mass, 'car', o.id); }
        }
      }
    }
    void dt;
    return res;
  }
}
