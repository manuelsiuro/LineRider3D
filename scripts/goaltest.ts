import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT } from '../src/physics/Rider';
import { RunStats } from '../src/game/RunStats';
import { rateRun } from '../src/game/rating';
import { check } from './assert';
import { buildDemoTrack } from '../src/demoTrack';

for (const [name, key, hold] of [['classic', 0, 0], ['backflip', INPUT.brake, 25]] as const) {
  const t = new Track();
  buildDemoTrack(t);
  const sim = new Simulation(t);
  for (let f = 130; f < 130 + hold; f++) sim.setInput(f, key);
  const stats = new RunStats();
  for (let f = 0; f <= 500; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    if (stats.stats.finished && f > stats.stats.finishTime * 40 + 60) break;
  }
  const s = stats.stats;
  const r = rateRun(t, s);
  check(s.finished && s.stars === t.stars.size, `${name}: should finish with every star`);
  check(r.stars === (name === 'classic' ? 2 : 3), `${name}: rated ${r.stars} stars`);
  console.log(name.padEnd(9), `stars ${s.stars}/${t.stars.size}`, s.finished ? `finish ${s.finishTime.toFixed(2)}s` : 'no finish', s.crashed ? 'CRASH' : '', 'score', s.score, '→', '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars));
}
