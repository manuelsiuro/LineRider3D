import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { P } from '../src/physics/Rider';

for (const auto of [false, true]) {
  const track = new Track();
  // Drop-in profile slope, then a path that turns 180° while descending.
  const pts: THREE.Vector3[] = [];
  for (let x = -2; x <= 20; x += 0.5) pts.push(new THREE.Vector3(x, 30 - 8 * (0.5 - 0.5 * Math.cos(Math.PI * Math.min(x, 20) / 20)), 0));
  track.addStroke({ type: 'normal', mode: 'profile', points: pts, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
  const end = pts[pts.length - 1];
  const path: THREE.Vector3[] = [end];
  let y = end.y, prev = end.clone();
  for (let a = 0.05; a <= Math.PI; a += 0.05) {
    const p = new THREE.Vector3(20 + 12 * Math.sin(a), 0, -12 + 12 * Math.cos(a));
    y -= Math.hypot(p.x - prev.x, p.z - prev.z) * 0.12;
    p.y = y; path.push(p); prev = p;
  }
  // Note: circle starts at (20,0) heading +x and turns toward -z.
  path[0] = end;
  track.addStroke({ type: 'normal', mode: 'path', points: path, planeNormal: new THREE.Vector3(0, 1, 0), bank: 0, autoBank: auto, width: 2.4 });
  track.setStart(new THREE.Vector3(0, 30.8, 0));
  const sim = new Simulation(track);
  let out = '';
  for (let f = 0; f <= 300; f += 30) { sim.seek(f); const b = sim.rider.pos[P.butt]; out += ` [${f}: ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)}${sim.rider.crashed ? ' X' : ''}]`; }
  console.log('autoBank', auto, out);
}
