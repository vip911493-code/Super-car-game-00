import * as THREE from 'three';

function createCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

/**
 * Converts a grayscale height canvas into a seamless tangent-space RGB normal map.
 */
function heightCanvasToNormalMap(
  heightCanvas: HTMLCanvasElement,
  strength: number,
  maxAnisotropy: number,
  repeatX = 1,
  repeatY = 1,
): THREE.CanvasTexture {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d')!;
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const [nCanvas, nCtx] = createCanvas(w, h);
  const outImg = nCtx.createImageData(w, h);
  const dst = outImg.data;

  const sampleH = (x: number, y: number): number => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return srcData[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const hL = sampleH(x - 1, y);
      const hR = sampleH(x + 1, y);
      const hD = sampleH(x, y - 1);
      const hU = sampleH(x, y + 1);

      const dx = (hL - hR) * strength;
      const dy = (hD - hU) * strength;
      const dz = 1.0;
      const invLen = 1 / Math.hypot(dx, dy, dz);

      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((dx * invLen * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((dy * invLen * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((dz * invLen * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }

  nCtx.putImageData(outImg, 0, 0);
  const tex = new THREE.CanvasTexture(nCanvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createGrassTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const [hCanvas, hCtx] = createCanvas(size, size);

  ctx.fillStyle = '#e8f3e2';
  ctx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  // Soft clover/soil blotches for organic variation
  for (let i = 0; i < 420; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const r = 4 + Math.random() * 14;
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(130, 175, 108, 0.14)' : 'rgba(255, 255, 255, 0.12)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    const hv = Math.floor(110 + Math.random() * 35);
    hCtx.fillStyle = `rgba(${hv},${hv},${hv},0.35)`;
    hCtx.beginPath();
    hCtx.arc(x, y, r * 0.8, 0, Math.PI * 2);
    hCtx.fill();
  }

  // Fine directional grass-blade strokes + corresponding bump strokes
  for (let i = 0; i < 5500; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const bladeH = 2 + Math.random() * 5;
    const tilt = (Math.random() - 0.5) * 2.2;
    const shade = Math.random();
    ctx.strokeStyle =
      shade > 0.64
        ? 'rgba(255, 255, 255, 0.25)'
        : shade > 0.28
          ? 'rgba(128, 172, 108, 0.28)'
          : 'rgba(84, 126, 68, 0.26)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + tilt, y - bladeH);
    ctx.stroke();

    const hv = shade > 0.5 ? 168 : 96;
    hCtx.strokeStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.lineWidth = 1.2;
    hCtx.beginPath();
    hCtx.moveTo(x, y);
    hCtx.lineTo(x + tilt, y - bladeH);
    hCtx.stroke();
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(700, 700);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const normalMap = heightCanvasToNormalMap(hCanvas, 2.2, maxAnisotropy, 700, 700);
  return { map, normalMap };
}

export function createRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const [canvas, ctx] = createCanvas(w, h);

  ctx.fillStyle = '#25282e';
  ctx.fillRect(0, 0, w, h);

  // Subtle tire rubber wear tracks across 2 lanes each way (12m main/coastal road)
  for (const cx of [0.16, 0.38, 0.62, 0.84]) {
    const grad = ctx.createLinearGradient(w * (cx - 0.08), 0, w * (cx + 0.08), 0);
    grad.addColorStop(0, 'rgba(10,12,15,0)');
    grad.addColorStop(0.5, 'rgba(10,12,15,0.28)');
    grad.addColorStop(1, 'rgba(10,12,15,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  // Fine asphalt stone aggregate
  for (let i = 0; i < 32000; i++) {
    const v = Math.floor(Math.random() * 72 + 24);
    ctx.fillStyle = `rgba(${v},${v},${v},0.36)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.8, 1.8);
  }

  // Subtle weathered hairline cracks
  ctx.strokeStyle = 'rgba(12,13,16,0.32)';
  ctx.lineWidth = 1;
  for (let c = 0; c < 10; c++) {
    let cx = 24 + Math.random() * (w - 48);
    let cy = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.random() - 0.5) * 16;
      cy += 10 + Math.random() * 14;
      ctx.lineTo(cx, cy);
    }
    ctx.stroke();
  }

  // Crisp white shoulder lines (~0.5m shoulder on 12m road = ~4.2%)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(8, 0, 5.5, h);
  ctx.fillRect(w - 13.5, 0, 5.5, h);

  // Dashed white lane dividers separating the 2 lanes on each side
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(w * 0.27 - 2, 0, 4, h * 0.42);
  ctx.fillRect(w * 0.73 - 2, 0, 4, h * 0.42);

  // Double solid yellow centerline separating opposing directions
  ctx.fillStyle = '#facc15';
  ctx.fillRect(w / 2 - 5, 0, 3.5, h);
  ctx.fillRect(w / 2 + 1.5, 0, 3.5, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createAsphaltMaps(maxAnisotropy: number): {
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
} {
  const w = 256;
  const h = 512;
  const [hCanvas, hCtx] = createCanvas(w, h);
  const [rCanvas, rCtx] = createCanvas(w, h);

  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, w, h);
  rCtx.fillStyle = '#d4d4d4';
  rCtx.fillRect(0, 0, w, h);

  for (let i = 0; i < 24000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const hv = Math.floor(82 + Math.random() * 96);
    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.fillRect(x, y, 2, 2);

    const rv = Math.floor(170 + Math.random() * 75);
    rCtx.fillStyle = `rgba(${rv},${rv},${rv},0.42)`;
    rCtx.fillRect(x, y, 2, 2);
  }

  const normalMap = heightCanvasToNormalMap(hCanvas, 2.4, maxAnisotropy);
  const roughnessMap = new THREE.CanvasTexture(rCanvas);
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.anisotropy = maxAnisotropy;

  return { normalMap, roughnessMap };
}

export function createDirtRoadTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const w = 256;
  const h = 512;
  const [canvas, ctx] = createCanvas(w, h);
  const [hCanvas, hCtx] = createCanvas(w, h);

  ctx.fillStyle = '#9c7146';
  ctx.fillRect(0, 0, w, h);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, w, h);

  // Packed tire ruts
  const gradL = ctx.createLinearGradient(w * 0.18, 0, w * 0.42, 0);
  gradL.addColorStop(0, 'rgba(84,52,24,0)');
  gradL.addColorStop(0.5, 'rgba(84,52,24,0.45)');
  gradL.addColorStop(1, 'rgba(84,52,24,0)');
  ctx.fillStyle = gradL;
  ctx.fillRect(0, 0, w, h);

  const gradR = ctx.createLinearGradient(w * 0.58, 0, w * 0.82, 0);
  gradR.addColorStop(0, 'rgba(84,52,24,0)');
  gradR.addColorStop(0.5, 'rgba(84,52,24,0.45)');
  gradR.addColorStop(1, 'rgba(84,52,24,0)');
  ctx.fillStyle = gradR;
  ctx.fillRect(0, 0, w, h);

  hCtx.fillStyle = '#5c5c5c';
  hCtx.fillRect(w * 0.24, 0, w * 0.12, h);
  hCtx.fillRect(w * 0.64, 0, w * 0.12, h);

  for (let i = 0; i < 22000; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const s = 1.5 + Math.random() * 2.5;
    const bright = Math.random() > 0.45;
    ctx.fillStyle = bright ? 'rgba(218,178,132,0.24)' : 'rgba(62,38,18,0.28)';
    ctx.fillRect(x, y, s, s);

    const hv = bright ? 165 : 88;
    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.fillRect(x, y, s, s);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const normalMap = heightCanvasToNormalMap(hCanvas, 2.8, maxAnisotropy);
  return { map, normalMap };
}

export function createRockTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const [hCanvas, hCtx] = createCanvas(size, size);

  ctx.fillStyle = '#dcd9d2';
  ctx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  // Mineral patches & stratified stone layers
  for (let i = 0; i < 650; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const rw = 8 + Math.random() * 28;
    const rh = 4 + Math.random() * 14;
    const v = Math.floor(155 + Math.random() * 85);
    ctx.fillStyle = `rgba(${v},${v - 3},${v - 8},0.28)`;
    ctx.fillRect(x, y, rw, rh);

    const hv = Math.floor(90 + Math.random() * 90);
    hCtx.fillStyle = `rgba(${hv},${hv},${hv},0.35)`;
    hCtx.fillRect(x, y, rw, rh);
  }

  // Cracks & fracture striations
  for (let c = 0; c < 48; c++) {
    let cx = Math.random() * size;
    let cy = Math.random() * size;
    ctx.strokeStyle = 'rgba(42,38,34,0.34)';
    ctx.lineWidth = 1 + Math.random() * 1.4;
    hCtx.strokeStyle = 'rgb(34,34,34)';
    hCtx.lineWidth = 1.6;
    ctx.beginPath();
    hCtx.beginPath();
    ctx.moveTo(cx, cy);
    hCtx.moveTo(cx, cy);
    for (let s = 0; s < 5; s++) {
      cx += (Math.random() - 0.5) * 28;
      cy += (Math.random() - 0.5) * 20;
      ctx.lineTo(cx, cy);
      hCtx.lineTo(cx, cy);
    }
    ctx.stroke();
    hCtx.stroke();
  }

  // Fine mineral grain
  for (let i = 0; i < 8000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = Math.floor(110 + Math.random() * 130);
    ctx.fillStyle = `rgba(${v},${v},${v},0.25)`;
    ctx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 2);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const normalMap = heightCanvasToNormalMap(hCanvas, 3.0, maxAnisotropy, 2, 2);
  return { map, normalMap };
}

export function createCurbTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(32, 64);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(0, 0, 32, 32);
  ctx.fillStyle = '#f4f4f5';
  ctx.fillRect(0, 32, 32, 32);

  ctx.fillStyle = 'rgba(0,0,0,0.16)';
  ctx.fillRect(0, 0, 32, 2);
  ctx.fillRect(0, 32, 32, 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createFinishLineTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(256, 64);
  const cols = 16;
  const rows = 4;
  const cw = canvas.width / cols;
  const ch = canvas.height / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      ctx.fillStyle = (x + y) % 2 === 0 ? '#111827' : '#f8fafc';
      ctx.fillRect(x * cw, y * ch, cw, ch);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size * 0.48);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.35)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createChevronSignTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const [canvas, ctx] = createCanvas(128, 64);
  ctx.fillStyle = '#18181b';
  ctx.fillRect(0, 0, 128, 64);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 10;
  ctx.lineCap = 'square';
  for (const offset of [28, 64, 100]) {
    ctx.beginPath();
    ctx.moveTo(offset - 16, 12);
    ctx.lineTo(offset + 8, 32);
    ctx.lineTo(offset - 16, 52);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createSmokeTexture(): THREE.CanvasTexture {
  const size = 64;
  const [canvas, ctx] = createCanvas(size, size);
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(255, 255, 255, 0.92)');
  grad.addColorStop(0.45, 'rgba(235, 238, 244, 0.48)');
  grad.addColorStop(1, 'rgba(220, 226, 236, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createWaterTexture(
  maxAnisotropy: number,
  repeatX: number,
  repeatY: number,
): THREE.CanvasTexture {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const grad = ctx.createLinearGradient(0, 0, 0, size);
  grad.addColorStop(0, '#1e74b8');
  grad.addColorStop(0.5, '#195f9c');
  grad.addColorStop(1, '#1e74b8');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 48; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x + 14, y - 5, x + 30, y);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createTunnelLiningTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const size = 256;
  const [canvas, ctx] = createCanvas(size, size);
  const [hCanvas, hCtx] = createCanvas(size, size);

  ctx.fillStyle = '#68645d';
  ctx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#808080';
  hCtx.fillRect(0, 0, size, size);

  for (let i = 0; i < 9000; i++) {
    const x = Math.random() * size;
    const y = Math.random() * size;
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${(Math.random() * 0.25).toFixed(3)})`;
    ctx.fillRect(x, y, 2, 2);

    const hv = Math.floor(96 + Math.random() * 64);
    hCtx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hCtx.fillRect(x, y, 2, 2);
  }

  // Concrete segmental ribs
  for (let row = 0; row < size; row += 32) {
    ctx.fillStyle = 'rgba(0,0,0,0.24)';
    ctx.fillRect(0, row, size, 4);
    hCtx.fillStyle = '#404040';
    hCtx.fillRect(0, row, size, 4);
  }

  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(3, 1);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const normalMap = heightCanvasToNormalMap(hCanvas, 2.2, maxAnisotropy, 3, 1);
  return { map, normalMap };
}

export function createCityPavementTexture(
  maxAnisotropy: number,
  repeatX: number,
  repeatY: number,
): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.fillStyle = '#757a82';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 4000; i++) {
    const v = Math.floor(Math.random() * 255);
    ctx.fillStyle = `rgba(${v},${v},${v},${(Math.random() * 0.2).toFixed(3)})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 2, 2);
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.22)';
  ctx.strokeRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCityFacadeTextures(maxAnisotropy: number): {
  colorMap: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
} {
  const size = 256;
  const [cCanvas, cCtx] = createCanvas(size, size);
  const [eCanvas, eCtx] = createCanvas(size, size);
  const [hCanvas, hCtx] = createCanvas(size, size);

  let s = 17;
  const nextRand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };

  // Architectural concrete & steel spandrels
  cCtx.fillStyle = '#7b838e';
  cCtx.fillRect(0, 0, size, size);
  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, size, size);
  hCtx.fillStyle = '#c8c8c8';
  hCtx.fillRect(0, 0, size, size);

  const cols = 6;
  const rows = 8;
  const cw = size / cols;
  const ch = size / rows;

  for (let y = 0; y < rows; y++) {
    // Horizontal floor spandrel shadow line
    cCtx.fillStyle = 'rgba(20,24,30,0.25)';
    cCtx.fillRect(0, y * ch, size, 3);
    hCtx.fillStyle = '#e6e6e6';
    hCtx.fillRect(0, y * ch, size, 4);

    for (let x = 0; x < cols; x++) {
      const r = nextRand();
      const lit = r > 0.56;
      const warm = nextRand() > 0.35;
      const wx = x * cw + 5;
      const wy = y * ch + 5;
      const ww = cw - 10;
      const wh = ch - 9;

      // Recessed window depth in normal height map
      hCtx.fillStyle = '#555555';
      hCtx.fillRect(wx, wy, ww, wh);

      // Daytime glass reflection vs warm/cool office interiors
      if (lit) {
        cCtx.fillStyle = warm ? '#f3dfa8' : '#cbe6ff';
        eCtx.fillStyle = warm ? '#ffd17a' : '#9ed4ff';
      } else {
        cCtx.fillStyle = '#1e2c3c';
        eCtx.fillStyle = '#000000';
      }
      cCtx.fillRect(wx, wy, ww, wh);
      eCtx.fillRect(wx, wy, ww, wh);

      // Subtle vertical window mullion
      cCtx.fillStyle = 'rgba(120,130,145,0.45)';
      cCtx.fillRect(wx + ww * 0.5 - 0.5, wy, 1, wh);
    }
  }

  const wrap = (tex: THREE.CanvasTexture, srgb: boolean) => {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 3);
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    tex.anisotropy = maxAnisotropy;
    return tex;
  };

  return {
    colorMap: wrap(new THREE.CanvasTexture(cCanvas), true),
    emissiveMap: wrap(new THREE.CanvasTexture(eCanvas), true),
    normalMap: heightCanvasToNormalMap(hCanvas, 2.0, maxAnisotropy, 1, 3),
  };
}

export function createHighwayTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const [canvas, ctx] = createCanvas(w, h);

  ctx.fillStyle = '#23262c';
  ctx.fillRect(0, 0, w, h);

  // Subtle tire wear along 4 highway lanes (3.5m each on 16m road with 0.8m median + 0.6m shoulders)
  for (const cx of [0.147, 0.366, 0.634, 0.853]) {
    const grad = ctx.createLinearGradient(w * (cx - 0.08), 0, w * (cx + 0.08), 0);
    grad.addColorStop(0, 'rgba(8,10,13,0)');
    grad.addColorStop(0.5, 'rgba(8,10,13,0.32)');
    grad.addColorStop(1, 'rgba(8,10,13,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  for (let i = 0; i < 24000; i++) {
    const v = Math.floor(Math.random() * 68 + 24);
    ctx.fillStyle = `rgba(${v},${v},${v},0.32)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.8, 1.8);
  }

  // Solid white outer edge lines bordering 0.6m shoulders (3.75% = ~9.6px)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(8, 0, 5, h);
  ctx.fillRect(w - 13, 0, 5, h);

  // 0.8m central median strip (5% = ~13px) bordered by solid yellow lines
  const medW = Math.round(w * 0.05);
  const medX = Math.round((w - medW) * 0.5);
  ctx.fillStyle = '#3b424d';
  ctx.fillRect(medX, 0, medW, h);
  ctx.fillStyle = '#facc15';
  ctx.fillRect(medX - 2.5, 0, 3, h);
  ctx.fillRect(medX + medW - 0.5, 0, 3, h);

  // Dashed white lane dividers between outer & inner lanes (at 25.6% & 74.4%)
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(w * 0.256 - 2, 0, 4, h * 0.42);
  ctx.fillRect(w * 0.744 - 2, 0, 4, h * 0.42);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCityRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const [canvas, ctx] = createCanvas(w, h);

  ctx.fillStyle = '#2a2e36';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 22000; i++) {
    const v = Math.floor(Math.random() * 68 + 28);
    ctx.fillStyle = `rgba(${v},${v},${v},0.28)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.8, 1.8);
  }

  // Concrete gutter strip along curbs (0.6m / 8m = 7.5% -> ~18px)
  ctx.fillStyle = '#525866';
  ctx.fillRect(0, 0, 16, h);
  ctx.fillRect(w - 16, 0, 16, h);

  ctx.fillStyle = '#f1f5f9';
  ctx.fillRect(17, 0, 5, h);
  ctx.fillRect(w - 22, 0, 5, h);

  // Clean dashed white city centerline separating 2 lanes
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(w / 2 - 3, 0, 6, h * 0.44);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createMountainRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 512;
  const [canvas, ctx] = createCanvas(w, h);

  ctx.fillStyle = '#282a2f';
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 22000; i++) {
    const v = Math.floor(Math.random() * 72 + 24);
    ctx.fillStyle = `rgba(${v},${v},${v},0.34)`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.8, 1.8);
  }

  // White edge lines bordering 0.6m mountain shoulders (7.5% -> ~18px)
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(14, 0, 5.5, h);
  ctx.fillRect(w - 19.5, 0, 5.5, h);

  // Double solid yellow centerline for winding 2-lane mountain pass
  ctx.fillStyle = '#facc15';
  ctx.fillRect(w / 2 - 5, 0, 3.5, h);
  ctx.fillRect(w / 2 + 1.5, 0, 3.5, h);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCrosswalkTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = '#f8fafc';
  const stripes = 8;
  const step = w / stripes;
  for (let i = 0; i < stripes; i++) {
    ctx.fillRect(i * step + step * 0.2, 16, step * 0.6, h - 32);
  }
  // White stop bar ahead of crosswalk
  ctx.fillRect(4, h - 10, w - 8, 8);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createLaneArrowTexture(
  kind: 'straight' | 'left' | 'right' | 'straight_right' | 'straight_left',
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const size = 128;
  const [canvas, ctx] = createCanvas(size, size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(248,250,252,0.92)';
  ctx.fillStyle = 'rgba(248,250,252,0.92)';
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const drawHead = (x: number, y: number, ang: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(13, 8);
    ctx.lineTo(-13, 8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  if (kind === 'straight' || kind === 'straight_right' || kind === 'straight_left') {
    ctx.beginPath();
    ctx.moveTo(64, 110);
    ctx.lineTo(64, 28);
    ctx.stroke();
    drawHead(64, 22, 0);
  }
  if (kind === 'left' || kind === 'straight_left') {
    ctx.beginPath();
    ctx.moveTo(64, kind === 'left' ? 110 : 76);
    ctx.quadraticCurveTo(64, 52, 34, 44);
    ctx.stroke();
    drawHead(26, 42, -Math.PI * 0.42);
  }
  if (kind === 'right' || kind === 'straight_right') {
    ctx.beginPath();
    ctx.moveTo(64, kind === 'right' ? 110 : 76);
    ctx.quadraticCurveTo(64, 52, 94, 44);
    ctx.stroke();
    drawHead(102, 42, Math.PI * 0.42);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

const directionSignCache = new Map<string, THREE.CanvasTexture>();

export function createDirectionSignTexture(
  arrow: string,
  destination: string,
  distanceText: string,
  secondaryArrow: string | undefined,
  secondaryDestination: string | undefined,
  isGantry: boolean,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const key = `${arrow}|${destination}|${distanceText}|${secondaryArrow ?? ''}|${secondaryDestination ?? ''}|${isGantry ? 1 : 0}`;
  const cached = directionSignCache.get(key);
  if (cached) return cached;

  const w = 512;
  const h = 256;
  const [canvas, ctx] = createCanvas(w, h);

  // Deep reflective highway green plate
  const bg = ctx.createLinearGradient(0, 0, 0, h);
  bg.addColorStop(0, '#047857');
  bg.addColorStop(1, '#065f46');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Reflective white rounded border
  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 10;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  if (isGantry && secondaryDestination) {
    // Split overhead gantry panel (left + right destinations)
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(w / 2 - 2, 20, 4, h - 40);

    // Left panel: Secondary / Straight route
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 58px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(secondaryArrow ?? '⬆', w * 0.25, 76);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px Inter, system-ui, sans-serif';
    ctx.fillText(secondaryDestination.toUpperCase(), w * 0.25, 148, w * 0.42);

    ctx.fillStyle = '#d1fae5';
    ctx.font = '700 24px Inter, system-ui, sans-serif';
    ctx.fillText('THRU LANE', w * 0.25, 198);

    // Right panel: Primary / Exit route
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 58px Inter, system-ui, sans-serif';
    ctx.fillText(arrow, w * 0.75, 76);

    ctx.fillStyle = '#ffffff';
    ctx.font = '800 32px Inter, system-ui, sans-serif';
    ctx.fillText(destination.toUpperCase(), w * 0.75, 148, w * 0.42);

    ctx.fillStyle = '#fef08a';
    ctx.font = '800 26px Inter, system-ui, sans-serif';
    ctx.fillText(distanceText, w * 0.75, 198);
  } else {
    // Roadside directional sign: Large arrow + destination + distance
    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 84px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(arrow, 82, h * 0.48);

    ctx.fillStyle = '#ffffff';
    ctx.font = '900 44px Inter, system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(destination, 144, 96, w - 172);

    ctx.fillStyle = '#fef08a';
    ctx.font = '800 36px Inter, system-ui, sans-serif';
    ctx.fillText(distanceText, 144, 168);

    if (secondaryDestination) {
      ctx.fillStyle = 'rgba(255,255,255,0.78)';
      ctx.font = '700 22px Inter, system-ui, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(`${secondaryArrow ?? ''} ${secondaryDestination}`, w - 26, 212, w * 0.56);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  directionSignCache.set(key, tex);
  return tex;
}

const speedLimitCache = new Map<string, THREE.CanvasTexture>();

export function createSpeedLimitTexture(
  limitText: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const cached = speedLimitCache.get(limitText);
  if (cached) return cached;

  const w = 128;
  const h = 160;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#dc2626';
  ctx.lineWidth = 8;
  ctx.strokeRect(6, 6, w - 12, h - 12);

  ctx.fillStyle = '#0f172a';
  ctx.font = '800 18px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('SPEED', w / 2, 30);
  ctx.fillText('LIMIT', w / 2, 50);

  ctx.font = '900 56px Inter, system-ui, sans-serif';
  ctx.fillText(limitText, w / 2, 108);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  speedLimitCache.set(limitText, tex);
  return tex;
}

const streetNameCache = new Map<string, THREE.CanvasTexture>();

export function createStreetNameTexture(
  streetName: string,
  maxAnisotropy: number,
): THREE.CanvasTexture {
  const cached = streetNameCache.get(streetName);
  if (cached) return cached;

  const w = 256;
  const h = 64;
  const [canvas, ctx] = createCanvas(w, h);
  ctx.fillStyle = '#047857';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = '#f8fafc';
  ctx.lineWidth = 4;
  ctx.strokeRect(4, 4, w - 8, h - 8);

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 28px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(streetName, w / 2, h / 2 + 1, w - 24);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  streetNameCache.set(streetName, tex);
  return tex;
}

