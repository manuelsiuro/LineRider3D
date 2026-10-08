import * as THREE from 'three';

/** Deterministic pseudo random generator so the landscape is stable. */
export function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

/** Smooth value noise in [0,1], tileable over `period`. */
export function valueNoise(size: number, period: number, seed: number): Float32Array {
  const rand = rng(seed);
  const grid = Array.from({ length: period * period }, () => rand());
  const at = (x: number, y: number) => grid[((y % period) + period) % period * period + (((x % period) + period) % period)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  return out;
}

function finish(tex: THREE.DataTexture, srgb = false) {
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

/** Tileable normal map from a height field. */
function normalMap(size: number, h: (x: number, y: number) => number, strength: number) {
  const data = new Uint8Array(size * size * 4);
  const n = new THREE.Vector3();
  const wrap = (v: number) => (v + size) % size;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (h(wrap(x + 1), y) - h(wrap(x - 1), y)) * strength;
      const dy = (h(x, wrap(y + 1)) - h(x, wrap(y - 1))) * strength;
      n.set(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  return finish(new THREE.DataTexture(data, size, size));
}

/** Tileable color map: `f` returns sRGB 0..1. */
function colorMap(size: number, f: (x: number, y: number, out: number[]) => void) {
  const data = new Uint8Array(size * size * 4);
  const c = [0, 0, 0];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      f(x, y, c);
      const i = (y * size + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0] * 255));
      data[i + 1] = Math.max(0, Math.min(255, c[1] * 255));
      data[i + 2] = Math.max(0, Math.min(255, c[2] * 255));
      data[i + 3] = 255;
    }
  return finish(new THREE.DataTexture(data, size, size), true);
}

export interface GroundTextures {
  map: THREE.Texture | null;
  normal: THREE.Texture;
  normalScale: number;
  roughness: number;
  /** Base color multiplied with the map and the vertex colors. */
  color: number;
}

/** Soft wind-blown snow ripples (the original look). */
function snow(): GroundTextures {
  const size = 256;
  const n1 = valueNoise(size, 8, 5);
  const n2 = valueNoise(size, 32, 9);
  const h = (x: number, y: number) => {
    const i = ((y + size) % size) * size + ((x + size) % size);
    return n1[i] * 0.8 + n2[i] * 0.35;
  };
  return { map: null, normal: normalMap(size, h, 3), normalScale: 0.55, roughness: 0.92, color: 0xf3f7fd };
}

/** Short meadow grass with clover patches and bare spots. */
function grass(): GroundTextures {
  const size = 256;
  const big = valueNoise(size, 6, 31);
  const mid = valueNoise(size, 24, 32);
  const fine = valueNoise(size, 128, 33);
  const rand = rng(34);
  const blades = new Float32Array(size * size).map(() => rand());
  const map = colorMap(size, (x, y, c) => {
    const i = y * size + x;
    const g = big[i] * 0.5 + mid[i] * 0.35 + fine[i] * 0.3;
    const blade = blades[i] > 0.82 ? 0.12 : blades[i] < 0.1 ? -0.1 : 0;
    c[0] = 0.34 + g * 0.16 + blade * 0.6;
    c[1] = 0.49 + g * 0.18 + blade;
    c[2] = 0.24 + g * 0.08 + blade * 0.3;
    // A few dry, yellow tufts.
    if (mid[i] > 0.78) {
      c[0] += 0.12;
      c[1] += 0.05;
    }
  });
  const normal = normalMap(size, (x, y) => fine[y * size + x] * 0.6 + blades[y * size + x] * 0.35, 4);
  return { map, normal, normalScale: 0.8, roughness: 0.95, color: 0xffffff };
}

/** Wind ripples in fine sand. */
function sand(seed: number, tone: [number, number, number]): GroundTextures {
  const size = 256;
  const warp = valueNoise(size, 4, seed);
  const grain = valueNoise(size, 128, seed + 1);
  const patch = valueNoise(size, 8, seed + 2);
  const ripple = (x: number, y: number) => {
    const i = y * size + x;
    const u = (x / size) * Math.PI * 2 * 9 + warp[i] * 9;
    return Math.sin(u + Math.sin((y / size) * Math.PI * 2 * 2) * 1.5) * 0.5 + 0.5;
  };
  const rand = rng(seed + 3);
  const speck = new Float32Array(size * size).map(() => rand());
  const map = colorMap(size, (x, y, c) => {
    const i = y * size + x;
    const k = 0.92 + patch[i] * 0.12 + grain[i] * 0.06 + ripple(x, y) * 0.04 - (speck[i] > 0.97 ? 0.15 : 0);
    c[0] = tone[0] * k;
    c[1] = tone[1] * k;
    c[2] = tone[2] * k;
  });
  const normal = normalMap(size, (x, y) => ripple(x, y) * 0.5 + grain[y * size + x] * 0.25, 2.2);
  return { map, normal, normalScale: 0.42, roughness: 0.97, color: 0xffffff };
}

/** Concrete plaza slabs with expansion joints and aggregate speckles. */
function concrete(): GroundTextures {
  const size = 256;
  const stain = valueNoise(size, 6, 51);
  const grain = valueNoise(size, 128, 52);
  const rand = rng(53);
  const speck = new Float32Array(size * size).map(() => rand());
  const joint = (x: number, y: number) => {
    const jx = Math.min(x % 128, 128 - (x % 128));
    const jy = Math.min(y % 128, 128 - (y % 128));
    return Math.min(jx, jy) < 1.5 ? 1 : 0;
  };
  const map = colorMap(size, (x, y, c) => {
    const i = y * size + x;
    let k = 0.66 + stain[i] * 0.1 + grain[i] * 0.06;
    if (speck[i] > 0.93) k += 0.08;
    else if (speck[i] < 0.05) k -= 0.1;
    if (joint(x, y)) k *= 0.82;
    c[0] = k * 0.98;
    c[1] = k;
    c[2] = k * 1.03;
  });
  const normal = normalMap(size, (x, y) => grain[y * size + x] * 0.2 + speck[y * size + x] * 0.1 - joint(x, y) * 0.35, 2.5);
  return { map, normal, normalScale: 0.6, roughness: 0.88, color: 0xffffff };
}

const cache = new Map<string, GroundTextures>();

export type GroundKind = 'snow' | 'grass' | 'sand' | 'redsand' | 'concrete';

/** Ground textures, made once and shared. */
export function groundTextures(kind: GroundKind): GroundTextures {
  let t = cache.get(kind);
  if (!t) {
    t =
      kind === 'snow'
        ? snow()
        : kind === 'grass'
          ? grass()
          : kind === 'sand'
            ? sand(61, [0.93, 0.84, 0.64])
            : kind === 'redsand'
              ? sand(71, [0.86, 0.6, 0.4])
              : concrete();
    cache.set(kind, t);
  }
  return t;
}

/** Soft round sprite used by particles. */
let dot: THREE.CanvasTexture | null = null;
export function dotTexture() {
  if (dot) return dot;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 32;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  dot = new THREE.CanvasTexture(canvas);
  dot.userData.shared = true;
  return dot;
}
