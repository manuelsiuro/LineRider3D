import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { RunStats } from '../src/game/RunStats';
import { rateRun } from '../src/game/rating';
import { LEVELS } from '../src/levels/levels';
import { VEHICLES } from '../src/physics/vehicles';
import { P } from '../src/physics/Rider';
import { buildDemoTrack } from '../src/demoTrack';
import { rideLevel } from '../src/levels/ride';

/**
 * Every vehicle on every level, on its home world, untouched (or with the level's
 * solution, for levels that need input): finish, stars, crashes. Levels made for one ride
 * are only played with it; a solution only has to work for the level's own ride (the sled
 * unless it names one).
 */
const only = process.argv[2];
let failed = false;

function demo(v: (typeof VEHICLES)[number]) {
  const t = new Track();
  buildDemoTrack(t);
  const sim = new Simulation(t, v);
  const stats = new RunStats();
  let f = 0;
  for (; f <= 1600; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    const s = stats.stats;
    if (!Number.isFinite(sim.rider.pos[P.butt].x)) return { stats: s, track: t, frames: f, nan: true };
    if ((s.finished && f > s.finishTime * 40 + 40) || s.crashed || (s.still > 1.5 && f > 80)) break;
  }
  return { stats: stats.stats, track: t, frames: f, nan: false };
}

for (const v of VEHICLES) {
  if (only && v.id !== only) continue;
  const row: string[] = [];
  for (const level of [null, ...LEVELS]) {
    if (level?.vehicle && level.vehicle !== v.id) continue;
    const r = level ? { ...rideLevel(level, { vehicle: v, plan: level.solution, maxFrames: 1600 }), nan: false } : demo(v);
    const s = r.stats;
    const rating = rateRun(r.track, s);
    const ok = s.finished && s.stars === r.track.stars.size && !s.crashed;
    // A solution is timed for one ride: others only report.
    const mustPass = !level?.solution || (level.vehicle ?? 'sled') === v.id;
    if (r.nan || (!ok && mustPass)) failed = true;
    const name = level?.name ?? 'Demo';
    row.push(`${name.slice(0, 12).padEnd(12)} ${r.nan ? 'NaN' : ok ? 'ok ' : s.crashed ? `X@${(r.frames / 40).toFixed(1)}` : s.finished ? `☆${s.stars}/${r.track.stars.size}` : 'stop'}${mustPass ? '' : '?'} ${'★'.repeat(rating.stars)}`);
  }
  console.log(`${v.name.padEnd(10)} ${row.join(' | ')}`);
}
if (failed) process.exitCode = 1;
