import { Injectable, signal } from '@angular/core';
import { WeatherState, WorldEnvironmentState } from '../models/world.types';

@Injectable({
  providedIn: 'root'
})
export class EnvironmentService {
  // 17.5 = 5:30 PM golden hour sunset over Ezulwini Valley
  readonly timeOfDayHours = signal<number>(10.5);
  readonly weather = signal<WeatherState>('SUNNY');
  readonly isDynamicTime = signal<boolean>(true);
  readonly wetness = signal<number>(0.0);

  // Computed visual properties
  readonly envState = signal<WorldEnvironmentState>({
    timeOfDayHours: 10.5,
    weather: 'SUNNY',
    wetness: 0.0,
    ambientTempC: 26,
    windSpeedKmh: 14,
    fogDensity: 0.0006,
    sunPosition: [1000, 450, -800],
    sunColorHex: '#f59e0b',
    skyColorHex: '#0284c7',
  });

  constructor() {
    this.recompute();
  }

  public setTimeOfDay(hours: number): void {
    this.timeOfDayHours.set(hours);
    this.recompute();
  }

  public setWeather(w: WeatherState): void {
    this.weather.set(w);
    if (w === 'TROPICAL_RAIN') {
      this.wetness.set(0.85);
    } else if (w === 'OVERCAST') {
      this.wetness.set(0.15);
    } else {
      this.wetness.set(0.0);
    }
    this.recompute();
  }

  public tickDayNight(deltaSeconds: number): void {
    if (!this.isDynamicTime()) return;
    // 1 full day/night cycle in 12 real minutes (12 * 60 = 720 seconds)
    const hoursPerSecond = 24 / 3000; // one full day per 50 real minutes
    let next = this.timeOfDayHours() + deltaSeconds * hoursPerSecond;
    if (next >= 24) next -= 24;
    this.timeOfDayHours.set(next);
    this.recompute();
  }

  private recompute(): void {
    const hours = this.timeOfDayHours();
    const w = this.weather();

    // Solar angle: 6h = dawn (0 elevation), 12h = noon (zenith), 18h = dusk (0 elevation), 24h = midnight
    const sunAngleRad = ((hours - 6) / 24) * 2 * Math.PI;
    const sunElevation = Math.sin(sunAngleRad);
    const sunAzimuth = Math.cos(sunAngleRad);

    const radius = 2500;
    const sunY = Math.max(-200, sunElevation * radius);
    const sunX = sunAzimuth * radius * 0.8;
    const sunZ = -1200;

    let sunColor = '#fff1d0'; // Noon warm white
    let skyColor = '#38bdf8'; // Clear bright blue
    let fog = 0.0005;

    if (hours < 5.5 || hours > 19.5) {
      // Night
      sunColor = '#1e1b4b'; // Deep starlight
      skyColor = '#030712'; // Obsidian black night
      fog = 0.0012;
    } else if (hours >= 5.5 && hours < 7.5) {
      // Dawn / Sunrise
      sunColor = '#ffc890'; // Dawn amber
      skyColor = '#f472b6'; // Morning rose-sky
      fog = 0.0008;
    } else if (hours >= 16.5 && hours <= 19.5) {
      // Sunset golden hour
      sunColor = '#ffb878'; // Golden hour
      skyColor = '#4c1d95'; // Purple dusk
      fog = 0.0007;
    }

    if (w === 'OVERCAST') {
      sunColor = '#94a3b8';
      skyColor = '#475569';
      fog = 0.0015;
    } else if (w === 'TROPICAL_RAIN') {
      sunColor = '#64748b';
      skyColor = '#1e293b';
      fog = 0.0025;
    }

    this.envState.set({
      timeOfDayHours: hours,
      weather: w,
      wetness: this.wetness(),
      ambientTempC: Math.round(18 + sunElevation * 12),
      windSpeedKmh: w === 'TROPICAL_RAIN' ? 38 : 12,
      fogDensity: fog,
      sunPosition: [sunX, sunY, sunZ],
      sunColorHex: sunColor,
      skyColorHex: skyColor,
    });
  }
}
