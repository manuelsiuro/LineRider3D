import * as THREE from 'three';
import type { Track } from './track/Track';
import type { DecorKind } from './track/types';

function profile(track: Track, fn: (x: number) => number, x0: number, x1: number, type: 'normal' | 'accel' = 'normal') {
  const points: THREE.Vector3[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) points.push(new THREE.Vector3(x, fn(x), 0));
  return track.addStroke({ type, mode: 'profile', points, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
}

/** A small starter track so the game is fun from the first second. */
export function buildDemoTrack(track: Track) {
  track.clear();
  track.setStart(new THREE.Vector3(0, 24.8, 0));

  // Drop-in, a long curved slope and a kicker.
  profile(track, (x) => 24 - 16 * (0.5 - 0.5 * Math.cos((Math.PI * Math.min(x, 32)) / 32)), -2, 32);
  profile(track, (x) => 8 + 0.09 * (x - 32) ** 2, 32, 36);
  // Landing follows the jump's arc, then a run-out with a boost.
  const arc = (x: number) => 10.05 + 0.59 * (x - 36.2) - 0.0279 * (x - 36.2) ** 2 - 1;
  profile(track, arc, 47, 60);
  const runout = (x: number) => arc(60) - 0.738 * (x - 60) + 0.025 * (x - 60) ** 2;
  profile(track, runout, 60, 74.5);
  const flat = runout(74.5);
  profile(track, () => flat, 74.5, 82, 'accel');
  profile(track, (x) => flat + 0.6 * Math.sin(((x - 82) / 16) * Math.PI) ** 2, 82, 98);
  // Glide gently down into the snow at the finish.
  profile(track, (x) => flat * (0.5 + 0.5 * Math.cos((Math.PI * (x - 98)) / 30)), 98, 128);

  // Decor around the run.
  const scatter: [DecorKind, number, number, number][] = [
    ['pine', -6, -5, 1.2],
    ['pine', -3, -7, 1.6],
    ['pine', 8, -6, 1.3],
    ['pine', 14, 5, 1.5],
    ['pine', 22, -5, 1.1],
    ['pine', 30, 6, 1.4],
    ['pine', 40, -6, 1.7],
    ['pine', 52, 6, 1.2],
    ['pine', 70, -6, 1.5],
    ['pine', 78, 7, 1.3],
    ['pine', 90, -4, 1.6],
    ['snowman', 34, 4.5, 1],
    ['snowman', 88, 3, 1.1],
    ['cabin', 20, -12, 1],
    ['rock', 44, 3.5, 1],
    ['rock', 62, -4, 0.8],
    ['lamp', 2, 3, 1],
    ['flag', 128, 2.5, 1],
    ['flag', 128, -2.5, 1],
    ['gift', 134, -3, 1],
    ['snowman', 136, 4, 1.2],
    ['pine', 112, -6, 1.4],
    ['pine', 120, 7, 1.2],
  ];
  scatter.forEach(([kind, x, z, scale], i) => {
    track.addDecor({ kind, position: new THREE.Vector3(x, 0, z), rotation: (i * 1.7) % (Math.PI * 2), scale });
  });
}
