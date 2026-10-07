import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { LEVELS } from '../src/levels/levels';
import { VEHICLES } from '../src/physics/vehicles';
import { P } from '../src/physics/Rider';

/** Closest approach of each ride to each star of a level (classic run). */
const level = LEVELS.find((l) => l.name === (process.argv[2] ?? 'Ring Road'))!;
for (const v of VEHICLES) {
  const t = new Track();
  level.build(t);
  const stars = t.starList();
  const best = stars.map(() => 1e9);
  const sim = new Simulation(t, v);
  for (let f = 0; f < 700; f++) {
    sim.seek(f);
    const r = sim.rider;
    if (r.crashed) break;
    stars.forEach((s, k) => {
      for (const i of [P.butt, P.shoulder, P.string]) best[k] = Math.min(best[k], r.pos[i].distanceTo(s.position));
    });
  }
  console.log(v.name.padEnd(10), best.map((d) => d.toFixed(2)).join('  '));
}
