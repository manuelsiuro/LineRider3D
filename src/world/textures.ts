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
  /** Glowing parts (lava in the cracks), lit by `emissive` color. */
  emissive?: { map: THREE.Texture; color: number; intensity: number };
  /** Tiles across the ground (default 180): fewer for patterns that read big. */
  repeat?: number;
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

/** Dark, mossy graveyard grass strewn with dead orange leaves. */
function grave(): GroundTextures {
  const size = 256;
  const big = valueNoise(size, 6, 41);
  const mid = valueNoise(size, 24, 42);
  const fine = valueNoise(size, 128, 43);
  const rand = rng(44);
  const blades = new Float32Array(size * size).map(() => rand());
  const leaves = new Float32Array(size * size).map(() => rand());
  const map = colorMap(size, (x, y, c) => {
    const i = y * size + x;
    const g = big[i] * 0.5 + mid[i] * 0.35 + fine[i] * 0.3;
    const blade = blades[i] > 0.85 ? 0.08 : blades[i] < 0.1 ? -0.08 : 0;
    c[0] = 0.24 + g * 0.1 + blade * 0.5;
    c[1] = 0.3 + g * 0.12 + blade;
    c[2] = 0.2 + g * 0.08 + blade * 0.4;
    // Bare earth patches and fallen leaves.
    if (mid[i] > 0.74) {
      c[0] = 0.25 + g * 0.06;
      c[1] = 0.23 + g * 0.06;
      c[2] = 0.2;
    }
    if (leaves[i] > 0.992) {
      c[0] = 0.8;
      c[1] = 0.38 + fine[i] * 0.2;
      c[2] = 0.1;
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

/** Cooled black lava: rough plates split by cracks with lava glowing in them. */
function basalt(): GroundTextures {
  const size = 256;
  const big = valueNoise(size, 6, 81);
  const fine = valueNoise(size, 96, 82);
  // Cell edges of a jittered grid: the cracks between plates.
  const rand = rng(83);
  const cells = 7;
  const cw = size / cells;
  const pts: [number, number][] = [];
  for (let y = 0; y < cells; y++) for (let x = 0; x < cells; x++) pts.push([(x + 0.15 + rand() * 0.7) * cw, (y + 0.15 + rand() * 0.7) * cw]);
  const crack = new Float32Array(size * size);
  const heat = valueNoise(size, 3, 84);
  const hotness = (i: number) => THREE.MathUtils.smoothstep(heat[i], 0.55, 0.75);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let d1 = 1e9;
      let d2 = 1e9;
      // Only the 3×3 cells around (wrapping, so the texture tiles).
      const cx = Math.floor(x / cw);
      const cy = Math.floor(y / cw);
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cy + oy;
          const [px, py] = pts[((gy + cells) % cells) * cells + ((gx + cells) % cells)];
          const d = Math.hypot(x - (px + Math.floor(gx / cells) * size), y - (py + Math.floor(gy / cells) * size));
          if (d < d1) {
            d2 = d1;
            d1 = d;
          } else if (d < d2) d2 = d;
        }
      crack[y * size + x] = Math.max(0, 1 - (d2 - d1) / 2.4);
    }
  const map = colorMap(size, (x, y, c) => {
    const i = y * size + x;
    const k = 0.13 + big[i] * 0.07 + fine[i] * 0.06;
    c[0] = k * 1.02;
    c[1] = k * 0.97;
    c[2] = k;
    // Most cracks are dark; lava shows only in some.
    const hot = crack[i] * hotness(i);
    c[0] = c[0] * (1 - hot) + 0.5 * hot;
    c[1] = c[1] * (1 - hot) + 0.1 * hot;
    c[2] *= 1 - hot;
    c[0] *= 1 - crack[i] * 0.5 * (1 - hotness(i));
    c[1] *= 1 - crack[i] * 0.5 * (1 - hotness(i));
    c[2] *= 1 - crack[i] * 0.5 * (1 - hotness(i));
  });
  const glowData = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    const g = crack[i] * hotness(i);
    glowData.set([255 * g, 110 * g, 20 * g, 255], i * 4);
  }
  const glow = finish(new THREE.DataTexture(glowData, size, size), true);
  const normal = normalMap(size, (x, y) => fine[y * size + x] * 0.5 - crack[y * size + x] * 0.8, 3);
  return { map, normal, normalScale: 0.9, roughness: 0.85, color: 0xffffff, emissive: { map: glow, color: 0xffffff, intensity: 1.6 }, repeat: 70 };
}

/** Grey moon dust pocked with little craters. */
function regolith(): GroundTextures {
  const size = 256;
  const big = valueNoise(size, 5, 91);
  const fine = valueNoise(size, 128, 92);
  const rand = rng(93);
  const pits: [number, number, number][] = Array.from({ length: 34 }, () => [rand() * size, rand() * size, 3 + rand() * 12]);
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let h = fine[y * size + x] * 0.25;
      for (const [px, py, r] of pits) {
        const dx = Math.min(Math.abs(x - px), size - Math.abs(x - px));
        const dy = Math.min(Math.abs(y - py), size - Math.abs(y - py));
        const d = Math.hypot(dx, dy) / r;
        // A bowl with a raised rim.
        if (d < 1.3) h += d < 1 ? -(1 - d * d) * 0.8 : (1.3 - d) * 1.2;
      }
      height[y * size + x] = h;
    }
  const map = colorMap(size, (x, y, c) => {
    const i = y * size + x;
    const k = 0.58 + big[i] * 0.12 + fine[i] * 0.08 + height[i] * 0.05;
    c[0] = k;
    c[1] = k;
    c[2] = k * 1.02;
  });
  const normal = normalMap(size, (x, y) => height[y * size + x], 2.4);
  return { map, normal, normalScale: 0.9, roughness: 0.96, color: 0xffffff };
}

const cache = new Map<string, GroundTextures>();

export type GroundKind = 'snow' | 'grass' | 'sand' | 'redsand' | 'concrete' | 'grave' | 'basalt' | 'regolith';

/** Ground textures, made once and shared. */
export function groundTextures(kind: GroundKind): GroundTextures {
  let t = cache.get(kind);
  if (!t) {
    t =
      kind === 'snow'
        ? snow()
        : kind === 'grass'
          ? grass()
          : kind === 'grave'
            ? grave()
          : kind === 'sand'
            ? sand(61, [0.93, 0.84, 0.64])
            : kind === 'redsand'
              ? sand(71, [0.86, 0.6, 0.4])
              : kind === 'basalt'
                ? basalt()
                : kind === 'regolith'
                  ? regolith()
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
