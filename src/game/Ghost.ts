import type { Track } from '../track/Track';
import { Simulation } from '../physics/Simulation';
import { SLED, type VehicleDef } from '../physics/vehicles';

/** A saved best run: the inputs that produced it, and how it went. */
export interface GhostRecord {
  /** Run-length encoded inputs: [value, count, value, count, ...]. */
  rle: number[];
  frames: number;
  score: number;
  finishTime: number;
  /** When it was saved (ms), for evicting the oldest ghosts. */
  savedAt?: number;
}

export function encodeInputs(inputs: number[]): number[] {
  const out: number[] = [];
  for (const v of inputs) {
    if (out.length && out[out.length - 2] === v) out[out.length - 1]++;
    else out.push(v, 1);
  }
  return out;
}

export function decodeInputs(rle: number[]): number[] {
  const out: number[] = [];
  for (let i = 0; i < rle.length; i += 2) for (let k = 0; k < rle[i + 1]; k++) out.push(rle[i]);
  return out;
}

const KEY = 'lr3d.ghosts';

export function loadGhost(trackKey: string): GhostRecord | null {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, GhostRecord>;
    return all[trackKey] ?? null;
  } catch {
    return null;
  }
}

export function saveGhost(trackKey: string, g: GhostRecord) {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, GhostRecord>;
    all[trackKey] = { ...g, savedAt: Date.now() };
    // Keep storage bounded: drop the least recently saved beyond 40 ghosts.
    const keys = Object.keys(all).sort((a, b) => (all[a].savedAt ?? 0) - (all[b].savedAt ?? 0));
    for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* storage full or unavailable */
  }
}

/** Is the new run better than the saved ghost? Higher score, then faster finish. */
export function beats(score: number, finishTime: number, ghost: GhostRecord | null): boolean {
  if (!ghost) return true;
  if (score !== ghost.score) return score > ghost.score;
  if (finishTime > 0 && ghost.finishTime > 0) return finishTime < ghost.finishTime;
  return finishTime > 0 && ghost.finishTime === 0;
}

/** Deterministic re-simulation of a ghost run on the same track. */
export class GhostRun {
  readonly sim: Simulation;
  constructor(
    track: Track,
    readonly record: GhostRecord,
    vehicle: VehicleDef = SLED,
  ) {
    this.sim = new Simulation(track, vehicle);
    this.sim.loadInputs(decodeInputs(record.rle));
  }
}
