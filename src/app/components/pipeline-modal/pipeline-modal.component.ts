import { ChangeDetectionStrategy, Component, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { GROUND_CLASSES, WorldPipelineService } from '../../services/world-pipeline.service';

@Component({
  selector: 'app-pipeline-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans">
      <div class="bg-zinc-950 border border-white/15 rounded-3xl max-w-4xl w-full h-[90vh] text-white shadow-2xl flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 px-6 border-b border-zinc-800 bg-zinc-900/50">
          <div class="flex items-center gap-3">
            <span class="bg-yellow-500/20 text-yellow-400 p-2 rounded-xl border border-yellow-500/30">
              <mat-icon class="text-xl">account_tree</mat-icon>
            </span>
            <div>
              <h2 class="text-lg font-black tracking-wide uppercase">Open World Data Pipeline Tools</h2>
              <p class="text-xs text-zinc-400">OpenStreetMap & Copernicus DEM 30m · 12-Class Ground System · Blender 4.x</p>
            </div>
          </div>
          <button
            (click)="closeModal.emit()"
            class="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer"
          >
            <mat-icon>close</mat-icon>
          </button>
        </div>

        <!-- Navigation Tabs -->
        <div class="flex items-center gap-2 p-4 px-6 border-b border-zinc-800 bg-zinc-950">
          <button
            (click)="activeTab.set('profile')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer"
            [class.bg-white]="activeTab() === 'profile'"
            [class.text-zinc-950]="activeTab() === 'profile'"
            [class.text-zinc-400]="activeTab() !== 'profile'"
          >
            Corridor Elevation Profile
          </button>
          <button
            (click)="activeTab.set('classes')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer"
            [class.bg-white]="activeTab() === 'classes'"
            [class.text-zinc-950]="activeTab() === 'classes'"
            [class.text-zinc-400]="activeTab() !== 'classes'"
          >
            12 Ground Classes
          </button>
          <button
            (click)="activeTab.set('scripts')"
            class="px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer"
            [class.bg-white]="activeTab() === 'scripts'"
            [class.text-zinc-950]="activeTab() === 'scripts'"
            [class.text-zinc-400]="activeTab() !== 'scripts'"
          >
            Offline Python & Blender Scripts
          </button>
        </div>

        <!-- Content Body -->
        <div class="flex-1 p-6 overflow-y-auto">
          <!-- Tab 1: Elevation Profile -->
          @if (activeTab() === 'profile') {
            <div class="flex flex-col gap-6">
              <div class="bg-zinc-900/60 p-5 rounded-2xl border border-zinc-800">
                <span class="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-1">
                  MR3 Highway Elevation Cross-Section (Manzini to Malagwane Hill)
                </span>
                <p class="text-xs text-zinc-500 mb-4">
                  Height above sea level along the 18+ km corridor. Clamped to max 12% grade for realistic driving dynamics.
                </p>

                <!-- Elevation Chart Mockup with Real Heights -->
                <div class="relative h-44 bg-zinc-950 rounded-xl border border-zinc-800 p-4 flex items-end justify-between font-mono text-[10px]">
                  <div class="flex flex-col items-center">
                    <span class="text-amber-400 font-bold mb-1">650m</span>
                    <div class="w-12 bg-amber-500/80 rounded-t h-16"></div>
                    <span class="mt-2 text-zinc-400">Manzini</span>
                  </div>
                  <div class="flex flex-col items-center">
                    <span class="text-amber-400 font-bold mb-1">600m</span>
                    <div class="w-12 bg-amber-500/80 rounded-t h-12"></div>
                    <span class="mt-2 text-zinc-400">Matsapha</span>
                  </div>
                  <div class="flex flex-col items-center">
                    <span class="text-amber-400 font-bold mb-1">680m</span>
                    <div class="w-12 bg-amber-500/80 rounded-t h-18"></div>
                    <span class="mt-2 text-zinc-400">Malkerns</span>
                  </div>
                  <div class="flex flex-col items-center">
                    <span class="text-amber-400 font-bold mb-1">690m</span>
                    <div class="w-12 bg-amber-500/80 rounded-t h-19"></div>
                    <span class="mt-2 text-zinc-400">Lobamba</span>
                  </div>
                  <div class="flex flex-col items-center">
                    <span class="text-amber-400 font-bold mb-1">700m</span>
                    <div class="w-12 bg-amber-500/80 rounded-t h-20"></div>
                    <span class="mt-2 text-zinc-400">Ezulwini</span>
                  </div>
                  <div class="flex flex-col items-center">
                    <span class="text-red-400 font-bold mb-1">1150m</span>
                    <div class="w-12 bg-red-500/80 rounded-t h-36 shadow-[0_0_15px_#ef4444]"></div>
                    <span class="mt-2 text-white font-bold">Malagwane</span>
                  </div>
                </div>
              </div>

              <!-- UTM 36S to WGS84 Reference Box -->
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
                  <span class="text-xs font-bold text-zinc-300 block mb-1">Projected Coordinate System (CRS)</span>
                  <p class="text-xs text-zinc-500 font-mono">EPSG:32736 (UTM Zone 36S, Southern Hemisphere)</p>
                  <p class="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                    Eswatini lies in UTM Zone 36S. Origin point is anchored at Manzini Centre (31.3667° E, -26.4833° S).
                  </p>
                </div>
                <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800">
                  <span class="text-xs font-bold text-zinc-300 block mb-1">512m Chunking & Streaming Grid</span>
                  <p class="text-xs text-zinc-500 font-mono">129 × 129 Vertices @ 4m resolution</p>
                  <p class="text-[11px] text-zinc-400 mt-2 leading-relaxed">
                    Zero crack stitching with shared edge vertices and bicubic interpolation for terrain colliders.
                  </p>
                </div>
              </div>
            </div>
          }

          <!-- Tab 2: 12 Ground Classes -->
          @if (activeTab() === 'classes') {
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              @for (c of groundClasses; track c.id) {
                <div class="bg-zinc-900/60 p-4 rounded-2xl border border-zinc-800 flex items-start gap-3">
                  <div
                    class="w-8 h-8 rounded-xl shrink-0 border border-white/20 mt-0.5"
                    [style.background-color]="'rgb(' + c.colorRgb.join(',') + ')'"
                  ></div>
                  <div class="flex-1">
                    <div class="flex items-center justify-between">
                      <span class="font-black text-xs text-white">{{ c.label }}</span>
                      <span class="text-[10px] font-mono text-zinc-400">Class {{ c.id }}</span>
                    </div>
                    <div class="mt-2 grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-400">
                      <div>Grip: <span class="text-emerald-400 font-bold">{{ Math.round(c.gripMultiplier * 100) }}%</span></div>
                      <div>Resistance: <span class="text-amber-400 font-bold">{{ c.rollingResistance }}x</span></div>
                    </div>
                  </div>
                </div>
              }
            </div>
          }

          <!-- Tab 3: Scripts -->
          @if (activeTab() === 'scripts') {
            <div class="flex flex-col gap-4">
              <div class="flex items-center gap-2">
                @for (scriptName of ['osm_export.sh', 'world_prep.py', 'blender_build_terrain.py']; track scriptName) {
                  <button
                    (click)="selectedScript.set(scriptName)"
                    class="px-3 py-1.5 text-xs font-bold rounded-xl transition-all cursor-pointer font-mono"
                    [class.bg-yellow-500]="selectedScript() === scriptName"
                    [class.text-black]="selectedScript() === scriptName"
                    [class.bg-zinc-900]="selectedScript() !== scriptName"
                    [class.text-zinc-400]="selectedScript() !== scriptName"
                  >
                    {{ scriptName }}
                  </button>
                }
              </div>

              <!-- Code Preview Box -->
              <div class="bg-zinc-950 p-4 rounded-2xl border border-zinc-800 font-mono text-xs overflow-x-auto text-zinc-300">
                <pre class="leading-relaxed whitespace-pre-wrap">{{ getScriptContent(selectedScript()) }}</pre>
              </div>
            </div>
          }
        </div>
      </div>
    </div>
  `
})
export class PipelineModalComponent {
  public worldPipeline = inject(WorldPipelineService);
  closeModal = output<void>();

  readonly activeTab = signal<'profile' | 'classes' | 'scripts'>('profile');
  readonly selectedScript = signal<string>('world_prep.py');
  readonly groundClasses = GROUND_CLASSES;
  public Math = Math;

  public getScriptContent(name: string): string {
    if (name === 'osm_export.sh') {
      return `#!/usr/bin/env bash
# Extract every real street (and land cover) for Manzini to Ezulwini from OpenStreetMap.
set -euo pipefail
mkdir -p osm && cd osm
curl -L -o eswatini.osm.pbf https://download.geofabrik.de/africa/swaziland-latest.osm.pbf
osmium extract -b 31.10,-26.58,31.45,-26.30 eswatini.osm.pbf -o aoi.osm.pbf --overwrite
ogr2ogr -f GeoJSON highways.geojson aoi.osm.pbf lines -where "highway IS NOT NULL" -t_srs EPSG:32736 -overwrite
ogr2ogr -f GeoJSON waterways.geojson aoi.osm.pbf lines -where "waterway IS NOT NULL" -t_srs EPSG:32736 -overwrite
ogr2ogr -f GeoJSON landuse.geojson aoi.osm.pbf multipolygons -where "landuse IS NOT NULL OR natural IS NOT NULL" -t_srs EPSG:32736 -overwrite`;
    }
    if (name === 'world_prep.py') {
      return `# Python 3.10+ world compiler (Toy Circuit / SD)
EPSG = 32736 # UTM 36S
BBOX = (31.10, -26.58, 31.45, -26.30) # Manzini to Ezulwini
RES = 4.0 # 4 metre grid
CHUNK = 512.0 # 512m chunk size, 129x129 vertices
# Mosaic GLO-30 GeoTIFFs, reproject with cubic filter, and carve road profiles:
def build_dem(tiles_dir, out_dir):
    # Generates height.npy, meta.json, and 12-class ground_class.npy`;
    }
    return `# Blender 4.x Python API automated world generator
# Loads height.npy, builds 12-class splat terrain, and extrudes smooth MR3 highway ribbons:
import bpy, numpy as np
AREA = (-1000.0, -1000.0, 1000.0, 1000.0) # 2x2km Manzini vertical slice
MAX_GRADE = 0.12 # 12% maximum highway slope
SHOULDER = 6.0 # 6m embankment blend
# Export to glTF 2.0 with meshopt and KTX2 compression for mobile WebView!`;
  }
}
