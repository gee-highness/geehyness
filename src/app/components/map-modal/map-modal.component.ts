import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewChild,
  inject,
  output,
  signal
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { WORLD } from '../../game/graphics/world-builder';
import { DISTRICTS, WorldPipelineService } from '../../services/world-pipeline.service';
import { DistrictInfo } from '../../models/world.types';
import { SPEED_TRAPS } from '../../services/festival.service';

@Component({
  selector: 'app-map-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 select-none font-sans">
      <div class="bg-zinc-950 border border-white/15 rounded-3xl max-w-5xl w-full h-[90vh] text-white shadow-2xl flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="flex items-center justify-between p-4 px-6 border-b border-zinc-800 bg-zinc-900/50">
          <div class="flex items-center gap-3">
            <span class="bg-amber-500/20 text-amber-400 p-2 rounded-xl border border-amber-500/30">
              <mat-icon class="text-xl">map</mat-icon>
            </span>
            <div>
              <h2 class="text-lg font-black tracking-wide uppercase">Eswatini Corridor Vector Map</h2>
              <p class="text-xs text-zinc-400">Manzini to Ezulwini Valley · MR3 Highway · 1:1 Scale Open World</p>
            </div>
          </div>

          <!-- Controls: Zoom In, Zoom Out, Recenter, Close -->
          <div class="flex items-center gap-2">
            <button
              (click)="zoomIn()"
              class="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors cursor-pointer"
              title="Zoom In"
            >
              <mat-icon class="text-sm">add</mat-icon>
            </button>
            <button
              (click)="zoomOut()"
              class="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors cursor-pointer"
              title="Zoom Out"
            >
              <mat-icon class="text-sm">remove</mat-icon>
            </button>
            <button
              (click)="resetView()"
              class="p-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors cursor-pointer"
              title="Recenter Map"
            >
              <mat-icon class="text-sm">center_focus_strong</mat-icon>
            </button>
            <button
              (click)="closeModal.emit()"
              class="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-xl transition-colors cursor-pointer ml-2"
            >
              <mat-icon>close</mat-icon>
            </button>
          </div>
        </div>

        <!-- Main Body: Canvas Map + Sidebar -->
        <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
          <!-- Canvas Vector Map -->
          <div class="flex-1 relative bg-zinc-950 overflow-hidden cursor-grab active:cursor-grabbing">
            <canvas
              #mapCanvas
              (mousedown)="startPan($event)"
              (mousemove)="onPan($event)"
              (mouseup)="endPan()"
              (mouseleave)="endPan()"
              (wheel)="onWheel($event)"
              class="w-full h-full block"
            ></canvas>

            <!-- Map Legend Overlay -->
            <div class="absolute bottom-4 left-4 bg-black/75 backdrop-blur-md border border-white/10 p-3 rounded-2xl text-[11px] text-zinc-300 font-mono flex flex-col gap-1.5 shadow-xl">
              <div class="flex items-center gap-2">
                <div class="w-3.5 h-1.5 bg-amber-500 rounded-full"></div>
                <span>MR3 Highway (4 Lanes)</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-3.5 h-1.5 bg-zinc-400 rounded-full"></div>
                <span>MR103 / MR18 Roads</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full bg-cyan-400"></div>
                <span>Player Position</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
                <span>Speed Camera Trap</span>
              </div>
            </div>
          </div>

          <!-- District Sidebar & Fast Travel -->
          <div class="w-full md:w-80 border-t md:border-t-0 md:border-l border-zinc-800 bg-zinc-900/40 p-4 overflow-y-auto flex flex-col gap-3">
            <span class="text-xs font-bold text-zinc-400 uppercase tracking-wider block">Districts & Fast Travel</span>

            @for (district of districts; track district.id) {
              <button
                type="button"
                class="w-full p-3 rounded-2xl border transition-all text-left bg-zinc-950/80 hover:border-amber-400/50 cursor-pointer block"
                [class.border-amber-400]="selectedDistrict()?.id === district.id"
                [class.border-zinc-800]="selectedDistrict()?.id !== district.id"
                (click)="selectDistrict(district)"
              >
                <div class="flex items-center justify-between">
                  <span class="font-black text-sm text-white">{{ district.name }}</span>
                  <span class="text-[10px] font-mono font-bold text-amber-400">{{ district.elevationM }}m</span>
                </div>
                <p class="text-[11px] text-zinc-400 mt-1 line-clamp-2">{{ district.tagline }}</p>

                <div class="mt-2 flex items-center justify-between pt-2 border-t border-zinc-800/60">
                  <span class="text-[10px] font-mono text-zinc-500">
                    {{ district.gpsLonLat[0] }}° E, {{ district.gpsLonLat[1] }}° S
                  </span>
                  <span
                    (click)="teleportTo(district); $event.stopPropagation()"
                    (keydown.enter)="teleportTo(district); $event.stopPropagation()"
                    tabindex="0"
                    role="button"
                    class="bg-amber-500/20 hover:bg-amber-500 hover:text-black text-amber-300 px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase transition-all cursor-pointer"
                  >
                    Travel
                  </span>
                </div>
              </button>
            }
          </div>
        </div>
      </div>
    </div>
  `
})
export class MapModalComponent implements AfterViewInit {
  @ViewChild('mapCanvas', { static: false }) mapCanvasRef!: ElementRef<HTMLCanvasElement>;

  public worldPipeline = inject(WorldPipelineService);
  closeModal = output<void>();
  teleport = output<[number, number]>();

  readonly districts = DISTRICTS;
  readonly selectedDistrict = signal<DistrictInfo | null>(DISTRICTS[0]);

  // Pan and zoom states
  private panX = 0;
  private panY = 0;
  private zoom = 1.0;
  private isPanning = false;
  private startMouseX = 0;
  private startMouseY = 0;

  // Player position in world metres
  public playerPos: [number, number] = [0, 0];

  ngAfterViewInit(): void {
    this.resetView();
    this.renderMap();
  }

  public setPlayerPosition(x: number, z: number): void {
    this.playerPos = [x, z];
    this.renderMap();
  }

  public selectDistrict(district: DistrictInfo): void {
    this.selectedDistrict.set(district);
    // Pan map to district center
    this.panX = -district.centerPos[0] * 0.08 * this.zoom;
    this.panY = district.centerPos[1] * 0.08 * this.zoom;
    this.renderMap();
  }

  public teleportTo(district: DistrictInfo): void {
    this.teleport.emit(district.centerPos);
    this.closeModal.emit();
  }

  public zoomIn(): void {
    this.zoom = Math.min(3.5, this.zoom * 1.3);
    this.renderMap();
  }

  public zoomOut(): void {
    this.zoom = Math.max(0.4, this.zoom / 1.3);
    this.renderMap();
  }

  public resetView(): void {
    this.zoom = 1.0;
    this.panX = 0;
    this.panY = 120; // Shift down so the north-south corridor fits comfortably
    this.renderMap();
  }

  public startPan(event: MouseEvent): void {
    this.isPanning = true;
    this.startMouseX = event.clientX - this.panX;
    this.startMouseY = event.clientY - this.panY;
  }

  public onPan(event: MouseEvent): void {
    if (!this.isPanning) return;
    this.panX = event.clientX - this.startMouseX;
    this.panY = event.clientY - this.startMouseY;
    this.renderMap();
  }

  public endPan(): void {
    this.isPanning = false;
  }

  public onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (event.deltaY < 0) this.zoomIn();
    else this.zoomOut();
  }

  public renderMap(): void {
    if (!this.mapCanvasRef) return;
    const canvas = this.mapCanvasRef.nativeElement;
    canvas.width = canvas.parentElement?.clientWidth || 700;
    canvas.height = canvas.parentElement?.clientHeight || 600;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#09090b';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Center origin
    ctx.translate(canvas.width / 2 + this.panX, canvas.height / 2 + this.panY);
    ctx.scale(this.zoom, this.zoom);

    // Coordinate conversion factor: 1 world metre = 0.08 canvas pixels
    const scale = 0.0125;
    ctx.translate(12000 * scale, 7500 * scale); // centre on the Manzini - Mbabane corridor

    // 1-2. Real OpenStreetMap rivers + MR3 / primary roads
    const w = WORLD.current;
    if (w?.ready) {
      for (const pass of [9, 3, 2, 1, 0]) {
        for (const r of w.roadWays) {
          if (r.c > 3 && r.c !== 9) continue; if (r.c === 9 && (pass !== 9 || r.w < 6)) continue; if (r.c !== 9 && pass === 9) continue;
          if (r.c !== 9 && r.c > pass && !(pass === 3)) continue;
          ctx.strokeStyle = r.c === 9 ? '#2b5d86' : (r.c <= 1 ? '#f59e0b' : '#d4d4d8');
          ctx.lineWidth = r.c === 9 ? 1.4 : (r.c <= 1 ? 2.6 : 1.5);
          ctx.beginPath();
          for (let i = 0; i < r.p.length; i += 2) { const px = r.p[i] / 10 * scale, pz = r.p[i + 1] / 10 * scale; if (i) ctx.lineTo(px, pz); else ctx.moveTo(px, pz); }
          ctx.stroke();
        }
      }
    }

    // 3. Draw District Node Markers & Labels
    for (const d of this.districts) {
      const dx = d.centerPos[0] * scale;
      const dz = d.centerPos[1] * scale;

      ctx.fillStyle = '#18181b';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(dx, dz, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(d.name, dx + 12, dz + 4);
    }

    // 4. Speed Camera Traps
    for (const trap of SPEED_TRAPS) {
      const tx = trap.position[0] * scale;
      const tz = trap.position[1] * scale;

      ctx.fillStyle = '#ef4444';
      ctx.beginPath();
      ctx.arc(tx, tz, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Player Marker
    const px = this.playerPos[0] * scale;
    const pz = this.playerPos[1] * scale;

    ctx.fillStyle = '#38bdf8';
    ctx.shadowColor = '#06b6d4';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(px, pz, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.restore();
  }
}
