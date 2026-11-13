import { Injectable, signal } from '@angular/core';

export type QualityTier = 'AUTO' | 'HIGH' | 'MED' | 'LOW';
const ORDER: QualityTier[] = ['AUTO', 'HIGH', 'MED', 'LOW'];

/** User graphics preferences, persisted locally. */
@Injectable({ providedIn: 'root' })
export class SettingsService {
  readonly quality = signal<QualityTier>(SettingsService.load());
  private static load(): QualityTier {
    try { const v = localStorage.getItem('shesha.quality') as QualityTier | null; if (v && ORDER.includes(v)) return v; } catch { /* private mode */ }
    return 'AUTO';
  }
  readonly theme = signal<'REAL' | 'NEO'>((() => { try { return localStorage.getItem('shesha.theme') === 'REAL' ? 'REAL' : 'NEO'; } catch { return 'NEO'; } })());
  toggleTheme(): void { const t = this.theme() === 'NEO' ? 'REAL' : 'NEO'; this.theme.set(t); try { localStorage.setItem('shesha.theme', t); } catch { /* private mode */ } }
  setQuality(q: QualityTier): void { this.quality.set(q); try { localStorage.setItem('shesha.quality', q); } catch { /* private mode */ } }
  cycleQuality(): void { this.setQuality(ORDER[(ORDER.indexOf(this.quality()) + 1) % ORDER.length]); }
}
