import type { VehicleId } from '../physics/vehicles';
import type { BiomeId, WorldConfig } from '../world/worlds';
import type { Stats } from './RunStats';
import { PUZZLES } from '../levels/puzzles';
import { KEYS, readJSON, writeJSON } from './storage';

/** What an achievement can look at. */
export interface RunContext {
  stats: Stats;
  vehicle: VehicleId;
  /** Built-in level id, if any. */
  levelId: string | null;
  /** Star rating of the run (0..3), only at the end. */
  rating: number;
  /** Names of the tricks landed this run. */
  tricks: string[];
  /** Run is over (summary shown). */
  ended: boolean;
  /** Totals across all play. */
  totalStars: number;
  wipeouts: number;
  /** Beat a friend's challenge score. */
  beatChallenge: boolean;
  /** Finished a track the player built (not a level or shared track). */
  ownTrack: boolean;
  /** The world of the run. */
  world: WorldConfig;
  /** Distinct worlds ridden in / finished a level in, across all play. */
  worldsRidden: number;
  worldsFinished: number;
  /** Days in a row with a daily ride (after this run). */
  dailyStreak: number;
  /** Puzzles solved, and solved with three stars. */
  puzzlesSolved: number;
  puzzlesPerfect: number;
  /** Worlds whose levels all have 3 stars. */
  champion: Partial<Record<BiomeId, boolean>>;
}

export interface Achievement {
  id: string;
  title: string;
  desc: string;
  /** Challenge of one ride (unlocks its paint jobs). */
  ride?: VehicleId;
  check(c: RunContext): boolean;
}

const KMH = 3.6 * 0.6;
const landed = (c: RunContext, re: RegExp) => c.tricks.some((t) => re.test(t));
const finishedLevel = (c: RunContext, id: string) => c.ended && c.stats.finished && !c.stats.crashed && c.levelId === id;
const on = (c: RunContext, v: VehicleId) => c.vehicle === v;

export const ACHIEVEMENTS: Achievement[] = [
  // ---------------------------------------------------------------- general
  { id: 'first-finish', title: 'First Finish', desc: 'Cross the finish line of any level.', check: (c) => c.ended && c.stats.finished && c.levelId !== null },
  { id: 'legendary', title: 'Legendary', desc: 'Earn 3 stars on a level.', check: (c) => c.ended && c.rating === 3 && c.levelId !== null },
  { id: 'star-collector', title: 'Star Collector', desc: 'Earn 25 stars in total.', check: (c) => c.totalStars >= 25 },
  { id: 'combo-3', title: 'Combo Artist', desc: 'Reach a x3 combo.', check: (c) => c.stats.combo >= 3 },
  { id: 'combo-5', title: 'Combo King', desc: 'Max out the combo at x5.', check: (c) => c.stats.combo >= 5 },
  { id: 'big-air', title: 'Frequent Flyer', desc: 'Stay airborne for 2.5 seconds.', check: (c) => c.stats.bestAir >= 2.5 && !c.stats.crashed },
  { id: 'speed', title: 'Speed Demon', desc: 'Hit 120 km/h.', check: (c) => c.stats.topSpeed * KMH >= 120 },
  { id: 'double', title: 'Double Trouble', desc: 'Land a double flip.', check: (c) => landed(c, /Double|Triple/) },
  { id: 'perfectionist', title: 'Perfectionist', desc: 'Land 4 Perfect tricks in one run.', check: (c) => c.stats.perfects >= 4 },
  { id: 'yard-sale', title: 'Yard Sale', desc: 'Wipe out 10 times. It happens.', check: (c) => c.wipeouts >= 10 },
  { id: 'architect', title: 'Architect', desc: 'Finish a track you built yourself.', check: (c) => c.ended && c.ownTrack && c.stats.finished },
  { id: 'rival', title: 'Rival', desc: "Beat a friend's challenge score.", check: (c) => c.ended && c.beatChallenge },

  // ---------------------------------------------------------------- worlds
  { id: 'tourist', title: 'Tourist', desc: 'Ride in all five worlds.', check: (c) => c.worldsRidden >= 5 },
  { id: 'puzzle-1', title: 'Handy', desc: 'Fix your first puzzle track.', check: (c) => c.puzzlesSolved >= 1 },
  { id: 'puzzle-all', title: 'Master Builder', desc: 'Earn 3 stars on every puzzle.', check: (c) => c.puzzlesPerfect >= PUZZLES.length },
  { id: 'daily-3', title: 'Regular', desc: 'Ride the daily 3 days in a row.', check: (c) => c.dailyStreak >= 3 },
  { id: 'daily-7', title: 'Every Single Day', desc: 'Ride the daily 7 days in a row.', check: (c) => c.dailyStreak >= 7 },
  { id: 'globetrotter', title: 'Globetrotter', desc: 'Finish a level in every world.', check: (c) => c.worldsFinished >= 5 },
  { id: 'night-owl', title: 'Night Owl', desc: 'Finish a level at night.', check: (c) => c.ended && c.stats.finished && !c.stats.crashed && c.levelId !== null && c.world.time === 'night' },
  {
    id: 'storm-chaser',
    title: 'Storm Chaser',
    desc: 'Earn 3 stars on a level in a storm or sandstorm.',
    check: (c) => c.ended && c.rating === 3 && c.levelId !== null && (c.world.weather === 'storm' || c.world.weather === 'sandstorm'),
  },
  { id: 'champ-forest', title: 'King of the Woods', desc: '3 stars on every Forest level.', check: (c) => !!c.champion.forest },
  { id: 'champ-beach', title: 'Beach Legend', desc: '3 stars on every Beach level.', check: (c) => !!c.champion.beach },
  { id: 'champ-desert', title: 'Desert Fox', desc: '3 stars on every Desert level.', check: (c) => !!c.champion.desert },
  { id: 'champ-city', title: 'City Slicker', desc: '3 stars on every City level.', check: (c) => !!c.champion.city },

  // ---------------------------------------------------------------- sled
  { id: 'sled-legend', ride: 'sled', title: 'Old School', desc: 'Earn 3 stars on a level with the sled.', check: (c) => on(c, 'sled') && c.ended && c.rating === 3 && c.levelId !== null },
  { id: 'sled-double', ride: 'sled', title: 'Sled Acrobat', desc: 'Land a double flip on the sled.', check: (c) => on(c, 'sled') && landed(c, /Double|Triple/) },
  { id: 'sled-ice', ride: 'sled', title: 'Ice Cold', desc: 'Finish Ice Age on the sled.', check: (c) => on(c, 'sled') && finishedLevel(c, 'ice-age') },
  // ---------------------------------------------------------------- skis
  { id: 'skis-360', ride: 'skis', title: 'Spin Doctor', desc: 'Land a 360 on skis.', check: (c) => on(c, 'skis') && landed(c, /(360|540|720|900|1080)$/) },
  { id: 'skis-slalom', ride: 'skis', title: 'Gatekeeper', desc: 'Earn 3 stars on Slalom.', check: (c) => on(c, 'skis') && finishedLevel(c, 'slalom') && c.rating === 3 },
  { id: 'skis-speed', ride: 'skis', title: 'Downhill Racer', desc: 'Reach 100 km/h on skis.', check: (c) => on(c, 'skis') && c.stats.topSpeed * KMH >= 100 },
  // ---------------------------------------------------------------- snowboard
  { id: 'board-540', ride: 'snowboard', title: 'Five-Forty', desc: 'Land a 540 on the snowboard.', check: (c) => on(c, 'snowboard') && landed(c, /(540|720|900|1080)$/) },
  { id: 'board-park', ride: 'snowboard', title: 'Park Rat', desc: 'Earn 3 stars on Big Air Park.', check: (c) => on(c, 'snowboard') && finishedLevel(c, 'big-air') && c.rating === 3 },
  { id: 'board-mix', ride: 'snowboard', title: 'Flip & Spin', desc: 'Land a flip and a spin in one jump.', check: (c) => on(c, 'snowboard') && landed(c, /flip \d+$/) },
  // ---------------------------------------------------------------- BMX
  { id: 'bike-pump', ride: 'bike', title: 'Pedal Power', desc: 'Finish Pump Track.', check: (c) => on(c, 'bike') && finishedLevel(c, 'pump-track') },
  { id: 'bike-flip', ride: 'bike', title: 'Flair', desc: 'Land a backflip on the BMX.', check: (c) => on(c, 'bike') && landed(c, /Backflip/) },
  { id: 'bike-3', ride: 'bike', title: 'Pump It', desc: 'Earn 3 stars on Pump Track.', check: (c) => on(c, 'bike') && finishedLevel(c, 'pump-track') && c.rating === 3 },
  // ---------------------------------------------------------------- motorbike
  { id: 'moto-canyon', ride: 'moto', title: 'Canyon Crosser', desc: 'Finish Canyon Jump.', check: (c) => on(c, 'moto') && finishedLevel(c, 'canyon-jump') },
  { id: 'moto-flip', ride: 'moto', title: 'Throttle Flip', desc: 'Land a backflip on the motorbike.', check: (c) => on(c, 'moto') && landed(c, /Backflip/) },
  { id: 'moto-speed', ride: 'moto', title: 'Ton Up', desc: 'Reach 130 km/h on the motorbike.', check: (c) => on(c, 'moto') && c.stats.topSpeed * KMH >= 130 },
  // ---------------------------------------------------------------- buggy
  { id: 'buggy-quarry', ride: 'buggy', title: 'Rock Crawler', desc: 'Finish Quarry Run.', check: (c) => on(c, 'buggy') && finishedLevel(c, 'quarry-run') },
  { id: 'buggy-flip', ride: 'buggy', title: 'Roll Cage Hero', desc: 'Land any flip in the buggy.', check: (c) => on(c, 'buggy') && landed(c, /flip/) },
  { id: 'buggy-3', ride: 'buggy', title: 'Quarry Master', desc: 'Earn 3 stars on Quarry Run.', check: (c) => on(c, 'buggy') && finishedLevel(c, 'quarry-run') && c.rating === 3 },
];


export function unlockedAchievements(): Record<string, number> {
  return readJSON<Record<string, number>>(KEYS.achievements, {});
}

/** Checks every locked achievement; saves and returns the newly unlocked ones. */
export function evaluate(c: RunContext): Achievement[] {
  const got = unlockedAchievements();
  const fresh = ACHIEVEMENTS.filter((a) => !got[a.id] && a.check(c));
  if (fresh.length === 0) return [];
  for (const a of fresh) got[a.id] = Date.now();
  writeJSON(KEYS.achievements, got);
  return fresh;
}

interface Counters {
  wipeouts: number;
  /** Worlds ridden in, and worlds where a level was finished. */
  rode: string[];
  finished: string[];
}

export function loadCounters(): Counters {
  const base: Counters = { wipeouts: 0, rode: [], finished: [] };
  const c = { ...base, ...readJSON<Partial<Counters>>(KEYS.counters, {}) };
  if (!Array.isArray(c.rode)) c.rode = [];
  if (!Array.isArray(c.finished)) c.finished = [];
  if (typeof c.wipeouts !== 'number') c.wipeouts = 0;
  return c;
}

function saveCounters(c: Counters) {
  writeJSON(KEYS.counters, c);
}

/** Remembers that the player rode in (and maybe finished a level in) a world. */
export function noteWorld(biome: BiomeId, finishedLevel: boolean) {
  const c = loadCounters();
  let changed = false;
  if (!c.rode.includes(biome)) {
    c.rode.push(biome);
    changed = true;
  }
  if (finishedLevel && !c.finished.includes(biome)) {
    c.finished.push(biome);
    changed = true;
  }
  if (changed) saveCounters(c);
  return c;
}

export function bumpWipeouts(): number {
  const c = loadCounters();
  c.wipeouts++;
  saveCounters(c);
  return c.wipeouts;
}

/** How many of a ride's three challenges are done. */
export function rideProgress(ride: VehicleId, got = unlockedAchievements()) {
  const list = ACHIEVEMENTS.filter((a) => a.ride === ride);
  return { done: list.filter((a) => got[a.id]).length, total: list.length };
}

// ---------------------------------------------------------------- paint jobs

export interface Paint {
  id: string;
  name: string;
  /** Ride challenges needed. */
  need: number;
  /** Main paint and accent (null: follow the outfit). */
  colors: [number, number] | null;
}

export const PAINTS: Record<VehicleId, Paint[]> = {
  sled: [
    { id: 'factory', name: 'Outfit match', need: 0, colors: null },
    { id: 'candy', name: 'Candy Red', need: 1, colors: [0xd8323c, 0xffffff] },
    { id: 'gold', name: 'Gold Rush', need: 3, colors: [0xf2c94c, 0x2a2d33] },
  ],
  skis: [
    { id: 'factory', name: 'Outfit match', need: 0, colors: null },
    { id: 'neon', name: 'Neon', need: 1, colors: [0x39e6a0, 0xff3da6] },
    { id: 'carbon', name: 'Carbon', need: 3, colors: [0x2a2d33, 0xffc23d] },
  ],
  snowboard: [
    { id: 'factory', name: 'Outfit match', need: 0, colors: null },
    { id: 'sunset', name: 'Sunset', need: 1, colors: [0xff7a3d, 0x7a3dff] },
    { id: 'glacier', name: 'Glacier', need: 3, colors: [0xbfe8ff, 0x2f6fd0] },
  ],
  bike: [
    { id: 'factory', name: 'Outfit match', need: 0, colors: null },
    { id: 'lime', name: 'Lime', need: 1, colors: [0x9be33a, 0x1d1f24] },
    { id: 'chrome', name: 'Chrome', need: 3, colors: [0xdfe6ee, 0xe0332b] },
  ],
  moto: [
    { id: 'factory', name: 'Outfit match', need: 0, colors: null },
    { id: 'orange', name: 'Factory Orange', need: 1, colors: [0xff6a13, 0x1d1f24] },
    { id: 'midnight', name: 'Midnight', need: 3, colors: [0x23234a, 0x5fb2ff] },
  ],
  buggy: [
    { id: 'factory', name: 'Outfit match', need: 0, colors: null },
    { id: 'desert', name: 'Desert', need: 1, colors: [0xd9b26a, 0x3a2a12] },
    { id: 'racing', name: 'Racing Green', need: 3, colors: [0x1f6b45, 0xf2c94c] },
  ],
};

export function selectedPaints(): Partial<Record<VehicleId, string>> {
  return readJSON<Partial<Record<VehicleId, string>>>(KEYS.paint, {});
}

/** The paint a ride wears (falls back to the outfit match if it's locked). */
export function paintFor(ride: VehicleId): Paint {
  const id = selectedPaints()[ride];
  const p = PAINTS[ride].find((x) => x.id === id);
  if (p && rideProgress(ride).done >= p.need) return p;
  return PAINTS[ride][0];
}

export function selectPaint(ride: VehicleId, id: string) {
  const all = selectedPaints();
  all[ride] = id;
  writeJSON(KEYS.paint, all);
}
