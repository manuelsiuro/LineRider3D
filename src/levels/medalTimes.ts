import { Track } from '../track/Track';
import { Simulation } from '../physics/Simulation';
import { INPUT } from '../physics/Rider';
import { VEHICLES, type VehicleDef } from '../physics/vehicles';
import { RunStats } from '../game/RunStats';
import { SURFACES, normalizeWorld, surfaceOf } from '../world/worlds';
import type { LevelDef } from './levels';

/** Bronze, silver, gold and dev finish times, in seconds. */
export type MedalTimes = [number, number, number, number];

/**
 * Finish time of a run on the level's home ground: untouched, or pushing
 * whenever the ride touches something (a simple autopilot). Null: no clean finish.
 */
function finishTime(level: LevelDef, v: VehicleDef, push: boolean): number | null {
  const t = new Track();
  level.build(t);
  const sim = new Simulation(t, v);
  sim.setGroundDrag(SURFACES[surfaceOf(normalizeWorld(level.world))].drag);
  const stats = new RunStats();
  for (let f = 0; f <= 1600; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    const s = stats.stats;
    if (s.crashed) return null;
    if (s.finished) return s.finishTime;
    if (s.still > 1.5 && f > 80) return null;
    if (push) sim.setInput(f, sim.rider.contact.some((c) => c) ? INPUT.push : 0);
  }
  return null;
}

const up = (x: number) => Math.ceil(x * 10 - 1e-9) / 10;

/**
 * Medal times from two reference runs: letting it ride (or a bit slower)
 * earns bronze, silver needs some pushing, gold nearly matches an
 * always-pushing autopilot, dev beats it.
 */
export function computeMedals(level: LevelDef, v: VehicleDef): MedalTimes | null {
  const classic = finishTime(level, v, false);
  if (classic === null) return null;
  const pushed = finishTime(level, v, true);
  const fast = pushed !== null ? Math.min(pushed, classic) : classic;
  const r = (x: number) => Math.round(x * 10) / 10;
  const dev = up(fast * 0.99);
  const gold = r(Math.max(up(fast * 1.03), dev + 0.1));
  const silver = r(Math.max(Math.min(up(classic * 0.97), up((classic + gold) / 2)), gold + 0.2));
  const bronze = r(Math.max(up(classic * 1.2), silver + 0.5));
  return [bronze, silver, gold, dev];
}

/** Every (level, ride) pair that gets medals: the level's own ride, or every ride. */
export function medalPairs(levels: LevelDef[]) {
  const out: [LevelDef, VehicleDef][] = [];
  for (const level of levels) for (const v of VEHICLES) if (!level.vehicle || level.vehicle === v.id) out.push([level, v]);
  return out;
}
