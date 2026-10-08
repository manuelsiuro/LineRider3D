import { Track } from '../src/track/Track';
import { SURFACES, normalizeWorld, surfaceOf } from '../src/world/worlds';
import { Simulation } from '../src/physics/Simulation';
import { RunStats } from '../src/game/RunStats';
import { rateRun } from '../src/game/rating';
import { LEVELS } from '../src/levels/levels';
import { VEHICLES } from '../src/physics/vehicles';
import { P } from '../src/physics/Rider';
import { buildDemoTrack } from '../src/demoTrack';

/**
 * Every vehicle on every level, classic run (no input): finish, stars,
 * crashes. Only levels a vehicle is marked for must pass with it.
 */
const only = process.argv[2];
const tracks = [{ name: 'Demo', build: buildDemoTrack }, ...LEVELS];
let failed = false;
for (const v of VEHICLES) {
  if (only && v.id !== only) continue;
  const row: string[] = [];
  for (const level of tracks) {
    // Ride levels are only played with their own ride.
    if ('vehicle' in level && level.vehicle && level.vehicle !== v.id) continue;
    const t = new Track();
    level.build(t);
    const sim = new Simulation(t, v);
    if ('world' in level) sim.setGroundDrag(SURFACES[surfaceOf(normalizeWorld(level.world))].drag);
    const stats = new RunStats();
    let f = 0;
    let bad = '';
    for (; f <= 1600; f++) {
      sim.seek(f);
      stats.advance(sim, f, 40);
      const s = stats.stats;
      const b = sim.rider.pos[P.butt];
      if (!Number.isFinite(b.x)) {
        bad = 'NaN';
        break;
      }
      if ((s.finished && f > s.finishTime * 40 + 40) || s.crashed || (s.still > 1.5 && f > 80)) break;
    }
    const s = stats.stats;
    const r = rateRun(t, s);
    const ok = s.finished && s.stars === t.stars.size && !s.crashed;
    if (bad || !ok) failed = true;
    row.push(`${level.name.slice(0, 12).padEnd(12)} ${bad || (ok ? 'ok ' : s.crashed ? `X@${(f / 40).toFixed(1)}` : s.finished ? `☆${s.stars}/${t.stars.size}` : 'stop')} ${'★'.repeat(r.stars)}`);
  }
  console.log(`${v.name.padEnd(10)} ${row.join(' | ')}`);
}
if (failed) process.exitCode = 1;
