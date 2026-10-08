import { previousDay } from '../levels/daily';
import { KEYS, readJSON, writeJSON } from './storage';

/** The player's daily results: best per day, and the streak of days played. */
interface DailyRecords {
  days: Record<string, { score: number; stars: number }>;
  /** Consecutive days with a finished or crashed run, ending on `last`. */
  streak: number;
  last: string;
}

export function loadDaily(): DailyRecords {
  const r = readJSON<Partial<DailyRecords>>(KEYS.daily, {});
  return {
    days: r.days && typeof r.days === 'object' ? r.days : {},
    streak: typeof r.streak === 'number' ? r.streak : 0,
    last: typeof r.last === 'string' ? r.last : '',
  };
}

/** Current streak as of `today` (0 once a day was missed). */
export function streakOn(today: string, r = loadDaily()) {
  return r.last === today || r.last === previousDay(today) ? r.streak : 0;
}

/**
 * Records a daily run. Only today's daily counts toward the streak (an old
 * daily from a link keeps its own best but doesn't extend it).
 */
export function recordDaily(day: string, today: string, score: number, stars: number) {
  const r = loadDaily();
  const prev = r.days[day] ?? { score: 0, stars: 0 };
  const newBest = score > prev.score && score > 0;
  r.days[day] = { score: Math.max(prev.score, score), stars: Math.max(prev.stars, stars) };
  if (day === today && r.last !== today) {
    r.streak = r.last === previousDay(today) ? r.streak + 1 : 1;
    r.last = today;
  }
  // Keep the last 90 days.
  const keys = Object.keys(r.days).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - 90))) delete r.days[k];
  writeJSON(KEYS.daily, r);
  return { best: r.days[day].score, newBest, streak: streakOn(today, r) };
}
