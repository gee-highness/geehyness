import type { VehicleArchetypeId } from '../models/vehicle.types';

export type CarClass = 'Sports' | 'Race' | 'Everyday' | 'SUV' | 'Van & Truck' | 'Service' | 'Farm' | 'Kart';

export interface CarDef {
  id: string; name: string; cls: CarClass; file: string; archetype: VehicleArchetypeId;
  /** Model faces -Z (three.js Ferrari) instead of +Z (Kenney). */
  flip?: boolean; paintable?: boolean; blurb: string;
  /** Wheel nodes in order FL, FR, RL, RR. */
  wheels: [string, string, string, string];
}
const K: [string, string, string, string] = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];
const c = (id: string, name: string, cls: CarClass, archetype: VehicleArchetypeId, blurb: string, extra: Partial<CarDef> = {}): CarDef =>
  ({ id, name, cls, file: `assets/models/cars/${id}.glb`, archetype, blurb, wheels: K, ...extra });

export const CAR_CATALOG: CarDef[] = [
  c('ferrari', 'Ferrari 458 Italia', 'Sports', 'RWD_DRIFT', 'Mid-engine V8 icon. Paintable.', { flip: true, paintable: true, wheels: ['wheel_fl', 'wheel_fr', 'wheel_rl', 'wheel_rr'] }),
  c('sedan-sports', 'Sports Sedan', 'Sports', 'AWD_GRIP', 'Four-door pace with all-wheel grip.'),
  c('hatchback-sports', 'Hot Hatch', 'Sports', 'AWD_GRIP', 'Light, nimble and loud.'),
  c('race', 'GT Racer', 'Race', 'AWD_GRIP', 'Track-bred touring car.'),
  c('race-future', 'Future Racer', 'Race', 'AWD_GRIP', 'Low, wide and aero-heavy.'),
  c('sedan', 'City Sedan', 'Everyday', 'AWD_GRIP', 'The everyday Manzini commuter.'),
  c('taxi', 'Taxi', 'Everyday', 'AWD_GRIP', 'Cruise Nkosi Hlusaza St like a local.'),
  c('suv', 'SUV', 'SUV', 'HEAVY_CRUISER', 'Soft suspension, big presence.'),
  c('suv-luxury', 'Luxury SUV', 'SUV', 'HEAVY_CRUISER', 'Executive comfort for the Ezulwini run.'),
  c('van', 'Kombi Van', 'Van & Truck', 'HEAVY_CRUISER', 'The Eswatini minibus taxi silhouette.'),
  c('delivery', 'Delivery Van', 'Van & Truck', 'HEAVY_CRUISER', 'Matsapha logistics workhorse.'),
  c('delivery-flat', 'Flatbed Van', 'Van & Truck', 'HEAVY_CRUISER', 'Open-bed hauler.'),
  c('truck', 'Truck', 'Van & Truck', 'HEAVY_CRUISER', 'Heavy and unstoppable.'),
  c('truck-flat', 'Flatbed Truck', 'Van & Truck', 'HEAVY_CRUISER', 'Freight on the MR3.'),
  c('vehicle-truck-red', 'Rally Truck (Red)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.'),
  c('vehicle-truck-yellow', 'Rally Truck (Yellow)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.'),
  c('vehicle-truck-green', 'Rally Truck (Green)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.'),
  c('vehicle-truck-purple', 'Rally Truck (Purple)', 'Van & Truck', 'HEAVY_CRUISER', 'Racing-kit truck.'),
  c('police', 'Police Car', 'Service', 'AWD_GRIP', 'Royal Eswatini Police pursuit.'),
  c('ambulance', 'Ambulance', 'Service', 'HEAVY_CRUISER', 'Emergency response.'),
  c('firetruck', 'Fire Truck', 'Service', 'HEAVY_CRUISER', 'Biggest thing on the road.'),
  c('garbage-truck', 'Garbage Truck', 'Service', 'HEAVY_CRUISER', 'Municipal heavy.'),
  c('tractor', 'Tractor', 'Farm', 'HEAVY_CRUISER', 'Malkerns farm country.'),
  c('tractor-shovel', 'Loader Tractor', 'Farm', 'HEAVY_CRUISER', 'Front shovel loader.'),
  c('kart-oobi', 'Kart Bi', 'Kart', 'RWD_DRIFT', 'Pure drift fun.'),
  c('kart-oodi', 'Kart Di', 'Kart', 'RWD_DRIFT', 'Pure drift fun.'),
  c('kart-ooli', 'Kart Li', 'Kart', 'RWD_DRIFT', 'Pure drift fun.'),
  c('kart-oopi', 'Kart Pi', 'Kart', 'RWD_DRIFT', 'Pure drift fun.'),
  c('kart-oozi', 'Kart Zi', 'Kart', 'RWD_DRIFT', 'Pure drift fun.'),
];
export const CAR_CLASSES: CarClass[] = ['Sports', 'Race', 'Everyday', 'SUV', 'Van & Truck', 'Service', 'Farm', 'Kart'];
/** Models used for ambient traffic on the real OSM roads. */
export const TRAFFIC_MODELS = ['taxi', 'van', 'sedan', 'hatchback-sports', 'suv', 'delivery', 'truck', 'sedan-sports', 'suv-luxury', 'van', 'taxi', 'ambulance', 'police'];
