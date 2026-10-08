import { MEDAL_TIMES } from '../levels/medals';
import type { MedalTimes } from '../levels/medalTimes';
import { KEYS, readJSON, writeJSON } from './storage';

export type Medal = 'bronze' | 'silver' | 'gold' | 'dev';
export const MEDALS: Medal[] = ['bronze', 'silver', 'gold', 'dev'];
export const MEDAL_NAME: Record<Medal, string> = { bronze: 'Bronze', silver: 'Silver', gold: 'Gold', dev: 'Dev' };

/** Medal times of a level with a ride (null: no medals for that pair). */
export function medalTimes(levelId: string, ride: string): MedalTimes | null {
  return MEDAL_TIMES[`${levelId}:${ride}`] ?? null;
}

/** The best medal a finish time earns (null: too slow, or no time). */
export function medalFor(times: MedalTimes, time: number): Medal | null {
  if (!(time > 0)) return null;
  let got: Medal | null = null;
  times.forEach((t, i) => {
    if (time <= t + 1e-6) got = MEDALS[i];
  });
  return got;
}

/** Best finish times per level and ride, on the level's home world. */
function loadTimes() {
  return readJSON<Record<string, number>>(KEYS.medals, {});
}

export function bestTime(levelId: string, ride: string): number {
  const t = loadTimes()[`${levelId}:${ride}`];
  return typeof t === 'number' && t > 0 ? t : 0;
}

/** Saves a clean finish; returns the medal now held and whether it is new. */
export function recordTime(levelId: string, ride: string, time: number) {
  const times = medalTimes(levelId, ride);
  const all = loadTimes();
  const key = `${levelId}:${ride}`;
  const prev = typeof all[key] === 'number' ? all[key] : 0;
  const best = prev > 0 ? Math.min(prev, time) : time;
  if (best !== prev) {
    all[key] = best;
    writeJSON(KEYS.medals, all);
  }
  const before = times ? medalFor(times, prev) : null;
  const now = times ? medalFor(times, best) : null;
  return { best, newBest: time < prev || prev === 0, medal: now, newMedal: now !== null && now !== before, times };
}

/** The best medal on a level across every ride (for the level select). */
export function levelMedal(levelId: string): Medal | null {
  const all = loadTimes();
  let top = -1;
  for (const [key, time] of Object.entries(all)) {
    const [id, ride] = key.split(':');
    if (id !== levelId) continue;
    const times = medalTimes(id, ride);
    const m = times ? medalFor(times, time) : null;
    if (m) top = Math.max(top, MEDALS.indexOf(m));
  }
  return top >= 0 ? MEDALS[top] : null;
}
