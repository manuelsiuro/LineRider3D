/**
 * Every value the game keeps in localStorage, behind one versioned, crash-safe
 * API. Storage can be missing, full or blocked (private windows), so every
 * read falls back and every write reports failure instead of throwing.
 *
 * When a stored format changes, bump SAVE_VERSION and add a migration below:
 * players keep their stars, bests, ghosts and tracks across updates.
 */

export const KEYS = {
  version: 'lr3d.version',
  // Progress (wiped by "Reset progress").
  progress: 'lr3d.progress',
  best: 'lr3d.best',
  ghosts: 'lr3d.ghosts',
  outfit: 'lr3d.outfit',
  achievements: 'lr3d.achievements',
  paint: 'lr3d.paint',
  counters: 'lr3d.counters',
  daily: 'lr3d.daily',
  medals: 'lr3d.medals',
  puzzles: 'lr3d.puzzles',
  // Preferences and the editor track (kept on reset).
  settings: 'lr3d.settings',
  vehicle: 'lr3d.vehicle',
  riderMode: 'lr3d.riderMode',
  helpSeen: 'lr3d.helpSeen',
  sfx: 'lr3d.sfx',
  music: 'lr3d.music',
  track: 'lr3d.track',
} as const;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS];

/** The keys "Reset progress" wipes. */
export const PROGRESS_KEYS: StorageKey[] = [KEYS.progress, KEYS.best, KEYS.ghosts, KEYS.outfit, KEYS.achievements, KEYS.paint, KEYS.counters, KEYS.daily, KEYS.medals, KEYS.puzzles];

export function readText(key: StorageKey): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeText(key: StorageKey, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeKey(key: StorageKey) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage unavailable */
  }
}

/** Parsed JSON, or the fallback when missing, unreadable or of the wrong shape. */
export function readJSON<T>(key: StorageKey, fallback: T): T {
  const raw = readText(key);
  if (raw === null) return fallback;
  try {
    const v = JSON.parse(raw) as unknown;
    // An object fallback only accepts a plain object back (not null, arrays or numbers).
    if (fallback !== null && typeof fallback === 'object' && !Array.isArray(fallback)) {
      return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as T) : fallback;
    }
    return v as T;
  } catch {
    return fallback;
  }
}

export function writeJSON(key: StorageKey, value: unknown): boolean {
  return writeText(key, JSON.stringify(value));
}

export function readFlag(key: StorageKey, fallback = false): boolean {
  const raw = readText(key);
  return raw === null ? fallback : raw === '1';
}

export function writeFlag(key: StorageKey, on: boolean) {
  writeText(key, on ? '1' : '0');
}

// ------------------------------------------------------------------ versions

export const SAVE_VERSION = 1;

/** MIGRATIONS[n] upgrades saves from version n to n + 1. */
const MIGRATIONS: Array<() => void> = [
  // 0 → 1: early builds stored a bare number per best score; make them records.
  () => {
    const bests = readJSON<Record<string, unknown>>(KEYS.best, {});
    let changed = false;
    for (const [k, v] of Object.entries(bests)) {
      if (typeof v === 'number') {
        bests[k] = { score: v, stars: 0 };
        changed = true;
      }
    }
    if (changed) writeJSON(KEYS.best, bests);
  },
];

/**
 * Brings stored data up to SAVE_VERSION; call once at startup before anything
 * reads storage. Saves from a newer build are left untouched.
 */
export function migrateStorage(): number {
  let v = Number(readText(KEYS.version) ?? 0) || 0;
  if (v > SAVE_VERSION) return v;
  for (; v < SAVE_VERSION; v++) {
    try {
      MIGRATIONS[v]();
    } catch {
      /* keep going: a broken old value falls back when read */
    }
  }
  writeText(KEYS.version, String(SAVE_VERSION));
  return v;
}
