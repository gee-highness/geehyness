import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, NgZone, OnDestroy, ViewChild, inject, input, output, signal, computed } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { AssetLibrary } from '../../game/graphics/asset-library';
import { CAR_CATALOG, CAR_CLASSES, CarClass, CarDef } from '../../game/cars';
import { ARCHETYPES } from '../../services/tuning.service';

@Component({
  selector: 'app-car-select',
  standalone: true,
  imports: [MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host{position:absolute;inset:0;z-index:40;display:block}
    .card{background:linear-gradient(160deg,rgba(24,24,27,.85),rgba(9,9,11,.8));backdrop-filter:blur(16px);border:1px solid rgba(255,255,255,.12)}
    .item{transition:background .12s,transform .12s,border-color .12s}
    .item:hover{background:rgba(255,255,255,.08);transform:translateX(3px)}
    .chip{transition:.12s}
    .go{background:linear-gradient(135deg,#fbbf24,#f97316);box-shadow:0 10px 30px rgba(249,115,22,.45)}
    .bar{height:6px;border-radius:3px;background:rgba(255,255,255,.1);overflow:hidden}
    .bar>i{display:block;height:100%;background:linear-gradient(90deg,#22d3ee,#fbbf24)}
  `],
  template: `
    <div class="absolute inset-0 bg-black/65 flex items-center justify-center p-3 sm:p-6 text-white font-sans" (click)="closeModal.emit()">
      <div class="card w-full max-w-5xl h-full max-h-[620px] rounded-3xl overflow-hidden flex flex-col sm:flex-row" (click)="$event.stopPropagation()" role="dialog" aria-label="Choose your car">
        <!-- list -->
        <div class="sm:w-[300px] flex flex-col border-b sm:border-b-0 sm:border-r border-white/10 min-h-0 max-h-[38%] sm:max-h-none">
          <div class="p-4 pb-2">
            <div class="text-[10px] tracking-[0.3em] text-amber-300 font-bold">GARAGE</div>
            <div class="text-xl font-black">{{ filtered().length }} cars</div>
            <div class="flex flex-wrap gap-1.5 mt-2">
              <button class="chip px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer" [class.bg-amber-400]="!cls()" [class.text-zinc-950]="!cls()" [class.border-white/20]="cls()" (click)="cls.set(null)">All</button>
              @for (c of classes; track c) {
                <button class="chip px-2.5 py-1 rounded-full text-[11px] font-semibold border cursor-pointer" [class.bg-amber-400]="cls() === c" [class.text-zinc-950]="cls() === c" [class.border-white/20]="cls() !== c" (click)="cls.set(c)">{{ c }}</button>
              }
            </div>
          </div>
          <div class="overflow-y-auto px-2 pb-3 flex-1">
            @for (car of filtered(); track car.id) {
              <button class="item w-full text-left px-3 py-2.5 rounded-xl mb-1 cursor-pointer border" [class.border-amber-400]="sel().id === car.id" [class.bg-white/10]="sel().id === car.id" [class.border-transparent]="sel().id !== car.id" (click)="pick(car)">
                <div class="text-sm font-bold">{{ car.name }}</div>
                <div class="text-[11px] text-zinc-400">{{ car.cls }} · {{ drive(car) }}</div>
              </button>
            }
          </div>
        </div>
        <!-- preview -->
        <div class="flex-1 flex flex-col min-h-0 relative">
          <canvas #view class="w-full flex-1 min-h-0"></canvas>
          <button class="absolute top-3 right-3 w-10 h-10 rounded-full bg-black/50 grid place-items-center cursor-pointer hover:bg-white/15" (click)="closeModal.emit()" aria-label="Close"><mat-icon>close</mat-icon></button>
          <div class="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-end gap-4 border-t border-white/10">
            <div class="flex-1">
              <div class="text-2xl font-black leading-tight">{{ sel().name }}</div>
              <div class="text-xs text-zinc-400 mb-2">{{ sel().blurb }}</div>
              <div class="grid grid-cols-3 gap-3 text-[10px] font-bold tracking-wider text-zinc-400">
                <div>POWER<div class="bar mt-1"><i [style.width.%]="stats().power"></i></div></div>
                <div>GRIP<div class="bar mt-1"><i [style.width.%]="stats().grip"></i></div></div>
                <div>WEIGHT<div class="bar mt-1"><i [style.width.%]="stats().mass"></i></div></div>
              </div>
            </div>
            <button class="go rounded-2xl px-7 py-3.5 text-zinc-950 font-black tracking-wider cursor-pointer hover:brightness-110" (click)="choose.emit(sel())">DRIVE THIS CAR</button>
          </div>
        </div>
      </div>
    </div>
  `
})
export class CarSelectComponent implements AfterViewInit, OnDestroy {
  current = input<string>('ferrari');
  choose = output<CarDef>();
  closeModal = output<void>();
  @ViewChild('view', { static: true }) viewRef!: ElementRef<HTMLCanvasElement>;
  private zone = inject(NgZone);

  readonly classes = CAR_CLASSES;
  readonly cls = signal<CarClass | null>(null);
  readonly sel = signal<CarDef>(CAR_CATALOG[0]);
  readonly filtered = computed(() => CAR_CATALOG.filter((c) => !this.cls() || c.cls === this.cls()));
  readonly stats = computed(() => {
    const a = ARCHETYPES[this.sel().archetype];
    return { power: Math.min(100, (a.engineMaxPowerKw / 450) * 100), grip: Math.min(100, ((a.tireGripPeak - 0.8) / 1.0) * 100 + 20), mass: Math.min(100, (a.massKg / 2400) * 100) };
  });

  private renderer!: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private pivot = new THREE.Group();
  private raf = 0; private token = 0;

  drive(c: CarDef): string { return ARCHETYPES[c.archetype].driveType; }
  pick(c: CarDef): void { this.sel.set(c); this.show(c); }

  ngAfterViewInit(): void {
    const found = CAR_CATALOG.find((c) => c.id === this.current()); if (found) this.sel.set(found);
    this.zone.runOutsideAngular(() => {
      const canvas = this.viewRef.nativeElement;
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      const pm = new THREE.PMREMGenerator(this.renderer);
      this.scene.environment = pm.fromScene(new RoomEnvironment(), 0.03).texture; pm.dispose();
      const key = new THREE.DirectionalLight(0xfff1d6, 2.2); key.position.set(4, 6, 3); this.scene.add(key);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(4, 48), new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.35, metalness: 0.6 }));
      floor.rotation.x = -Math.PI / 2; this.scene.add(floor);
      this.scene.add(this.pivot);
      this.cam.position.set(5.2, 2.2, 5.2); this.cam.lookAt(0, 0.7, 0);
      this.show(this.sel());
      const loop = () => {
        this.raf = requestAnimationFrame(loop);
        const w = canvas.clientWidth, h = canvas.clientHeight;
        if (canvas.width !== w * this.renderer.getPixelRatio() || canvas.height !== h * this.renderer.getPixelRatio()) { this.renderer.setSize(w, h, false); this.cam.aspect = w / h; this.cam.updateProjectionMatrix(); }
        this.pivot.rotation.y += 0.008;
        this.renderer.render(this.scene, this.cam);
      };
      loop();
    });
  }

  private async show(def: CarDef): Promise<void> {
    const t = ++this.token;
    const m = await AssetLibrary.load(def.file).catch(() => null);
    if (!m || t !== this.token) return;
    this.pivot.clear();
    const car = m.clone(true);
    const box = new THREE.Box3().setFromObject(car), size = box.getSize(new THREE.Vector3());
    const s = 4.4 / Math.max(size.x, size.z);
    const g = new THREE.Group(); car.scale.setScalar(s); g.add(car);
    const b2 = new THREE.Box3().setFromObject(g); car.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    this.pivot.add(g);
  }

  ngOnDestroy(): void { cancelAnimationFrame(this.raf); this.renderer?.dispose(); }
}
