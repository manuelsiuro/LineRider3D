import * as THREE from 'three';
import { Track } from '../track/Track';
import { Simulation } from '../physics/Simulation';
import { vehicleById, type VehicleId } from '../physics/vehicles';
import { RunStats } from '../game/RunStats';
import { BIOMES, SURFACES, biomeById, normalizeWorld, surfaceOf, type TimeId, type WorldConfig } from '../world/worlds';
import { cosine, finish, forest, landing, profile, riderLine, star, start } from './builders';

/**
 * The daily ride: one generated track per UTC day, the same for every player,
 * with the day's ride and world. Built from a seed, then checked with the real
 * physics (an untouched run must finish with every star); a failed attempt
 * moves on to the next sub-seed, so every day is playable.
 */
export interface DailyInfo {
  /** UTC date, YYYY-MM-DD. */
  day: string;
  /** Days since the first daily (Daily #1). */
  number: number;
  name: string;
  vehicle: VehicleId;
  world: WorldConfig;
}

const FIRST_DAY = Date.UTC(2026, 9, 1);
const DAY_MS = 86_400_000;

/** Today's UTC date as YYYY-MM-DD. */
export function dayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function isDayKey(s: string | null | undefined): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));
}

export function dayNumber(day: string) {
  return Math.floor((Date.parse(`${day}T00:00:00Z`) - FIRST_DAY) / DAY_MS) + 1;
}

/** The day before (for streaks). */
export function previousDay(day: string) {
  return dayKey(new Date(Date.parse(`${day}T00:00:00Z`) - DAY_MS));
}

/** Small fast seeded generator (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

const ADJECTIVES = ['Frosty', 'Wild', 'Rapid', 'Lucky', 'Breezy', 'Golden', 'Rowdy', 'Sneaky', 'Mighty', 'Dizzy', 'Sunny', 'Stormy', 'Silver', 'Bouncy', 'Daring'];
const NOUNS = ['Switchback', 'Plunge', 'Rollercoaster', 'Getaway', 'Gauntlet', 'Express', 'Sprint', 'Descent', 'Dash', 'Rally', 'Run', 'Drop', 'Loop', 'Shortcut', 'Cruise'];
/** Rides in the rotation (the sled twice: it is the classic). */
const RIDES: VehicleId[] = ['sled', 'sled', 'skis', 'snowboard', 'bike', 'moto', 'buggy'];
const TIMES: TimeId[] = ['day', 'day', 'sunset', 'dawn', 'night'];
const SPOOKY_ADJECTIVES = ['Creepy', 'Ghoulish', 'Haunted', 'Spooky', 'Wicked', 'Eerie', 'Batty', 'Grim', 'Howling', 'Cursed', 'Moonlit', 'Shadowy', 'Bony', 'Witchy', 'Phantom'];
const SPOOKY_NOUNS = ['Crypt', 'Gully', 'Graveyard', 'Hollow', 'Plunge', 'Nightmare', 'Descent', 'Scramble', 'Hayride', 'Fright', 'Drop', 'Lantern Run', 'Bone Rattle', 'Shortcut', 'Midnight Run'];

/** Haunted Hollow joins the daily worlds from this day on (earlier dailies stay as they were). */
const HOLLOW_FROM = '2026-10-09';
/** The worlds daily rides happen in (the Moon's gravity and Volcano's lava stay out of them). */
const DAILY_WORLDS = BIOMES.filter((b) => b.id !== 'volcano' && b.id !== 'moon');
const CLASSIC_WORLDS = DAILY_WORLDS.filter((b) => b.id !== 'halloween');

/** Halloween season on the daily's own UTC date (the same for every player). */
const spookyDate = (day: string) => {
  const [, m, d] = day.split('-').map(Number);
  return m === 10 || (m === 11 && d <= 10);
};

type Piece = 'dip' | 'jump' | 'boost' | 'ring' | 'bump';

/** One attempt at a track; may be unrideable (checked afterwards). */
function generate(t: Track, rand: () => number, vehicle: VehicleId) {
  const def = vehicleById(vehicle);
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const between = (a: number, b: number) => a + (b - a) * rand();
  t.clear();

  const pieces: Piece[] = [];
  const n = 3 + Math.floor(rand() * 3);
  for (let i = 0; i < n; i++) pieces.push(pick(['jump', 'jump', 'dip', 'boost', 'ring', 'bump']));
  if (!pieces.includes('jump')) pieces[1] = 'jump';

  let x = -125;
  let y = 30 + n * 5;
  // The drop-in: speed for everything after it.
  const drop = between(10, 15);
  const len = between(28, 36);
  const h0 = cosine(y, y - drop, x, x + len);
  profile(t, h0, x - 2, x + len);
  start(t, x, h0(x));
  x += len;
  y -= drop;
  const starXs: number[] = [x - len / 2];

  for (const piece of pieces) {
    if (x > 60) break;
    if (piece === 'dip') {
      const d = between(4, 8);
      const L = between(16, 24);
      profile(t, cosine(y, y - d, x, x + L), x, x + L);
      profile(t, () => y - d, x + L, x + L + 6);
      starXs.push(x + L * 0.6);
      x += L + 6;
      y -= d;
    } else if (piece === 'boost') {
      const L = between(10, 16);
      profile(t, () => y, x, x + 4);
      profile(t, () => y, x + 4, x + 4 + L, 'accel');
      profile(t, () => y, x + 4 + L, x + 10 + L);
      starXs.push(x + 4 + L / 2);
      x += 10 + L;
    } else if (piece === 'ring') {
      const L = between(18, 24);
      profile(t, () => y, x, x + L);
      t.addRing({ position: new THREE.Vector3(x + L / 2, y + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      x += L;
    } else if (piece === 'bump') {
      const up = between(0.8, 1.6);
      const L = between(10, 14);
      profile(t, cosine(y, y + up, x, x + L / 2), x, x + L / 2);
      profile(t, cosine(y + up, y - 1, x + L / 2, x + L), x + L / 2, x + L);
      profile(t, () => y - 1, x + L, x + L + 8);
      starXs.push(x + L / 2);
      x += L + 8;
      y -= 1;
    } else {
      // Kicker, then a landing shaped on the measured flight.
      const lip = between(0.06, 0.14);
      profile(t, () => y, x, x + 4);
      profile(t, (q) => y + lip * (q - x - 4) ** 2, x + 4, x + 8);
      const top = y + lip * 16;
      const floor = Math.max(2, y - between(5, 10));
      const l = landing(t, x + 8, top, between(1.5, 3), floor, 'normal', def);
      starXs.push(l.top);
      x = l.end;
      y = floor;
    }
  }
  // Run-out and finish.
  profile(t, () => y, x, x + 34);
  finish(t, x + 24, y);
  starXs.push(x + 12);
  // Stars where the rider really passes (a little above the body line).
  const line = riderLine(t, starXs, def);
  for (const p of line) if (p.lengthSq() > 0) star(t, p.x, p.y + 0.4, p.z);
  forest(t, -130, x + 40, Math.floor(rand() * 1e6));
}

/** Runs the track untouched: must finish with every star, without crashing. */
function check(t: Track, vehicle: VehicleId, drag: number) {
  const sim = new Simulation(t, vehicleById(vehicle));
  sim.setGroundDrag(drag);
  const stats = new RunStats();
  for (let f = 0; f <= 1600; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    const s = stats.stats;
    if (s.crashed) return null;
    if (s.finished && f > s.finishTime * 40 + 20) return s.stars === t.stars.size && t.stars.size >= 3 ? s.score : null;
    if (s.still > 1.5 && f > 80) return null;
  }
  return null;
}

/** The daily ride of a UTC day (YYYY-MM-DD): name, ride and world (cheap). */
export function dailyInfo(day: string): DailyInfo {
  const rand = rng(hash(`lr3d-daily-${day}`));
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const vehicle = pick(RIDES);
  const hollow = day >= HOLLOW_FROM;
  let biome = pick(hollow ? DAILY_WORLDS : CLASSIC_WORLDS);
  // In the Halloween season, half the days go to the Hollow (an extra seed keeps the rest of the pick as it was).
  if (hollow && spookyDate(day) && (day.endsWith('-10-31') || rng(hash(`lr3d-spooky-${day}`))() < 0.5)) biome = biomeById('halloween');
  const spooky = biome.id === 'halloween';
  let time = pick(TIMES);
  if (spooky && time !== 'sunset') time = 'night';
  const world = normalizeWorld({ biome: biome.id, time, weather: rand() < 0.65 ? biome.weathers[0] : pick(biome.weathers) });
  const name = spooky ? `${pick(SPOOKY_ADJECTIVES)} ${pick(SPOOKY_NOUNS)}` : `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  return { day, number: dayNumber(day), name, vehicle, world };
}

/** Which attempt rides clean, and the score of an untouched run (per day). */
const solved = new Map<string, { attempt: number; target: number }>();

/**
 * Builds the day's track (a few hundred ms per attempt: run it in a worker).
 * The first attempt that rides clean wins; the seed sequence is the same for everyone.
 */
export function buildDaily(day: string, t: Track) {
  const info = dailyInfo(day);
  let s = solved.get(day);
  if (!s) {
    const drag = SURFACES[surfaceOf(info.world)].drag;
    s = { attempt: -1, target: 1500 };
    for (let attempt = 0; attempt < 40; attempt++) {
      generate(t, rng(hash(`lr3d-daily-${day}-${attempt}`)), info.vehicle);
      const score = check(t, info.vehicle, drag);
      if (score === null) continue;
      s = { attempt, target: Math.max(1500, Math.ceil((score + 2000) / 500) * 500) };
      break;
    }
    solved.set(day, s);
  } else if (s.attempt >= 0) generate(t, rng(hash(`lr3d-daily-${day}-${s.attempt}`)), info.vehicle);
  if (s.attempt < 0) fallback(t);
  t.targetScore = s.target;
}

/** A plain, always-rideable track (never expected: kept as a safety net). */
function fallback(t: Track) {
  t.clear();
  const h = cosine(30, 6, -60, -20);
  profile(t, h, -62, -20);
  profile(t, () => 6, -20, 40);
  start(t, -60, h(-60));
  for (const x of [-40, -10, 20]) star(t, x, (x < -20 ? h(x) : 6) + 1.3);
  finish(t, 30, 6);
}
