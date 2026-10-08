import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { VEHICLES } from '../src/physics/vehicles';
import { P } from '../src/physics/Rider';
import { SURFACES } from '../src/world/worlds';

/**
 * Ground surfaces: snow (drag 1) must be bit-identical to the original
 * physics; other grounds only change how far a rider slides on the ground.
 */
function runout(drag: number | null, vehicle = VEHICLES[0]) {
  const t = new Track();
  // A ramp that drops the rider onto flat ground.
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 40; i++) {
    const x = i;
    pts.push(new THREE.Vector3(x, Math.max(0.3, 12 - x * 0.45), 0));
  }
  t.addStroke({ type: 'normal', mode: 'profile', points: pts, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
  t.setStart(new THREE.Vector3(1, 13, 0));
  const sim = new Simulation(t, vehicle);
  if (drag !== null) sim.setGroundDrag(drag);
  const trace: number[] = [];
  for (let f = 0; f <= 400; f++) {
    sim.seek(f);
    trace.push(sim.rider.pos[P.butt].x, sim.rider.pos[P.butt].y);
  }
  return trace;
}

let failed = false;
const base = runout(null);
const snow = runout(SURFACES.snow.drag);
if (base.some((v, i) => v !== snow[i])) {
  console.log('FAIL snow is not bit-identical to the original physics');
  failed = true;
}
const far = (tr: number[]) => tr[tr.length - 2];
const results = (Object.keys(SURFACES) as (keyof typeof SURFACES)[]).map((k) => [k, far(runout(SURFACES[k].drag))] as const);
console.log('runout x:', results.map(([k, x]) => `${k}=${x.toFixed(1)}`).join(' '));
const at = Object.fromEntries(results);
if (!(at.sand < at.grass && at.grass < at.snow && at.snow < at.asphalt)) {
  console.log('FAIL expected sand < grass < snow < asphalt runouts');
  failed = true;
}
if (failed) process.exit(1);
console.log('surface test OK');
