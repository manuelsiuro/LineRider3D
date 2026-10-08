/** Save migrations and crash-safe storage, against an in-memory localStorage. */
import { check } from './assert';

const mem = new Map<string, string>();
let blocked = false;
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => {
    if (blocked) throw new Error('SecurityError');
    return mem.get(k) ?? null;
  },
  setItem: (k: string, v: string) => {
    if (blocked) throw new Error('QuotaExceededError');
    mem.set(k, String(v));
  },
  removeItem: (k: string) => void mem.delete(k),
};

const { KEYS, SAVE_VERSION, migrateStorage, readJSON, writeJSON } = await import('../src/game/storage');

// A save from before versioning: legacy number bests, no version key.
mem.set(KEYS.best, JSON.stringify({ 'track-a': 1200, 'track-b': { score: 50, stars: 2 } }));
mem.set(KEYS.progress, JSON.stringify({ 'first-run': { stars: 3, score: 700 } }));
migrateStorage();
const bests = readJSON<Record<string, { score: number; stars: number }>>(KEYS.best, {});
check(bests['track-a']?.score === 1200 && bests['track-a']?.stars === 0, 'legacy best should become a record');
check(bests['track-b']?.stars === 2, 'record bests are kept');
check(mem.get(KEYS.version) === String(SAVE_VERSION), 'version is stamped');
check(readJSON<Record<string, unknown>>(KEYS.progress, {})['first-run'] !== undefined, 'progress survives the migration');
console.log('migrated to', mem.get(KEYS.version), JSON.stringify(bests));

// Running again is a no-op; a newer save is left alone.
const before = mem.get(KEYS.best);
migrateStorage();
check(mem.get(KEYS.best) === before, 'migrations run once');
mem.set(KEYS.version, String(SAVE_VERSION + 5));
migrateStorage();
check(mem.get(KEYS.version) === String(SAVE_VERSION + 5), 'newer saves are not downgraded');

// Corrupt values and wrong shapes fall back.
mem.set(KEYS.progress, '{not json');
check(Object.keys(readJSON(KEYS.progress, {})).length === 0, 'corrupt JSON falls back');
mem.set(KEYS.progress, '[1,2]');
check(!Array.isArray(readJSON(KEYS.progress, {})), 'an array is not a record');
mem.set(KEYS.progress, 'null');
check(readJSON(KEYS.progress, {}) !== null, 'null is not a record');

// Blocked storage (private mode) never throws.
blocked = true;
check(writeJSON(KEYS.progress, { a: 1 }) === false, 'blocked writes report failure');
check(Object.keys(readJSON(KEYS.progress, {})).length === 0, 'blocked reads fall back');
migrateStorage();
blocked = false;
console.log('corrupt and blocked storage handled');
