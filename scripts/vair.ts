import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { LEVELS } from '../src/levels/levels';
import { vehicleById } from '../src/physics/vehicles';
import { P } from '../src/physics/Rider';
import { buildDemoTrack } from '../src/demoTrack';

/** Pitch of the ride vs its flight direction, frame by frame. */
const v = vehicleById(process.argv[2]);
const name = process.argv[3] ?? 'Demo';
const [f0, f1] = (process.argv[4] ?? '120,220').split(',').map(Number);
const t = new Track();
(name === 'Demo' ? { build: buildDemoTrack } : LEVELS.find((l) => l.name === name)!).build(t);
const sim = new Simulation(t, v);
for (let f = f0; f <= f1; f += 2) {
  sim.seek(f);
  const r = sim.rider;
  const tail = r.pos[P.tailL].clone().add(r.pos[P.tailR]).multiplyScalar(0.5);
  const nose = r.pos[P.noseL].clone().add(r.pos[P.noseR]).multiplyScalar(0.5);
  const fwd = nose.sub(tail);
  const vel = r.pos[P.butt].clone().sub(r.prev[P.butt]);
  const deg = (x: number, y: number) => ((Math.atan2(y, x) * 180) / Math.PI).toFixed(0);
  console.log(`f${f} x${tail.x.toFixed(1)} y${tail.y.toFixed(1)} pitch ${deg(fwd.x, fwd.y)} flight ${deg(vel.x, vel.y)} contact ${r.contact.map((c) => (c ? 1 : 0)).join('')} ${r.crashed ? 'X ' + r.crashReason : ''}`);
  if (r.crashed) break;
}
