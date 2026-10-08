import * as THREE from 'three';
import type { BiomeId, TimeId, WeatherId, WorldConfig } from './worlds';

/** Everything the sky, lights, fog and color grade need for one world. */
export interface Atmosphere {
  skyTop: THREE.Color;
  skyMid: THREE.Color;
  skyHorizon: THREE.Color;
  fog: THREE.Color;
  fogNear: number;
  fogFar: number;
  /** Light position relative to the focus (sun, or moon at night). */
  sunOffset: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  /** Color of the sun disc and its glow in the sky. */
  sunGlow: THREE.Color;
  /** Sun disc / halo visibility (0 under clouds). */
  sunDisc: number;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  exposure: number;
  envIntensity: number;
  /** 0 day .. 1 night: stars, moon, city lights, headlights. */
  night: number;
  /** 0..1 overcast: grey sky, more and darker clouds. */
  overcast: number;
  cloudColor: THREE.Color;
  /** Wet ground and track (rain). */
  wet: number;
  /** Lightning flashes. */
  lightning: boolean;
  precip: { kind: 'none' | 'snow' | 'rain' | 'dust'; amount: number; wind: number };
  grade: { saturation: number; contrast: number; vignette: number; shadows: THREE.Vector3; highlights: THREE.Vector3 };
}

interface TimePreset {
  top: number;
  mid: number;
  horizon: number;
  fog: number;
  fogNear: number;
  fogFar: number;
  sun: [number, number, number];
  sunColor: number;
  sunIntensity: number;
  /** Raw (linear) RGB of the sun disc. */
  glow: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemi: number;
  exposure: number;
  env: number;
  night: number;
  cloud: number;
}

// Day is the original golden-afternoon look of the game.
const TIME: Record<TimeId, TimePreset> = {
  dawn: {
    top: 0x3a5a9c,
    mid: 0xc4a8cc,
    horizon: 0xffc8a6,
    fog: 0xe8d0cc,
    fogNear: 100,
    fogFar: 480,
    sun: [78, 16, -34],
    sunColor: 0xffc49a,
    sunIntensity: 2.1,
    glow: [1, 0.74, 0.6],
    hemiSky: 0xbcc6f0,
    hemiGround: 0xd8bcc4,
    hemi: 0.95,
    exposure: 0.97,
    env: 0.35,
    night: 0,
    cloud: 0xffd6d0,
  },
  day: {
    top: 0x2f6fc4,
    mid: 0x8fbbe8,
    horizon: 0xffe0c2,
    fog: 0xf1e6dc,
    fogNear: 110,
    fogFar: 520,
    sun: [-70, 42, 46],
    sunColor: 0xffd8a8,
    sunIntensity: 2.7,
    glow: [1, 0.86, 0.62],
    hemiSky: 0xc4dcff,
    hemiGround: 0xd8c2c0,
    hemi: 1.05,
    exposure: 1,
    env: 0.4,
    night: 0,
    cloud: 0xc8d8ec,
  },
  sunset: {
    top: 0x2a3f7e,
    mid: 0xd98a72,
    horizon: 0xffa95e,
    fog: 0xeeb898,
    fogNear: 100,
    fogFar: 470,
    sun: [-88, 13, 32],
    sunColor: 0xff9c5c,
    sunIntensity: 2.4,
    glow: [1, 0.66, 0.42],
    hemiSky: 0xaab2e2,
    hemiGround: 0xd89a7c,
    hemi: 0.88,
    exposure: 0.97,
    env: 0.32,
    night: 0,
    cloud: 0xffb08c,
  },
  night: {
    top: 0x040918,
    mid: 0x0c1834,
    horizon: 0x26335c,
    fog: 0x161f38,
    fogNear: 70,
    fogFar: 400,
    sun: [40, 70, -50],
    sunColor: 0x9fb8ff,
    sunIntensity: 0.7,
    glow: [0.85, 0.9, 1],
    hemiSky: 0x4a5c94,
    hemiGround: 0x22283e,
    hemi: 0.75,
    exposure: 1.08,
    env: 0.16,
    night: 1,
    cloud: 0x2a3456,
  },
};

/** Per-biome color mood, mixed in at the luminance of the time of day. */
const BIOME: Record<BiomeId, { tints: Partial<Record<'top' | 'mid' | 'horizon' | 'fog' | 'hemiGround' | 'hemiSky', [number, number]>>; fogFar?: number; saturation?: number; exposure?: number }> = {
  alpine: { tints: {} },
  forest: {
    tints: { horizon: [0xe4eccc, 0.35], fog: [0xc9d8c0, 0.55], hemiGround: [0x6f8a52, 0.65], mid: [0x9cc4d8, 0.25] },
    fogFar: 1.45,
    saturation: 0.04,
  },
  beach: {
    tints: { top: [0x1d82dc, 0.45], mid: [0x7ccbf2, 0.5], fog: [0xb8dcf0, 0.6], hemiGround: [0xe8d4a8, 0.6], horizon: [0xe8f4ff, 0.4] },
    fogFar: 1.5,
    saturation: 0.06,
    exposure: 0.03,
  },
  desert: {
    tints: { horizon: [0xffd29a, 0.5], fog: [0xf2cf9c, 0.65], hemiGround: [0xd8945e, 0.75], mid: [0xa8c8e8, 0.2] },
    fogFar: 1.7,
    saturation: 0.05,
  },
  city: {
    tints: { fog: [0xc6cad6, 0.5], mid: [0xa6bad2, 0.3], hemiGround: [0x9a9aa8, 0.6], horizon: [0xf0dcc8, 0.2] },
    fogFar: 1.35,
    saturation: -0.03,
  },
};

const lum = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
const tmp = new THREE.Color();

/** Shifts `c` toward `hex`'s hue, keeping `c`'s brightness. */
function tint(c: THREE.Color, hex: number, amount: number) {
  tmp.setHex(hex);
  const k = lum(c) / Math.max(1e-4, lum(tmp));
  tmp.multiplyScalar(k);
  c.lerp(tmp, amount);
}

/** Greys `c` out (overcast), keeping a little of its hue. */
function grey(c: THREE.Color, amount: number, darken: number) {
  const l = lum(c);
  c.lerp(tmp.setRGB(l, l, l), amount).multiplyScalar(1 - darken);
}

const precipFor = (biome: BiomeId, weather: WeatherId): Atmosphere['precip'] => {
  switch (weather) {
    case 'snow':
      return { kind: 'snow', amount: 1, wind: 0.3 };
    case 'rain':
      return { kind: 'rain', amount: 1, wind: 0.2 };
    case 'storm':
      return biome === 'alpine' ? { kind: 'snow', amount: 2.2, wind: 2.5 } : { kind: 'rain', amount: 1.8, wind: 1.2 };
    case 'sandstorm':
      return { kind: 'dust', amount: 1.6, wind: 3 };
    default:
      return { kind: 'none', amount: 0, wind: 0 };
  }
};

export function resolveAtmosphere(w: WorldConfig): Atmosphere {
  const t = TIME[w.time];
  const b = BIOME[w.biome];
  const c = (hex: number) => new THREE.Color(hex);
  const a: Atmosphere = {
    skyTop: c(t.top),
    skyMid: c(t.mid),
    skyHorizon: c(t.horizon),
    fog: c(t.fog),
    fogNear: t.fogNear,
    fogFar: t.fogFar * (b.fogFar ?? 1),
    sunOffset: new THREE.Vector3(...t.sun),
    sunColor: c(t.sunColor),
    sunIntensity: t.sunIntensity,
    sunGlow: new THREE.Color().setRGB(...t.glow),
    sunDisc: 1,
    hemiSky: c(t.hemiSky),
    hemiGround: c(t.hemiGround),
    hemiIntensity: t.hemi,
    exposure: t.exposure + (b.exposure ?? 0),
    envIntensity: t.env,
    night: t.night,
    overcast: 0,
    cloudColor: c(t.cloud),
    wet: 0,
    lightning: false,
    precip: precipFor(w.biome, w.weather),
    grade: {
      saturation: 1.14 + (b.saturation ?? 0),
      contrast: 1.08,
      vignette: 0.32,
      shadows: new THREE.Vector3(-0.012, 0, 0.02),
      highlights: new THREE.Vector3(0.02, 0.01, -0.01),
    },
  };
  const map = { top: a.skyTop, mid: a.skyMid, horizon: a.skyHorizon, fog: a.fog, hemiGround: a.hemiGround, hemiSky: a.hemiSky };
  for (const [k, v] of Object.entries(b.tints)) tint(map[k as keyof typeof map], v[0], v[1]);

  if (w.time === 'night') {
    // Moonlit blue grade.
    a.grade.shadows.set(-0.01, 0, 0.035);
    a.grade.highlights.set(0, 0.01, 0.02);
  } else if (w.time === 'sunset' || w.time === 'dawn') {
    a.grade.highlights.set(0.03, 0.012, -0.015);
  }

  const overcast = (amount: number, darken: number) => {
    a.overcast = amount;
    for (const col of [a.skyTop, a.skyMid, a.skyHorizon, a.fog, a.hemiSky, a.cloudColor]) grey(col, amount, darken);
    a.sunIntensity *= 1 - amount * 0.85;
    a.sunDisc = 1 - amount;
    a.hemiIntensity *= 1 + amount * 0.15;
    a.grade.saturation -= amount * 0.18;
    a.envIntensity *= 1 - amount * 0.4;
  };

  switch (w.weather) {
    case 'rain':
      overcast(0.7, 0.18);
      a.fogNear *= 0.45;
      a.fogFar *= 0.55;
      a.wet = 1;
      break;
    case 'storm':
      overcast(0.88, 0.42);
      a.fogNear *= 0.3;
      a.fogFar *= w.biome === 'alpine' ? 0.32 : 0.45;
      a.wet = w.biome === 'alpine' ? 0 : 1;
      a.lightning = w.biome !== 'alpine';
      a.grade.vignette += 0.08;
      break;
    case 'fog':
      a.fogNear = 6;
      a.fogFar = w.time === 'night' ? 110 : 140;
      a.skyTop.lerp(a.fog, 0.55);
      a.skyMid.lerp(a.fog, 0.75);
      a.skyHorizon.lerp(a.fog, 0.9);
      a.sunIntensity *= 0.55;
      a.sunDisc = 0.35;
      a.overcast = 0.4;
      a.grade.saturation -= 0.08;
      break;
    case 'sandstorm': {
      const dust = c(0xd08848).multiplyScalar(w.time === 'night' ? 0.18 : w.time === 'day' ? 1 : 0.8);
      a.fog.lerp(dust, 0.8);
      a.fogNear = 4;
      a.fogFar = 120;
      a.skyTop.lerp(a.fog, 0.6);
      a.skyMid.lerp(a.fog, 0.8);
      a.skyHorizon.lerp(a.fog, 0.92);
      a.sunIntensity *= 0.45;
      a.sunDisc = 0.25;
      a.overcast = 0.5;
      a.hemiGround.lerp(dust, 0.4);
      a.grade.highlights.set(0.03, 0.012, -0.02);
      break;
    }
  }
  return a;
}
