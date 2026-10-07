import * as THREE from 'three';
import { EVENT, P, POINT_COUNT } from '../physics/Rider';
import type { Simulation } from '../physics/Simulation';
import type { Segment } from '../track/types';
import { terrainHeight } from '../world/terrain';

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
  perfects: number;
  /** Current combo multiplier (1 = no combo). */
  combo: number;
  bestCombo: number;
  /** Remaining combo window, 0..1. */
  comboLeft: number;
}

export type Grade = 'perfect' | 'good' | 'sketchy';

export interface Trick {
  name: string;
  points: number;
  bailed: boolean;
  grade?: Grade;
  combo?: number;
  repeat?: boolean;
}

const BUTT = P.butt * 6;
const CRASH = POINT_COUNT * 6;
const CONTACT = POINT_COUNT * 6 + 1;
const EVENTS = POINT_COUNT * 6 + 2;
const SPIN = POINT_COUNT * 6 + 3;
const TAIL_L = P.tailL * 6;
const TAIL_R = P.tailR * 6;
const NOSE_L = P.noseL * 6;
const NOSE_R = P.noseR * 6;

/** Frames off the ground before a landing counts as a jump. */
const MIN_AIR_FRAMES = 8;
/** Frames after touchdown without crashing for a trick to be awarded. */
const LAND_FRAMES = 16;
const RING_POINTS = 250;
/** Seconds to land the next trick or ring before the combo ends. */
const COMBO_WINDOW = 3.5;
const MAX_COMBO = 5;

export const GRADE_MULT: Record<Grade, number> = { perfect: 2, good: 1, sketchy: 0.5 };
export const GRADE_LABEL: Record<Grade, string> = { perfect: 'Perfect', good: 'Good', sketchy: 'Sketchy' };

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

/** Names and scores a jump (before grade and combo) from its rotation and airtime. */
export function scoreJump(rotation: number, air: number): { name: string; points: number } | null {
  const deg = Math.abs((rotation * 180) / Math.PI);
  const flips = Math.floor((deg + 90) / 360);
  const airPoints = Math.round(air * 10) * 20;
  if (flips === 0) return air >= 1 ? { name: 'Big Air', points: airPoints } : null;
  const kind = rotation > 0 ? 'Backflip' : 'Frontflip';
  const name = flips === 1 ? kind : `${NUMBER_NAMES[flips] ?? `${flips}×`} ${kind}`;
  return { name, points: 1000 * flips * flips + airPoints };
}

/**
 * Landing quality from the angle between sled and surface, downgraded when
 * Bosh is still spinning at touchdown (the flip key was held too long).
 */
export function gradeLanding(deg: number, spin: number): Grade {
  const byAngle: Grade = deg <= 15 ? 'perfect' : deg <= 30 ? 'good' : 'sketchy';
  const s = Math.abs(spin);
  const bySpin: Grade = s < 0.04 ? 'perfect' : s < 0.12 ? 'good' : 'sketchy';
  const order: Grade[] = ['perfect', 'good', 'sketchy'];
  return order[Math.max(order.indexOf(byAngle), order.indexOf(bySpin))];
}

const near = new Set<Segment>();
const tmp = new THREE.Vector3();

/**
 * Run statistics and scoring computed from the recorded simulation, so they
 * are exact and consistent with scrubbing and replays.
 */
export class RunStats {
  stats: Stats = RunStats.empty();
  private frame = 0;
  private airFrames = 0;
  private stillFrames = 0;
  private airRotation = 0;
  private pending: { rotation: number; air: number; frame: number; angle: number; spin: number } | null = null;
  private queue: Trick[] = [];
  private bestTrickPoints = 0;
  private chain = 0;
  private lastActionFrame = -1e9;
  private lastTrickName = '';
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
      perfects: 0,
      combo: 1,
      bestCombo: 1,
      comboLeft: 0,
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
    this.chain = 0;
    this.lastActionFrame = -1e9;
    this.lastTrickName = '';
  }

  /** Tricks resolved since the last call (landed or bailed). */
  takeTricks(): Trick[] {
    const q = this.queue;
    this.queue = [];
    return q;
  }

  private get multiplier() {
    return Math.min(1 + 0.5 * this.chain, MAX_COMBO);
  }

  /** Something combo-worthy happened: extend the chain. */
  private bump(frame: number) {
    this.chain++;
    this.lastActionFrame = frame;
    this.stats.bestCombo = Math.max(this.stats.bestCombo, this.multiplier);
  }

  private award(base: { name: string; points: number }, grade: Grade, frame: number) {
    const s = this.stats;
    const repeat = base.name === this.lastTrickName;
    const combo = this.multiplier;
    const points = Math.round((base.points * GRADE_MULT[grade] * (repeat ? 0.5 : 1) * combo) / 10) * 10;
    this.queue.push({ name: base.name, points, bailed: false, grade, combo, repeat });
    s.score += points;
    s.tricks++;
    if (grade === 'perfect') s.perfects++;
    if (points > this.bestTrickPoints) {
      this.bestTrickPoints = points;
      s.bestTrick = `${GRADE_LABEL[grade]} ${base.name}`;
    }
    this.lastTrickName = base.name;
    this.bump(frame);
  }

  private bail() {
    this.queue.push({ name: 'Bailed!', points: 0, bailed: true });
  }

  /**
   * Angle (degrees) between the sled's underside and the surface it lands on:
   * 0 means it touched down perfectly flat.
   */
  private landingAngle(sim: Simulation, s: Float64Array): number {
    sledAxes(s, this.fwdB, this.latB);
    const fwd = new THREE.Vector3().fromArray(this.fwdB).normalize();
    const lat = new THREE.Vector3().fromArray(this.latB).normalize();
    const up = new THREE.Vector3().crossVectors(lat, fwd).normalize();
    const center = new THREE.Vector3(
      (s[TAIL_L] + s[TAIL_R] + s[NOSE_L] + s[NOSE_R]) / 4,
      (s[TAIL_L + 1] + s[TAIL_R + 1] + s[NOSE_L + 1] + s[NOSE_R + 1]) / 4,
      (s[TAIL_L + 2] + s[TAIL_R + 2] + s[NOSE_L + 2] + s[NOSE_R + 2]) / 4,
    );
    let normal: THREE.Vector3 | null = null;
    let best = Infinity;
    near.clear();
    sim.track.querySegments(center, near);
    for (const seg of near) {
      tmp.subVectors(center, seg.a);
      const t = tmp.dot(seg.dir);
      if (t < -0.5 || t > seg.len + 0.5) continue;
      if (Math.abs(tmp.dot(seg.side)) > seg.halfWidth + 0.3) continue;
      const d = Math.abs(tmp.dot(seg.up));
      if (d < best && d < 1.2) {
        best = d;
        normal = seg.up;
      }
    }
    if (!normal) normal = center.y - terrainHeight(center.x, center.z) < 1.2 ? new THREE.Vector3(0, 1, 0) : up;
    return (Math.acos(THREE.MathUtils.clamp(up.dot(normal), -1, 1)) * 180) / Math.PI;
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
          this.pending.angle = this.landingAngle(sim, b);
          this.pending.spin = a[SPIN];
        } else if (this.airFrames >= MIN_AIR_FRAMES) {
          this.pending = { rotation: this.airRotation, air: this.airFrames / fps, frame: f, angle: this.landingAngle(sim, b), spin: a[SPIN] };
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
        if (!s.crashed) {
          s.score += Math.round(RING_POINTS * this.multiplier);
          this.bump(f);
        }
      }
      if (ev & EVENT.bounce) s.bounces++;
      events |= ev;
      s.crashed = b[CRASH] === 1;

      if (s.crashed && !wasCrashed) {
        // Crashing mid-air or right after touchdown voids the trick and the combo.
        const attempt = this.pending ?? (airborne ? { rotation: this.airRotation, air: this.airFrames / fps } : null);
        if (attempt && (Math.abs(attempt.rotation) > Math.PI || attempt.air > 1)) this.bail();
        this.pending = null;
        this.chain = 0;
      } else if (this.pending && f - this.pending.frame >= LAND_FRAMES) {
        const base = scoreJump(this.pending.rotation, this.pending.air);
        if (base) this.award(base, gradeLanding(this.pending.angle, this.pending.spin), f);
        this.pending = null;
      }

      // The combo ends when nothing happens for a while (airtime keeps it alive).
      if (this.chain > 0 && !airborne && !this.pending && f - this.lastActionFrame > COMBO_WINDOW * fps) this.chain = 0;
      this.frame = f;
    }
    s.combo = this.multiplier;
    s.comboLeft = this.chain > 0 ? Math.max(0, 1 - (this.frame - this.lastActionFrame) / (COMBO_WINDOW * fps)) : 0;
    s.time = this.frame / fps;
    return events;
  }
}
