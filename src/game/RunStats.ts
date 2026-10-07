import { EVENT, P, POINT_COUNT } from '../physics/Rider';
import type { Simulation } from '../physics/Simulation';

export interface Stats {
  time: number;
  distance: number;
  /** Units per second. */
  speed: number;
  topSpeed: number;
  /** Current airtime, seconds. */
  air: number;
  bestAir: number;
  rings: number;
  bounces: number;
  crashed: boolean;
  /** Seconds the rider has been (nearly) still. */
  still: number;
  score: number;
  /** Landed tricks. */
  tricks: number;
  bestTrick: string;
}

export interface Trick {
  name: string;
  points: number;
  bailed: boolean;
}

const BUTT = P.butt * 6;
const CRASH = POINT_COUNT * 6;
const CONTACT = POINT_COUNT * 6 + 1;
const EVENTS = POINT_COUNT * 6 + 2;
const TAIL_L = P.tailL * 6;
const TAIL_R = P.tailR * 6;
const NOSE_L = P.noseL * 6;
const NOSE_R = P.noseR * 6;

/** Frames off the ground before a landing counts as a jump. */
const MIN_AIR_FRAMES = 8;
/** Frames after touchdown without crashing for a trick to be awarded. */
const LAND_FRAMES = 16;
const RING_POINTS = 250;

const NUMBER_NAMES = ['', '', 'Double', 'Triple', 'Quadruple'];

/** Sled forward and lateral axes from a recorded state. */
function sledAxes(s: Float64Array, fwd: number[], lat: number[]) {
  for (let k = 0; k < 3; k++) {
    fwd[k] = (s[NOSE_L + k] + s[NOSE_R + k] - s[TAIL_L + k] - s[TAIL_R + k]) / 2;
    lat[k] = s[TAIL_R + k] - s[TAIL_L + k];
  }
}

/** Signed rotation from a to b around axis (radians). */
function signedAngle(a: number[], b: number[], axis: number[]) {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  const la = Math.hypot(a[0], a[1], a[2]);
  const lb = Math.hypot(b[0], b[1], b[2]);
  const ln = Math.hypot(axis[0], axis[1], axis[2]);
  const sin = (cx * axis[0] + cy * axis[1] + cz * axis[2]) / (la * lb * ln);
  const cos = (a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) / (la * lb);
  return Math.atan2(sin, cos);
}

/** Names and scores a jump from its total pitch rotation and airtime. */
export function scoreJump(rotation: number, air: number): Trick | null {
  const deg = Math.abs((rotation * 180) / Math.PI);
  const flips = Math.floor((deg + 90) / 360);
  const airPoints = Math.round(air * 10) * 20;
  if (flips === 0) return air >= 1 ? { name: 'Big Air', points: airPoints, bailed: false } : null;
  const kind = rotation > 0 ? 'Backflip' : 'Frontflip';
  const name = flips === 1 ? kind : `${NUMBER_NAMES[flips] ?? `${flips}×`} ${kind}`;
  return { name, points: 1000 * flips * flips + airPoints, bailed: false };
}

/**
 * Run statistics computed from the recorded simulation, so they are exact
 * and consistent with scrubbing.
 */
export class RunStats {
  stats: Stats = RunStats.empty();
  private frame = 0;
  private airFrames = 0;
  private stillFrames = 0;
  private airRotation = 0;
  private pending: { rotation: number; air: number; frame: number } | null = null;
  private queue: Trick[] = [];
  private bestTrickPoints = 0;
  private fwdA = [0, 0, 0];
  private fwdB = [0, 0, 0];
  private latB = [0, 0, 0];

  static empty(): Stats {
    return {
      time: 0,
      distance: 0,
      speed: 0,
      topSpeed: 0,
      air: 0,
      bestAir: 0,
      rings: 0,
      bounces: 0,
      crashed: false,
      still: 0,
      score: 0,
      tricks: 0,
      bestTrick: '',
    };
  }

  reset() {
    this.stats = RunStats.empty();
    this.frame = 0;
    this.airFrames = 0;
    this.stillFrames = 0;
    this.airRotation = 0;
    this.pending = null;
    this.queue = [];
    this.bestTrickPoints = 0;
  }

  /** Tricks resolved since the last call (landed or bailed). */
  takeTricks(): Trick[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  private award(t: Trick) {
    this.queue.push(t);
    if (t.bailed) return;
    const s = this.stats;
    s.score += t.points;
    s.tricks++;
    if (t.points > this.bestTrickPoints) {
      this.bestTrickPoints = t.points;
      s.bestTrick = t.name;
    }
  }

  /** Brings the stats to `frame`; returns the events that happened on the way. */
  advance(sim: Simulation, frame: number, fps: number): number {
    if (frame < this.frame) this.reset();
    let events = 0;
    const s = this.stats;
    for (let f = this.frame + 1; f <= frame; f++) {
      const a = sim.stateAt(f - 1);
      const b = sim.stateAt(f);
      if (!a || !b) break;
      const dx = b[BUTT] - a[BUTT];
      const dy = b[BUTT + 1] - a[BUTT + 1];
      const dz = b[BUTT + 2] - a[BUTT + 2];
      const step = Math.hypot(dx, dy, dz);
      s.distance += step;
      s.speed = step * fps;
      if (!s.crashed) s.topSpeed = Math.max(s.topSpeed, s.speed);
      const airborne = b[CONTACT] === 0;
      const wasCrashed = s.crashed;
      // Track pitch rotation while airborne.
      if (airborne && !wasCrashed) {
        sledAxes(a, this.fwdA, this.latB);
        sledAxes(b, this.fwdB, this.latB);
        this.airRotation += signedAngle(this.fwdA, this.fwdB, this.latB);
      }
      if (!airborne && this.airFrames > 0 && !wasCrashed) {
        if (this.pending) {
          // Glancing touch then airborne again: still the same jump.
          this.pending.rotation += this.airRotation;
          this.pending.air += this.airFrames / fps;
          this.pending.frame = f;
        } else if (this.airFrames >= MIN_AIR_FRAMES) {
          this.pending = { rotation: this.airRotation, air: this.airFrames / fps, frame: f };
        }
      }
      if (!airborne) this.airRotation = 0;
      this.airFrames = airborne ? this.airFrames + 1 : 0;
      s.air = this.airFrames / fps;
      if (!s.crashed) s.bestAir = Math.max(s.bestAir, s.air);
      this.stillFrames = s.speed < 0.6 ? this.stillFrames + 1 : 0;
      s.still = this.stillFrames / fps;
      const ev = b[EVENTS];
      if (ev & EVENT.ring) {
        s.rings++;
        if (!s.crashed) s.score += RING_POINTS;
      }
      if (ev & EVENT.bounce) s.bounces++;
      events |= ev;
      s.crashed = b[CRASH] === 1;
      // Crashing mid-air or right after touchdown voids the trick.
      if (s.crashed && !wasCrashed) {
        const attempt = this.pending ?? (airborne ? { rotation: this.airRotation, air: this.airFrames / fps, frame: f } : null);
        if (attempt && (Math.abs(attempt.rotation) > Math.PI || attempt.air > 1)) this.award({ name: 'Bailed!', points: 0, bailed: true });
        this.pending = null;
      } else if (this.pending && f - this.pending.frame >= LAND_FRAMES) {
        const trick = scoreJump(this.pending.rotation, this.pending.air);
        if (trick) this.award(trick);
        this.pending = null;
      }
      this.frame = f;
    }
    s.time = this.frame / fps;
    return events;
  }
}
