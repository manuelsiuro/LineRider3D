/**
 * Traces a puzzle run, untouched and with its solution: the body every 20 steps.
 *   npx tsx scripts/dev/puzzletrace.ts <puzzle-id>
 */
import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { RunStats } from '../../src/game/RunStats';
import { P } from '../../src/physics/Rider';
import { PUZZLES, puzzleKind } from '../../src/levels/puzzles';
import { gravityOf, normalizeWorld } from '../../src/world/worlds';

const p = PUZZLES.find((x) => x.id === process.argv[2]);
if (!p) throw new Error(`No puzzle ${process.argv[2]}`);
for (const solved of [false, true]) {
  const t = new Track();
  p.build(t);
  if (puzzleKind(p) !== 'erase') for (const s of t.strokes.values()) s.locked = true;
  if (solved) p.solution(t);
  const sim = new Simulation(t);
  sim.setGravity(gravityOf(normalizeWorld(p.world)));
  const st = new RunStats();
  let out = '';
  for (let f = 0; f <= 600; f++) {
    sim.seek(f);
    st.advance(sim, f, 40);
    const b = sim.rider.pos[P.butt];
    if (f % 20 === 0) out += ` ${f}:${b.x.toFixed(0)},${b.y.toFixed(1)}`;
    if (st.stats.crashed || st.stats.finished) {
      out += ` | ${st.stats.crashed ? `CRASH ${sim.rider.crashReason}` : 'FINISH'} at ${f} x${b.x.toFixed(1)} y${b.y.toFixed(1)}`;
      break;
    }
  }
  console.log(solved ? 'solved  ' : 'untouched', out, `| tricks ${st.stats.tricks} ${st.stats.bestTrick} air ${st.stats.bestAir.toFixed(2)}`);
}
