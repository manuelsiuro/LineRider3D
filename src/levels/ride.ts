import { Track } from '../track/Track';
import { Simulation } from '../physics/Simulation';
import { INPUT, P } from '../physics/Rider';
import { RunStats, type Stats } from '../game/RunStats';
import { SURFACES, gravityOf, normalizeWorld, surfaceOf } from '../world/worlds';
import { SLED, vehicleById, type VehicleDef } from '../physics/vehicles';
import type { LevelDef } from './levels';

/**
 * Inputs for a whole run, as changes: from each frame on, these keys are held (until the
 * next entry). `[[0, 0]]` (or empty) is an untouched run.
 */
export type InputPlan = [frame: number, mask: number][];

/** The input mask a plan holds at a frame. */
export function planAt(plan: InputPlan, frame: number) {
  let mask = 0;
  for (const [f, m] of plan) {
    if (f > frame) break;
    mask = m;
  }
  return mask;
}

export interface LevelRide {
  stats: Stats;
  track: Track;
  /** Frames simulated. */
  frames: number;
  /** Airborne frames (the body off every surface). */
  airFrames: number;
  /** Where the run ended. */
  end: { x: number; y: number; z: number };
}

/**
 * Rides a level on its home world (ground drag and gravity) with an input plan (and
 * optionally an autopilot that pushes whenever the ride touches something). Stops a
 * second after the finish, on a crash, or once the rider has stood still.
 */
export function rideLevel(level: LevelDef, opts: { plan?: InputPlan; vehicle?: VehicleDef; push?: boolean; maxFrames?: number } = {}): LevelRide {
  const track = new Track();
  level.build(track);
  const vehicle = opts.vehicle ?? (level.vehicle ? vehicleById(level.vehicle) : SLED);
  const sim = new Simulation(track, vehicle);
  const world = normalizeWorld(level.world);
  sim.setGroundDrag(SURFACES[surfaceOf(world)].drag);
  sim.setGravity(gravityOf(world));
  const plan = opts.plan ?? [];
  const stats = new RunStats();
  let airFrames = 0;
  let f = 0;
  for (; f <= (opts.maxFrames ?? 2400); f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    const s = stats.stats;
    if (!sim.rider.contact.some((c) => c)) airFrames++;
    if ((s.finished && f > s.finishTime * 40 + 40) || s.crashed || (s.still > 1.5 && f > 80)) break;
    let mask = planAt(plan, f);
    if (opts.push && sim.rider.contact.some((c) => c) && !(mask & INPUT.brake)) mask |= INPUT.push;
    sim.setInput(f, mask);
  }
  const b = sim.rider.pos[P.butt];
  return { stats: stats.stats, track, frames: f, airFrames, end: { x: b.x, y: b.y, z: b.z } };
}

/** A clean run: finished with every star, no crash. */
export const cleanRun = (r: LevelRide) => r.stats.finished && !r.stats.crashed && r.stats.stars === r.track.stars.size;
