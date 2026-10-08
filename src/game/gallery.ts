import { validateTrack, type SerializedTrack } from '../track/Track';
import { KEYS, readJSON, readText, removeKey, slotKey, writeJSON, writeText } from './storage';

/** A saved track in the gallery (the data itself lives under its own key). */
export interface Slot {
  id: string;
  name: string;
  savedAt: number;
  strokes: number;
  /** Biome id, for the card icon. */
  world: string;
}

interface Index {
  /** The track "Continue" opens. */
  current: string | null;
  slots: Slot[];
}

function index(): Index {
  const raw = readJSON<Partial<Index>>(KEYS.tracks, {});
  const slots = Array.isArray(raw.slots) ? raw.slots.filter((s) => s && typeof s.id === 'string') : [];
  return { current: typeof raw.current === 'string' ? raw.current : null, slots };
}

const writeIndex = (i: Index) => writeJSON(KEYS.tracks, i);

/** Saved tracks, most recently saved first. */
export function listSlots(): Slot[] {
  return [...index().slots].sort((a, b) => b.savedAt - a.savedAt);
}

/** The track "Continue" opens: the last one edited, else the most recently saved. */
export function currentSlot(): string | null {
  const i = index();
  if (i.current && i.slots.some((s) => s.id === i.current)) return i.current;
  return listSlots()[0]?.id ?? null;
}

export function setCurrent(id: string | null) {
  const i = index();
  i.current = id;
  writeIndex(i);
}

/** A saved track's data (null when missing or unreadable). */
export function loadSlot(id: string): SerializedTrack | null {
  const raw = readText(slotKey(id));
  if (raw === null) return null;
  try {
    return validateTrack(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** A name not used yet: "Track 3". */
export function freshName(base = 'Track') {
  const names = new Set(index().slots.map((s) => s.name));
  for (let n = index().slots.length + 1; ; n++) if (!names.has(`${base} ${n}`)) return `${base} ${n}`;
}

/** Creates an empty slot and makes it current; returns its id. */
export function createSlot(name = freshName()): string {
  const i = index();
  const id = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  i.slots.push({ id, name, savedAt: Date.now(), strokes: 0, world: '' });
  i.current = id;
  writeIndex(i);
  return id;
}

/** Saves a track into its slot (returns false when storage is full). */
export function saveSlot(id: string, data: SerializedTrack): boolean {
  if (!writeText(slotKey(id), JSON.stringify(data))) return false;
  const i = index();
  const slot = i.slots.find((s) => s.id === id);
  if (!slot) return false;
  slot.savedAt = Date.now();
  slot.strokes = data.strokes.length;
  slot.world = data.world?.biome ?? '';
  i.current = id;
  return writeIndex(i);
}

export function renameSlot(id: string, name: string) {
  const i = index();
  const slot = i.slots.find((s) => s.id === id);
  if (!slot) return;
  slot.name = name.trim().slice(0, 40) || slot.name;
  writeIndex(i);
}

export function duplicateSlot(id: string): string | null {
  const data = loadSlot(id);
  const from = index().slots.find((s) => s.id === id);
  if (!data || !from) return null;
  // A copy doesn't change which track "Continue" opens.
  const current = currentSlot();
  const copy = createSlot(`${from.name} copy`);
  saveSlot(copy, data);
  setCurrent(current);
  return copy;
}

export function deleteSlot(id: string) {
  const i = index();
  i.slots = i.slots.filter((s) => s.id !== id);
  if (i.current === id) i.current = null;
  writeIndex(i);
  removeKey(slotKey(id));
}
