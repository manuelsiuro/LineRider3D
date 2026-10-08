/** Daily rides: deterministic per day, always rideable (untouched run finishes with every star). */
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { vehicleById } from '../src/physics/vehicles';
import { RunStats } from '../src/game/RunStats';
import { SURFACES, surfaceOf } from '../src/world/worlds';
import { buildDaily, dailyInfo, dayKey } from '../src/levels/daily';
import { check } from './assert';

const first = Date.UTC(2026, 9, 1);
let slow = 0;
const rides: Record<string, number> = {};
for (let d = 0; d < 30; d++) {
  const day = dayKey(new Date(first + d * 86_400_000));
  const t0 = performance.now();
  const daily = dailyInfo(day);
  const t = new Track();
  buildDaily(day, t);
  slow = Math.max(slow, performance.now() - t0);
  const sim = new Simulation(t, vehicleById(daily.vehicle));
  sim.setGroundDrag(SURFACES[surfaceOf(daily.world)].drag);
  const stats = new RunStats();
  let f = 0;
  for (; f <= 1600; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    const s = stats.stats;
    if ((s.finished && f > s.finishTime * 40 + 20) || s.crashed || (s.still > 1.5 && f > 80)) break;
  }
  const s = stats.stats;
  const ok = s.finished && !s.crashed && s.stars === t.stars.size;
  check(ok, `${day} ${daily.name} does not ride clean`);
  rides[daily.vehicle] = (rides[daily.vehicle] ?? 0) + 1;
  // Same day, same track.
  const again = new Track();
  buildDaily(day, again);
  check(JSON.stringify(again.serialize()) === JSON.stringify(t.serialize()), `${day} is not deterministic`);
  console.log(`#${String(daily.number).padStart(2)} ${day} ${daily.name.padEnd(22)} ${daily.vehicle.padEnd(9)} ${daily.world.biome}/${daily.world.time}/${daily.world.weather}`.padEnd(78), `strokes ${t.strokes.size} stars ${s.stars}/${t.stars.size} rings ${t.rings.size} finish ${s.finishTime.toFixed(1)}s score ${s.score}/${t.targetScore}`);
}
console.error(`slowest daily: ${slow.toFixed(0)}ms`);
console.log('rides', JSON.stringify(rides));
