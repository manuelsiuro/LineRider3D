import * as THREE from 'three';
import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { LEVELS } from '../../src/levels/levels';
import { vehicleById } from '../../src/physics/vehicles';
import { P } from '../../src/physics/Rider';

/** Roll / heading / lateral offset of a ride on a path level, frame by frame. */
const v = vehicleById(process.argv[2]);
const t = new Track();
LEVELS.find((l) => l.name === (process.argv[3] ?? 'Ring Road'))!.build(t);
const [f0, f1] = (process.argv[4] ?? '200,320').split(',').map(Number);
const sim = new Simulation(t, v);
const near = new Set<import('../../src/track/types').Segment>();
for (let f = f0; f <= f1; f += 3) {
  sim.seek(f);
  const r = sim.rider;
  const tail = r.pos[P.tailL].clone().add(r.pos[P.tailR]).multiplyScalar(0.5);
  const nose = r.pos[P.noseL].clone().add(r.pos[P.noseR]).multiplyScalar(0.5);
  const fwd = nose.clone().sub(tail).normalize();
  const lat = r.pos[P.tailR].clone().sub(r.pos[P.tailL]).normalize();
  const up = new THREE.Vector3().crossVectors(lat, fwd);
  const vel = r.pos[P.butt].clone().sub(r.prev[P.butt]);
  near.clear();
  t.querySegments(tail, near);
  let best: import('../../src/track/types').Segment | null = null;
  let bd = 1e9;
  for (const s of near) {
    if (s.wall) continue;
    const d = Math.abs(tail.clone().sub(s.a).dot(s.up));
    if (d < bd) (bd = d), (best = s);
  }
  const deg = (r: number) => ((r * 180) / Math.PI).toFixed(0);
  let info = '';
  if (best) {
    const off = tail.clone().sub(best.a).dot(best.side);
    info = `off ${off.toFixed(2)} roll ${deg(up.angleTo(best.up))} bank ${deg(best.up.angleTo(new THREE.Vector3(0, 1, 0)))} head ${deg(fwd.angleTo(best.dir))} slip ${deg(vel.clone().normalize().angleTo(fwd))}`;
  }
  console.log(`f${f} v${(vel.length() * 40).toFixed(1)} ${info} c${r.contact.map((c) => (c ? 1 : 0)).join('')}${r.crashed ? ' X ' + r.crashReason : ''}`);
  if (r.crashed) break;
}
