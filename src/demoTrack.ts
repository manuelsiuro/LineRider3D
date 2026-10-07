import * as THREE from 'three';
import type { Track } from './track/Track';
import type { DecorKind, LineType } from './track/types';
import { Simulation } from './physics/Simulation';
import { P } from './physics/Rider';

function profile(track: Track, fn: (x: number) => number, x0: number, x1: number, type: LineType = 'normal') {
  const points: THREE.Vector3[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) points.push(new THREE.Vector3(x, fn(x), 0));
  return track.addStroke({ type, mode: 'profile', points, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
}

/**
 * Flight path of an untouched run, measured with the real physics, so the
 * landing ramp can follow it exactly.
 */
function measureArc(track: Track, fromX: number): (x: number) => number {
  const sim = new Simulation(track);
  const arc: [number, number][] = [];
  for (let f = 0; f < 500; f++) {
    sim.seek(f);
    const b = sim.rider.pos[P.butt];
    if (b.x > fromX && (arc.length === 0 || b.x > arc[arc.length - 1][0])) arc.push([b.x, b.y]);
    if (b.y < 0.5) break;
  }
  return (x: number) => {
    for (let i = 1; i < arc.length; i++) {
      const [x0, y0] = arc[i - 1];
      const [x1, y1] = arc[i];
      if (x1 >= x) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return arc[arc.length - 1][1];
  };
}

/** Starter track: a big trick jump, a boost ring, ice and a glide into the snow. */
export function buildDemoTrack(track: Track) {
  track.clear();
  track.setStart(new THREE.Vector3(0, 40.8, 0));

  // Drop-in and kicker: about one second of air, enough for a flip.
  profile(track, (x) => 40 - 26 * (0.5 - 0.5 * Math.cos((Math.PI * x) / 40)), -2, 40);
  profile(track, (x) => 14 + 0.12 * (x - 40) ** 2, 40, 44);

  // Landing that follows the flight arc, then a long curve out of it.
  const arc = measureArc(track, 44);
  const landY = (x: number) => arc(x) - 0.9;
  const LAND_END = 76;
  const OUT = 34;
  profile(track, landY, 62, LAND_END);
  const y0 = landY(LAND_END);
  const slope = (landY(LAND_END) - landY(LAND_END - 0.5)) / 0.5;
  const runout = (x: number) => y0 + slope * (x - LAND_END) - (slope * (x - LAND_END) ** 2) / (2 * OUT);
  profile(track, runout, LAND_END, LAND_END + OUT);
  const flat = runout(LAND_END + OUT);
  const x0 = LAND_END + OUT;

  // Ring, ice bump and a soft finish in the snow.
  track.addRing({ position: new THREE.Vector3(x0 + 6, flat + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
  profile(track, () => flat, x0, x0 + 10);
  profile(track, (x) => flat + 0.6 * Math.sin(((x - x0 - 10) / 16) * Math.PI) ** 2, x0 + 10, x0 + 26, 'ice');
  profile(track, (x) => flat * (0.5 + 0.5 * Math.cos((Math.PI * (x - x0 - 26)) / 40)), x0 + 26, x0 + 66);

  // Decor around the run.
  const scatter: [DecorKind, number, number, number][] = [
    ['pine', -6, -5, 1.2],
    ['pine', -3, -7, 1.6],
    ['pine', 8, -6, 1.3],
    ['pine', 14, 5, 1.5],
    ['pine', 22, -5, 1.1],
    ['pine', 30, 6, 1.4],
    ['cabin', 26, -13, 1],
    ['lamp', 2, 3, 1],
    ['snowman', 46, 5, 1],
    ['pine', 52, -7, 1.7],
    ['pine', 60, 7, 1.3],
    ['rock', 64, -4, 1],
    ['pine', 76, -6, 1.5],
    ['pine', 90, 7, 1.2],
    ['rock', 98, 4, 0.8],
    ['pine', 104, -6, 1.4],
    ['lamp', 112, 3, 1],
    ['pine', 124, 7, 1.3],
    ['pine', 140, -6, 1.6],
    ['pine', 150, 7, 1.2],
    ['flag', 166, 2.5, 1],
    ['flag', 166, -2.5, 1],
    ['gift', 172, -3, 1],
    ['snowman', 174, 4, 1.2],
  ];
  scatter.forEach(([kind, x, z, scale], i) => {
    track.addDecor({ kind, position: new THREE.Vector3(x, 0, z), rotation: (i * 1.7) % (Math.PI * 2), scale });
  });
}
