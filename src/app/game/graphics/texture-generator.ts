import * as THREE from 'three';

export class TextureGenerator {
  /**
   * Generates a high-fidelity Southern African 4-lane highway asphalt texture
   * with double yellow center median, white dashed lane dividers, solid shoulder lines,
   * red/white painted kerb strips, and rubber skid wear.
   */
  public static createHighwayTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // 1. Base dark weathered asphalt
    ctx.fillStyle = '#222326';
    ctx.fillRect(0, 0, width, height);

    // 2. Multi-frequency aggregate grain & tar noise
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const n1 = (Math.random() - 0.5) * 32;
      const n2 = (Math.random() - 0.5) * 16;
      const val = Math.max(20, Math.min(55, 36 + n1 + n2));
      // Subtle warm tint to emulate real stone aggregate
      data[i] = val + 2;     // R
      data[i + 1] = val + 1; // G
      data[i + 2] = val;     // B
      data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    // 3. Faint rubber tire wear lanes
    const drawTireTracks = (centerX: number, trackWidth: number) => {
      ctx.fillStyle = 'rgba(15, 15, 17, 0.45)';
      ctx.fillRect(centerX - trackWidth * 0.45, 0, trackWidth * 0.28, height);
      ctx.fillRect(centerX + trackWidth * 0.17, 0, trackWidth * 0.28, height);
    };

    // Left carriageway lanes (Eswatini drives on left)
    drawTireTracks(width * 0.18, 110);
    drawTireTracks(width * 0.36, 110);
    // Right carriageway lanes
    drawTireTracks(width * 0.64, 110);
    drawTireTracks(width * 0.82, 110);

    // 4. Concrete Kerb Edges (Red and White alternating safety blocks)
    const kerbWidth = 32;
    const blockHeight = 64;
    for (let y = 0; y < height; y += blockHeight) {
      const isRed = Math.floor(y / blockHeight) % 2 === 0;
      ctx.fillStyle = isRed ? '#dc2626' : '#f4f4f5';
      ctx.fillRect(0, y, kerbWidth, blockHeight);
      ctx.fillRect(width - kerbWidth, y, kerbWidth, blockHeight);
    }

    // 5. Solid White Shoulder Lines
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(kerbWidth + 8, 0, 10, height);
    ctx.fillRect(width - kerbWidth - 18, 0, 10, height);

    // 6. Double Yellow Median Center Lines (Southern African / Eswatini standard)
    ctx.fillStyle = '#facc15';
    const midX = width / 2;
    ctx.fillRect(midX - 12, 0, 8, height);
    ctx.fillRect(midX + 4, 0, 8, height);

    // 7. Dashed White Lane Divider Lines
    ctx.fillStyle = '#f1f5f9';
    const dashLength = 80;
    const gapLength = 60;
    const leftDividerX = width * 0.27;
    const rightDividerX = width * 0.73;

    for (let y = 0; y < height; y += dashLength + gapLength) {
      ctx.fillRect(leftDividerX - 4, y, 8, dashLength);
      ctx.fillRect(rightDividerX - 4, y, 8, dashLength);
    }

    // 8. Subtle asphalt seam and tar crack details
    ctx.strokeStyle = 'rgba(10, 10, 12, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(width * 0.2, 0);
    ctx.bezierCurveTo(width * 0.22, 300, width * 0.19, 700, width * 0.21, height);
    ctx.stroke();

    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1, 1);
    texture.anisotropy = 8;
    return texture;
  }

  /**
   * Generates a normal bump map for the road surface (gravel texture + line relief).
   */
  public static createHighwayNormalMap(): THREE.CanvasTexture {
    const width = 512;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    const imgData = ctx.createImageData(width, height);
    const data = imgData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Perturb normal X & Y slightly with high-frequency noise
      const nx = 128 + Math.floor((Math.random() - 0.5) * 36);
      const ny = 128 + Math.floor((Math.random() - 0.5) * 36);
      data[i] = nx;
      data[i + 1] = ny;
      data[i + 2] = 255; // Facing straight up (Z)
      data[i + 3] = 255;
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    return texture;
  }

  /**
   * Generates an authentic Eswatini terrain texture: rich red-ochre African earth
   * blended with golden dry savanna bushveld grass, rocky gravel, and fertile green valley loam.
   */
  public static createTerrainTexture(): THREE.CanvasTexture {
    const size = 1024;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // 1. Rich African red earth / terracotta base
    ctx.fillStyle = '#9e4624';
    ctx.fillRect(0, 0, size, size);

    // 2. Savanna grass patches and soil variations
    const imgData = ctx.getImageData(0, 0, size, size);
    const d = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const idx = (y * size + x) * 4;

        // Multi-frequency noise for soil & grass patches
        const s1 = Math.sin(x * 0.02) * Math.cos(y * 0.02);
        const s2 = Math.sin(x * 0.05 + y * 0.03) * 0.5;
        const s3 = (Math.random() - 0.5) * 0.35;
        const factor = (s1 + s2 + s3 + 1.2) * 0.5;

        if (factor > 0.65) {
          // Golden dry bushveld grass (#8c8f42 to #a4a852)
          d[idx] = Math.floor(138 + s3 * 40);     // R
          d[idx + 1] = Math.floor(142 + s3 * 35); // G
          d[idx + 2] = Math.floor(66 + s3 * 30);  // B
        } else if (factor < 0.35) {
          // Deeper red-brown African clay soil (#7c3318)
          d[idx] = Math.floor(124 + s3 * 30);
          d[idx + 1] = Math.floor(51 + s3 * 20);
          d[idx + 2] = Math.floor(24 + s3 * 15);
        } else {
          // Mid red-ochre earth with pebbles (#a64d26)
          d[idx] = Math.floor(166 + s3 * 30);
          d[idx + 1] = Math.floor(77 + s3 * 25);
          d[idx + 2] = Math.floor(38 + s3 * 20);
        }
        d[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);

    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(36, 120); // Tile nicely across the 1400x7600m world
    return texture;
  }

  /**
   * Generates atmospheric sky dome texture with African blue zenith,
   * warm golden horizon haze, and soft layered cumulus clouds.
   */
  public static createSkyDomeTexture(): THREE.CanvasTexture {
    const width = 1024;
    const height = 512;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // Vertical atmospheric gradient
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0.0, '#1d4ed8'); // Deep African azure zenith
    grad.addColorStop(0.35, '#38bdf8'); // Bright sky blue
    grad.addColorStop(0.75, '#bae6fd'); // Pale sky
    grad.addColorStop(0.92, '#fde68a'); // Warm golden dust haze near horizon
    grad.addColorStop(1.0, '#fed7aa');  // Earthy horizon blend
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Procedural cumulus cloud banks
    ctx.fillStyle = 'rgba(255, 255, 255, 0.42)';
    for (let i = 0; i < 45; i++) {
      const cx = (i * 250 + Math.sin(i * 3.4) * 80) % width;
      const cy = 130 + (i % 5) * 35 + Math.sin(i * 2.1) * 25;
      const radius = 50 + (i % 4) * 35;

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.arc(cx + radius * 0.7, cy - radius * 0.2, radius * 0.8, 0, Math.PI * 2);
      ctx.arc(cx - radius * 0.6, cy + radius * 0.1, radius * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  /**
   * Generates authentic Southern African / Eswatini Highway Gantry Signs.
   */
  public static createHighwaySignTexture(
    destination: string,
    route: string,
    distanceKm: string,
    subText?: string
  ): THREE.CanvasTexture {
    const width = 512;
    const height = 256;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    // SADC Standard Green Highway Signboard
    ctx.fillStyle = '#065f46'; // Forest green highway board
    ctx.fillRect(0, 0, width, height);

    // White outer border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    // Yellow Route Shield (e.g. MR3 / MR103)
    ctx.fillStyle = '#eab308';
    ctx.beginPath();
    ctx.roundRect(24, 28, 120, 56, 8);
    ctx.fill();

    ctx.fillStyle = '#000000';
    ctx.font = 'bold 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(route, 84, 70);

    // Destination City & Distance
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 44px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(destination.toUpperCase(), 160, 72);

    if (subText) {
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 28px "Segoe UI", Arial, sans-serif';
      ctx.fillText(subText.toUpperCase(), 24, 138);
    }

    // Distance & Arrow
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 38px "Segoe UI", Arial, sans-serif';
    ctx.fillText(distanceKm, 24, 206);

    // Arrow icon
    ctx.beginPath();
    ctx.moveTo(width - 80, 180);
    ctx.lineTo(width - 30, 200);
    ctx.lineTo(width - 80, 220);
    ctx.lineTo(width - 80, 206);
    ctx.lineTo(width - 120, 206);
    ctx.lineTo(width - 120, 194);
    ctx.lineTo(width - 80, 194);
    ctx.closePath();
    ctx.fill();

    { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t; }
  }

  /**
   * Generates Yellow Diamond Speed / Hazard Warning signs with authentic Eswatini warnings.
   */
  public static createHazardSignTexture(hazardType: 'SLOW_DOWN' | 'CATTLE' | 'STEEP_GRADE'): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Yellow diamond background
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(-size * 0.35, -size * 0.35, size * 0.7, size * 0.7);
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 10;
    ctx.strokeRect(-size * 0.33, -size * 0.33, size * 0.66, size * 0.66);
    ctx.restore();

    ctx.fillStyle = '#000000';
    ctx.textAlign = 'center';

    if (hazardType === 'SLOW_DOWN') {
      ctx.font = '900 36px "Segoe UI", Arial, sans-serif';
      ctx.fillText('SLOW', size / 2, size * 0.46);
      ctx.fillText('DOWN', size / 2, size * 0.64);
    } else if (hazardType === 'STEEP_GRADE') {
      ctx.font = '900 34px "Segoe UI", Arial, sans-serif';
      ctx.fillText('STEEP', size / 2, size * 0.42);
      ctx.fillText('12%', size / 2, size * 0.58);
      ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
      ctx.fillText('DESCENT', size / 2, size * 0.72);
    } else {
      ctx.font = '900 30px "Segoe UI", Arial, sans-serif';
      ctx.fillText('CAUTION', size / 2, size * 0.46);
      ctx.fillText('ANIMALS', size / 2, size * 0.64);
    }

    { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t; }
  }

  /**
   * Generates striped market stall awning textures for Manzini Central Market and Bus Rank.
   */
  public static createMarketCanopyTexture(color: 'red' | 'blue' | 'yellow' | 'green'): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const primaryColor =
      color === 'red' ? '#dc2626' :
      color === 'blue' ? '#2563eb' :
      color === 'yellow' ? '#f59e0b' : '#16a34a';

    const stripeWidth = 32;
    for (let x = 0; x < size; x += stripeWidth * 2) {
      ctx.fillStyle = primaryColor;
      ctx.fillRect(x, 0, stripeWidth, size);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + stripeWidth, 0, stripeWidth, size);
    }

    { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t; }
  }

  /**
   * Generates shopfront & petrol station signage.
   */
  public static createShopSignTexture(title: string, sub: string, bgColor: string, textColor: string): THREE.CanvasTexture {
    const width = 512;
    const height = 128;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = bgColor;
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = textColor;
    ctx.lineWidth = 6;
    ctx.strokeRect(4, 4, width - 8, height - 8);

    ctx.fillStyle = textColor;
    ctx.font = '900 36px "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title.toUpperCase(), width / 2, 54);

    ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
    ctx.fillText(sub.toUpperCase(), width / 2, 98);

    { const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; return t; }
  }
}
