import * as THREE from 'three';
import { VehicleArchetypeConfig, VisualCustomization } from '../../models/vehicle.types';

export class CarFactory {
  /**
   * Builds an intricate 3–12 part procedural vehicle model with active aero,
   * brake rotor glow, glowing LED lights, and cockpit interior.
   */
  public static createVehicleMesh(config: VehicleArchetypeConfig, visuals: VisualCustomization): {
    root: THREE.Group;
    wheels: THREE.Group[];
    rotors: THREE.Mesh[];
    spoiler: THREE.Group;
    steeringWheel: THREE.Group;
    exhaustFlameLeft: THREE.Mesh;
    exhaustFlameRight: THREE.Mesh;
    brakeLights: THREE.Mesh[];
    headlights: THREE.SpotLight[];
    underglow: THREE.PointLight | null;
    bodyMaterial: THREE.MeshPhysicalMaterial;
  } {
    const root = new THREE.Group();
    root.name = 'VehicleRoot';

    // 1. PBR Car Paint Material
    const bodyMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(visuals.bodyColor),
      metalness: visuals.paintFinish === 'metallic' ? 0.75 : (visuals.paintFinish === 'matte' ? 0.1 : 0.35),
      roughness: visuals.paintFinish === 'matte' ? 0.65 : 0.18,
      clearcoat: visuals.paintFinish === 'matte' ? 0.0 : 0.95,
      clearcoatRoughness: 0.1,
    });

    const carbonMaterial = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.4,
      metalness: 0.2,
    });

    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      roughness: 0.05,
      transmission: 0.65,
      transparent: true,
      opacity: 0.85,
      ior: 1.5,
    });

    const chromeMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.95,
      roughness: 0.1,
    });

    // 2. Sculpted Chassis Body
    const bodyGroup = new THREE.Group();

    // Main lower hull
    const hullGeo = new THREE.BoxGeometry(config.trackWidthM * 0.92, 0.45, config.wheelBaseM * 1.55);
    const hullMesh = new THREE.Mesh(hullGeo, bodyMaterial);
    hullMesh.position.y = 0.32;
    hullMesh.castShadow = true;
    hullMesh.receiveShadow = true;
    bodyGroup.add(hullMesh);

    // Front nose taper / hood
    const hoodGeo = new THREE.BoxGeometry(config.trackWidthM * 0.88, 0.22, 1.2);
    const hoodMesh = new THREE.Mesh(hoodGeo, bodyMaterial);
    hoodMesh.position.set(0, 0.42, 1.25);
    hoodMesh.rotation.x = 0.06;
    hoodMesh.castShadow = true;
    bodyGroup.add(hoodMesh);

    // Front carbon splitter
    const splitterGeo = new THREE.BoxGeometry(config.trackWidthM * 0.96, 0.06, 0.45);
    const splitterMesh = new THREE.Mesh(splitterGeo, carbonMaterial);
    splitterMesh.position.set(0, 0.12, 1.95);
    splitterMesh.castShadow = true;
    bodyGroup.add(splitterMesh);

    // Rear diffuser
    const diffuserGeo = new THREE.BoxGeometry(config.trackWidthM * 0.94, 0.18, 0.4);
    const diffuserMesh = new THREE.Mesh(diffuserGeo, carbonMaterial);
    diffuserMesh.position.set(0, 0.2, -1.92);
    diffuserMesh.castShadow = true;
    bodyGroup.add(diffuserMesh);

    // 3. Cockpit Cabin & Glass Canopy
    const cabinGeo = new THREE.BoxGeometry(config.trackWidthM * 0.76, 0.42, 1.4);
    const cabinMesh = new THREE.Mesh(cabinGeo, glassMaterial);
    cabinMesh.position.set(0, 0.68, -0.15);
    cabinMesh.castShadow = true;
    bodyGroup.add(cabinMesh);

    // Roof panel
    const roofGeo = new THREE.BoxGeometry(config.trackWidthM * 0.72, 0.06, 1.1);
    const roofMesh = new THREE.Mesh(roofGeo, bodyMaterial);
    roofMesh.position.set(0, 0.89, -0.15);
    bodyGroup.add(roofMesh);

    // 4. Interior Cockpit Dashboard & Steering Wheel
    const interiorGroup = new THREE.Group();
    const dashGeo = new THREE.BoxGeometry(config.trackWidthM * 0.68, 0.2, 0.4);
    const dashMesh = new THREE.Mesh(dashGeo, carbonMaterial);
    dashMesh.position.set(0, 0.55, 0.35);
    interiorGroup.add(dashMesh);

    // Steering wheel (on the RIGHT side for Eswatini left-hand drive!)
    const steeringWheel = new THREE.Group();
    steeringWheel.position.set(0.28, 0.6, 0.2); // Right-hand drive setup
    const rimTorus = new THREE.TorusGeometry(0.12, 0.02, 8, 16);
    const steerMesh = new THREE.Mesh(rimTorus, carbonMaterial);
    steeringWheel.add(steerMesh);
    const steerCenter = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.03, 8), chromeMaterial);
    steerCenter.rotation.x = Math.PI / 2;
    steeringWheel.add(steerCenter);
    interiorGroup.add(steeringWheel);
    bodyGroup.add(interiorGroup);

    // 5. Active Aero Rear Spoiler
    const spoiler = new THREE.Group();
    spoiler.position.set(0, 0.72, -1.82);

    // Spoiler wing blade
    const wingGeo = new THREE.BoxGeometry(config.trackWidthM * 0.95, 0.04, 0.32);
    const wingMesh = new THREE.Mesh(wingGeo, carbonMaterial);
    wingMesh.castShadow = true;
    spoiler.add(wingMesh);

    // Spoiler upright struts
    const strutGeo = new THREE.BoxGeometry(0.04, 0.24, 0.15);
    const strutLeft = new THREE.Mesh(strutGeo, carbonMaterial);
    strutLeft.position.set(-0.45, -0.12, 0);
    const strutRight = new THREE.Mesh(strutGeo, carbonMaterial);
    strutRight.position.set(0.45, -0.12, 0);
    spoiler.add(strutLeft, strutRight);
    bodyGroup.add(spoiler);

    // 6. Headlights & Projector Beams
    const headlightMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const headlightGeo = new THREE.BoxGeometry(0.24, 0.08, 0.08);
    const hlLeft = new THREE.Mesh(headlightGeo, headlightMaterial);
    hlLeft.position.set(-0.62, 0.42, 1.85);
    const hlRight = new THREE.Mesh(headlightGeo, headlightMaterial);
    hlRight.position.set(0.62, 0.42, 1.85);
    bodyGroup.add(hlLeft, hlRight);

    // Spotlights projecting onto the road
    const spotLeft = new THREE.SpotLight(0xfffbeb, 8.0, 45, Math.PI / 6, 0.4, 1.0);
    spotLeft.position.set(-0.62, 0.42, 1.85);
    spotLeft.target.position.set(-0.62, 0, 18);
    const spotRight = new THREE.SpotLight(0xfffbeb, 8.0, 45, Math.PI / 6, 0.4, 1.0);
    spotRight.position.set(0.62, 0.42, 1.85);
    spotRight.target.position.set(0.62, 0, 18);
    bodyGroup.add(spotLeft, spotLeft.target, spotRight, spotRight.target);

    // 7. Taillights & Brake Lights
    const taillightMat = new THREE.MeshBasicMaterial({ color: 0xff1e1e });
    const tlLeft = new THREE.Mesh(headlightGeo, taillightMat);
    tlLeft.position.set(-0.62, 0.45, -1.9);
    const tlRight = new THREE.Mesh(headlightGeo, taillightMat);
    tlRight.position.set(0.62, 0.45, -1.9);
    bodyGroup.add(tlLeft, tlRight);

    // 8. Dual Chrome Exhausts & Backfire Flame Sprites
    const exhaustGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.15, 12);
    exhaustGeo.rotateX(Math.PI / 2);
    const exLeft = new THREE.Mesh(exhaustGeo, chromeMaterial);
    exLeft.position.set(-0.35, 0.18, -1.96);
    const exRight = new THREE.Mesh(exhaustGeo, chromeMaterial);
    exRight.position.set(0.35, 0.18, -1.96);
    bodyGroup.add(exLeft, exRight);

    // Backfire flame meshes
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8, // Electric blue/cyan turbo pop flame
      transparent: true,
      opacity: 0,
    });
    const flameGeo = new THREE.ConeGeometry(0.1, 0.45, 8);
    flameGeo.rotateX(-Math.PI / 2);

    const exhaustFlameLeft = new THREE.Mesh(flameGeo, flameMat);
    exhaustFlameLeft.position.set(-0.35, 0.18, -2.25);
    const exhaustFlameRight = new THREE.Mesh(flameGeo, flameMat.clone());
    exhaustFlameRight.position.set(0.35, 0.18, -2.25);
    bodyGroup.add(exhaustFlameLeft, exhaustFlameRight);

    // 9. Neon Underglow (Optional visual tuning)
    let underglow: THREE.PointLight | null = null;
    if (visuals.underglowEnabled) {
      underglow = new THREE.PointLight(new THREE.Color(visuals.underglowColor), 3.0, 4.0);
      underglow.position.set(0, 0.15, 0);
      bodyGroup.add(underglow);
    }

    root.add(bodyGroup);

    // 10. Four Detailed Wheels with Glowing Brake Rotors
    const wheels: THREE.Group[] = [];
    const rotors: THREE.Mesh[] = [];

    const tireGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.24, 20);
    tireGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x1c1917,
      roughness: 0.85,
      metalness: 0.05,
    });

    const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.25, 12);
    rimGeo.rotateZ(Math.PI / 2);
    const rimMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(visuals.rimColor),
      metalness: 0.85,
      roughness: 0.2,
    });

    const rotorGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.04, 16);
    rotorGeo.rotateZ(Math.PI / 2);

    const caliperGeo = new THREE.BoxGeometry(0.08, 0.12, 0.12);
    const caliperMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(visuals.caliperColor),
      metalness: 0.6,
      roughness: 0.3,
    });

    const halfTrack = config.trackWidthM * 0.5;
    const halfBase = config.wheelBaseM * 0.5;
    const wheelPositions = [
      new THREE.Vector3(-halfTrack, 0.33, halfBase),  // FL
      new THREE.Vector3(halfTrack, 0.33, halfBase),   // FR
      new THREE.Vector3(-halfTrack, 0.33, -halfBase), // RL
      new THREE.Vector3(halfTrack, 0.33, -halfBase),  // RR
    ];

    for (let i = 0; i < 4; i++) {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.copy(wheelPositions[i]);

      const tireMesh = new THREE.Mesh(tireGeo, tireMat);
      tireMesh.castShadow = true;
      wheelGroup.add(tireMesh);

      const rimMesh = new THREE.Mesh(rimGeo, rimMat);
      wheelGroup.add(rimMesh);

      // Brake rotor disc with thermal emissive color
      const rotorMat = new THREE.MeshStandardMaterial({
        color: 0x52525b,
        metalness: 0.9,
        roughness: 0.3,
        emissive: 0x000000,
        emissiveIntensity: 0.0,
      });
      const rotorMesh = new THREE.Mesh(rotorGeo, rotorMat);
      wheelGroup.add(rotorMesh);
      rotors.push(rotorMesh);

      // Caliper
      const caliperMesh = new THREE.Mesh(caliperGeo, caliperMat);
      caliperMesh.position.set(i % 2 === 0 ? 0.04 : -0.04, 0.1, 0);
      wheelGroup.add(caliperMesh);

      root.add(wheelGroup);
      wheels.push(wheelGroup);
    }

    return {
      root,
      wheels,
      rotors,
      spoiler,
      steeringWheel,
      exhaustFlameLeft,
      exhaustFlameRight,
      brakeLights: [tlLeft, tlRight],
      headlights: [spotLeft, spotRight],
      underglow,
      bodyMaterial,
    };
  }
}
