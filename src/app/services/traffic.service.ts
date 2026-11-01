import * as THREE from 'three';

export interface TrafficCar {
  id: string;
  type: 'COMBI' | 'BAKKIE' | 'SEDAN' | 'TRUCK';
  mesh: THREE.Group;
  lane: 'LEFT_OUTER' | 'LEFT_INNER' | 'RIGHT_OUTER' | 'RIGHT_INNER';
  direction: 1 | -1; // 1 = north toward Ezulwini, -1 = south toward Manzini
  z: number;
  speedKmh: number;
}

export class TrafficSimulator {
  public trafficCars: TrafficCar[] = [];
  public trafficGroup = new THREE.Group();

  constructor(private scene: THREE.Scene) {
    this.trafficGroup.name = 'AmbientTraffic';
    this.scene.add(this.trafficGroup);
    this.spawnInitialTraffic();
  }

  private spawnInitialTraffic(): void {
    const types: ('COMBI' | 'BAKKIE' | 'SEDAN' | 'TRUCK')[] = [
      'COMBI', 'SEDAN', 'BAKKIE', 'COMBI', 'TRUCK', 'SEDAN', 'COMBI', 'BAKKIE'
    ];

    for (let i = 0; i < 12; i++) {
      const type = types[i % types.length];
      const mesh = this.createTrafficCarMesh(type);
      const isNorthbound = i % 2 === 0;

      const car: TrafficCar = {
        id: `traffic_${i}`,
        type,
        mesh,
        direction: isNorthbound ? -1 : 1, // -z is north toward Ezulwini
        lane: isNorthbound ? 'LEFT_OUTER' : 'RIGHT_OUTER',
        z: -200 - i * 450,
        speedKmh: 75 + Math.random() * 25,
      };

      this.trafficGroup.add(mesh);
      this.trafficCars.push(car);
    }
  }

  private createTrafficCarMesh(type: 'COMBI' | 'BAKKIE' | 'SEDAN' | 'TRUCK'): THREE.Group {
    const group = new THREE.Group();

    let length = 4.2;
    let width = 1.8;
    let height = 1.4;
    let bodyColor = 0xffffff; // Default White Combi

    if (type === 'COMBI') {
      // Eswatini Minibus Combi (Toyota HiAce style with blue taxi stripe)
      length = 4.8;
      width = 1.85;
      height = 1.95;
      bodyColor = 0xf8fafc;
    } else if (type === 'TRUCK') {
      length = 7.5;
      width = 2.4;
      height = 2.8;
      bodyColor = 0xd97706; // Freight amber
    } else if (type === 'BAKKIE') {
      length = 4.9;
      width = 1.9;
      height = 1.6;
      bodyColor = 0x64748b; // Steel grey pickup
    }

    const mat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.5 });
    const geo = new THREE.BoxGeometry(width, height, length);
    const body = new THREE.Mesh(geo, mat);
    body.position.y = height * 0.5 + 0.3;
    body.castShadow = true;
    group.add(body);

    // If Combi, add blue iconic taxi stripe
    if (type === 'COMBI') {
      const stripeMat = new THREE.MeshBasicMaterial({ color: 0x0284c7 });
      const stripeGeo = new THREE.BoxGeometry(width + 0.02, 0.22, length * 0.9);
      const stripe = new THREE.Mesh(stripeGeo, stripeMat);
      stripe.position.y = 1.1;
      group.add(stripe);
    }

    // Windows
    const glassMat = new THREE.MeshBasicMaterial({ color: 0x1e293b });
    const glassGeo = new THREE.BoxGeometry(width * 0.95, height * 0.35, length * 0.65);
    const glass = new THREE.Mesh(glassGeo, glassMat);
    glass.position.y = height * 0.75 + 0.2;
    group.add(glass);

    // Wheels
    const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b });

    const w1 = new THREE.Mesh(wheelGeo, wheelMat);
    w1.position.set(-width * 0.5, 0.3, length * 0.3);
    const w2 = new THREE.Mesh(wheelGeo, wheelMat);
    w2.position.set(width * 0.5, 0.3, length * 0.3);
    const w3 = new THREE.Mesh(wheelGeo, wheelMat);
    w3.position.set(-width * 0.5, 0.3, -length * 0.3);
    const w4 = new THREE.Mesh(wheelGeo, wheelMat);
    w4.position.set(width * 0.5, 0.3, -length * 0.3);
    group.add(w1, w2, w3, w4);

    return group;
  }

  public update(dt: number, playerZ: number, getRoadCenterlineX: (z: number) => number, getRoadHeight: (z: number) => number): void {
    for (const car of this.trafficCars) {
      const speedMs = (car.speedKmh / 3.6);
      car.z += car.direction * speedMs * dt;

      // Wrap around player if too far
      if (car.z < playerZ - 2000) {
        car.z = playerZ + 1500;
      } else if (car.z > playerZ + 2000) {
        car.z = playerZ - 1500;
      }

      // Eswatini drives on the LEFT!
      // In direction -1 (north): left side of road is offset -3.8m or -7.2m from center
      // In direction +1 (south): left side of road relative to traveling south is +3.8m or +7.2m
      const lateralOffset = car.direction === -1 ? -5.2 : 5.2;
      const roadCenterX = getRoadCenterlineX(car.z);
      const x = roadCenterX + lateralOffset;
      const y = getRoadHeight(car.z);

      car.mesh.position.set(x, y, car.z);
      car.mesh.rotation.y = car.direction === -1 ? Math.PI : 0;
    }
  }
}
