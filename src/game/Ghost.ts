import type { Track } from '../track/Track';
import { Simulation } from '../physics/Simulation';
import { P } from '../physics/Rider';
import { SLED, type VehicleDef } from '../physics/vehicles';
import { KEYS, readJSON, writeJSON } from './storage';

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

type Ghosts = Record<string, GhostRecord>;

export function loadGhost(trackKey: string): GhostRecord | null {
  return readJSON<Ghosts>(KEYS.ghosts, {})[trackKey] ?? null;
}

export function saveGhost(trackKey: string, g: GhostRecord) {
  const all = readJSON<Ghosts>(KEYS.ghosts, {});
  all[trackKey] = { ...g, savedAt: Date.now() };
  // Keep storage bounded: drop the least recently saved beyond 40 ghosts.
  const keys = Object.keys(all).sort((a, b) => (all[a].savedAt ?? 0) - (all[b].savedAt ?? 0));
  for (const k of keys.slice(0, Math.max(0, keys.length - 40))) delete all[k];
  writeJSON(KEYS.ghosts, all);
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
    groundDrag = 1,
  ) {
    this.sim = new Simulation(track, vehicle);
    this.sim.setGroundDrag(groundDrag);
    this.sim.loadInputs(decodeInputs(record.rle));
  }

  /** Distance travelled (body path) by each frame, computed on first use. */
  private dist: Float64Array | null = null;

  private distances() {
    if (this.dist) return this.dist;
    const n = this.record.frames;
    const d = new Float64Array(n + 1);
    this.sim.seek(n);
    const o = P.butt * 6;
    for (let f = 1; f <= n; f++) {
      const a = this.sim.stateAt(f - 1)!;
      const b = this.sim.stateAt(f)!;
      d[f] = d[f - 1] + Math.hypot(b[o] - a[o], b[o + 1] - a[o + 1], b[o + 2] - a[o + 2]);
    }
    this.sim.seek(0);
    return (this.dist = d);
  }

  /**
   * Time gap to the ghost (s) for a rider who has covered `distance` by
   * `frame`: negative when ahead. Null once past where the ghost ever got.
   */
  gap(frame: number, distance: number, fps: number): number | null {
    const d = this.distances();
    if (distance > d[d.length - 1]) return null;
    // First ghost frame at or past this distance (binary search), interpolated.
    let lo = 0;
    let hi = d.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (d[mid] < distance) lo = mid + 1;
      else hi = mid;
    }
    const g = lo > 0 && d[lo] > d[lo - 1] ? lo - 1 + (distance - d[lo - 1]) / (d[lo] - d[lo - 1]) : lo;
    return (frame - g) / fps;
  }
}
