import * as THREE from 'three';
import type { Track } from '../track/Track';
import type { DecorKind, LineType } from '../track/types';
import { Simulation } from '../physics/Simulation';
import type { VehicleDef } from '../physics/vehicles';
import { P } from '../physics/Rider';

/** Profile stroke along +X (z = 0) from a height function. */
export function profile(track: Track, fn: (x: number) => number, x0: number, x1: number, type: LineType = 'normal', z = 0, width = 2.4) {
  const points: THREE.Vector3[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) points.push(new THREE.Vector3(x, fn(x), z));
  return track.addStroke({ type, mode: 'profile', points, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width });
}

/** Path stroke (auto-banked) through 3D points, resampled every 0.5 units. */
export function path(track: Track, pts: THREE.Vector3[], type: LineType = 'normal', width = 3) {
  const curve = new THREE.CatmullRomCurve3(pts);
  const n = Math.ceil(curve.getLength() / 0.5);
  const points = curve.getSpacedPoints(n);
  // Keep the exact first point so it can join another stroke seamlessly.
  points[0] = pts[0];
  return track.addStroke({ type, mode: 'path', points, planeNormal: new THREE.Vector3(0, 1, 0), bank: 0, autoBank: true, walls: true, width });
}

/**
 * Flight path (butt height by x) of an untouched run on the track so far,
 * measured with the real physics, so landings can follow it exactly.
 */
export function measureArc(track: Track, fromX: number, vehicle?: VehicleDef): (x: number) => number {
  const sim = new Simulation(track, vehicle);
  const arc: [number, number][] = [];
  for (let f = 0; f < 800; f++) {
    sim.seek(f);
    const b = sim.rider.pos[P.butt];
    if (b.x > fromX && (arc.length === 0 || b.x > arc[arc.length - 1][0])) arc.push([b.x, b.y]);
    if (b.y < 0.5 || sim.rider.crashed) break;
  }
  return (x: number) => {
    if (arc.length === 0) return 0;
    if (x <= arc[0][0]) return arc[0][1];
    for (let i = 1; i < arc.length; i++) {
      const [x0, y0] = arc[i - 1];
      const [x1, y1] = arc[i];
      if (x1 >= x) return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
    return arc[arc.length - 1][1];
  };
}

/**
 * Where the rider actually passes, measured with an untouched run: returns
 * the body position the first time the run reaches each requested x.
 */
export function riderLine(track: Track, xs: number[], vehicle?: VehicleDef): THREE.Vector3[] {
  const sim = new Simulation(track, vehicle);
  const out: (THREE.Vector3 | null)[] = xs.map(() => null);
  for (let f = 0; f < 1200 && out.some((p) => !p); f++) {
    sim.seek(f);
    const b = sim.rider.pos[P.butt];
    xs.forEach((x, k) => {
      if (!out[k] && b.x >= x) out[k] = b.clone();
    });
    if (sim.rider.crashed) break;
  }
  return out.map((p) => p ?? new THREE.Vector3());
}

export const cosine = (y0: number, y1: number, x0: number, x1: number) => (x: number) =>
  y0 + (y1 - y0) * (0.5 - 0.5 * Math.cos((Math.PI * THREE.MathUtils.clamp((x - x0) / (x1 - x0), 0, 1))));

export function star(track: Track, x: number, y: number, z = 0) {
  track.addStar({ position: new THREE.Vector3(x, y, z) });
}

export function finish(track: Track, x: number, y: number, z = 0, axis = new THREE.Vector3(1, 0, 0)) {
  track.setFinish({ position: new THREE.Vector3(x, y, z), axis: axis.normalize(), halfWidth: 2.3 });
}

/** Scatter decor on both sides of a run between x0 and x1. */
export function forest(track: Track, x0: number, x1: number, seed: number, kinds: DecorKind[] = ['pine', 'pine', 'pine', 'rock', 'snowman']) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let x = x0; x < x1; x += 5 + rand() * 5) {
    const side = rand() < 0.5 ? -1 : 1;
    const kind = kinds[Math.floor(rand() * kinds.length)];
    track.addDecor({ kind, position: new THREE.Vector3(x, 0, side * (4 + rand() * 7)), rotation: rand() * 6.28, scale: 0.9 + rand() * 0.7 });
  }
}
