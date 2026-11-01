import * as THREE from 'three';
import { TextureGenerator } from './texture-generator';

export interface GroundQueryResult {
  height: number;
  normal: THREE.Vector3;
  surfaceClass: number;
  surfaceName: string;
}

export class WorldBuilder {
  public terrainMesh!: THREE.Mesh;
  public roadMeshes: THREE.Mesh[] = [];
  public waterMesh!: THREE.Mesh;
  public speedTrapMeshes: THREE.Group[] = [];
  public driftZoneMeshes: THREE.Group[] = [];
  public bridgeGroup = new THREE.Group();
  public landmarksGroup = new THREE.Group();
  public foliageGroup = new THREE.Group();
  public mountainBackdropGroup = new THREE.Group();
  public roadInfrastructureGroup = new THREE.Group();

  // Terrain bounds: 1400m east-west, 7600m north-south (Manzini to Ezulwini & Malagwane)
  private readonly WIDTH_X = 1400;
  private readonly LENGTH_Z = 7600;
  private readonly SEGMENTS_X = 110;
  private readonly SEGMENTS_Z = 280;

  // Real MR3 Highway spine points
  public highwayPoints = [
    new THREE.Vector3(0, 0, 400),        // Manzini South Approach
    new THREE.Vector3(0, 0, 0),          // Manzini Central Hub & Bus Rank
    new THREE.Vector3(0, 6.5, -140),     // Mzimene River Viaduct Deck
    new THREE.Vector3(-40, 2, -500),     // Manzini North Exit
    new THREE.Vector3(-140, -10, -1100), // Matsapha South Junction
    new THREE.Vector3(-240, -18, -1800), // Matsapha Industrial District
    new THREE.Vector3(-180, -12, -2600), // Malkerns MR103 Branch
    new THREE.Vector3(-320, 5, -3400),   // Lobamba Legislative Valley
    new THREE.Vector3(-550, 15, -4200),  // Ezulwini Valley Gateway
    new THREE.Vector3(-680, 25, -5100),  // Ezulwini Craft Markets & Hot Springs
    new THREE.Vector3(-820, 65, -6000),  // Malagwane Hill Base
    new THREE.Vector3(-980, 140, -7000), // Malagwane Summit toward Mbabane
  ];

  public highwayCurve = new THREE.CatmullRomCurve3(this.highwayPoints);

  public buildWorld(scene: THREE.Scene): void {
    this.createMountainBackdrop(scene);
    this.createTerrain(scene);
    this.createMzimeneRiverAndBridge(scene);
    this.createRoadNetwork(scene);
    this.createRoadInfrastructure(scene);
    this.createManziniTownCenter(scene);
    this.createDistrictLandmarks(scene);
    this.createAuthenticAfricanVegetation(scene);
    this.createInselbergsAndRocks(scene);
    this.createFestivalStructures(scene);
  }

  /**
   * Distant Mdzimba mountain ridges and inselberg peaks that frame the Ezulwini Valley.
   */
  private createMountainBackdrop(scene: THREE.Scene): void {
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x6f7d5c, // Highveld olive-green ridge
      roughness: 0.95,
      metalness: 0.05,
      flatShading: true,
    });

    // Eastern Mdzimba Mountain Ridge
    const eastRidgeGeo = new THREE.ConeGeometry(380, 320, 7);
    for (let i = 0; i < 9; i++) {
      const z = 200 - i * 850;
      const x = 580 + Math.sin(i * 1.7) * 90;
      const h = 260 + (i % 3) * 60;
      const ridge = new THREE.Mesh(eastRidgeGeo, mountainMat);
      ridge.position.set(x, h * 0.45, z);
      ridge.scale.set(1.4 + Math.sin(i), h / 300, 1.8);
      this.mountainBackdropGroup.add(ridge);
    }

    // Western Malagwane & Nyonyane Peaks
    const westRidgeGeo = new THREE.ConeGeometry(420, 360, 6);
    for (let i = 0; i < 9; i++) {
      const z = 100 - i * 850;
      const x = -720 - Math.cos(i * 1.5) * 110;
      const h = 290 + ((i + 1) % 3) * 70;
      const ridge = new THREE.Mesh(westRidgeGeo, mountainMat);
      ridge.position.set(x, h * 0.45, z);
      ridge.scale.set(1.5, h / 320, 1.7 + Math.cos(i) * 0.4);
      this.mountainBackdropGroup.add(ridge);
    }

    scene.add(this.mountainBackdropGroup);
  }

  /**
   * Generates continuous terrain with realistic African red earth & savanna grass textures.
   */
  private createTerrain(scene: THREE.Scene): void {
    const geo = new THREE.PlaneGeometry(this.WIDTH_X, this.LENGTH_Z, this.SEGMENTS_X, this.SEGMENTS_Z);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes['position'];
    const colors = new Float32Array(pos.count * 3);

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);

      const h = this.calculateRawTerrainHeight(x, z);
      pos.setY(i, h);

      // Colorize based on 12-class ground distribution
      const sClass = this.classifySurfaceAt(x, z, h);
      const rgb = this.getClassColor(sClass);
      colors[i * 3] = rgb[0];
      colors[i * 3 + 1] = rgb[1];
      colors[i * 3 + 2] = rgb[2];
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    // Real CC0 PBR grass/earth (Poly Haven) tiled across the world, tinted per district via vertex colours
    const terrainTexture = WorldBuilder.loadTiled('assets/tex/leafy_grass_diff.jpg', 220, 1200, true);
    const terrainNormal = WorldBuilder.loadTiled('assets/tex/leafy_grass_nor_gl.jpg', 220, 1200, false);
    const terrainRough = WorldBuilder.loadTiled('assets/tex/leafy_grass_rough.jpg', 220, 1200, false);

    const mat = new THREE.MeshStandardMaterial({
      map: terrainTexture,
      normalMap: terrainNormal,
      roughnessMap: terrainRough,
      vertexColors: true, // Multiplies the procedural red earth texture by district colors
      roughness: 0.88,
      metalness: 0.08,
    });

    this.terrainMesh = new THREE.Mesh(geo, mat);
    this.terrainMesh.name = 'EswatiniTerrain';
    this.terrainMesh.receiveShadow = true;
    scene.add(this.terrainMesh);
  }

  /** Loads a tiling image texture from /assets with anisotropic filtering. */
  public static loadTiled(url: string, rx: number, ry: number, srgb: boolean): THREE.Texture {
    const tex = new THREE.TextureLoader().load(url);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(rx, ry);
    tex.anisotropy = 8;
    if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  public calculateRawTerrainHeight(x: number, z: number): number {
    let baseElevation = 0;
    if (z > -1800) {
      baseElevation = (z / -1800) * -18;
    } else if (z > -4200) {
      const t = (-z - 1800) / 2400;
      baseElevation = -18 + t * 43;
    } else {
      const t = (-z - 4200) / 3400;
      baseElevation = 25 + Math.pow(t, 1.4) * 115;
    }

    // Valley ridges
    const valleyWidth = 280;
    const distFromCenter = Math.abs(x - this.getRoadCenterlineX(z));
    let valleyWalls = 0;
    if (distFromCenter > valleyWidth) {
      const wallDist = distFromCenter - valleyWidth;
      valleyWalls = Math.pow(wallDist / 110, 1.6) * 26;
    }

    // Natural rolling African savanna hills
    const hills = Math.sin(x * 0.007 + z * 0.004) * 9 + Math.cos(x * 0.013 - z * 0.01) * 6;
    let h = baseElevation + valleyWalls + hills;

    // Carve Mzimene River gorge
    const riverDist = Math.abs(z - (-140));
    if (riverDist < 75) {
      const riverDepth = (1 - riverDist / 75) * 13;
      h -= riverDepth;
    }

    // Smooth road embankment
    const distToRoad = this.distanceToHighway(x, z);
    const roadWidth = 14.0;
    const shoulderWidth = 20.0;

    if (distToRoad < roadWidth) {
      const roadH = this.getRoadHeight(z);
      h = roadH;
    } else if (distToRoad < roadWidth + shoulderWidth) {
      const roadH = this.getRoadHeight(z);
      const factor = (distToRoad - roadWidth) / shoulderWidth;
      const smoothFactor = factor * factor * (3 - 2 * factor);
      h = roadH * (1 - smoothFactor) + h * smoothFactor;
    }

    return h;
  }

  private getRoadCenterlineX(z: number): number {
    const t = Math.max(0, Math.min(1, (400 - z) / 8000));
    return this.highwayCurve.getPointAt(t).x;
  }

  public getRoadHeight(z: number): number {
    if (z > -220 && z < -60) {
      return 6.5; // Elevated on Mzimene Bridge Deck
    }
    const t = Math.max(0, Math.min(1, (400 - z) / 8000));
    return this.highwayCurve.getPointAt(t).y;
  }

  public distanceToHighway(x: number, z: number): number {
    return Math.abs(x - this.getRoadCenterlineX(z));
  }

  public classifySurfaceAt(x: number, z: number, h: number): number {
    const distToRoad = this.distanceToHighway(x, z);
    if (distToRoad <= 12.0) return 11; // Asphalt
    if (Math.abs(z - (-140)) < 45 && distToRoad > 12) return 10; // River sand
    if (z > -600 && Math.abs(x) < 450) return 8; // Urban ground
    if (z < -1100 && z > -2500 && Math.abs(x) < 550) return 9; // Industrial
    if (x > 180 && z < -2000 && z > -3400) return 4; // Malkerns cane
    if (Math.abs(x) > 360) return 6; // Rock & scree
    if (z < -5800) return 5; // Pine plantation
    if (h > 65) return 2; // Highveld grass
    if (z < -3400 && z > -5800) return 3; // Ezulwini pasture
    return 1; // Dry bushveld
  }

  private getClassColor(classId: number): [number, number, number] {
    switch (classId) {
      case 1:  return [1.55, 0.85, 0.62]; // Natural African earth multiplier
      case 2:  return [0.85, 0.98, 0.78]; // Highveld grass
      case 3:  return [0.75, 1.0, 0.65];  // Ezulwini green pasture
      case 4:  return [0.65, 0.95, 0.55]; // Malkerns cane green
      case 5:  return [0.45, 0.75, 0.45]; // Dark pine forest
      case 6:  return [0.92, 0.88, 0.85]; // Mountain rock
      case 7:  return [1.65, 0.8, 0.58];  // Red soil trail
      case 8:  return [0.9, 0.88, 0.84]; // Urban pavement
      case 9:  return [0.75, 0.78, 0.82]; // Industrial concrete
      case 10: return [1.1, 1.05, 0.92];  // River sand
      case 11: return [0.35, 0.35, 0.38]; // Road bed
      case 12: return [0.72, 0.88, 0.72]; // Wetland
      default: return [1.0, 0.95, 0.88];
    }
  }

  /**
   * Creates the real Mzimene River viaduct with concrete piers, water surface,
   * river boulders, and sandbanks.
   */
  private createMzimeneRiverAndBridge(scene: THREE.Scene): void {
    // Water surface
    const waterGeo = new THREE.PlaneGeometry(800, 60);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshPhysicalMaterial({
      color: 0x1e3a5f,
      roughness: 0.12,
      metalness: 0.1,
      transmission: 0.75,
      transparent: true,
      opacity: 0.88,
      ior: 1.333,
    });
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(0, -6.2, -140);
    scene.add(this.waterMesh);

    // River sandbanks and granite river boulders
    const boulderGeo = new THREE.DodecahedronGeometry(2.5);
    const boulderMat = new THREE.MeshStandardMaterial({ color: 0x78716c, roughness: 0.9 });
    for (let i = 0; i < 28; i++) {
      const bx = -150 + Math.random() * 300;
      const bz = -140 + (Math.random() - 0.5) * 35;
      const boulder = new THREE.Mesh(boulderGeo, boulderMat);
      boulder.position.set(bx, -5.5, bz);
      boulder.scale.set(1.2 + Math.random() * 0.8, 0.7 + Math.random() * 0.4, 1.1 + Math.random() * 0.7);
      boulder.rotation.set(Math.random(), Math.random(), Math.random());
      scene.add(boulder);
    }

    // Concrete Viaduct Deck (Four-lane split)
    const concreteMat = new THREE.MeshStandardMaterial({
      color: 0x9ca3af,
      roughness: 0.8,
      metalness: 0.1,
    });

    const bridgeDeckGeo = new THREE.BoxGeometry(23, 1.4, 160);
    const bridgeDeck = new THREE.Mesh(bridgeDeckGeo, concreteMat);
    bridgeDeck.position.set(0, 6.0, -140);
    bridgeDeck.receiveShadow = true;
    this.bridgeGroup.add(bridgeDeck);

    // Reinforced Concrete Twin Support Piers
    const pierGeo = new THREE.BoxGeometry(3.5, 14, 5.0);
    const pierPositions = [-60, -20, 20, 60];
    for (const pz of pierPositions) {
      const pierLeft = new THREE.Mesh(pierGeo, concreteMat);
      pierLeft.position.set(-7, 0, -140 + pz);
      const pierRight = new THREE.Mesh(pierGeo, concreteMat);
      pierRight.position.set(7, 0, -140 + pz);
      this.bridgeGroup.add(pierLeft, pierRight);
    }

    // Heavy steel highway crash barrier on bridge sides
    const steelRailMat = new THREE.MeshStandardMaterial({
      color: 0xd4d4d8,
      metalness: 0.85,
      roughness: 0.2,
    });
    const railGeo = new THREE.BoxGeometry(0.4, 1.1, 160);
    const railL = new THREE.Mesh(railGeo, steelRailMat);
    railL.position.set(-11.2, 7.2, -140);
    const railR = new THREE.Mesh(railGeo, steelRailMat);
    railR.position.set(11.2, 7.2, -140);
    this.bridgeGroup.add(railL, railR);

    // Bridge Abutment Walls
    const abutmentGeo = new THREE.BoxGeometry(26, 12, 10);
    const abutmentNorth = new THREE.Mesh(abutmentGeo, concreteMat);
    abutmentNorth.position.set(0, 1.0, -220);
    const abutmentSouth = new THREE.Mesh(abutmentGeo, concreteMat);
    abutmentSouth.position.set(0, 1.0, -60);
    this.bridgeGroup.add(abutmentNorth, abutmentSouth);

    scene.add(this.bridgeGroup);
  }

  /**
   * Generates the textured 4-lane MR3 highway with Southern African markings,
   * New Jersey concrete median barrier, cat-eye reflectors, and streetlights.
   */
  private createRoadNetwork(scene: THREE.Scene): void {
    const roadPointsCount = 260;
    const curvePoints = this.highwayCurve.getSpacedPoints(roadPointsCount);

    const roadGeo = new THREE.BufferGeometry();
    const vertices: number[] = [];
    const uvs: number[] = [];
    const halfWidth = 11.2; // 4-lane width + paved shoulders

    for (let i = 0; i < curvePoints.length; i++) {
      const pt = curvePoints[i];
      let y = pt.y;
      if (pt.z > -220 && pt.z < -60) {
        y = 6.75; // Sits flush on bridge deck
      } else {
        y += 0.08;
      }

      const next = curvePoints[Math.min(i + 1, curvePoints.length - 1)];
      const prev = curvePoints[Math.max(i - 1, 0)];
      const tangent = next.clone().sub(prev).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();

      const leftPt = pt.clone().add(normal.clone().multiplyScalar(-halfWidth));
      const rightPt = pt.clone().add(normal.clone().multiplyScalar(halfWidth));

      vertices.push(leftPt.x, y, leftPt.z);
      vertices.push(rightPt.x, y, rightPt.z);

      // UV mapping: U goes 0 to 1 across road width, V repeats every ~25m
      const v = i * 0.38;
      uvs.push(0, v);
      uvs.push(1, v);
    }

    const indices: number[] = [];
    for (let i = 0; i < curvePoints.length - 1; i++) {
      const bl = i * 2;
      const br = i * 2 + 1;
      const tl = (i + 1) * 2;
      const tr = (i + 1) * 2 + 1;
      indices.push(bl, tl, br);
      indices.push(br, tl, tr);
    }

    roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    roadGeo.setIndex(indices);
    roadGeo.computeVertexNormals();

    const roadTexture = TextureGenerator.createHighwayTexture();
    const roadNormal = WorldBuilder.loadTiled('assets/tex/asphalt_02_nor_gl.jpg', 3, 4, false);

    const roadMat = new THREE.MeshStandardMaterial({
      map: roadTexture,
      normalMap: roadNormal,
      normalScale: new THREE.Vector2(0.8, 0.8),
      side: THREE.DoubleSide,
      roughnessMap: WorldBuilder.loadTiled('assets/tex/asphalt_02_rough.jpg', 3, 4, false),
      roughness: 0.9,
      metalness: 0.15,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.name = 'MR3_Highway_Pavement';
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);
    this.roadMeshes.push(roadMesh);

    // Concrete New Jersey Median Barrier with Reflectors
    const barrierMat = new THREE.MeshStandardMaterial({ color: 0x71717a, roughness: 0.8 });
    const reflectorMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b }); // Amber reflector tab
    const barrierGeo = new THREE.BoxGeometry(0.8, 0.9, 14);
    const reflectorGeo = new THREE.BoxGeometry(0.85, 0.15, 0.3);

    for (let i = 2; i < curvePoints.length - 2; i += 3) {
      const pt = curvePoints[i];
      const next = curvePoints[i + 1];
      const angle = Math.atan2(next.x - pt.x, next.z - pt.z);

      const barrier = new THREE.Mesh(barrierGeo, barrierMat);
      barrier.position.set(pt.x, pt.y + 0.45, pt.z);
      barrier.rotation.y = angle;
      barrier.castShadow = true;
      this.roadInfrastructureGroup.add(barrier);

      // Amber reflector on barrier top
      const reflector = new THREE.Mesh(reflectorGeo, reflectorMat);
      reflector.position.set(pt.x, pt.y + 0.85, pt.z);
      reflector.rotation.y = angle;
      this.roadInfrastructureGroup.add(reflector);
    }

    // Galvanized Street Light Poles along Median
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8, roughness: 0.3 });
    const lampBulbMat = new THREE.MeshBasicMaterial({ color: 0xfef08a }); // Warm sodium/LED light
    const poleGeo = new THREE.CylinderGeometry(0.12, 0.18, 9, 8);
    const armGeo = new THREE.BoxGeometry(3.6, 0.12, 0.15);
    const bulbGeo = new THREE.BoxGeometry(0.6, 0.15, 0.3);

    for (let i = 4; i < curvePoints.length - 4; i += 9) {
      const pt = curvePoints[i];
      const poleGroup = new THREE.Group();
      poleGroup.position.set(pt.x, pt.y, pt.z);

      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.y = 4.5;
      pole.castShadow = true;
      poleGroup.add(pole);

      // Dual-arm outreach
      const arm = new THREE.Mesh(armGeo, poleMat);
      arm.position.y = 9.0;
      poleGroup.add(arm);

      // Left & right lamp heads
      const bulbL = new THREE.Mesh(bulbGeo, lampBulbMat);
      bulbL.position.set(-1.6, 8.85, 0);
      const bulbR = new THREE.Mesh(bulbGeo, lampBulbMat);
      bulbR.position.set(1.6, 8.85, 0);
      poleGroup.add(bulbL, bulbR);

      this.roadInfrastructureGroup.add(poleGroup);
    }
  }

  /**
   * Overhead Cantilever Sign Gantries & Eswatini Speed / Hazard Warning signs.
   */
  private createRoadInfrastructure(scene: THREE.Scene): void {
    // 1. Manzini Overhead Highway Gantry
    this.createGantry(
      new THREE.Vector3(0, 0, 160),
      'Manzini Central',
      'MR3',
      '2 km | BUS RANK & MARKET',
      'KEEP LEFT'
    );

    // 2. Matsapha Industrial Gantry
    this.createGantry(
      new THREE.Vector3(-140, -10, -1000),
      'Matsapha Industrial',
      'MR3',
      '4 km | MBABANE 36 km',
      'TRUCK ROUTE'
    );

    // 3. Malkerns Junction Gantry
    this.createGantry(
      new THREE.Vector3(-180, -12, -2400),
      'Malkerns Valley',
      'MR103',
      'MAHLANYA MARKET 3 km',
      'FARM ROUTE'
    );

    // 4. Ezulwini Valley Entrance Gantry
    this.createGantry(
      new THREE.Vector3(-550, 15, -4000),
      'Ezulwini Valley',
      'MR3',
      'HOT SPRINGS & CRAFT MARKETS',
      'SCENIC BYWAY'
    );

    // 5. Malagwane Hill Summit Gantry
    this.createGantry(
      new THREE.Vector3(-820, 65, -5800),
      'Mbabane & Ngwenya',
      'MR3',
      'STEEP 12% DESCENT AHEAD',
      'USE LOW GEAR'
    );

    // Roadside Hazard Signs (Yellow Diamonds)
    this.createRoadsideSign(new THREE.Vector3(13, 0.5, 260), 'SLOW_DOWN');
    this.createRoadsideSign(new THREE.Vector3(-13, 0.5, 80), 'SLOW_DOWN');
    this.createRoadsideSign(new THREE.Vector3(-153, -9.5, -920), 'CATTLE');
    this.createRoadsideSign(new THREE.Vector3(-193, -11.5, -2300), 'SLOW_DOWN');
    this.createRoadsideSign(new THREE.Vector3(-833, 65.5, -5700), 'STEEP_GRADE');

    scene.add(this.roadInfrastructureGroup);
  }

  private createGantry(
    pos: THREE.Vector3,
    dest: string,
    route: string,
    dist: string,
    subText?: string
  ): void {
    const gantry = new THREE.Group();
    gantry.position.copy(pos);

    const metalMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.9, roughness: 0.25 });
    // Steel truss pillars
    const pillarGeo = new THREE.CylinderGeometry(0.35, 0.4, 9, 8);
    const pillarL = new THREE.Mesh(pillarGeo, metalMat);
    pillarL.position.set(-13, 4.5, 0);
    const pillarR = new THREE.Mesh(pillarGeo, metalMat);
    pillarR.position.set(13, 4.5, 0);
    gantry.add(pillarL, pillarR);

    // Horizontal truss
    const beamGeo = new THREE.BoxGeometry(27, 0.9, 0.8);
    const beam = new THREE.Mesh(beamGeo, metalMat);
    beam.position.y = 8.5;
    gantry.add(beam);

    // Signboard
    const signTexture = TextureGenerator.createHighwaySignTexture(dest, route, dist, subText);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture });
    const signGeo = new THREE.PlaneGeometry(12, 3.6);
    const signBoard = new THREE.Mesh(signGeo, signMat);
    signBoard.position.set(0, 8.5, 0.45);
    gantry.add(signBoard);

    this.roadInfrastructureGroup.add(gantry);
  }

  private createRoadsideSign(pos: THREE.Vector3, hazard: 'SLOW_DOWN' | 'CATTLE' | 'STEEP_GRADE'): void {
    const group = new THREE.Group();
    group.position.copy(pos);

    const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.8 });
    const pole = new THREE.Mesh(poleGeo, poleMat);
    pole.position.y = 1.6;
    group.add(pole);

    const signTexture = TextureGenerator.createHazardSignTexture(hazard);
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture, side: THREE.DoubleSide });
    const signGeo = new THREE.PlaneGeometry(1.6, 1.6);
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, 2.6, 0);
    group.add(sign);

    this.roadInfrastructureGroup.add(group);
  }

  /**
   * Creates the bustling Manzini Town Center:
   * 1. Manzini Bus Rank & Kombi Taxi Terminal
   * 2. Parked Toyota HiAce Kombis with authentic Swazi blue taxi stripe
   * 3. Fruit vendor market stalls with striped canvas canopies & pineapple crates
   * 4. Commercial buildings & Eswatini Petroleum filling station
   */
  private createManziniTownCenter(scene: THREE.Scene): void {
    const manziniGroup = new THREE.Group();
    manziniGroup.position.set(0, 0, 0);

    // 1. Manzini Bus Rank Terminal Canopy
    const terminalGroup = new THREE.Group();
    terminalGroup.position.set(45, 0, 80);

    const concretePadGeo = new THREE.BoxGeometry(60, 0.3, 90);
    const concretePadMat = new THREE.MeshStandardMaterial({ color: 0x52525b, roughness: 0.85 });
    const pad = new THREE.Mesh(concretePadGeo, concretePadMat);
    pad.position.y = 0.15;
    pad.receiveShadow = true;
    terminalGroup.add(pad);

    // Curved corrugated tin shelter
    const shelterRoofGeo = new THREE.CylinderGeometry(16, 16, 75, 16, 1, false, 0, Math.PI);
    const tinMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, metalness: 0.6, roughness: 0.4 });
    const roof = new THREE.Mesh(shelterRoofGeo, tinMat);
    roof.rotation.z = Math.PI / 2;
    roof.rotation.x = Math.PI / 2;
    roof.position.set(0, 8.5, 0);
    terminalGroup.add(roof);

    // Support columns
    const colMat = new THREE.MeshStandardMaterial({ color: 0x71717a, metalness: 0.7 });
    const colGeo = new THREE.CylinderGeometry(0.25, 0.25, 7.5, 8);
    for (let cz = -30; cz <= 30; cz += 15) {
      const c1 = new THREE.Mesh(colGeo, colMat);
      c1.position.set(-10, 3.75, cz);
      const c2 = new THREE.Mesh(colGeo, colMat);
      c2.position.set(10, 3.75, cz);
      terminalGroup.add(c1, c2);
    }

    // Terminal Sign Banner: "MANZINI CENTRAL BUS & KOMBI RANK"
    const terminalBannerTexture = TextureGenerator.createShopSignTexture(
      'MANZINI BUS & KOMBI RANK',
      'MAIN INTER-CITY TERMINAL',
      '#1e3a8a',
      '#ffffff'
    );
    const bannerMat = new THREE.MeshBasicMaterial({ map: terminalBannerTexture });
    const bannerGeo = new THREE.PlaneGeometry(18, 4.5);
    const banner = new THREE.Mesh(bannerGeo, bannerMat);
    banner.position.set(0, 10.5, 38);
    terminalGroup.add(banner);

    // 2. Parked Toyota HiAce "Kombis" in Taxi Bays
    for (let k = 0; k < 5; k++) {
      const kombi = this.createKombiTaxi();
      kombi.position.set(-14 + (k % 2) * 12, 0.2, -25 + k * 14);
      kombi.rotation.y = Math.PI / 2;
      terminalGroup.add(kombi);
    }

    manziniGroup.add(terminalGroup);

    // 3. Manzini Open-Air Fresh Produce & Craft Market Stalls
    const marketGroup = new THREE.Group();
    marketGroup.position.set(-45, 0, 70);

    const stallColors: ('red' | 'blue' | 'yellow' | 'green')[] = ['red', 'blue', 'yellow', 'green'];
    for (let s = 0; s < 8; s++) {
      const stall = this.createMarketStall(stallColors[s % 4]);
      stall.position.set((s % 2) * 12 - 6, 0, Math.floor(s / 2) * 16 - 24);
      marketGroup.add(stall);
    }

    const marketBannerTex = TextureGenerator.createShopSignTexture(
      'MANZINI CENTRAL MARKET',
      'FRESH PINEAPPLES & HANDICRAFTS',
      '#15803d',
      '#fef08a'
    );
    const marketSign = new THREE.Mesh(new THREE.PlaneGeometry(16, 3.5), new THREE.MeshBasicMaterial({ map: marketBannerTex }));
    marketSign.position.set(0, 5.5, 32);
    marketGroup.add(marketSign);

    manziniGroup.add(marketGroup);

    // 4. Eswatini Petroleum Filling Station
    const petrolStation = this.createPetrolStation();
    petrolStation.position.set(-50, 0, -80);
    manziniGroup.add(petrolStation);

    // 5. Swazi Auto Spares & Commercial Building
    const autoSpares = this.createCommercialBuilding('SWAZI AUTO SPARES & TYRES', 'GENUINE PARTS & SERVICES', 0x1e293b);
    autoSpares.position.set(50, 0, -60);
    manziniGroup.add(autoSpares);

    scene.add(manziniGroup);
    this.landmarksGroup.add(manziniGroup);
  }

  /**
   * Procedural Toyota HiAce Minibus "Kombi" Taxi with authentic blue stripe & taxi sign.
   */
  private createKombiTaxi(): THREE.Group {
    const kombi = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.35 });
    const blueStripeMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1, metalness: 0.8 });
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x27272a, roughness: 0.9 });

    // Lower white body
    const lowerBodyGeo = new THREE.BoxGeometry(1.8, 0.7, 4.4);
    const lower = new THREE.Mesh(lowerBodyGeo, bodyMat);
    lower.position.y = 0.65;
    kombi.add(lower);

    // Iconic blue taxi middle stripe
    const stripeGeo = new THREE.BoxGeometry(1.82, 0.18, 4.42);
    const stripe = new THREE.Mesh(stripeGeo, blueStripeMat);
    stripe.position.y = 0.98;
    kombi.add(stripe);

    // Cabin with passenger windows
    const cabinGeo = new THREE.BoxGeometry(1.75, 0.85, 3.8);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.45, -0.1);
    kombi.add(cabin);

    // White roof
    const roofGeo = new THREE.BoxGeometry(1.76, 0.12, 3.8);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.9, -0.1);
    kombi.add(roof);

    // Yellow roof Taxi Sign
    const taxiSignGeo = new THREE.BoxGeometry(0.8, 0.25, 0.3);
    const taxiSignMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const taxiSign = new THREE.Mesh(taxiSignGeo, taxiSignMat);
    taxiSign.position.set(0, 2.05, 0.8);
    kombi.add(taxiSign);

    // Bumpers
    const bumperFront = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.3, 0.2), bumperMat);
    bumperFront.position.set(0, 0.45, 2.25);
    const bumperRear = new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.3, 0.2), bumperMat);
    bumperRear.position.set(0, 0.45, -2.25);
    kombi.add(bumperFront, bumperRear);

    // 4 Wheels
    const tireGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12);
    tireGeo.rotateZ(Math.PI / 2);
    const wheelPositions = [
      [-0.9, 0.36, 1.3],
      [0.9, 0.36, 1.3],
      [-0.9, 0.36, -1.3],
      [0.9, 0.36, -1.3],
    ];
    for (const [wx, wy, wz] of wheelPositions) {
      const wheel = new THREE.Mesh(tireGeo, wheelMat);
      wheel.position.set(wx, wy, wz);
      kombi.add(wheel);
    }

    return kombi;
  }

  /**
   * Market Vendor Stall with striped canvas awning, wooden display tables, and fruit crates.
   */
  private createMarketStall(canopyColor: 'red' | 'blue' | 'yellow' | 'green'): THREE.Group {
    const stall = new THREE.Group();

    // Wooden Table Frame
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.9 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(5.0, 0.15, 3.5), woodMat);
    tableTop.position.y = 1.0;
    stall.add(tableTop);

    // Legs
    const legGeo = new THREE.CylinderGeometry(0.08, 0.08, 1.0, 6);
    for (const [lx, lz] of [[-2.2, -1.5], [2.2, -1.5], [-2.2, 1.5], [2.2, 1.5]]) {
      const leg = new THREE.Mesh(legGeo, woodMat);
      leg.position.set(lx, 0.5, lz);
      stall.add(leg);
    }

    // Striped Canvas Awning Roof
    const canopyTexture = TextureGenerator.createMarketCanopyTexture(canopyColor);
    const canopyMat = new THREE.MeshStandardMaterial({
      map: canopyTexture,
      roughness: 0.8,
      side: THREE.DoubleSide,
    });
    const canopyRoof = new THREE.Mesh(new THREE.ConeGeometry(3.6, 1.2, 4), canopyMat);
    canopyRoof.position.y = 2.8;
    canopyRoof.rotation.y = Math.PI / 4;
    stall.add(canopyRoof);

    // Produce Crates (Swazi Pineapples & Fruit)
    const fruitMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.7 });
    for (let p = 0; p < 3; p++) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 0.9), fruitMat);
      crate.position.set(-1.4 + p * 1.4, 1.25, 0);
      stall.add(crate);
    }

    return stall;
  }

  /**
   * Eswatini Petroleum Filling Station with large illuminated canopy and pump islands.
   */
  private createPetrolStation(): THREE.Group {
    const station = new THREE.Group();

    // Large Station Overhead Canopy
    const canopyGeo = new THREE.BoxGeometry(32, 1.4, 24);
    const canopyMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.4, roughness: 0.3 });
    const canopy = new THREE.Mesh(canopyGeo, canopyMat);
    canopy.position.y = 6.5;
    canopy.castShadow = true;
    station.add(canopy);

    // 4 Support Pillars
    const pillarGeo = new THREE.CylinderGeometry(0.5, 0.5, 6.5, 8);
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const [px, pz] of [[-10, -7], [10, -7], [-10, 7], [10, 7]]) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(px, 3.25, pz);
      station.add(pillar);
    }

    // Fuel Pump Islands
    const pumpGeo = new THREE.BoxGeometry(1.6, 2.2, 0.8);
    const pumpMat = new THREE.MeshStandardMaterial({ color: 0xef4444 });
    for (const [px, pz] of [[-6, 0], [6, 0]]) {
      const pump = new THREE.Mesh(pumpGeo, pumpMat);
      pump.position.set(px, 1.1, pz);
      station.add(pump);
    }

    // Price Totem Sign
    const signTex = TextureGenerator.createShopSignTexture('ESWATINI PETROLEUM', 'DIESEL 50ppm / UNLEADED 95', '#eab308', '#000000');
    const totem = new THREE.Mesh(new THREE.PlaneGeometry(6, 9), new THREE.MeshBasicMaterial({ map: signTex }));
    totem.position.set(16, 5.0, 12);
    station.add(totem);

    return station;
  }

  /**
   * Commercial shopfront building.
   */
  private createCommercialBuilding(title: string, sub: string, colorHex: number): THREE.Group {
    const bldg = new THREE.Group();

    const mainGeo = new THREE.BoxGeometry(36, 12, 28);
    const bldgMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.2 });
    const mesh = new THREE.Mesh(mainGeo, bldgMat);
    mesh.position.y = 6.0;
    mesh.castShadow = true;
    bldg.add(mesh);

    // Signboard banner
    const signTex = TextureGenerator.createShopSignTexture(title, sub, '#ffffff', '#0f172a');
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(24, 4), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 9.5, 14.2);
    bldg.add(sign);

    return bldg;
  }

  /**
   * Industrial & Resort landmarks for Matsapha, Malkerns, and Ezulwini.
   */
  private createDistrictLandmarks(scene: THREE.Scene): void {
    // 1. Matsapha Industrial Warehouses & Logistics Depots
    const whMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5, roughness: 0.4 });
    const warehouseGeo = new THREE.BoxGeometry(75, 18, 110);
    const wh1 = new THREE.Mesh(warehouseGeo, whMat);
    wh1.position.set(-360, 9, -1700);
    wh1.castShadow = true;
    const wh2 = new THREE.Mesh(warehouseGeo, whMat);
    wh2.position.set(-380, 9, -2100);
    wh2.castShadow = true;

    // Matsapha Logistics Depot Sign
    const matsaphaSignTex = TextureGenerator.createShopSignTexture(
      'MATSAPHA DRY PORT & LOGISTICS',
      'ESWATINI RAILWAYS FREIGHT TERMINAL',
      '#0f172a',
      '#38bdf8'
    );
    const matsaphaSign = new THREE.Mesh(new THREE.PlaneGeometry(36, 6), new THREE.MeshBasicMaterial({ map: matsaphaSignTex }));
    matsaphaSign.position.set(-320, 12, -1640);
    this.landmarksGroup.add(wh1, wh2, matsaphaSign);

    // 2. Malkerns Valley Sugarcane & Farm Stalls
    const malkernsSignTex = TextureGenerator.createShopSignTexture(
      'MALKERNS COUNTRY BAZAAR',
      'PINEAPPLES • CANE SUGAR • CRAFTS',
      '#166534',
      '#fef08a'
    );
    const malkernsSign = new THREE.Mesh(new THREE.PlaneGeometry(28, 5.5), new THREE.MeshBasicMaterial({ map: malkernsSignTex }));
    malkernsSign.position.set(160, 5, -2500);
    this.landmarksGroup.add(malkernsSign);

    // 3. Ezulwini Valley Resort Hotel Towers & Craft Stops
    const resortMat = new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.25, metalness: 0.25 });
    const towerGeo = new THREE.BoxGeometry(45, 60, 45);
    const resortTower = new THREE.Mesh(towerGeo, resortMat);
    resortTower.position.set(-540, 35, -4600);
    resortTower.castShadow = true;

    const ezulwiniSignTex = TextureGenerator.createShopSignTexture(
      'ROYAL SWAZI SPA & CASINO',
      'EZULWINI VALLEY OF HEAVEN',
      '#7c2d12',
      '#fde047'
    );
    const ezulwiniSign = new THREE.Mesh(new THREE.PlaneGeometry(32, 6.5), new THREE.MeshBasicMaterial({ map: ezulwiniSignTex }));
    ezulwiniSign.position.set(-510, 22, -4570);
    this.landmarksGroup.add(resortTower, ezulwiniSign);

    scene.add(this.landmarksGroup);
  }

  /**
   * Authentic African Flora:
   * 1. Umbrella Acacia Trees (Vachellia tortilis) with multi-tiered flat canopies
   * 2. Lilac-purple blooming Jacaranda Trees lining the avenue
   * 3. Pine/eucalyptus trees on high slopes
   */
  private createAuthenticAfricanVegetation(scene: THREE.Scene): void {
    const treeGroup = new THREE.Group();

    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x451a03, roughness: 0.9 });
    const acaciaFoliageMat = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.82 });
    const jacarandaFoliageMat = new THREE.MeshStandardMaterial({ color: 0xa855f7, roughness: 0.8 }); // Beautiful purple blossoms!
    const pineFoliageMat = new THREE.MeshStandardMaterial({ color: 0x14532d, roughness: 0.85 });

    const totalTrees = 520;

    for (let i = 0; i < totalTrees; i++) {
      const z = -(Math.random() * 7300);
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = 24 + Math.random() * 420;
      const roadCenterX = this.getRoadCenterlineX(z);
      const x = roadCenterX + side * dist;
      const y = this.calculateRawTerrainHeight(x, z);

      const tree = new THREE.Group();
      tree.position.set(x, y, z);

      if (z > -800 && Math.random() < 0.35) {
        // Jacaranda tree in urban Manzini / roadsides
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.45, 5, 6), trunkMat);
        trunk.position.y = 2.5;
        trunk.castShadow = true;
        tree.add(trunk);

        const canopy = new THREE.Mesh(new THREE.DodecahedronGeometry(3.2), jacarandaFoliageMat);
        canopy.position.y = 6.0;
        canopy.castShadow = true;
        tree.add(canopy);
      } else if (z < -5800) {
        // Highveld Pine tree on Malagwane Hill
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.45, 8, 6), trunkMat);
        trunk.position.y = 4.0;
        trunk.castShadow = true;
        tree.add(trunk);

        for (let tier = 0; tier < 3; tier++) {
          const pineCone = new THREE.Mesh(new THREE.ConeGeometry(3.2 - tier * 0.7, 3.5, 7), pineFoliageMat);
          pineCone.position.y = 6.0 + tier * 2.2;
          pineCone.castShadow = true;
          tree.add(pineCone);
        }
      } else {
        // Umbrella Acacia Tree (Vachellia tortilis)
        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.48, 5.5, 6), trunkMat);
        trunk.position.y = 2.75;
        trunk.castShadow = true;
        tree.add(trunk);

        // Branching arms
        const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 5), trunkMat);
        arm1.position.set(1.1, 4.8, 0.5);
        arm1.rotation.z = -0.55;
        tree.add(arm1);

        const arm2 = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 3.2, 5), trunkMat);
        arm2.position.set(-1.1, 4.8, -0.4);
        arm2.rotation.z = 0.55;
        tree.add(arm2);

        // Wide flat-topped acacia canopy tiers
        const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.6, 0.9, 8), acaciaFoliageMat);
        tier1.position.y = 6.5;
        tier1.castShadow = true;
        tree.add(tier1);

        const tier2 = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 3.4, 0.7, 8), acaciaFoliageMat);
        tier2.position.y = 7.4;
        tier2.castShadow = true;
        tree.add(tier2);
      }

      treeGroup.add(tree);
    }

    scene.add(treeGroup);
    this.foliageGroup = treeGroup;
  }

  /**
   * Granite Kopjes & Rocky Inselbergs: Weathered African boulder outcrops.
   */
  private createInselbergsAndRocks(scene: THREE.Scene): void {
    const rockGroup = new THREE.Group();
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0x854d0e, // Warm granite with lichen patina
      roughness: 0.92,
      metalness: 0.05,
    });
    const rockGeo = new THREE.DodecahedronGeometry(7.0);

    for (let i = 0; i < 48; i++) {
      const z = -(Math.random() * 7200);
      const side = Math.random() < 0.5 ? -1 : 1;
      const dist = 55 + Math.random() * 380;
      const roadCenterX = this.getRoadCenterlineX(z);
      const x = roadCenterX + side * dist;
      const y = this.calculateRawTerrainHeight(x, z);

      const kopje = new THREE.Group();
      kopje.position.set(x, y - 1.5, z);

      // Stack 2-3 boulders into an inselberg outcrop
      for (let b = 0; b < 3; b++) {
        const boulder = new THREE.Mesh(rockGeo, rockMat);
        boulder.position.set((b - 1) * 4.5, b * 3.2, (b % 2) * 3);
        boulder.scale.set(1.0 + Math.random() * 0.5, 0.7 + Math.random() * 0.4, 1.1 + Math.random() * 0.5);
        boulder.rotation.set(Math.random(), Math.random(), Math.random());
        boulder.castShadow = true;
        boulder.receiveShadow = true;
        kopje.add(boulder);
      }

      rockGroup.add(kopje);
    }

    scene.add(rockGroup);
  }

  /**
   * Places speed trap radar flashes and drift zone holographic markers.
   */
  private createFestivalStructures(scene: THREE.Scene): void {
    const archMat = new THREE.MeshBasicMaterial({ color: 0xfacc15 });
    const archGeo = new THREE.BoxGeometry(24, 0.8, 1.2);

    // Speed Trap 1: Mzimene Viaduct
    const trap1 = new THREE.Group();
    trap1.position.set(0, 11.5, -120);
    const beam1 = new THREE.Mesh(archGeo, archMat);
    trap1.add(beam1);
    scene.add(trap1);
    this.speedTrapMeshes.push(trap1);

    // Speed Trap 2: Matsapha Industrial
    const trap2 = new THREE.Group();
    trap2.position.set(-240, -9.5, -1800);
    const beam2 = new THREE.Mesh(archGeo, archMat);
    trap2.add(beam2);
    scene.add(trap2);
    this.speedTrapMeshes.push(trap2);

    // Drift Zone Holographic Arches (Cyan Neon)
    const driftMat = new THREE.MeshBasicMaterial({ color: 0x06b6d4 });
    const driftArchStart = new THREE.Mesh(archGeo, driftMat);
    driftArchStart.position.set(-580, 24, -3600);
    const driftArchEnd = new THREE.Mesh(archGeo, driftMat);
    driftArchEnd.position.set(-640, 32, -4400);
    scene.add(driftArchStart, driftArchEnd);
  }

  public queryGround(x: number, z: number): GroundQueryResult {
    const height = this.calculateRawTerrainHeight(x, z);

    const eps = 0.5;
    const hL = this.calculateRawTerrainHeight(x - eps, z);
    const hR = this.calculateRawTerrainHeight(x + eps, z);
    const hD = this.calculateRawTerrainHeight(x, z - eps);
    const hU = this.calculateRawTerrainHeight(x, z + eps);

    const normal = new THREE.Vector3(hL - hR, 2 * eps, hD - hU).normalize();
    const surfaceClass = this.classifySurfaceAt(x, z, height);

    let surfaceName = 'Asphalt Highway';
    switch (surfaceClass) {
      case 11: surfaceName = 'MR3 Asphalt'; break;
      case 8:  surfaceName = 'Manzini Urban'; break;
      case 9:  surfaceName = 'Industrial Ground'; break;
      case 6:  surfaceName = 'Granite Rock'; break;
      case 7:  surfaceName = 'Red Loam Trail'; break;
      case 4:  surfaceName = 'Sugarcane Soil'; break;
      case 5:  surfaceName = 'Highveld Forest'; break;
      case 10: surfaceName = 'Mzimene Sand'; break;
      default: surfaceName = 'Bushveld Savanna'; break;
    }

    return { height, normal, surfaceClass, surfaceName };
  }
}
