import { LEVELS, chapterOf } from '../levels/levels';
import { unlockedAchievements } from './achievements';
import type { BiomeId } from '../world/worlds';
import type { HeadKind } from '../render/RiderView';
import { halloweenSeason } from './season';
import { KEYS, readJSON, readText, writeJSON, writeText } from './storage';

export interface LevelProgress {
  stars: number;
  score: number;
}

export function loadProgress(): Record<string, LevelProgress> {
  return readJSON<Record<string, LevelProgress>>(KEYS.progress, {});
}

/** Records a level result; returns whether it improved the stars. */
export function saveLevelResult(id: string, stars: number, score: number): boolean {
  const all = loadProgress();
  const prev = all[id] ?? { stars: 0, score: 0 };
  all[id] = { stars: Math.max(prev.stars, stars), score: Math.max(prev.score, score) };
  writeJSON(KEYS.progress, all);
  return stars > prev.stars;
}

export function totalStars(progress = loadProgress()) {
  return Object.values(progress).reduce((n, p) => n + p.stars, 0);
}

/** Share of all the stars of the worlds before it that a world needs to open. */
const GATE_SHARE = 0.55;

/** Stars needed to open a world: a little over half of the stars of the worlds before it. */
export function worldGate(biome: BiomeId): number {
  const first = LEVELS.findIndex((l) => chapterOf(l) === biome);
  return first <= 0 ? 0 : Math.round(GATE_SHARE * 3 * first);
}

/**
 * A world is open once the player has its gate's stars. Worlds already played in (or
 * with later worlds played) stay open, so nobody loses a world when gates change; Haunted
 * Hollow opens for everyone during the Halloween season.
 */
export function worldOpen(biome: BiomeId, progress = loadProgress()): boolean {
  if (totalStars(progress) >= worldGate(biome)) return true;
  if (biome === 'halloween' && halloweenSeason()) return true;
  const first = LEVELS.findIndex((l) => chapterOf(l) === biome);
  return LEVELS.some((l, i) => i >= first && (progress[l.id]?.stars ?? 0) > 0);
}

/**
 * A level opens once its world is open and the previous level of the world has at least
 * one star; a world's first level opens with the world.
 */
export function isUnlocked(index: number, progress = loadProgress()) {
  if (index < 0 || index >= LEVELS.length) return false;
  // Levels already won stay open (e.g. after levels were reordered).
  if ((progress[LEVELS[index].id]?.stars ?? 0) > 0) return true;
  if (!worldOpen(chapterOf(LEVELS[index]), progress)) return false;
  const prev = LEVELS[index - 1];
  if (!prev || chapterOf(prev) !== chapterOf(LEVELS[index])) return true;
  return (progress[prev.id]?.stars ?? 0) >= 1;
}

export interface Outfit {
  id: string;
  name: string;
  /** Total stars needed. */
  stars: number;
  /** Achievement needed (world outfits). */
  achievement?: string;
  /** How to unlock it, when locked. */
  hint?: string;
  jacket: number;
  pants: number;
  scarf: number;
  hat: number;
  sled: number;
  /** Costume pieces. */
  head?: HeadKind;
  skin?: number;
  boot?: number;
  pattern?: 'bones';
  /** Free for everyone during this season (and kept for good once worn then). */
  season?: 'halloween';
}

export const OUTFITS: Outfit[] = [
  { id: 'classic', name: 'Classic Bosh', stars: 0, jacket: 0x2f6fd0, pants: 0x2a2f3a, scarf: 0xe0332b, hat: 0xf2f2f2, sled: 0xb5793f },
  // Halloween costumes: free in season, otherwise earned in Haunted Hollow.
  { id: 'pumpkin', name: 'Pumpkin Head', stars: 0, achievement: 'trick-or-treat', season: 'halloween', head: 'pumpkin', jacket: 0x3a6a2a, pants: 0x2a2a2e, scarf: 0xff8a1a, hat: 0xff8a1a, sled: 0x5a3a22 },
  { id: 'skeleton', name: 'Skeleton', stars: 0, achievement: 'bag-of-bones', season: 'halloween', head: 'skull', pattern: 'bones', boot: 0xeee6d2, jacket: 0x16161a, pants: 0x16161a, scarf: 0xeee6d2, hat: 0xeee6d2, sled: 0x2a2d33 },
  { id: 'arctic', name: 'Arctic Fox', stars: 4, jacket: 0xf4f7fb, pants: 0x5d7a99, scarf: 0x3fc6e8, hat: 0x3fc6e8, sled: 0xd9e4ee },
  { id: 'ruby', name: 'Ruby Rocket', stars: 8, jacket: 0xd3263a, pants: 0x1e1e26, scarf: 0xffc23d, hat: 0x1e1e26, sled: 0x2c2c34 },
  { id: 'forest', name: 'Forest Ranger', stars: 12, jacket: 0x2e7d4f, pants: 0x4a3b2a, scarf: 0xff8a3d, hat: 0xff8a3d, sled: 0x8a5a36 },
  { id: 'midnight', name: 'Midnight', stars: 16, jacket: 0x2b2a5e, pants: 0x14142a, scarf: 0xb48cff, hat: 0xb48cff, sled: 0x3b3970 },
  { id: 'golden', name: 'Golden Legend', stars: 22, jacket: 0xf2c94c, pants: 0x3a2a12, scarf: 0xffffff, hat: 0xf2c94c, sled: 0xf2c94c },
  // World outfits: 3 stars on every level of a world.
  { id: 'ranger', name: 'Woodland Ranger', stars: 0, achievement: 'champ-forest', hint: 'Forest', jacket: 0x5a7a2e, pants: 0x3b2f22, scarf: 0xc9a227, hat: 0x7a4b25, sled: 0x6e4529 },
  { id: 'lifeguard', name: 'Lifeguard', stars: 0, achievement: 'champ-beach', hint: 'Beach', jacket: 0xe0332b, pants: 0xf2c94c, scarf: 0xffffff, hat: 0xf2c94c, sled: 0x18b6c9 },
  { id: 'nomad', name: 'Desert Nomad', stars: 0, achievement: 'champ-desert', hint: 'Desert', jacket: 0xd9b26a, pants: 0x8a5a36, scarf: 0x2f6fd0, hat: 0xf4ecd8, sled: 0xc4532a },
  { id: 'courier', name: 'Neon Courier', stars: 0, achievement: 'champ-city', hint: 'City', jacket: 0x1d1f24, pants: 0x2a2d33, scarf: 0xff3da6, hat: 0x39e6f0, sled: 0x7466f0 },
  { id: 'count', name: 'Count Boshula', stars: 0, achievement: 'champ-halloween', hint: 'Haunted Hollow', head: 'vampire', skin: 0xdfe3e8, jacket: 0x1d1a22, pants: 0x1d1a22, scarf: 0xc8102e, hat: 0x141018, sled: 0x3a1020 },
];

/** Is an outfit available (enough stars, and its world mastered)? Costumes are free in their season. */
export function outfitUnlocked(o: Outfit, stars = totalStars(), got = unlockedAchievements()) {
  if (o.season && (halloweenSeason() || wornCostumes().includes(o.id))) return true;
  return stars >= o.stars && (!o.achievement || !!got[o.achievement]);
}

/** Seasonal costumes worn during their season: they stay unlocked. */
export function wornCostumes(): string[] {
  return readJSON<string[]>(KEYS.costumes, []);
}

/** Worlds whose levels all have 3 stars. */
export function champions(progress = loadProgress()): Partial<Record<BiomeId, boolean>> {
  const out: Partial<Record<BiomeId, boolean>> = {};
  for (const l of LEVELS) {
    const b = chapterOf(l);
    const three = (progress[l.id]?.stars ?? 0) >= 3;
    out[b] = (out[b] ?? true) && three;
  }
  return out;
}

export function selectedOutfit(): Outfit {
  const id = readText(KEYS.outfit);
  const o = OUTFITS.find((x) => x.id === id);
  return o && outfitUnlocked(o) ? o : OUTFITS[0];
}

export function selectOutfit(id: string) {
  writeText(KEYS.outfit, id);
  const o = OUTFITS.find((x) => x.id === id);
  const worn = wornCostumes();
  if (o?.season && halloweenSeason() && !worn.includes(id)) writeJSON(KEYS.costumes, [...worn, id]);
}

/** The player's chosen ride (all rides are available from the start). */
export function selectedVehicleId(): string {
  return readText(KEYS.vehicle) ?? 'sled';
}

export function selectVehicle(id: string) {
  writeText(KEYS.vehicle, id);
}
