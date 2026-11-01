import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, HostListener, NgZone, OnDestroy, ViewChild, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WORLD } from '../../game/graphics/world-builder';
import { DISTRICTS } from '../../services/world-pipeline.service';
import { DistrictInfo } from '../../models/world.types';
import { SPEED_TRAPS } from '../../services/festival.service';
import { NavigationService } from '../../services/navigation.service';

/** GTA-"Atlas"-style full-screen GPS map: land-use tint, white/yellow roads, blue place names, blips, waypoint and GPS line. */
const LAND: Record<number, string> = { 1: '#cfd3a9', 2: '#d4dbb0', 3: '#d8dcb6', 4: '#dfdcb4', 5: '#a9c08a', 6: '#c9c3b6', 7: '#d9d2bd', 8: '#e6e0d0', 9: '#cfcac4', 10: '#e8dcb4', 11: '#d9d2bd', 12: '#b5cfc0' };
const WATER = '#8db8d0', LABEL = '#3b6aa0';
const BLIP: Record<string, [string, string, number]> = { // kind -> [colour, glyph, min zoom]
  hospital: ['#e11d48', '+', 0.05], clinic: ['#e11d48', '+', 0.25], police: ['#2563eb', 'P', 0.1], fuel: ['#f97316', 'F', 0.12], mall: ['#a855f7', 'M', 0.06], supermarket: ['#a855f7', 'S', 0.2],
  bank: ['#16a34a', '$', 0.25], school: ['#0ea5e9', 'S', 0.3], college: ['#0ea5e9', 'U', 0.15], university: ['#0ea5e9', 'U', 0.1], restaurant: ['#eab308', 'R', 0.4], fast_food: ['#eab308', 'R', 0.4],
  place_of_worship: ['#64748b', '+', 0.35], bus_station: ['#14b8a6', 'B', 0.2], marketplace: ['#f43f5e', 'M', 0.2], convenience: ['#94a3b8', 'C', 0.5],
};

@Component({
  selector: 'app-map-modal',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed inset-0 z-50 bg-[#2b3a44] select-none font-sans text-white">
      <canvas #mapCanvas class="absolute inset-0 w-full h-full block cursor-crosshair touch-none"
        (pointerdown)="down($event)" (pointermove)="move($event)" (pointerup)="up($event)" (pointerleave)="leave()" (wheel)="wheel($event)"></canvas>

      <div class="absolute top-0 inset-x-0 flex items-center justify-between px-5 py-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
        <div><div class="text-xl font-black tracking-[0.25em] uppercase">Eswatini · GPS</div>
          <div class="text-[11px] text-zinc-300 font-mono">{{ cursorText() }}</div></div>
        <div class="flex gap-2 pointer-events-auto">
          <button (click)="zoomBy(1.4)" class="mbtn" aria-label="Zoom in">+</button>
          <button (click)="zoomBy(1 / 1.4)" class="mbtn" aria-label="Zoom out">−</button>
          <button (click)="centreOnMe()" class="mbtn" aria-label="Centre on me">◎</button>
          <button (click)="clearWaypoint()" class="mbtn" aria-label="Clear waypoint">⚑</button>
          <button (click)="showList.set(!showList())" class="mbtn" aria-label="Places">☰</button>
          <button (click)="closeModal.emit()" class="mbtn" aria-label="Close">✕</button>
        </div>
      </div>

      @if (showList()) {
        <div class="absolute top-16 right-3 bottom-16 w-72 overflow-y-auto bg-black/65 backdrop-blur-md rounded-2xl border border-white/10 p-2 flex flex-col gap-1.5">
          <div class="text-[10px] uppercase tracking-wider text-zinc-400 px-2 pt-1">Fast travel</div>
          @for (d of districts; track d.id) {
            <div class="rounded-xl bg-white/5 hover:bg-white/10 p-2 flex items-center justify-between gap-2">
              <button class="text-left flex-1" (click)="focus(d)"><div class="font-bold text-sm">{{ d.name }}</div><div class="text-[10px] text-zinc-400">{{ d.elevationM }} m</div></button>
              <button class="px-2 py-1 rounded-lg bg-amber-500/25 text-amber-200 text-[10px] font-bold uppercase" (click)="travel(d)">Travel</button>
            </div>
          }
        </div>
      }

      <div class="absolute bottom-0 inset-x-0 px-5 py-3 bg-gradient-to-t from-black/75 to-transparent flex flex-wrap gap-x-5 gap-y-1 text-[11px] text-zinc-200 pointer-events-none">
        <span><b class="text-amber-300">Click / A</b> waypoint</span><span><b class="text-amber-300">Drag / L-stick</b> pan</span><span><b class="text-amber-300">Wheel / R2·L2</b> zoom</span>
        <span><b class="text-amber-300">Y / space</b> centre</span><span><b class="text-amber-300">X / Del</b> clear</span><span><b class="text-amber-300">B / Esc / M</b> close</span>
        @if (nav.waypoint()) { <span class="ml-auto text-fuchsia-300 font-bold">{{ nav.route() ? 'Route · ' + routeKm() : nav.routing() ? 'Routing…' : 'Waypoint · ' + wpDist() + ' (no road route)' }}</span> }
      </div>
    </div>
  `,
  styles: [`.mbtn{width:2.4rem;height:2.4rem;border-radius:.8rem;background:rgba(0,0,0,.55);border:1px solid rgba(255,255,255,.18);font-weight:800;font-size:1.05rem}.mbtn:hover{background:rgba(255,255,255,.18)}`],
})
export class MapModalComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;
  readonly nav = inject(NavigationService);
  private zone = inject(NgZone);
  closeModal = output<void>();
  teleport = output<[number, number]>();
  readonly districts = DISTRICTS;
  readonly showList = signal(false);
  readonly cursorText = signal('');

  private cx = 0; private cz = 0; private s = 0.12; // centre (world m), px per metre
  private land?: HTMLCanvasElement; private raf = 0; private dirty = true; private lastBtn: boolean[] = []; private hoverName = '';
  private dragging = false; private moved = false; private sx = 0; private sy = 0; private mx = -1; private my = -1;
  private ways: { w: { c: number; w: number; p: number[] }; x0: number; z0: number; x1: number; z1: number }[] = [];
  private usingPad = false;

  ngAfterViewInit(): void {
    this.cx = this.nav.pose.x; this.cz = this.nav.pose.z;
    this.buildLand(); this.buildWayBoxes();
    this.zone.runOutsideAngular(() => { const loop = () => { this.pollPad(); if (this.dirty || true) this.draw(); this.raf = requestAnimationFrame(loop); }; loop(); });
  }
  ngOnDestroy(): void { cancelAnimationFrame(this.raf); }

  // ---------------------------------------------------------------- data prep
  private buildLand(): void {
    const w = WORLD.current; if (!w?.ready) return;
    const [x0, x1, z0, z1] = w.meta.bounds, cell = 60, W = Math.ceil((x1 - x0) / cell), H = Math.ceil((z1 - z0) / cell);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d')!; const img = g.createImageData(W, H);
    const rgb: Record<number, number[]> = {}; for (const k of Object.keys(LAND)) { const h = LAND[+k]; rgb[+k] = [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]; }
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const cl = w.groundClassAt(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell), col = rgb[cl] ?? rgb[2], o = (j * W + i) * 4;
      img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0); this.land = c;
  }
  private buildWayBoxes(): void {
    const w = WORLD.current; if (!w?.ready) return;
    this.ways = w.roadWays.filter((r) => r.p.length >= 4).map((r) => { let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9; for (let i = 0; i < r.p.length; i += 2) { const x = r.p[i] / 10, z = r.p[i + 1] / 10; if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; } return { w: r, x0, z0, x1, z1 }; });
  }

  // ---------------------------------------------------------------- input
  private toWorld(px: number, py: number): [number, number] { const c = this.canvasRef.nativeElement; return [this.cx + (px - c.width / 2) / this.s, this.cz + (py - c.height / 2) / this.s]; }
  down(e: PointerEvent): void { this.dragging = true; this.moved = false; this.sx = e.clientX; this.sy = e.clientY; (e.target as Element).setPointerCapture?.(e.pointerId); this.usingPad = false; }
  move(e: PointerEvent): void {
    const r = this.canvasRef.nativeElement.getBoundingClientRect(); const k = this.canvasRef.nativeElement.width / r.width;
    this.mx = (e.clientX - r.left) * k; this.my = (e.clientY - r.top) * k; this.usingPad = false;
    if (this.dragging) { const dx = e.clientX - this.sx, dy = e.clientY - this.sy; if (Math.abs(dx) + Math.abs(dy) > 3) this.moved = true; this.cx -= (dx * k) / this.s; this.cz -= (dy * k) / this.s; this.sx = e.clientX; this.sy = e.clientY; }
  }
  up(e: PointerEvent): void { if (this.dragging && !this.moved) { const [x, z] = this.toWorld(this.mx, this.my); this.nav.set(x, z); } this.dragging = false; (e.target as Element).releasePointerCapture?.(e.pointerId); }
  leave(): void { this.dragging = false; this.mx = -1; }
  wheel(e: WheelEvent): void { e.preventDefault(); this.zoomBy(e.deltaY < 0 ? 1.18 : 1 / 1.18); }
  zoomBy(f: number): void { this.s = Math.max(0.012, Math.min(1.6, this.s * f)); }
  centreOnMe(): void { this.cx = this.nav.pose.x; this.cz = this.nav.pose.z; }
  clearWaypoint(): void { this.nav.clear(); }
  focus(d: DistrictInfo): void { this.cx = d.centerPos[0]; this.cz = d.centerPos[1]; this.s = Math.max(this.s, 0.15); }
  travel(d: DistrictInfo): void { this.teleport.emit(d.centerPos); this.closeModal.emit(); }
  routeKm(): string { const r = this.nav.route(); if (!r) return ''; return r.length > 1000 ? (r.length / 1000).toFixed(1) + ' km' : Math.round(r.length) + ' m'; }
  wpDist(): string { const w = this.nav.waypoint(); if (!w) return ''; const d = Math.hypot(w[0] - this.nav.pose.x, w[1] - this.nav.pose.z); return d > 1000 ? (d / 1000).toFixed(1) + ' km' : Math.round(d) + ' m'; }

  @HostListener('window:keydown', ['$event']) key(e: KeyboardEvent): void {
    if (e.code === 'Escape') this.closeModal.emit();
    else if (e.code === 'Space') { e.preventDefault(); this.centreOnMe(); } else if (e.code === 'Delete' || e.code === 'Backspace') this.clearWaypoint();
    else if (e.code === 'Equal' || e.code === 'NumpadAdd') this.zoomBy(1.3); else if (e.code === 'Minus' || e.code === 'NumpadSubtract') this.zoomBy(1 / 1.3);
  }

  private pollPad(): void {
    const pad = typeof navigator !== 'undefined' && navigator.getGamepads ? Array.from(navigator.getGamepads()).find((p) => p && p.connected) : null; if (!pad) return;
    const dz = (v: number) => (Math.abs(v) < 0.15 ? 0 : v);
    const ax = dz(pad.axes[0] || 0) + dz(pad.axes[2] || 0), ay = dz(pad.axes[1] || 0) + dz(pad.axes[3] || 0);
    if (ax || ay) { this.cx += (ax * 900) / this.s / 60; this.cz += (ay * 900) / this.s / 60; this.usingPad = true; }
    const r2 = pad.buttons[7]?.value ?? 0, l2 = pad.buttons[6]?.value ?? 0; if (r2 > 0.1) this.zoomBy(1 + r2 * 0.03); if (l2 > 0.1) this.zoomBy(1 / (1 + l2 * 0.03));
    const b = pad.buttons.map((x) => x.pressed), edge = (i: number) => b[i] && !this.lastBtn[i];
    if (edge(0)) { this.usingPad = true; const c = this.canvasRef.nativeElement; const [x, z] = this.toWorld(c.width / 2, c.height / 2); this.nav.set(x, z); }
    if (edge(2)) this.clearWaypoint(); if (edge(3)) this.centreOnMe(); if (edge(1)) this.closeModal.emit();
    this.lastBtn = b;
  }

  // ---------------------------------------------------------------- drawing
  private draw(): void {
    const cv = this.canvasRef.nativeElement, par = cv.parentElement!; const W = par.clientWidth, H = par.clientHeight;
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const g = cv.getContext('2d')!, w = WORLD.current; const s = this.s;
    const sxp = (x: number) => (x - this.cx) * s + W / 2, szp = (z: number) => (z - this.cz) * s + H / 2;
    g.fillStyle = WATER; g.fillRect(0, 0, W, H);
    if (this.land && w?.ready) { const [x0, x1, z0, z1] = w.meta.bounds; g.imageSmoothingEnabled = true; g.drawImage(this.land, sxp(x0), szp(z0), (x1 - x0) * s, (z1 - z0) * s); }
    const vx0 = this.cx - W / 2 / s, vx1 = this.cx + W / 2 / s, vz0 = this.cz - H / 2 / s, vz1 = this.cz + H / 2 / s;
    g.lineJoin = 'round'; g.lineCap = 'round';
    // lakes
    if (w) { g.fillStyle = WATER; for (const p of w.waterPolys) { g.beginPath(); for (let i = 0; i < p.length; i += 2) { const x = sxp(p[i] / 10), z = szp(p[i + 1] / 10); if (i) g.lineTo(x, z); else g.moveTo(x, z); } g.fill(); } }
    // roads: casing pass then fill pass, minor roads only when zoomed in
    const minC = s < 0.05 ? 3 : s < 0.1 ? 4 : s < 0.25 ? 5 : s < 0.5 ? 7 : 9;
    const WID = [9, 8, 7, 6, 5, 4, 3, 2.6, 1.6, 0];
    const vis = this.ways.filter((a) => a.w.c <= minC && a.x1 > vx0 && a.x0 < vx1 && a.z1 > vz0 && a.z0 < vz1);
    const stroke = (list: typeof vis, fill: boolean) => {
      for (const a of list) {
        const r = a.w; if (r.c === 9) continue;
        const wd = Math.max(1.2, WID[r.c] * Math.min(1.8, 0.55 + s * 3.2));
        g.strokeStyle = fill ? (r.c <= 1 ? '#f6c945' : r.c <= 3 ? '#fbe9a0' : r.c === 7 ? '#cbb892' : '#ffffff') : (r.c <= 1 ? '#a77d12' : '#a89f88');
        g.lineWidth = fill ? wd : wd + 1.6; g.beginPath();
        for (let i = 0; i < r.p.length; i += 2) { const x = sxp(r.p[i] / 10), z = szp(r.p[i + 1] / 10); if (i) g.lineTo(x, z); else g.moveTo(x, z); }
        g.stroke();
      }
    };
    // rivers under roads
    g.strokeStyle = WATER; for (const a of this.ways) { const r = a.w; if (r.c !== 9 || a.x1 < vx0 || a.x0 > vx1 || a.z1 < vz0 || a.z0 > vz1) continue; g.lineWidth = Math.max(1.2, r.w * s * 1.4); g.beginPath(); for (let i = 0; i < r.p.length; i += 2) { const x = sxp(r.p[i] / 10), z = szp(r.p[i + 1] / 10); if (i) g.lineTo(x, z); else g.moveTo(x, z); } g.stroke(); }
    vis.sort((a, b) => b.w.c - a.w.c); stroke(vis, false); stroke(vis, true);

    // place names
    if (w?.ready) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const p of w.meta.places) {
        const big = p.k === 'city' || p.k === 'town', mid = p.k === 'suburb' || p.k === 'village', minZ = big ? 0 : mid ? 0.1 : 0.28; if (s < minZ) continue;
        const x = sxp(p.p[0]), z = szp(p.p[1]); if (x < -80 || x > W + 80 || z < -20 || z > H + 20) continue;
        g.font = `italic 800 ${big ? 17 : mid ? 13 : 11}px sans-serif`; const t = p.n.toUpperCase();
        g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.9)'; g.strokeText(t, x, z); g.fillStyle = LABEL; g.fillText(t, x, z);
      }
      // blips
      this.hoverName = '';
      for (const poi of w.meta.pois) {
        const b = BLIP[poi.k]; if (!b || s < b[2]) continue; const x = sxp(poi.p[0]), z = szp(poi.p[1]); if (x < -10 || x > W + 10 || z < -10 || z > H + 10) continue;
        this.blip(g, x, z, b[0], b[1], 8);
        if (this.mx >= 0 && Math.hypot(x - this.mx, z - this.my) < 10) this.hoverName = poi.n;
      }
      for (const bs of w.meta.busstops ?? []) { if (s < 0.45) break; const x = sxp(bs.p[0]), z = szp(bs.p[1]); if (x < 0 || x > W || z < 0 || z > H) continue; this.blip(g, x, z, '#14b8a6', 'B', 6); }
    }
    for (const t of SPEED_TRAPS) { if (s < 0.08) break; this.blip(g, sxp(t.position[0]), szp(t.position[1]), '#ef4444', '!', 7); }

    // GPS line + waypoint
    const wp = this.nav.waypoint(), me = this.nav.pose;
    if (wp) {
      const rt = this.nav.route();
      if (rt) { g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 8; g.beginPath(); for (let i = 0; i < rt.pts.length; i += 2) { const x = sxp(rt.pts[i]), z = szp(rt.pts[i + 1]); if (i) g.lineTo(x, z); else g.moveTo(x, z); } g.stroke(); g.strokeStyle = '#d946ef'; g.lineWidth = 5; g.stroke(); }
      else { g.setLineDash([10, 8]); g.strokeStyle = '#d946ef'; g.lineWidth = 3; g.beginPath(); g.moveTo(sxp(me.x), szp(me.z)); g.lineTo(sxp(wp[0]), szp(wp[1])); g.stroke(); g.setLineDash([]); }
      const x = sxp(wp[0]), z = szp(wp[1]); g.fillStyle = '#d946ef'; g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(x, z); g.bezierCurveTo(x - 16, z - 18, x - 12, z - 38, x, z - 38); g.bezierCurveTo(x + 12, z - 38, x + 16, z - 18, x, z); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(x, z - 26, 4.5, 0, 7); g.fill();
    }
    // player arrow (GTA: white arrow, heading-aware)
    { const x = sxp(me.x), z = szp(me.z); g.save(); g.translate(x, z); g.rotate(-me.yaw); g.fillStyle = '#fff'; g.strokeStyle = '#1f2937'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 13); g.lineTo(-9, -10); g.lineTo(0, -5); g.lineTo(9, -10); g.closePath(); g.fill(); g.stroke(); g.restore(); }

    // reticle for gamepad mode
    const rx = this.usingPad || this.mx < 0 ? W / 2 : this.mx, ry = this.usingPad || this.mx < 0 ? H / 2 : this.my;
    g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = 2; g.beginPath(); g.moveTo(rx - 12, ry); g.lineTo(rx + 12, ry); g.moveTo(rx, ry - 12); g.lineTo(rx, ry + 12); g.stroke();
    if (this.hoverName) { g.font = '700 13px sans-serif'; g.textAlign = 'left'; const tw = g.measureText(this.hoverName).width; g.fillStyle = 'rgba(0,0,0,.75)'; g.fillRect(rx + 14, ry - 24, tw + 12, 22); g.fillStyle = '#fff'; g.fillText(this.hoverName, rx + 20, ry - 12); }
    // scale bar
    { const nice = [10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000]; const m = nice.find((n) => n * s > 90) ?? 10000; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(18, H - 64, m * s + 12, 20); g.fillStyle = '#fff'; g.font = '700 11px sans-serif'; g.textAlign = 'left'; g.fillText(m >= 1000 ? m / 1000 + ' km' : m + ' m', 24, H - 54); g.fillRect(24, H - 47, m * s, 2); }
    const [wx, wz] = this.toWorld(rx, ry); const t = `x ${Math.round(wx)}  z ${Math.round(wz)}${w?.ready ? '  ·  ' + w.districtAt(wx, wz) : ''}`; if (t !== this.cursorText()) this.cursorText.set(t);
  }

  private blip(g: CanvasRenderingContext2D, x: number, y: number, col: string, glyph: string, r: number): void {
    g.fillStyle = col; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = `800 ${Math.round(r * 1.25)}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(glyph, x, y + 0.5);
  }
}
