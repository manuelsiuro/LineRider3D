import { Track } from '../src/track/Track';
import { SURFACES, normalizeWorld, surfaceOf } from '../src/world/worlds';
import { Simulation } from '../src/physics/Simulation';
import { INPUT } from '../src/physics/Rider';
import { RunStats } from '../src/game/RunStats';
import { rateRun } from '../src/game/rating';
import { LEVELS } from '../src/levels/levels';
import { vehicleById } from '../src/physics/vehicles';

/** Each level must be finishable, with all stars, in a classic (no input) run. */
let failed = false;
let slowest = 0;
for (const level of LEVELS) {
  const t = new Track();
  const t0 = performance.now();
  level.build(t);
  slowest = Math.max(slowest, performance.now() - t0);
  const sim = new Simulation(t, level.vehicle ? vehicleById(level.vehicle) : undefined);
  // On its home ground (sand drags more, asphalt less).
  sim.setGroundDrag(SURFACES[surfaceOf(normalizeWorld(level.world))].drag);
  const stats = new RunStats();
  let f = 0;
  for (; f <= 1600; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    const s = stats.stats;
    if ((s.finished && f > s.finishTime * 40 + 40) || s.crashed || (s.still > 1.5 && f > 80)) break;
  }
  const s = stats.stats;
  const r = rateRun(t, s);
  const ok = s.finished && s.stars === t.stars.size && !s.crashed;
  if (!ok) failed = true;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${level.name.padEnd(14)} stars ${s.stars}/${t.stars.size}  ${s.finished ? `finish ${s.finishTime.toFixed(1)}s` : 'NO FINISH'}${s.crashed ? ' CRASH' : ''}  score ${s.score}/${t.targetScore}  ${'★'.repeat(r.stars)}${'☆'.repeat(3 - r.stars)}  end x=${sim.rider.pos[6].x.toFixed(0)},y=${sim.rider.pos[6].y.toFixed(1)},z=${sim.rider.pos[6].z.toFixed(1)} f${f}`,
  );
}
void INPUT;
console.error(`slowest build: ${slowest.toFixed(0)}ms`);
if (failed) process.exitCode = 1;
