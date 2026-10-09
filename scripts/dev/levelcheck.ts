/**
 * Rides one level on its home world (with its solution, if any) and prints the body's
 * path every 20 steps, where it crashed and why, and the result: for tuning a level.
 *   npx tsx scripts/dev/levelcheck.ts <level-id> [untouched] [ride]
 */
import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { P } from '../../src/physics/Rider';
import { RunStats } from '../../src/game/RunStats';
import { LEVELS } from '../../src/levels/levels';
import { planAt } from '../../src/levels/ride';
import { SLED, vehicleById } from '../../src/physics/vehicles';
import { SURFACES, gravityOf, normalizeWorld, surfaceOf } from '../../src/world/worlds';

const level = LEVELS.find((l) => l.id === process.argv[2]);
if (!level) throw new Error(`No level ${process.argv[2]}`);
const plan = process.argv[3] === 'untouched' ? [] : (level.solution ?? []);
const t = new Track();
level.build(t);
const ride = process.argv[4] ?? level.vehicle;
const sim = new Simulation(t, ride ? vehicleById(ride) : SLED);
const w = normalizeWorld(level.world);
sim.setGroundDrag(SURFACES[surfaceOf(w)].drag);
sim.setGravity(gravityOf(w));
const st = new RunStats();
let out = '';
let f = 0;
for (; f <= 2400; f++) {
  sim.seek(f);
  st.advance(sim, f, 40);
  const b = sim.rider.pos[P.butt];
  if (f % 20 === 0) out += ` ${f}:${b.x.toFixed(0)},${b.y.toFixed(1)}${sim.rider.contact.some((c) => c) ? '' : '^'}`;
  const s = st.stats;
  if (s.crashed) {
    out += ` | CRASH ${sim.rider.crashReason} at ${f} x${b.x.toFixed(1)} y${b.y.toFixed(1)}`;
    break;
  }
  if (s.finished && f > s.finishTime * 40 + 20) break;
  if (s.still > 1.5 && f > 80) {
    out += ` | STOPPED at x${b.x.toFixed(1)}`;
    break;
  }
  sim.setInput(f, planAt(plan, f));
}
const s = st.stats;
console.log(out);
console.log(`${s.finished ? `FINISH ${s.finishTime.toFixed(1)}s` : 'no finish'} stars ${s.stars}/${t.stars.size} score ${s.score}/${t.targetScore} best ${s.bestTrick || '-'} air ${s.bestAir.toFixed(1)}s dist ${Math.round(s.distance * 0.6)} m`);
