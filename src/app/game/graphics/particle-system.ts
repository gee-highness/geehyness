import * as THREE from 'three';

interface Particle {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private maxParticles = 600;

  private geometry!: THREE.BufferGeometry;
  private positions!: Float32Array;
  private colors!: Float32Array;
  private sizes!: Float32Array;
  private pointCloud!: THREE.Points;

  constructor(scene: THREE.Scene) {
    this.geometry = new THREE.BufferGeometry();
    this.positions = new Float32Array(this.maxParticles * 3);
    this.colors = new Float32Array(this.maxParticles * 3);
    this.sizes = new Float32Array(this.maxParticles);

    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.geometry.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));

    // Custom shader or PointMaterial with soft particle texture
    const mat = new THREE.PointsMaterial({
      vertexColors: true,
      size: 1.5,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.pointCloud = new THREE.Points(this.geometry, mat);
    this.pointCloud.name = 'VfxPointCloud';
    scene.add(this.pointCloud);
  }

  public emitTireSmoke(pos: THREE.Vector3, isWet: boolean, isDirt: boolean): void {
    if (this.particles.length >= this.maxParticles) return;

    let pColor = new THREE.Color(0xf4f4f5); // White tire smoke
    if (isWet) pColor = new THREE.Color(0x93c5fd); // Light blue rain spray
    else if (isDirt) pColor = new THREE.Color(0xb45309); // Red earth dust

    this.particles.push({
      pos: pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.1, (Math.random() - 0.5) * 0.4)),
      vel: new THREE.Vector3((Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.5),
      life: 0,
      maxLife: 0.8 + Math.random() * 0.6,
      size: 0.8,
      color: pColor,
    });
  }

  public emitSparks(pos: THREE.Vector3, normal: THREE.Vector3): void {
    const count = 12;
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const vel = normal.clone().multiplyScalar(4.0).add(new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4,
        (Math.random() - 0.5) * 5
      ));
      this.particles.push({
        pos: pos.clone(),
        vel,
        life: 0,
        maxLife: 0.35 + Math.random() * 0.3,
        size: 0.4,
        color: new THREE.Color(0xf59e0b), // Golden sparks
      });
    }
  }

  public update(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }

      p.pos.add(p.vel.clone().multiplyScalar(dt));
      p.vel.y -= 2.0 * dt; // Gravity
      p.size += dt * 1.2;  // Expansion
    }

    // Update GPU buffers
    for (let i = 0; i < this.maxParticles; i++) {
      if (i < this.particles.length) {
        const p = this.particles[i];
        this.positions[i * 3] = p.pos.x;
        this.positions[i * 3 + 1] = p.pos.y;
        this.positions[i * 3 + 2] = p.pos.z;

        const alpha = 1.0 - (p.life / p.maxLife);
        this.colors[i * 3] = p.color.r * alpha;
        this.colors[i * 3 + 1] = p.color.g * alpha;
        this.colors[i * 3 + 2] = p.color.b * alpha;
        this.sizes[i] = p.size;
      } else {
        this.positions[i * 3 + 1] = -9999;
        this.sizes[i] = 0;
      }
    }

    this.geometry.attributes['position'].needsUpdate = true;
    this.geometry.attributes['color'].needsUpdate = true;
    this.geometry.attributes['size'].needsUpdate = true;
  }
}
