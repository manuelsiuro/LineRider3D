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
}

const BUTT = P.butt * 6;
const CRASH = POINT_COUNT * 6;
const CONTACT = POINT_COUNT * 6 + 1;
const EVENTS = POINT_COUNT * 6 + 2;

/**
 * Run statistics computed from the recorded simulation, so they are exact
 * and consistent with scrubbing.
 */
export class RunStats {
  stats: Stats = RunStats.empty();
  private frame = 0;
  private airFrames = 0;
  private stillFrames = 0;

  static empty(): Stats {
    return { time: 0, distance: 0, speed: 0, topSpeed: 0, air: 0, bestAir: 0, rings: 0, bounces: 0, crashed: false, still: 0 };
  }

  reset() {
    this.stats = RunStats.empty();
    this.frame = 0;
    this.airFrames = 0;
    this.stillFrames = 0;
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
      this.airFrames = b[CONTACT] === 0 ? this.airFrames + 1 : 0;
      s.air = this.airFrames / fps;
      if (!s.crashed) s.bestAir = Math.max(s.bestAir, s.air);
      this.stillFrames = s.speed < 0.6 ? this.stillFrames + 1 : 0;
      s.still = this.stillFrames / fps;
      const ev = b[EVENTS];
      if (ev & EVENT.ring) s.rings++;
      if (ev & EVENT.bounce) s.bounces++;
      events |= ev;
      s.crashed = b[CRASH] === 1;
      this.frame = f;
    }
    s.time = this.frame / fps;
    return events;
  }
}
