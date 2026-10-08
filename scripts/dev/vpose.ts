import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { LEVELS } from '../../src/levels/levels';
import { vehicleById } from '../../src/physics/vehicles';

/** Local pose of every point (relative to the start pose) at a few frames. */
const v = vehicleById(process.argv[2]);
const t = new Track();
LEVELS.find((l) => l.name === (process.argv[3] ?? 'First Run'))!.build(t);
const sim = new Simulation(t, v);
for (const f of (process.argv[4] ?? '0,1,5,20,60').split(',').map(Number)) {
  sim.seek(f);
  const r = sim.rider;
  const o = r.pos[0].clone().add(r.pos[1]).multiplyScalar(0.5);
  console.log(`f${f} ` + r.pos.map((p, i) => `${i}:${(p.x - o.x).toFixed(2)},${(p.y - o.y).toFixed(2)}`).join(' '));
}
