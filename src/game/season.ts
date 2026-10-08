/** Seasonal events: Halloween runs from 1 October to 10 November (local date). */

export type SeasonPref = 'auto' | 'off';

/** `?season=halloween` or `?season=off` forces the season (handy for testing). */
function override(): boolean | null {
  try {
    const q = new URLSearchParams(location.search).get('season');
    if (q === 'halloween') return true;
    if (q === 'off') return false;
  } catch {
    /* no location (tests, workers) */
  }
  return null;
}

/** Is it Halloween season on the calendar? Ignores the player's preference. */
export function halloweenSeason(date = new Date()): boolean {
  const o = override();
  if (o !== null) return o;
  const m = date.getMonth();
  return m === 9 || (m === 10 && date.getDate() <= 10);
}

/** Should the game dress up for Halloween (calendar plus the Settings toggle)? */
export function seasonOn(pref: SeasonPref): boolean {
  return pref !== 'off' && halloweenSeason();
}

/** Last day of the season, for "free until" labels. */
export const SEASON_END = 'Nov 10';
