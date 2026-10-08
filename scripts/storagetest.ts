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

// 1 → 2: the single editor track moves into the gallery, as "My track".
{
  mem.clear();
  const track = JSON.stringify({ version: 1, start: [0, 12, 0], strokes: [{ type: 'normal', mode: 'profile', points: [0, 10, 0, 5, 9, 0], planeNormal: [0, 0, 1], bank: 0, width: 2.4 }], decor: [], world: { biome: 'forest' } });
  mem.set(KEYS.track, track);
  mem.set(KEYS.version, '1');
  migrateStorage();
  const gallery = await import('../src/game/gallery');
  const slots = gallery.listSlots();
  check(slots.length === 1 && slots[0].name === 'My track' && slots[0].strokes === 1 && slots[0].world === 'forest', `gallery after migration: ${JSON.stringify(slots)}`);
  check(gallery.currentSlot() === slots[0].id, 'the migrated track is current');
  check(gallery.loadSlot(slots[0].id)?.strokes.length === 1, 'the migrated track loads');
  check(!mem.has(KEYS.track), 'the old key is gone');
  // Gallery basics: create, save, duplicate, rename, delete.
  const id = gallery.createSlot();
  check(gallery.saveSlot(id, gallery.loadSlot(slots[0].id)!), 'save into a new slot');
  const copy = gallery.duplicateSlot(id)!;
  gallery.renameSlot(copy, '  Big jump  ');
  check(gallery.listSlots().some((s) => s.id === copy && s.name === 'Big jump'), 'rename trims');
  gallery.deleteSlot(copy);
  check(!gallery.listSlots().some((s) => s.id === copy) && !mem.has(`lr3d.slot.${copy}`), 'delete removes the slot and its data');
  check(gallery.freshName() === 'Track 3', `fresh name: ${gallery.freshName()}`);
  // An empty old track is simply dropped.
  mem.clear();
  mem.set(KEYS.track, JSON.stringify({ strokes: [] }));
  mem.set(KEYS.version, '1');
  migrateStorage();
  check(!mem.has(KEYS.track) && gallery.listSlots().length === 0, 'an empty old track is not kept');
  console.log('gallery migration ok');
}

// A migration that can't finish (storage full) is retried on the next start.
{
  mem.clear();
  mem.set(KEYS.track, JSON.stringify({ strokes: [{ points: [0, 1, 0, 2, 1, 0] }] }));
  mem.set(KEYS.version, '1');
  const setItem = (globalThis as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage.setItem;
  (globalThis as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage.setItem = (k, v) => {
    if (k.startsWith('lr3d.slot.')) throw new Error('QuotaExceededError');
    setItem(k, v);
  };
  migrateStorage();
  check(mem.get(KEYS.version) === '1' && mem.has(KEYS.track), 'a failed migration keeps the old track and version');
  (globalThis as { localStorage: { setItem: (k: string, v: string) => void } }).localStorage.setItem = setItem;
  migrateStorage();
  check(mem.get(KEYS.version) === String(SAVE_VERSION) && !mem.has(KEYS.track), 'it succeeds on the next start');
  console.log('failed migration retried');
}
