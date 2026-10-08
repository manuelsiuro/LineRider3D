import * as THREE from 'three';
import type { WorldConfig } from '../world/worlds';

type Pair = [THREE.Color, THREE.Color];

/** How a world's particles look and move: dust, spray, sparkles and the speed trail. */
export interface FxStyle {
  /** Kicked up from the ground (plowing, crashes). */
  ground: Pair;
  /** Flecks mixed into ground bursts (leaves, shells), if any. */
  bits: Pair | null;
  /** Fine spray from the contacts on the track, and landing puffs. */
  spray: Pair;
  /** Star pickup sparkles (values above 1 glow). */
  sparkle: Pair;
  /** Speed trail tint. */
  trail: THREE.Color;
  /** Metal sparks on hard scrapes and landings. */
  sparks: boolean;
  /** Dust behavior: size and life multipliers, gravity, air drag, how high it kicks. */
  puff: { size: number; life: number; gravity: number; drag: number; rise: number };
}

/** Glow colors (linear, may exceed 1). */
const c = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
/** Surface colors, picked as on screen (sRGB). */
const s = (r: number, g: number, b: number) => new THREE.Color().setRGB(r, g, b, THREE.SRGBColorSpace);

const BASE: Record<WorldConfig['biome'], FxStyle> = {
  // Powder snow and ice crystals.
  alpine: {
    ground: [s(1, 1, 1), s(0.94, 0.97, 1)],
    bits: null,
    spray: [s(0.92, 0.97, 1), s(0.8, 0.92, 1)],
    sparkle: [c(1.6, 1.25, 0.4), c(0.8, 1.3, 1.6)],
    trail: c(0.75, 0.9, 1),
    sparks: false,
    puff: { size: 1, life: 1, gravity: -6, drag: 2.5, rise: 1 },
  },
  // Dirt clods and leaves, sawdust off the timber track, firefly-green sparkles.
  forest: {
    ground: [s(0.42, 0.31, 0.2), s(0.3, 0.22, 0.14)],
    bits: [s(0.36, 0.56, 0.24), s(0.85, 0.55, 0.2)],
    spray: [s(0.85, 0.7, 0.5), s(0.7, 0.55, 0.38)],
    sparkle: [c(1.6, 1.25, 0.4), c(0.9, 1.6, 0.5)],
    trail: c(0.8, 1, 0.55),
    sparks: false,
    puff: { size: 0.9, life: 0.8, gravity: -8, drag: 3, rise: 0.8 },
  },
  // Pale sand that falls fast, bits of shell, aqua sparkles.
  beach: {
    ground: [s(0.96, 0.87, 0.66), s(0.85, 0.74, 0.55)],
    bits: [s(1, 0.96, 0.92), s(0.95, 0.75, 0.7)],
    spray: [s(0.95, 0.88, 0.7), s(0.88, 0.8, 0.62)],
    sparkle: [c(1.6, 1.25, 0.4), c(0.4, 1.5, 1.6)],
    trail: c(0.5, 1, 1),
    sparks: false,
    puff: { size: 0.8, life: 0.7, gravity: -10, drag: 2, rise: 0.9 },
  },
  // Big, slow clouds of red dust hanging in the air.
  desert: {
    ground: [s(0.9, 0.58, 0.36), s(0.76, 0.46, 0.28)],
    bits: null,
    spray: [s(0.92, 0.65, 0.42), s(0.8, 0.52, 0.32)],
    sparkle: [c(1.7, 1.1, 0.35), c(1.7, 0.7, 0.3)],
    trail: c(1, 0.7, 0.4),
    sparks: false,
    puff: { size: 1.6, life: 1.7, gravity: -2.5, drag: 1.6, rise: 0.85 },
  },
  // Grey grit, sparks off the asphalt, neon sparkles and trail.
  city: {
    ground: [s(0.6, 0.6, 0.62), s(0.45, 0.45, 0.48)],
    bits: null,
    spray: [s(0.7, 0.7, 0.72), s(0.55, 0.55, 0.58)],
    sparkle: [c(1.8, 0.4, 1.2), c(0.4, 1.5, 1.8)],
    trail: c(1, 0.45, 0.95),
    sparks: true,
    puff: { size: 0.9, life: 0.6, gravity: -7, drag: 3, rise: 0.7 },
  },
};

const SNOW = BASE.alpine;
const WATER: Pair = [s(0.72, 0.82, 0.92), s(0.6, 0.72, 0.85)];
const MUD: Pair = [s(0.3, 0.22, 0.15), s(0.22, 0.16, 0.11)];

/** The particle style of a world, adjusted for snow cover and rain. */
export function fxStyle(w: WorldConfig, wet: number): FxStyle {
  const base = BASE[w.biome];
  // Fresh snow covers every world.
  if (w.weather === 'snow') return { ...base, ground: SNOW.ground, spray: SNOW.spray, bits: null, puff: SNOW.puff };
  if (wet > 0) {
    // Rain: the track throws water, soft ground turns to mud.
    return {
      ...base,
      spray: WATER,
      ground: w.biome === 'forest' || w.biome === 'alpine' ? MUD : base.ground,
      puff: { ...base.puff, size: base.puff.size * 0.7, life: base.puff.life * 0.6, gravity: -9, drag: 2.5 },
    };
  }
  return base;
}
