import * as THREE from 'three';
import { EVENT, META, Rider } from './Rider';
import { SLED, type VehicleDef } from './vehicles';
import type { Track } from '../track/Track';

export const STEPS_PER_SECOND = 40;
const MAX_FRAMES = STEPS_PER_SECOND * 60 * 10;

/**
 * Deterministic fixed-step simulation that records every frame so the
 * timeline can be scrubbed freely. Any track change invalidates the recording.
 */
export class Simulation {
  rider: Rider;
  frame = 0;
  private history: Float64Array[] = [];
  /** Recorded player input per frame (input[f] drives the step f → f+1). */
  private inputs: number[] = [];
  private revision = -1;
  /** Comebacks after a crash: frame where the rider respawned → frame it was copied from. */
  private respawns = new Map<number, number>();

  constructor(
    readonly track: Track,
    vehicle: VehicleDef = SLED,
  ) {
    this.rider = new Rider(vehicle);
  }

  get vehicle(): VehicleDef {
    return this.rider.def;
  }

  /** Switches the ride; the recording starts over (inputs are kept). */
  setVehicle(vehicle: VehicleDef) {
    if (vehicle === this.rider.def) return;
    const { groundDrag, gravityScale } = this.rider;
    this.rider = new Rider(vehicle);
    this.rider.groundDrag = groundDrag;
    this.rider.gravityScale = gravityScale;
    this.history = [];
    this.revision = -1;
  }

  /** Ground drag of the world's surface (snow = 1); the recording starts over. */
  setGroundDrag(drag: number) {
    if (drag === this.rider.groundDrag) return;
    this.rider.groundDrag = drag;
    this.history = [];
    this.revision = -1;
  }

  /** Gravity of the world (1 on Earth); the recording starts over. */
  setGravity(scale: number) {
    if (scale === this.rider.gravityScale) return;
    this.rider.gravityScale = scale;
    this.history = [];
    this.revision = -1;
  }

  /** Number of frames already computed. */
  get recorded() {
    return this.history.length;
  }

  private startYaw(): number {
    // Face along the closest track segment below the start point.
    const near = new Set<import('../track/types').Segment>();
    this.track.querySegments(this.track.start, near);
    let best: { d: number; yaw: number } | null = null;
    for (const seg of near) {
      const mid = new THREE.Vector3().addVectors(seg.a, seg.b).multiplyScalar(0.5);
      const d = mid.distanceTo(this.track.start);
      const hx = seg.dir.x;
      const hz = seg.dir.z;
      if (hx * hx + hz * hz < 1e-4) continue;
      if (!best || d < best.d) best = { d, yaw: Math.atan2(-hz, hx) };
    }
    return best ? best.yaw : 0;
  }

  private ensureFresh() {
    if (this.revision === this.track.revision && this.history.length > 0) return;
    this.revision = this.track.revision;
    this.respawns.clear();
    this.rider.bindTrack(this.track);
    this.rider.reset(this.track.start, this.startYaw());
    const s = new Float64Array(this.rider.stateSize);
    this.rider.writeState(s);
    this.history = [s];
  }

  /** Recompute from scratch on next access (e.g. start moved). */
  invalidate() {
    this.revision = -1;
  }

  /** Moves the rider to `frame`, simulating forward as needed. */
  seek(frame: number) {
    this.ensureFresh();
    frame = Math.max(0, Math.min(MAX_FRAMES, Math.floor(frame)));
    if (frame >= this.history.length) {
      this.rider.readState(this.history[this.history.length - 1]);
      while (this.history.length <= frame) {
        const last = this.history.length - 1;
        const from = this.respawns.get(last);
        if (from !== undefined) {
          this.history.push(this.comeback(this.history[last], this.history[from]));
          this.rider.readState(this.history[last + 1]);
          continue;
        }
        this.rider.step(this.track, this.inputs[last] ?? 0);
        const s = new Float64Array(this.rider.stateSize);
        this.rider.writeState(s);
        this.history.push(s);
      }
    }
    this.rider.readState(this.history[frame]);
    this.frame = frame;
  }

  /** Writes interpolated point positions between frame and frame+1. */
  interpolated(alpha: number, out: THREE.Vector3[]) {
    const a = this.history[this.frame];
    const b = this.history[Math.min(this.frame + 1, this.history.length - 1)] ?? a;
    for (let i = 0; i < out.length; i++) {
      const o = i * 6;
      out[i].set(
        a[o] + (b[o] - a[o]) * alpha,
        a[o + 1] + (b[o + 1] - a[o + 1]) * alpha,
        a[o + 2] + (b[o + 2] - a[o + 2]) * alpha,
      );
    }
  }

  /** Records the input for a frame; changing it discards the recording after it. */
  setInput(frame: number, mask: number) {
    if ((this.inputs[frame] ?? 0) === mask) return;
    this.inputs[frame] = mask;
    if (this.history.length > frame + 1) this.history.length = frame + 1;
    for (const f of this.respawns.keys()) if (f > frame) this.respawns.delete(f);
  }

  /** Forgets all recorded input (classic runs and fresh attempts). */
  clearInputs() {
    if (this.inputs.some((m) => m) || this.respawns.size) this.history.length = Math.min(this.history.length, 1);
    this.inputs = [];
    this.respawns.clear();
  }

  /** The rider crashed at `frame` after passing a checkpoint (so can come back to it). */
  canRespawn(frame: number) {
    const s = this.history[frame];
    if (!s) return false;
    const m = this.rider.count * 6;
    return s[m + META.crashed] === 1 && s[m + META.finished] === 0 && s[m + META.checkpoint] > 0;
  }

  /**
   * Back to the last checkpoint after a crash: the next frame is the rider as he crossed
   * it (same speed), keeping the stars collected since. The clock keeps running.
   */
  respawn(frame: number) {
    if (!this.canRespawn(frame)) return false;
    const m = this.rider.count * 6;
    const k = this.history[frame][m + META.checkpoint];
    let from = frame;
    while (from > 0 && this.history[from - 1][m + META.checkpoint] === k) from--;
    this.respawns.set(frame, from);
    this.history.length = frame + 1;
    for (const f of this.respawns.keys()) if (f > frame) this.respawns.delete(f);
    return true;
  }

  /** Number of comebacks up to `frame`. */
  respawnsUpTo(frame: number) {
    let n = 0;
    for (const f of this.respawns.keys()) if (f < frame) n++;
    return n;
  }

  private comeback(now: Float64Array, at: Float64Array) {
    const m = this.rider.count * 6;
    const s = at.slice();
    s[m + META.crashed] = 0;
    s[m + META.events] = EVENT.respawn;
    s[m + META.stars] = unionBits(at[m + META.stars], now[m + META.stars]);
    return s;
  }

  /** Recorded inputs up to `frames` (for saving a run). */
  inputsUpTo(frames: number): number[] {
    const out: number[] = [];
    for (let f = 0; f < frames; f++) out.push(this.inputs[f] ?? 0);
    return out;
  }

  inputAt(frame: number): number {
    return this.inputs[frame] ?? 0;
  }

  /** Replaces all inputs (e.g. to replay a saved ghost run). */
  loadInputs(inputs: number[]) {
    this.inputs = inputs.slice();
    this.respawns.clear();
    this.history.length = Math.min(this.history.length, 1);
  }

  /** Raw recorded state of a frame (see Rider.writeState layout). */
  stateAt(frame: number): Float64Array | undefined {
    return this.history[frame];
  }

  crashedAt(frame: number) {
    const s = this.history[frame];
    return s ? s[this.rider.count * 6 + META.crashed] === 1 : false;
  }
}

/** Bitwise OR of two star masks (they go past 32 bits, so no `|`). */
function unionBits(a: number, b: number) {
  let out = 0;
  for (let bit = 1; a > 0 || b > 0; bit *= 2) {
    if (a % 2 === 1 || b % 2 === 1) out += bit;
    a = Math.floor(a / 2);
    b = Math.floor(b / 2);
  }
  return out;
}
