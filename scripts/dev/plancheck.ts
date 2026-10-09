/**
 * Rides a level with a given plan (JSON) and prints the path: for checking a solution.
 *   npx tsx scripts/dev/plancheck.ts <level-id> '<plan json>' [ride]
 */
import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { P } from '../../src/physics/Rider';
import { RunStats } from '../../src/game/RunStats';
import { LEVELS } from '../../src/levels/levels';
import { planAt, type InputPlan } from '../../src/levels/ride';
import { SLED, vehicleById } from '../../src/physics/vehicles';
import { SURFACES, gravityOf, normalizeWorld, surfaceOf } from '../../src/world/worlds';

const level = LEVELS.find((l) => l.id === process.argv[2])!;
const plan = JSON.parse(process.argv[3] ?? '[]') as InputPlan;
const t = new Track();
level.build(t);
const ride = process.argv[4] ?? level.vehicle;
const sim = new Simulation(t, ride ? vehicleById(ride) : SLED);
const w = normalizeWorld(level.world);
sim.setGroundDrag(SURFACES[surfaceOf(w)].drag);
sim.setGravity(gravityOf(w));
const st = new RunStats();
let out = '';
for (let f = 0; f <= 2400; f++) {
  sim.seek(f);
  st.advance(sim, f, 40);
  const b = sim.rider.pos[P.butt];
  if (f % 10 === 0) out += ` ${f}:${b.x.toFixed(0)},${b.y.toFixed(1)}${sim.rider.contact.some((c) => c) ? '' : '^'}`;
  if (st.stats.crashed) { out += ` | CRASH ${sim.rider.crashReason} at ${f} x${b.x.toFixed(1)}`; break; }
  if (st.stats.finished && f > st.stats.finishTime * 40 + 20) break;
  if (st.stats.still > 1.5 && f > 80) { out += ` | STOPPED x${b.x.toFixed(1)}`; break; }
  sim.setInput(f, planAt(plan, f));
}
console.log(out);
console.log('stars at', t.starList().map((s) => `${s.position.x.toFixed(0)},${s.position.y.toFixed(1)}`).join(' '), '| got', st.stats.stars, st.stats.finished ? 'FINISH' : '');
