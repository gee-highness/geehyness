import { Injectable, signal, inject } from '@angular/core';
import { DangerSignJump, DriftZone, RaceEvent, SpeedTrap } from '../models/world.types';
import { AudioService } from './audio.service';
import { HapticsService } from './haptics.service';

export interface FestivalNotification {
  id: string;
  type: 'SPEED_TRAP' | 'DRIFT_ZONE' | 'DANGER_SIGN' | 'RECORD_BROKEN' | 'CHECKPOINT';
  title: string;
  scoreText: string;
  subText: string;
  stars: number;
}

export const SPEED_TRAPS: SpeedTrap[] = [
  {
    id: 'st_manzini_bridge',
    name: 'Mzimene River Crossing Trap',
    district: 'MANZINI',
    position: [0, -120],
    speedLimitKmh: 120,
    personalBestKmh: 198,
    threeStarTargetKmh: 240,
  },
  {
    id: 'st_matsapha_straight',
    name: 'Matsapha Industrial Drag Strip',
    district: 'MATSAPHA',
    position: [-240, -1800],
    speedLimitKmh: 140,
    personalBestKmh: 224,
    threeStarTargetKmh: 260,
  },
  {
    id: 'st_ezulwini_highway',
    name: 'MR3 Valley Descent Trap',
    district: 'EZULWINI',
    position: [-620, -4200],
    speedLimitKmh: 120,
    personalBestKmh: 215,
    threeStarTargetKmh: 250,
  },
  {
    id: 'st_malagwane_climb',
    name: 'Malagwane Hill Sprint',
    district: 'MBABANE',
    position: [-950, -6800],
    speedLimitKmh: 100,
    personalBestKmh: 185,
    threeStarTargetKmh: 220,
  },
];

export const DRIFT_ZONES: DriftZone[] = [
  {
    id: 'dz_ezulwini_curves',
    name: 'Ezulwini Mountain Sweepers',
    district: 'EZULWINI',
    startPos: [-580, -3600],
    endPos: [-640, -4400],
    lengthM: 800,
    personalBestScore: 42500,
    threeStarTargetScore: 65000,
  },
  {
    id: 'dz_malkerns_rally',
    name: 'Malkerns Cane Hairpins',
    district: 'MALKERNS',
    startPos: [320, -2200],
    endPos: [410, -2900],
    lengthM: 700,
    personalBestScore: 38200,
    threeStarTargetScore: 55000,
  },
];

export const DANGER_SIGNS: DangerSignJump[] = [
  {
    id: 'ds_matsapha_quarry',
    name: 'Matsapha Overpass Leap',
    district: 'MATSAPHA',
    rampPos: [-180, -1450],
    personalBestDistanceM: 88,
    threeStarTargetM: 110,
  },
];

@Injectable({
  providedIn: 'root'
})
export class FestivalService {
  private audio = inject(AudioService);
  private haptics = inject(HapticsService);

  readonly speedTraps = signal<SpeedTrap[]>(SPEED_TRAPS);
  readonly driftZones = signal<DriftZone[]>(DRIFT_ZONES);
  readonly activeNotification = signal<FestivalNotification | null>(null);

  // Active drift zone tracking
  readonly inDriftZone = signal<boolean>(false);
  readonly currentDriftZoneScore = signal<number>(0);
  private activeZoneId: string | null = null;

  // Jump tracking
  private jumpLaunchPos: [number, number, number] | null = null;

  // Race event state
  readonly activeRace = signal<RaceEvent | null>(null);
  readonly raceLap = signal<number>(1);
  readonly raceCurrentLapTimeMs = signal<number>(0);
  readonly raceBestLapTimeMs = signal<number>(0);
  readonly racePosition = signal<number>(1);

  // Speed trap trigger cooldown map
  private lastTriggered: Record<string, number> = {};

  public checkSpeedTraps(carX: number, carZ: number, speedKmh: number): void {
    const now = performance.now();
    for (const trap of this.speedTraps()) {
      const dx = carX - trap.position[0];
      const dz = carZ - trap.position[1];
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < 18) {
        if (!this.lastTriggered[trap.id] || now - this.lastTriggered[trap.id] > 6000) {
          this.lastTriggered[trap.id] = now;
          this.triggerSpeedTrap(trap, speedKmh);
        }
      }
    }
  }

  private triggerSpeedTrap(trap: SpeedTrap, speedKmh: number): void {
    const speed = Math.round(speedKmh);
    const isNewRecord = speed > trap.personalBestKmh;
    if (isNewRecord) {
      this.speedTraps.update(traps =>
        traps.map(t => t.id === trap.id ? { ...t, personalBestKmh: speed } : t)
      );
    }

    const stars = speed >= trap.threeStarTargetKmh ? 3 : (speed >= trap.speedLimitKmh * 1.3 ? 2 : 1);

    this.audio.playSpeedTrapChirp();
    this.haptics.triggerImpulse('speedTrap', 0.8, 0.9, 200);

    this.showBanner({
      id: Math.random().toString(),
      type: 'SPEED_TRAP',
      title: trap.name,
      scoreText: `${speed} KM/H`,
      subText: isNewRecord ? 'NEW PERSONAL BEST!' : `Target: ${trap.threeStarTargetKmh} KM/H`,
      stars,
    });
  }

  public updateDriftZoneProgress(carX: number, carZ: number, isDrifting: boolean, driftAngleDeg: number, speedKmh: number, deltaS: number): void {
    for (const zone of this.driftZones()) {
      const dStart = Math.hypot(carX - zone.startPos[0], carZ - zone.startPos[1]);
      const dEnd = Math.hypot(carX - zone.endPos[0], carZ - zone.endPos[1]);

      if (dStart < 35 && !this.inDriftZone()) {
        this.inDriftZone.set(true);
        this.activeZoneId = zone.id;
        this.currentDriftZoneScore.set(0);
        this.audio.playCheckpointChime();
      } else if (dEnd < 35 && this.inDriftZone() && this.activeZoneId === zone.id) {
        // Finished zone
        const finalScore = Math.round(this.currentDriftZoneScore());
        const isPb = finalScore > zone.personalBestScore;
        if (isPb) {
          this.driftZones.update(zones =>
            zones.map(z => z.id === zone.id ? { ...z, personalBestScore: finalScore } : z)
          );
        }
        const stars = finalScore >= zone.threeStarTargetScore ? 3 : (finalScore >= zone.threeStarTargetScore * 0.6 ? 2 : 1);
        this.showBanner({
          id: Math.random().toString(),
          type: 'DRIFT_ZONE',
          title: zone.name,
          scoreText: `${finalScore.toLocaleString()} PTS`,
          subText: isPb ? 'NEW DRIFT RECORD!' : `Target: ${zone.threeStarTargetScore.toLocaleString()} PTS`,
          stars,
        });
        this.inDriftZone.set(false);
        this.activeZoneId = null;
      }
    }

    if (this.inDriftZone() && isDrifting && speedKmh > 20) {
      const added = driftAngleDeg * speedKmh * deltaS * 3.5;
      this.currentDriftZoneScore.update(s => s + added);
    }
  }

  /** Reached a real OSM viewpoint: nudge the player toward Photo Mode. */
  public announceViewpoint(name: string): void {
    this.showBanner({ id: 'vp_' + name, type: 'CHECKPOINT', title: 'VIEWPOINT DISCOVERED', scoreText: name, subText: 'Press P for Photo Mode', stars: 1 });
  }

  private showBanner(notification: FestivalNotification): void {
    this.activeNotification.set(notification);
    setTimeout(() => {
      if (this.activeNotification()?.id === notification.id) {
        this.activeNotification.set(null);
      }
    }, 4000);
  }
}
