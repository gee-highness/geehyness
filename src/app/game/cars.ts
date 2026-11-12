import type { VehicleArchetypeConfig, VehicleArchetypeId } from '../models/vehicle.types';
import { ARCHETYPES } from '../services/tuning.service';
import { CarKind, carSize, wheelSpots } from './graphics/car-gen';

export type CarClass = 'Local' | 'Sports' | 'Race' | 'Everyday' | 'SUV' | 'Van & Truck' | 'Service' | 'Farm' | 'Kart';

export interface CarDef {
  id: string; name: string; cls: CarClass; file: string; archetype: VehicleArchetypeId;
  /** Model faces -Z (three.js Ferrari) instead of +Z (Kenney). */
  flip?: boolean; paintable?: boolean; blurb: string;
  /** Wheel nodes in order FL, FR, RL, RR. */
  wheels: [string, string, string, string];
  /** Generated body (car-gen.ts) instead of a glTF file: drawn at true size, wheelbase / track come from the body. */
  gen?: CarKind;
  /** Waist stripe colour for generated bodies (minibus taxi, coach). */
  stripe?: number;
  /** Fixed paint for generated bodies that are not paintable. */
  paint?: number;
  /** This car's own figures on top of its archetype (mass, power, drive, grip, size, gearing). */
  spec: Partial<VehicleArchetypeConfig>;
}
const K: [string, string, string, string] = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];
type Drive = 'AWD' | 'RWD' | 'FWD';
/** mass kg, power kW, drive, tyre grip, wheelbase m (sets the model's size), track m, + any other figure. */
const sp = (massKg: number, engineMaxPowerKw: number, driveType: Drive, tireGripPeak: number, wheelBaseM: number, trackWidthM: number, more: Partial<VehicleArchetypeConfig> = {}): Partial<VehicleArchetypeConfig> =>
  ({ massKg, engineMaxPowerKw, driveType, tireGripPeak, wheelBaseM, trackWidthM, ...more });
/** Rev range + gearing shorthand: peak rpm, limiter, final drive, drag. */
const rev = (enginePeakRpm: number, engineMaxRpm: number, finalDrive: number, dragCoefficient: number, more: Partial<VehicleArchetypeConfig> = {}): Partial<VehicleArchetypeConfig> =>
  ({ enginePeakRpm, engineMaxRpm, finalDrive, dragCoefficient, ...more });
const ROAD = rev(5800, 6600, 4.1, 0.34), DIESEL = rev(3600, 4400, 3.9, 0.42), LORRY = rev(2400, 3000, 3.7, 0.62, { engineIdleRpm: 650 }), KART = rev(9500, 11500, 12, 0.5, { engineIdleRpm: 1800, suspensionRestLengthM: 0.3 });
const c = (id: string, name: string, cls: CarClass, archetype: VehicleArchetypeId, blurb: string, spec: Partial<VehicleArchetypeConfig>, extra: Partial<CarDef> = {}): CarDef =>
  ({ id, name, cls, file: `assets/models/cars/${id}.glb`, archetype, blurb, wheels: K, spec, ...extra });
/** A generated Southern-African body: true-size, wheelbase / track read from the shape. */
const g = (id: string, name: string, gen: CarKind, archetype: VehicleArchetypeId, blurb: string, massKg: number, engineMaxPowerKw: number, driveType: Drive, tireGripPeak: number, more: Partial<VehicleArchetypeConfig> = {}, extra: Partial<CarDef> = {}): CarDef =>
  ({ id, name, cls: 'Local', file: '', archetype, blurb, wheels: K, gen, paintable: true, spec: { massKg, engineMaxPowerKw, driveType, tireGripPeak, ...more }, ...extra });

/** Full physics config for a catalogue car: archetype + the car's own figures; springs and dampers follow the mass. */
export function carConfig(def: CarDef): VehicleArchetypeConfig {
  const a = ARCHETYPES[def.archetype], s = def.spec, m = (s.massKg ?? a.massKg) / a.massKg;
  const cfg: VehicleArchetypeConfig = { ...a, name: def.name, tagline: def.blurb, suspensionStiffness: a.suspensionStiffness * m, suspensionDamping: a.suspensionDamping * m, ...s };
  if (def.gen) {
    const w = wheelSpots(def.gen), z = carSize(def.gen);
    cfg.wheelBaseM = w[0][2] - w[2][2]; cfg.trackWidthM = w[0][0] * 2;
    cfg.dragCoefficient = s.dragCoefficient ?? Math.max(0.3, (0.36 * z.W * z.H) / 2.2);   // physics uses a fixed 2.2 m2 frontal area
  }
  return cfg;
}

export const CAR_CATALOG: CarDef[] = [
  c('ferrari', 'Ferrari 458 Italia', 'Sports', 'RWD_DRIFT', 'Mid-engine V8 icon. Paintable.', sp(1485, 419, 'RWD', 1.24, 2.65, 1.67, rev(7900, 9000, 4.1, 0.33, { downforceCoefficient: 1.6 })), { file: 'assets/models/cars/ferrari-lod.glb', flip: true, paintable: true, wheels: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] }),
  // ---- generated local bodies (paintable, true size)
  g('gusheshe', 'Gusheshe 325', 'coupe', 'RWD_DRIFT', 'Boxy rear-drive legend of every spin event. Paintable.', 1180, 155, 'RWD', 1.02, rev(6200, 7000, 4.1, 0.36)),
  g('sa-hatch', 'Vivo GT Hatch', 'hatch', 'AWD_GRIP', 'The hatch on every street, warmed up. Paintable.', 1080, 110, 'FWD', 1.08, ROAD),
  g('sa-sedan', 'Corolla-type Sedan', 'sedan', 'AWD_GRIP', 'Runs forever. Paintable.', 1290, 103, 'FWD', 1.0, ROAD),
  g('sa-bakkie-1', 'Single-Cab Bakkie', 'bakkie1', 'HEAVY_CRUISER', 'Half-ton workhorse, light tail. Paintable.', 1650, 110, 'RWD', 0.94, DIESEL),
  g('sa-bakkie', 'Double-Cab Bakkie', 'bakkie', 'HEAVY_CRUISER', 'Turbo-diesel 4x4 double cab. Paintable.', 2100, 150, 'AWD', 0.98, DIESEL),
  g('sa-suv', 'Fortuner-type SUV', 'suv', 'HEAVY_CRUISER', 'Seven seats, school run to Sibebe. Paintable.', 2130, 150, 'AWD', 0.98, DIESEL),
  g('sa-cruiser', 'Bush Cruiser 4x4', 'cruiser', 'HEAVY_CRUISER', 'Straight-six, solid axles, goes anywhere. Paintable.', 2350, 151, 'AWD', 0.96, rev(3400, 4200, 4.1, 0.5, { suspensionRestLengthM: 0.46 })),
  g('sa-quantum', 'Quantum Minibus Taxi', 'minibus', 'HEAVY_CRUISER', 'Fifteen seats, one stripe, no brakes spared.', 2250, 111, 'RWD', 0.93, DIESEL, { paintable: false, paint: 0xf0f0ec, stripe: 0xd9a514 }),
  g('sa-coach', 'Intercity Coach', 'coach', 'HEAVY_CRUISER', 'Twelve metres to Johannesburg. Mind the corners.', 13500, 300, 'RWD', 0.88, LORRY, { paintable: false, paint: 0xf2f2ee, stripe: 0x1d4ed8 }),
  // ---- kit models
  c('sedan-sports', 'Sports Sedan', 'Sports', 'AWD_GRIP', 'Four-door pace with all-wheel grip.', sp(1650, 280, 'AWD', 1.16, 2.75, 1.6, rev(6400, 7200, 3.6, 0.33))),
  c('hatchback-sports', 'Hot Hatch', 'Sports', 'AWD_GRIP', 'Light, nimble and loud.', sp(1350, 180, 'FWD', 1.12, 2.6, 1.55, rev(6200, 7000, 3.9, 0.34))),
  c('race', 'GT Racer', 'Race', 'AWD_GRIP', 'Track-bred touring car.', sp(1250, 400, 'RWD', 1.45, 2.7, 1.75, rev(7400, 8600, 3.73, 0.36, { downforceCoefficient: 2.4 }))),
  c('race-future', 'Future Racer', 'Race', 'AWD_GRIP', 'Low, wide and aero-heavy.', sp(1050, 520, 'AWD', 1.55, 2.8, 1.8, rev(8200, 9400, 3.5, 0.38, { downforceCoefficient: 3.0 }))),
  c('sedan', 'City Sedan', 'Everyday', 'AWD_GRIP', 'The everyday Manzini commuter.', sp(1300, 103, 'FWD', 1.0, 2.7, 1.55, ROAD)),
  c('taxi', 'Taxi', 'Everyday', 'AWD_GRIP', 'Cruise Nkosi Hlusaza St like a local.', sp(1350, 110, 'FWD', 1.0, 2.7, 1.55, ROAD)),
  c('suv', 'SUV', 'SUV', 'HEAVY_CRUISER', 'Soft suspension, big presence.', sp(1900, 150, 'AWD', 0.98, 2.75, 1.6, DIESEL)),
  c('suv-luxury', 'Luxury SUV', 'SUV', 'HEAVY_CRUISER', 'Executive comfort for the Ezulwini run.', sp(2300, 300, 'AWD', 1.06, 2.9, 1.66, rev(5600, 6400, 3.4, 0.38))),
  c('van', 'Kombi Van', 'Van & Truck', 'HEAVY_CRUISER', 'The Eswatini minibus taxi silhouette.', sp(1900, 111, 'RWD', 0.95, 2.9, 1.62, DIESEL)),
  c('delivery', 'Delivery Van', 'Van & Truck', 'HEAVY_CRUISER', 'Matsapha logistics workhorse.', sp(2400, 120, 'RWD', 0.92, 3.2, 1.7, DIESEL)),
  c('delivery-flat', 'Flatbed Van', 'Van & Truck', 'HEAVY_CRUISER', 'Open-bed hauler.', sp(2200, 120, 'RWD', 0.92, 3.2, 1.7, DIESEL)),
  c('truck', 'Truck', 'Van & Truck', 'HEAVY_CRUISER', 'Heavy and unstoppable.', sp(5500, 210, 'RWD', 0.9, 3.6, 1.9, LORRY)),
  c('truck-flat', 'Flatbed Truck', 'Van & Truck', 'HEAVY_CRUISER', 'Freight on the MR3.', sp(5000, 210, 'RWD', 0.9, 3.6, 1.9, LORRY)),
  c('vehicle-truck-red', 'Rally Truck (Red)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.', sp(1600, 330, 'AWD', 1.2, 2.8, 1.75, rev(6200, 7200, 3.9, 0.42))),
  c('vehicle-truck-yellow', 'Rally Truck (Yellow)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.', sp(1600, 330, 'AWD', 1.2, 2.8, 1.75, rev(6200, 7200, 3.9, 0.42))),
  c('vehicle-truck-green', 'Rally Truck (Green)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.', sp(1600, 330, 'AWD', 1.2, 2.8, 1.75, rev(6200, 7200, 3.9, 0.42))),
  c('vehicle-truck-purple', 'Rally Truck (Purple)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.', sp(1600, 330, 'AWD', 1.2, 2.8, 1.75, rev(6200, 7200, 3.9, 0.42))),
  c('police', 'Police Car', 'Service', 'AWD_GRIP', 'Royal Eswatini Police pursuit.', sp(1600, 250, 'RWD', 1.15, 2.75, 1.6, rev(6000, 6800, 3.6, 0.35))),
  c('ambulance', 'Ambulance', 'Service', 'HEAVY_CRUISER', 'Emergency response.', sp(3200, 140, 'RWD', 0.92, 3.3, 1.75, DIESEL)),
  c('firetruck', 'Fire Truck', 'Service', 'HEAVY_CRUISER', 'Biggest thing on the road.', sp(9000, 260, 'RWD', 0.88, 4.0, 2.0, LORRY)),
  c('garbage-truck', 'Garbage Truck', 'Service', 'HEAVY_CRUISER', 'Municipal heavy.', sp(8000, 210, 'RWD', 0.88, 3.9, 2.0, LORRY)),
  c('tractor', 'Tractor', 'Farm', 'HEAVY_CRUISER', 'Malkerns farm country.', sp(3200, 75, 'RWD', 0.9, 2.3, 1.7, rev(2100, 2600, 7, 0.8, { engineIdleRpm: 700 }))),
  c('tractor-shovel', 'Loader Tractor', 'Farm', 'HEAVY_CRUISER', 'Front shovel loader.', sp(4200, 80, 'AWD', 0.9, 2.3, 1.7, rev(2100, 2600, 7, 0.85, { engineIdleRpm: 700 }))),
  c('kart-oobi', 'Kart Bi', 'Kart', 'RWD_DRIFT', 'Pure drift fun.', sp(230, 21, 'RWD', 1.3, 1.25, 1.1, KART)),
  c('kart-oodi', 'Kart Di', 'Kart', 'RWD_DRIFT', 'Pure drift fun.', sp(230, 21, 'RWD', 1.3, 1.25, 1.1, KART)),
  c('kart-ooli', 'Kart Li', 'Kart', 'RWD_DRIFT', 'Pure drift fun.', sp(230, 21, 'RWD', 1.3, 1.25, 1.1, KART)),
  c('kart-oopi', 'Kart Pi', 'Kart', 'RWD_DRIFT', 'Pure drift fun.', sp(230, 21, 'RWD', 1.3, 1.25, 1.1, KART)),
  c('kart-oozi', 'Kart Zi', 'Kart', 'RWD_DRIFT', 'Pure drift fun.', sp(230, 21, 'RWD', 1.3, 1.25, 1.1, KART)),
];
export const CAR_CLASSES: CarClass[] = ['Local', 'Sports', 'Race', 'Everyday', 'SUV', 'Van & Truck', 'Service', 'Farm', 'Kart'];
/** Models used for ambient traffic on the real OSM roads. */
export const TRAFFIC_MODELS = ['taxi', 'van', 'sedan', 'hatchback-sports', 'suv', 'delivery', 'truck', 'sedan-sports', 'suv-luxury', 'van', 'taxi', 'ambulance', 'police'];
