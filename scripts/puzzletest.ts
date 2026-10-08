/**
 * Puzzles: each known solution finishes with every star within par (so three
 * stars are possible), and only "Star Route" can be finished without drawing.
 */
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { RunStats } from '../src/game/RunStats';
import { PUZZLES, inkUsed } from '../src/levels/puzzles';
import { check } from './assert';

function ride(t: Track) {
  const sim = new Simulation(t);
  const st = new RunStats();
  for (let f = 0; f <= 1200; f++) {
    sim.seek(f);
    st.advance(sim, f, 40);
    const s = st.stats;
    if ((s.finished && f > s.finishTime * 40 + 20) || s.crashed || (s.still > 1.5 && f > 80)) break;
  }
  return st.stats;
}

const ids = new Set<string>();
for (const p of PUZZLES) {
  check(!ids.has(p.id), `duplicate puzzle id ${p.id}`);
  ids.add(p.id);
  check(p.par <= p.ink, `${p.id}: par above the ink limit`);
  const bare = new Track();
  p.build(bare);
  const unsolved = ride(bare);
  const solvesItself = unsolved.finished && !unsolved.crashed;
  check(solvesItself === (p.id === 'star-route'), `${p.id}: finishes without drawing = ${solvesItself}`);
  const t = new Track();
  p.build(t);
  for (const s of t.strokes.values()) s.locked = true;
  p.solution(t);
  const s = ride(t);
  const ink = inkUsed(t);
  check(s.finished && !s.crashed, `${p.id}: the solution does not finish`);
  check(s.stars === t.stars.size, `${p.id}: the solution misses stars (${s.stars}/${t.stars.size})`);
  check(ink <= p.par + 1e-6, `${p.id}: the solution uses ${ink.toFixed(1)} ink, par is ${p.par}`);
  console.log(`${p.id.padEnd(15)} unsolved ${solvesItself ? 'finishes' : 'fails   '} solved ${s.finishTime.toFixed(2)}s stars ${s.stars}/${t.stars.size} ink ${ink.toFixed(1)}/${p.par}/${p.ink}`);
}
