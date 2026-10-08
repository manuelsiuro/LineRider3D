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
  /** The single editor track of saves before version 2 (moved into the gallery). */
  track: 'lr3d.track',
  /** The track gallery: index of saved tracks and the one being edited. */
  tracks: 'lr3d.tracks',
} as const;

/** One saved track of the gallery. */
export type SlotKey = `lr3d.slot.${string}`;
export const slotKey = (id: string): SlotKey => `lr3d.slot.${id}`;

export type StorageKey = (typeof KEYS)[keyof typeof KEYS] | SlotKey;

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

export const SAVE_VERSION = 2;

/** MIGRATIONS[n] upgrades saves from version n to n + 1; false means try again next time. */
const MIGRATIONS: Array<() => boolean> = [
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
    return !changed || writeJSON(KEYS.best, bests);
  },
  // 1 → 2: the single editor track becomes the first track of the gallery.
  () => {
    const raw = readText(KEYS.track);
    if (raw === null) return true;
    let strokes = 0;
    let world = '';
    try {
      const data = JSON.parse(raw) as { strokes?: unknown[]; world?: { biome?: string } };
      strokes = Array.isArray(data.strokes) ? data.strokes.length : 0;
      world = data.world?.biome ?? '';
    } catch {
      return true;
    }
    if (strokes === 0) {
      removeKey(KEYS.track);
      return true;
    }
    // Copy first, and only drop the old key once the copy is in place (storage full: retry later).
    if (!writeText(slotKey('t1'), raw)) return false;
    if (!writeJSON(KEYS.tracks, { current: 't1', slots: [{ id: 't1', name: 'My track', savedAt: Date.now(), strokes, world }] })) return false;
    removeKey(KEYS.track);
    return true;
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
    let ok = true;
    try {
      ok = MIGRATIONS[v]();
    } catch {
      /* a broken old value falls back when read: move on */
    }
    // Couldn't finish (storage full): stay on this version and try again next start.
    if (!ok) break;
  }
  writeText(KEYS.version, String(v));
  return v;
}
