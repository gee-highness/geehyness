import { Injectable, signal } from '@angular/core';

/** The GTA-style map waypoint: set on the map, shown on the radar, HUD and as a beacon in the world. */
@Injectable({ providedIn: 'root' })
export class NavigationService {
  /** Player pose, refreshed every frame by the app (plain object: read it, do not bind to it). */
  readonly pose = { x: 0, z: 0, yaw: 0, speedKmh: 0 };
  readonly waypoint = signal<[number, number] | null>(null);
  set(x: number, z: number): void { this.waypoint.set([x, z]); }
  clear(): void { this.waypoint.set(null); }
}
