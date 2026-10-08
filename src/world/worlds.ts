import type { DecorKind } from '../track/types';

export type BiomeId = 'alpine' | 'forest' | 'beach' | 'desert' | 'city';
export type TimeId = 'dawn' | 'day' | 'sunset' | 'night';
export type WeatherId = 'clear' | 'snow' | 'rain' | 'fog' | 'storm' | 'sandstorm';
export type SurfaceId = 'snow' | 'grass' | 'sand' | 'asphalt';

/** Where a run takes place: landscape, time of day and weather. */
export interface WorldConfig {
  biome: BiomeId;
  time: TimeId;
  weather: WeatherId;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  blurb: string;
  /** Ground the riders slide on when they leave the track. */
  surface: SurfaceId;
  /** Weathers that make sense here (the first is the default). */
  weathers: WeatherId[];
  /** Decor that belongs here (editor palette and level scatter). */
  decor: DecorKind[];
}

export const BIOMES: BiomeDef[] = [
  {
    id: 'alpine',
    name: 'Alpine',
    blurb: 'Powder slopes, pine forests and snowy peaks.',
    surface: 'snow',
    weathers: ['snow', 'clear', 'fog', 'storm'],
    decor: ['pine', 'snowman', 'cabin', 'rock', 'lamp', 'flag', 'gift'],
  },
  {
    id: 'forest',
    name: 'Forest',
    blurb: 'Mossy woods, misty hollows and fallen logs.',
    surface: 'grass',
    weathers: ['clear', 'rain', 'fog', 'snow', 'storm'],
    decor: ['oak', 'birch', 'pine', 'bush', 'log', 'mushroom', 'sign', 'rock', 'cabin', 'lamp'],
  },
  {
    id: 'beach',
    name: 'Beach',
    blurb: 'Golden sand, palm trees and a turquoise sea.',
    surface: 'sand',
    weathers: ['clear', 'rain', 'fog', 'storm'],
    decor: ['palm', 'umbrella', 'surfboard', 'hut', 'lifeguard', 'deckchair', 'rock', 'flag'],
  },
  {
    id: 'desert',
    name: 'Desert',
    blurb: 'Red mesas, cactus flats and blazing sunsets.',
    surface: 'sand',
    weathers: ['clear', 'sandstorm', 'storm'],
    decor: ['cactus', 'barrel', 'mesa', 'tumbleweed', 'skull', 'windmill', 'rock', 'flag'],
  },
  {
    id: 'city',
    name: 'City',
    blurb: 'Rooftops, neon and streets that never sleep.',
    surface: 'asphalt',
    weathers: ['clear', 'rain', 'fog', 'snow', 'storm'],
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp', 'flag'],
  },
];

export const TIMES: { id: TimeId; name: string }[] = [
  { id: 'dawn', name: 'Dawn' },
  { id: 'day', name: 'Day' },
  { id: 'sunset', name: 'Sunset' },
  { id: 'night', name: 'Night' },
];

export const WEATHERS: { id: WeatherId; name: string }[] = [
  { id: 'clear', name: 'Clear' },
  { id: 'snow', name: 'Snow' },
  { id: 'rain', name: 'Rain' },
  { id: 'fog', name: 'Fog' },
  { id: 'storm', name: 'Storm' },
  { id: 'sandstorm', name: 'Sandstorm' },
];

/** How the ground feels: drag multiplier (snow is the reference, exactly 1). */
export const SURFACES: Record<SurfaceId, { name: string; drag: number }> = {
  snow: { name: 'Snow', drag: 1 },
  grass: { name: 'Grass', drag: 1.15 },
  sand: { name: 'Sand', drag: 1.6 },
  asphalt: { name: 'Asphalt', drag: 0.75 },
};

export const DEFAULT_WORLD: WorldConfig = { biome: 'alpine', time: 'day', weather: 'snow' };

export function biomeById(id: string | undefined): BiomeDef {
  return BIOMES.find((b) => b.id === id) ?? BIOMES[0];
}

/** Fills in and validates a (possibly partial or untrusted) world config. */
export function normalizeWorld(w?: Partial<WorldConfig> | null): WorldConfig {
  const biome = biomeById(w?.biome);
  const time = TIMES.some((t) => t.id === w?.time) ? (w!.time as TimeId) : 'day';
  const weather = biome.weathers.includes(w?.weather as WeatherId) ? (w!.weather as WeatherId) : biome.weathers[0];
  return { biome: biome.id, time, weather };
}

export function sameWorld(a: WorldConfig, b: WorldConfig) {
  return a.biome === b.biome && a.time === b.time && a.weather === b.weather;
}

/** The ground under the rider: snowfall covers every biome in snow. */
export function surfaceOf(w: WorldConfig): SurfaceId {
  return w.weather === 'snow' ? 'snow' : biomeById(w.biome).surface;
}

/** Snow caps on trees, roofs and rocks. */
export function isSnowy(w: WorldConfig) {
  return w.biome === 'alpine' || w.weather === 'snow';
}

export function worldLabel(w: WorldConfig) {
  const t = TIMES.find((x) => x.id === w.time)!.name;
  const we = WEATHERS.find((x) => x.id === w.weather)!.name;
  return `${biomeById(w.biome).name} · ${t} · ${we}`;
}
