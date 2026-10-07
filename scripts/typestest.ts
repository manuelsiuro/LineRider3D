import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { P } from '../src/physics/Rider';
import type { LineType } from '../src/track/types';

function line(track: Track, type: LineType, x0: number, x1: number, fn: (x: number) => number) {
  const points: THREE.Vector3[] = [];
  for (let x = x0; x <= x1; x += 0.5) points.push(new THREE.Vector3(x, fn(x), 0));
  track.addStroke({ type, mode: 'profile', points, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
}

function run(name: string, track: Track, frames: number, every: number) {
  const sim = new Simulation(track);
  let out = '';
  for (let f = 0; f <= frames; f += every) {
    sim.seek(f);
    const b = sim.rider.pos[P.butt];
    const v = sim.rider.velocity(new THREE.Vector3());
    out += ` [${f}: x${b.x.toFixed(1)} y${b.y.toFixed(1)} v${(v.length() * 40).toFixed(1)}${sim.rider.crashed ? ' X' : ''}]`;
  }
  console.log(name.padEnd(8), out);
}

// Bouncy: fall from height onto a flat pad.
for (const type of ['normal', 'bouncy'] as LineType[]) {
  const t = new Track();
  line(t, type, -5, 40, () => 2);
  t.setStart(new THREE.Vector3(0, 8, 0));
  run(type, t, 160, 16);
}

// Ice vs normal: same slope then flat; ice keeps more speed? (no friction anyway) mostly check stability.
for (const type of ['normal', 'ice'] as LineType[]) {
  const t = new Track();
  line(t, type, -2, 60, (x) => Math.max(2, 14 - x * 0.4));
  t.setStart(new THREE.Vector3(0, 14.8, 0));
  run(type, t, 200, 40);
}

// Ring: flat track, ring halfway.
for (const ring of [false, true]) {
  const t = new Track();
  line(t, 'normal', -2, 120, () => 2);
  t.setStart(new THREE.Vector3(0, 2.8, 0));
  if (ring) t.addRing({ position: new THREE.Vector3(6, 3.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.8 });
  run(ring ? 'ring' : 'noring', t, 200, 40);
}
