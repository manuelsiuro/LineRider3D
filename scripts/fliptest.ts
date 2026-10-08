import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT, P } from '../src/physics/Rider';
import { check } from './assert';
import type { LineType } from '../src/track/types';

/** Big kicker with a long landing: room for flips. */
export function bigJump(t: Track) {
  const line = (fn: (x: number) => number, x0: number, x1: number, type: LineType = 'normal') => {
    const pts: THREE.Vector3[] = [];
    for (let x = x0; x <= x1 + 1e-6; x += 0.5) pts.push(new THREE.Vector3(x, fn(x), 0));
    t.addStroke({ type, mode: 'profile', points: pts, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
  };
  t.setStart(new THREE.Vector3(0, 40.8, 0));
  line((x) => 40 - 26 * (0.5 - 0.5 * Math.cos((Math.PI * x) / 40)), -2, 40);
  line((x) => 14 + 0.12 * (x - 40) ** 2, 40, 44);
  // Landing follows the flight arc (measured from a dry run), then flattens.
  const probe = new Track();
  probe.setStart(t.start.clone());
  for (const s of t.strokes.values()) probe.addStroke({ ...s });
  const sim = new Simulation(probe);
  const arc: [number, number][] = [];
  for (let f = 0; f < 400; f++) {
    sim.seek(f);
    const b = sim.rider.pos[P.butt];
    if (b.x > 44) arc.push([b.x, b.y]);
  }
  const arcY = (x: number) => {
    for (let i = 1; i < arc.length; i++) if (arc[i][0] >= x) return arc[i - 1][1] + ((arc[i][1] - arc[i - 1][1]) * (x - arc[i - 1][0])) / (arc[i][0] - arc[i - 1][0]);
    return arc[arc.length - 1][1];
  };
  const x0 = 70;
  const x1 = 84;
  line((x) => arcY(x) - 0.9, x0, x1);
  const y1 = arcY(x1) - 0.9;
  const slope = (arcY(x1) - arcY(x1 - 0.5)) / 0.5;
  line((x) => y1 + slope * (x - x1) - (slope * (x - x1) ** 2) / 40, x1, x1 + 20);
  line(() => y1 + slope * 10, x1 + 20, 220);
}

for (const [name, key, hold] of [['none', 0, 0], ['backflip', INPUT.brake, 22], ['frontflip', INPUT.push, 22], ['double back', INPUT.brake, 60]] as const) {
  const t = new Track();
  bigJump(t);
  const sim = new Simulation(t);
  let takeoff = -1;
  for (let f = 50; f < 300; f++) { sim.seek(f); if (!sim.rider.contact.some((c) => c)) { takeoff = f; break; } }
  for (let f = takeoff; f < takeoff + hold; f++) sim.setInput(f, key);
  let rot = 0, prevFwd: THREE.Vector3 | null = null, crash = -1, landing = -1;
  for (let f = takeoff; f < 400; f++) {
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
  if (name === 'backflip') check(crash < 0 && rot > 3.5, 'a held backflip should land on the big jump');
  if (name === 'double back') check(crash >= 0, 'over-rotating should crash');
  console.log(name.padEnd(12), 'takeoff', takeoff, 'air', ((landing - takeoff) / 40).toFixed(2) + 's', 'rotation', ((rot * 180) / Math.PI).toFixed(0) + '°', 'crash', crash);
}

// Scoring through RunStats.
import { RunStats } from '../src/game/RunStats';
for (const [name, key, hold] of [['none', 0, 0], ['backflip', INPUT.brake, 22], ['frontflip', INPUT.push, 22]] as const) {
  const t = new Track();
  bigJump(t);
  const sim = new Simulation(t);
  for (let f = 130; f < 130 + hold; f++) sim.setInput(f, key);
  const stats = new RunStats();
  const tricks: string[] = [];
  for (let f = 0; f <= 400; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    for (const tr of stats.takeTricks()) tricks.push(`${tr.grade ?? ''} ${tr.name} +${tr.points}`);
  }
  if (name === 'backflip') check(stats.stats.score > 0, 'backflip landing should score');
  console.log('score', name.padEnd(10), stats.stats.score, tricks.join(', '));
}
