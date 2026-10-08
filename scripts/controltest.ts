import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT, P } from '../src/physics/Rider';
import { check } from './assert';
import { buildDemoTrack } from '../src/demoTrack';

const kmh = (sim: Simulation) => (sim.rider.velocity(new THREE.Vector3()).length() * 40 * 3.6 * 0.6).toFixed(0);

// Push on a flat track.
{
  const t = new Track();
  const pts: THREE.Vector3[] = [];
  for (let x = -2; x <= 200; x += 0.5) pts.push(new THREE.Vector3(x, 2, 0));
  t.addStroke({ type: 'normal', mode: 'profile', points: pts, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
  t.setStart(new THREE.Vector3(0, 2.8, 0));
  const sim = new Simulation(t);
  for (let f = 0; f < 200; f++) sim.setInput(f, INPUT.push);
  let out = '';
  for (let f = 0; f <= 200; f += 40) { sim.seek(f); out += ` [${f}: ${kmh(sim)}km/h${sim.rider.crashed ? ' X' : ''}]`; }
  console.log('push flat', out);
  sim.seek(160);
  check(+kmh(sim) >= 45, 'pushing on the flat should reach top speed');
  for (let f = 100; f < 200; f++) sim.setInput(f, INPUT.brake);
  out = '';
  for (let f = 100; f <= 200; f += 20) { sim.seek(f); out += ` [${f}: ${kmh(sim)}km/h${sim.rider.crashed ? ' X' : ''}]`; }
  console.log('then brake', out);
  check(+kmh(sim) <= 3, 'braking should stop the sled');
}

// Flips over the demo jump: hold a key while airborne, then release.
for (const [name, key, hold] of [['none', 0, 0], ['backflip', INPUT.brake, 30], ['frontflip', INPUT.push, 30]] as const) {
  const t = new Track();
  buildDemoTrack(t);
  const sim = new Simulation(t);
  // Find takeoff: first airborne frame after 100.
  let takeoff = -1;
  for (let f = 100; f < 200; f++) { sim.seek(f); if (!sim.rider.contact.some((c) => c)) { takeoff = f; break; } }
  for (let f = takeoff; f < takeoff + hold; f++) sim.setInput(f, key);
  let rot = 0;
  let prevFwd: THREE.Vector3 | null = null;
  let crash = -1;
  let landing = -1;
  for (let f = takeoff; f < 300; f++) {
    sim.seek(f);
    const r = sim.rider;
    if (landing < 0 && f > takeoff + 3 && r.contact.some((c) => c)) landing = f;
    const tail = r.pos[P.tailL].clone().add(r.pos[P.tailR]).multiplyScalar(0.5);
    const fwd = r.pos[P.noseL].clone().add(r.pos[P.noseR]).multiplyScalar(0.5).sub(tail).normalize();
    const lat = r.pos[P.tailR].clone().sub(r.pos[P.tailL]).normalize();
    if (prevFwd && landing < 0) rot += Math.atan2(new THREE.Vector3().crossVectors(prevFwd, fwd).dot(lat), prevFwd.dot(fwd));
    prevFwd = fwd;
    if (r.crashed && crash < 0) crash = f;
  }
  const deg = (rot * 180) / Math.PI;
  check(crash < 0, `${name} over the demo jump crashed`);
  if (name === 'backflip') check(deg > 300, `backflip rotated only ${deg.toFixed(0)}°`);
  if (name === 'frontflip') check(deg < -300, `frontflip rotated only ${deg.toFixed(0)}°`);
  console.log(name.padEnd(10), 'takeoff', takeoff, 'landing', landing, 'air rotation', ((rot * 180) / Math.PI).toFixed(0) + '°', 'crash', crash);
}
