import * as THREE from 'three';
import { groundGlints } from './alpine';
import { terrainHeight } from '../terrain';
import { Birds, Drifters, bakedDecor, flatMaterial, peaks, ring, scatter, smooth, type Backdrop, type BackdropCtx } from './common';
import { Water } from './water';

const LAKE = new THREE.Vector2(300, -300);
const LAKE_R = 95;
const LAKE_LEVEL = -0.8;

const SHORE = new THREE.Color().setRGB(1.35, 1.05, 0.8);
const forestDark = new THREE.Color(0x2f5a30);
const grassLow = new THREE.Color(0x4f7d3a);
const rock = new THREE.Color(0x7a7f78);

/** Deep green woods: rolling hills, mixed forest, a lake, birds and fireflies. */
export function forest(ctx: BackdropCtx): Backdrop {
  const { detail, cfg, atm } = ctx;
  const snowy = cfg.weather === 'snow';
  const group = new THREE.Group();

  // Rolling wooded hills with rocky tops.
  group.add(
    peaks({
      count: 30,
      seed: 17,
      dist: [380, 640],
      height: [55, 150],
      radius: [110, 210],
      sides: 8,
      paint: (t, rand, out) => {
        if (snowy && t > 0.55) out.setHex(0xf0f4f8);
        else if (t > 0.82 + rand() * 0.1) out.copy(rock);
        else out.copy(forestDark).lerp(grassLow, rand() * 0.5 + (t < 0.15 ? 0.4 : 0));
      },
    }),
  );

  const lakeMask = (x: number, z: number) => 1 - smooth(LAKE_R * 0.55, LAKE_R, Math.hypot(x - LAKE.x, z - LAKE.y));
  const clear = (x: number, z: number, angle: number) => {
    const r = Math.hypot(x, z);
    if (lakeMask(x, z) > 0) return false;
    // Glades: skip some sectors.
    return Math.sin(angle * 4 + r * 0.025) < 0.6;
  };

  const trees: [Parameters<typeof bakedDecor>, number, number, [number, number]][] = [
    [['pine', snowy, 0], 520, 1, [1.3, 2.8]],
    [['oak', snowy, 0], 260, 2, [1.1, 2]],
    [['oak', snowy, 1], 220, 3, [1.1, 2]],
    [['birch', snowy, 0], 220, 4, [1, 1.8]],
    [['bush', snowy, 0], 260, 5, [0.9, 1.8]],
  ];
  for (const [args, count, seed, size] of trees) {
    group.add(
      scatter(bakedDecor(...args), flatMaterial(), count * detail, 100 + seed, (rand) => {
        const [x, z, a] = ring(rand, 62, 400, 0.75);
        if (!clear(x, z, a)) return null;
        const sc = size[0] + rand() * (size[1] - size[0]);
        return { x, z, s: [sc, sc * (0.85 + rand() * 0.35), sc] };
      }),
    );
  }
  group.add(
    scatter(bakedDecor('rock', snowy), flatMaterial(), 90 * detail, 120, (rand) => {
      const [x, z] = ring(rand, 40, 300);
      return lakeMask(x, z) > 0 ? null : { x, z, s: 0.6 + rand() * 1.6, dy: -0.25 };
    }),
  );
  group.add(
    scatter(bakedDecor('log', snowy), flatMaterial(), 40 * detail, 121, (rand) => {
      const [x, z] = ring(rand, 50, 260);
      return { x, z, s: 0.8 + rand() * 0.6, dy: -0.15 };
    }),
  );

  // The lake.
  const water = new Water(new THREE.CircleGeometry(LAKE_R + 12, 48).rotateX(-Math.PI / 2), atm, {
    level: LAKE_LEVEL,
    deep: snowy ? 0x3a5468 : 0x1f4a52,
    shallow: 0x4f8a78,
    waves: 0.35,
    foam: 0.3,
  });
  water.mesh.position.set(LAKE.x, LAKE_LEVEL, LAKE.y);
  group.add(water.mesh);

  const birds = new Birds(14, 5, 0x2a2a30, [60, -40], [60, 160], [35, 70]);
  group.add(birds.mesh);

  // Floating leaves by day, fireflies at night.
  const night = atm.night > 0.5;
  const drift = snowy || cfg.weather === 'rain' || cfg.weather === 'storm'
    ? null
    : new Drifters(Math.round((night ? 260 : 160) * detail), 9, night
      ? { color: 0xd8ff7a, size: 0.35, box: 40, fall: 0.05, additive: true, opacity: 0.9 }
      : { color: 0xc8a43a, size: 0.22, box: 40, fall: 0.8 });
  if (drift) group.add(drift.points);

  const glint = ctx.cfg.weather === 'snow' ? groundGlints(group, 600 * ctx.detail, new THREE.Color(1, 1, 1), (1 - ctx.atm.night * 0.6) * (1 - ctx.atm.overcast * 0.7)) : null;

  return {
    group,
    ground: 'grass',
    groundTint(x, z, out) {
      // Meadow patches, darker under the trees and wet near the lake.
      const n = Math.sin(x * 0.045) * Math.cos(z * 0.038) * 0.5 + Math.sin(x * 0.11 + z * 0.07) * 0.25;
      const r = Math.hypot(x, z);
      const shade = smooth(60, 140, r) * 0.25;
      const k = (0.92 + n * 0.18) * (1 - shade);
      out.setRGB(k * (1 + n * 0.08), k, k * (1 - n * 0.1));
      const shore = 1 - smooth(LAKE_R, LAKE_R + 25, Math.hypot(x - LAKE.x, z - LAKE.y));
      if (shore > 0) out.lerp(SHORE, shore * 0.8);
    },
    farShape(x, z) {
      const m = lakeMask(x, z);
      if (m <= 0) return 0;
      // A bowl below the water line.
      return -(terrainHeight(x, z) + 3.5) * m;
    },
    onGround: (h, seg, ext) => water.setHeights(h, seg, ext),
    update(dt, focus, time) {
      glint?.(focus, time);
      water.update(time);
      birds.update(time);
      drift?.update(dt, focus, time);
    },
  };
}
