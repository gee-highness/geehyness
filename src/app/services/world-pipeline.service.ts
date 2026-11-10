import { Injectable, signal } from '@angular/core';
import { DistrictInfo, GroundClassDefinition } from '../models/world.types';

export const DISTRICTS: DistrictInfo[] = [
  {
    id: 'MANZINI',
    name: 'Manzini Centre',
    tagline: 'The bustling hub: dense street grid, vibrant markets, and Mzimene River bridge',
    elevationM: 650,
    centerPos: [0, 0],
    gpsLonLat: [31.3667, -26.4833],
    primarySurfaces: ['Urban Concrete', 'Asphalt Highway', 'River Sand & Gravel'],
    landmarks: ['Mzimene River Bridge', 'Main Bus Rank', 'Market Street Commercial Strip', 'Festival Garage Hub'],
    description: 'Home base and starting district. Dual-lane MR3 highway leads out over the Mzimene River bridge with tight commercial grid turns.',
  },
  {
    id: 'MATSAPHA',
    name: 'Matsapha Industrial',
    tagline: 'Expansive logistics yards, long straightaways, and wide warehouse drift lots',
    elevationM: 600,
    centerPos: [-240, -1600],
    gpsLonLat: [31.3050, -26.5050],
    primarySurfaces: ['Industrial Hardstanding', 'Cracked Concrete', 'Asphalt Express'],
    landmarks: ['Matsapha Estate Main Gate', 'Logistics Warehouses', 'MR18 / MR9 Roundabout', 'Container Yard Drift Park'],
    description: 'Industrial hub west of the city along the MR3. Features wide high-speed intersections, flat logistics hardstanding, and high-speed drift tracks.',
  },
  {
    id: 'FAIRVIEW',
    name: 'Fairview',
    tagline: 'Leafy northern suburb: hilly residential streets above the city',
    elevationM: 660,
    centerPos: [0, 0],
    gpsLonLat: [31.376, -26.478],
    primarySurfaces: ['Smooth Asphalt', 'Urban Concrete'],
    landmarks: ['Fairview North', 'Engen Fairview', 'Hillside Crescents'],
    description: 'Residential hills north of the CBD with short climbs, blind crests and tight crescents.',
  },
  {
    id: 'NGWANE_PARK',
    name: 'Ngwane Park',
    tagline: 'Southern township grid over the Mzimnene valley',
    elevationM: 600,
    centerPos: [0, 0],
    gpsLonLat: [31.373, -26.5228],
    primarySurfaces: ['Urban Concrete', 'Red Dirt & Soil'],
    landmarks: ['Ngwane Park Shops', 'Valley Descent', 'Township Grid'],
    description: 'Dense township streets south of the city, reached by a fast valley descent.',
  },
  {
    id: 'KWALUSENI',
    name: 'Kwaluseni',
    tagline: 'University town on the ridge above Matsapha',
    elevationM: 640,
    centerPos: [0, 0],
    gpsLonLat: [31.297, -26.482],
    primarySurfaces: ['Smooth Asphalt', 'Red Dirt & Soil'],
    landmarks: ['UNESWA Kwaluseni Campus', 'Mhlaleni Junction', 'Ridge Road'],
    description: 'Campus roads and busy kombi routes on the ridge north of the Matsapha estate.',
  },
  {
    id: 'AIRPORT',
    name: 'Matsapha Airport',
    tagline: 'Long flat apron and runway on the southern plain',
    elevationM: 630,
    centerPos: [0, 0],
    gpsLonLat: [31.3075, -26.529],
    primarySurfaces: ['Industrial Hardstanding', 'Asphalt Express'],
    landmarks: ['Runway 07/25', 'Terminal Apron', 'Airport Road'],
    description: 'The old Matsapha airfield: the longest straight in the map.',
  },
  {
    id: 'MONENI',
    name: 'Moneni & Eastern Gate',
    tagline: 'MR3 heading east out of the city toward the lowveld',
    elevationM: 560,
    centerPos: [0, 0],
    gpsLonLat: [31.41, -26.505],
    primarySurfaces: ['Asphalt Highway', 'Dry Bushveld Grass'],
    landmarks: ['MR3 East Dual Carriageway', 'Moneni Interchange', 'Lowveld Gate'],
    description: 'Fast dual carriageway dropping east out of Manzini.',
  },
];

export const GROUND_CLASSES: GroundClassDefinition[] = [
  { id: 1, name: 'dry_bushveld_grass', label: 'Dry Bushveld Grass', colorRgb: [201, 196, 138], gripMultiplier: 0.58, rollingResistance: 1.3, hapticSignature: { baseStrong: 0.2, baseWeak: 0.3, jitter: 0.15 } },
  { id: 2, name: 'highveld_grassland', label: 'Highveld Grassland', colorRgb: [169, 196, 122], gripMultiplier: 0.62, rollingResistance: 1.2, hapticSignature: { baseStrong: 0.18, baseWeak: 0.25, jitter: 0.12 } },
  { id: 3, name: 'valley_pasture', label: 'Valley Pasture', colorRgb: [127, 184, 90], gripMultiplier: 0.65, rollingResistance: 1.15, hapticSignature: { baseStrong: 0.15, baseWeak: 0.2, jitter: 0.1 } },
  { id: 4, name: 'cane_and_pineapple', label: 'Cane & Pineapple Soil', colorRgb: [94, 158, 74], gripMultiplier: 0.50, rollingResistance: 1.6, hapticSignature: { baseStrong: 0.25, baseWeak: 0.35, jitter: 0.2 } },
  { id: 5, name: 'timber_plantation', label: 'Timber Pine Needles', colorRgb: [63, 122, 58], gripMultiplier: 0.55, rollingResistance: 1.4, hapticSignature: { baseStrong: 0.22, baseWeak: 0.28, jitter: 0.18 } },
  { id: 6, name: 'rock_and_scree', label: 'Mountain Rock & Scree', colorRgb: [168, 159, 145], gripMultiplier: 0.72, rollingResistance: 1.25, hapticSignature: { baseStrong: 0.45, baseWeak: 0.6, jitter: 0.35 } },
  { id: 7, name: 'bare_soil_and_dirt', label: 'Red Dirt & Soil', colorRgb: [176, 140, 98], gripMultiplier: 0.70, rollingResistance: 1.35, hapticSignature: { baseStrong: 0.28, baseWeak: 0.38, jitter: 0.22 } },
  { id: 8, name: 'urban_ground', label: 'Urban Pavement', colorRgb: [140, 140, 148], gripMultiplier: 0.95, rollingResistance: 1.02, hapticSignature: { baseStrong: 0.08, baseWeak: 0.1, jitter: 0.04 } },
  { id: 9, name: 'industrial_hardstanding', label: 'Industrial Hardstanding', colorRgb: [110, 112, 120], gripMultiplier: 0.92, rollingResistance: 1.05, hapticSignature: { baseStrong: 0.15, baseWeak: 0.2, jitter: 0.08 } },
  { id: 10, name: 'river_sand_and_gravel', label: 'River Sand & Gravel', colorRgb: [214, 200, 160], gripMultiplier: 0.52, rollingResistance: 1.7, hapticSignature: { baseStrong: 0.35, baseWeak: 0.45, jitter: 0.28 } },
  { id: 11, name: 'asphalt_road', label: 'Smooth Tarmac Highway', colorRgb: [40, 42, 46], gripMultiplier: 1.0, rollingResistance: 1.0, hapticSignature: { baseStrong: 0.05, baseWeak: 0.05, jitter: 0.01 } },
  { id: 12, name: 'wetland_reed', label: 'Wetland & Mud', colorRgb: [110, 150, 110], gripMultiplier: 0.38, rollingResistance: 2.2, hapticSignature: { baseStrong: 0.32, baseWeak: 0.4, jitter: 0.25 } },
];

@Injectable({
  providedIn: 'root'
})
export class WorldPipelineService {
  readonly districts = signal<DistrictInfo[]>(DISTRICTS);
  readonly groundClasses = signal<GroundClassDefinition[]>(GROUND_CLASSES);
  readonly selectedDistrict = signal<DistrictInfo>(DISTRICTS[0]);

  // Origin UTM 36S coordinates (Manzini)
  readonly ORIGIN_EASTING = 336780.0;
  readonly ORIGIN_NORTHING = 7070150.0;

  public worldToGps(x: number, z: number): [number, number] {
    // Approximate local conversion from UTM 36S to WGS84 for the corridor
    const lat = -26.4966 - (z / 110574);
    const lon = 31.3826 + (x / (111320 * Math.cos(-26.4966 * Math.PI / 180)));
    return [Math.round(lon * 10000) / 10000, Math.round(lat * 10000) / 10000];
  }

  public getGroundClass(id: number): GroundClassDefinition {
    return this.groundClasses().find(c => c.id === id) || this.groundClasses()[10];
  }
}
