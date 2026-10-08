import { LEVELS, chapterOf } from '../levels/levels';

export interface LevelProgress {
  stars: number;
  score: number;
}

const KEY = 'lr3d.progress';
const OUTFIT_KEY = 'lr3d.outfit';

export function loadProgress(): Record<string, LevelProgress> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, LevelProgress>;
  } catch {
    return {};
  }
}

/** Records a level result; returns whether it improved the stars. */
export function saveLevelResult(id: string, stars: number, score: number): boolean {
  const all = loadProgress();
  const prev = all[id] ?? { stars: 0, score: 0 };
  all[id] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score) };
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage unavailable */
  }
  return stars > prev.stars;
}

export function totalStars(progress = loadProgress()) {
  return Object.values(progress).reduce((n, p) => n + p.stars, 0);
}

/**
 * A level opens once the previous one of its world has at least one star;
 * the first level of every world is open from the start.
 */
export function isUnlocked(index: number, progress = loadProgress()) {
  if (index <= 0 || index >= LEVELS.length) return index === 0;
  // Levels already won stay open (e.g. after levels were reordered).
  if ((progress[LEVELS[index].id]?.stars ?? 0) > 0) return true;
  const prev = LEVELS[index - 1];
  if (chapterOf(prev) !== chapterOf(LEVELS[index])) return true;
  return (progress[prev.id]?.stars ?? 0) >= 1;
}

export interface Outfit {
  id: string;
  name: string;
  /** Total stars needed. */
  stars: number;
  jacket: number;
  pants: number;
  scarf: number;
  hat: number;
  sled: number;
}

export const OUTFITS: Outfit[] = [
  { id: 'classic', name: 'Classic Bosh', stars: 0, jacket: 0x2f6fd0, pants: 0x2a2f3a, scarf: 0xe0332b, hat: 0xf2f2f2, sled: 0xb5793f },
  { id: 'arctic', name: 'Arctic Fox', stars: 4, jacket: 0xf4f7fb, pants: 0x5d7a99, scarf: 0x3fc6e8, hat: 0x3fc6e8, sled: 0xd9e4ee },
  { id: 'ruby', name: 'Ruby Rocket', stars: 8, jacket: 0xd3263a, pants: 0x1e1e26, scarf: 0xffc23d, hat: 0x1e1e26, sled: 0x2c2c34 },
  { id: 'forest', name: 'Forest Ranger', stars: 12, jacket: 0x2e7d4f, pants: 0x4a3b2a, scarf: 0xff8a3d, hat: 0xff8a3d, sled: 0x8a5a36 },
  { id: 'midnight', name: 'Midnight', stars: 16, jacket: 0x2b2a5e, pants: 0x14142a, scarf: 0xb48cff, hat: 0xb48cff, sled: 0x3b3970 },
  { id: 'golden', name: 'Golden Legend', stars: 22, jacket: 0xf2c94c, pants: 0x3a2a12, scarf: 0xffffff, hat: 0xf2c94c, sled: 0xf2c94c },
];

export function selectedOutfit(): Outfit {
  try {
    const id = localStorage.getItem(OUTFIT_KEY);
    const o = OUTFITS.find((x) => x.id === id);
    if (o && totalStars() >= o.stars) return o;
  } catch {
    /* storage unavailable */
  }
  return OUTFITS[0];
}

export function selectOutfit(id: string) {
  try {
    localStorage.setItem(OUTFIT_KEY, id);
  } catch {
    /* storage unavailable */
  }
}

const VEHICLE_KEY = 'lr3d.vehicle';

/** The player's chosen ride (all rides are available from the start). */
export function selectedVehicleId(): string {
  try {
    return localStorage.getItem(VEHICLE_KEY) ?? 'sled';
  } catch {
    return 'sled';
  }
}

export function selectVehicle(id: string) {
  try {
    localStorage.setItem(VEHICLE_KEY, id);
  } catch {
    /* storage unavailable */
  }
}
