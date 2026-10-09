import * as THREE from 'three';
import type { Track } from '../track/Track';
import type { DecorKind, HazardKind, LineType } from '../track/types';
import { Simulation } from '../physics/Simulation';
import type { VehicleDef } from '../physics/vehicles';
import { P } from '../physics/Rider';
import { SURFACES, gravityOf, normalizeWorld, surfaceOf, type WorldConfig } from '../world/worlds';

/**
 * Sets the world a level is built for (call right after clearing): the helpers that
 * measure the rider's path then use its gravity and ground, so landings fit on the Moon.
 */
export function home(track: Track, world: Partial<WorldConfig>) {
  track.setWorld(world);
}

/** A simulation of the track so far, on the track's world (gravity and ground drag). */
function measureSim(track: Track, vehicle?: VehicleDef) {
  const sim = new Simulation(track, vehicle);
  const world = normalizeWorld(track.world as Partial<WorldConfig> | null);
  sim.setGravity(gravityOf(world));
  sim.setGroundDrag(SURFACES[surfaceOf(world)].drag);
  return sim;
}

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
  const sim = measureSim(track, vehicle);
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
  const sim = measureSim(track, vehicle);
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

/**
 * Scatter decor on both sides of a run between x0 and x1, `near`..`near +
 * spread` away from the center line.
 */
export function forest(track: Track, x0: number, x1: number, seed: number, kinds: DecorKind[] = ['pine', 'pine', 'pine', 'rock', 'snowman'], near = 4, spread = 7) {
  let s = seed;
  const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let x = x0; x < x1; x += 5 + rand() * 5) {
    const side = rand() < 0.5 ? -1 : 1;
    const kind = kinds[Math.floor(rand() * kinds.length)];
    track.addDecor({ kind, position: new THREE.Vector3(x, 0, side * (near + rand() * spread)), rotation: rand() * 6.28, scale: 0.9 + rand() * 0.7 });
  }
}

export function start(track: Track, x: number, y: number, z = 0) {
  track.setStart(new THREE.Vector3(x, y + 0.8, z));
}

/**
 * Lands a jump: a ramp that follows the measured flight arc, then eases out
 * to level ground at `floorY` with a smooth (Hermite) curve. The touchdown
 * point is chosen high enough that the curve-out stays gentle and never dips
 * below the floor.
 */
export function landing(track: Track, fromX: number, fromY: number, drop: number, floorY: number, type: 'normal' | 'ice' = 'normal', vehicle?: VehicleDef, width = 2.4) {
  const arc = measureArc(track, fromX, vehicle);
  const landY = (x: number) => arc(x) - 0.9;
  const slopeAt = (x: number) => (landY(x + 0.25) - landY(x - 0.25)) / 0.5;
  let top = fromX;
  for (let x = fromX; x < fromX + 120; x += 0.25) if (arc(x) > arc(top)) top = x;
  // Touch down `drop` below the takeoff, or earlier if the curve-out would be too tight.
  let x1 = top + 2;
  while (landY(x1) > fromY - drop && x1 < top + 120) x1 += 0.25;
  while (x1 > top + 3 && landY(x1) - floorY < 9 * Math.abs(slopeAt(x1))) x1 -= 0.25;
  const x0 = Math.max(top + 2, x1 - 10);
  profile(track, landY, x0, x1, type, 0, width);
  const y1 = landY(x1);
  const slope = Math.min(-0.02, slopeAt(x1));
  const L = Math.max(26, (2.5 * (y1 - floorY)) / -slope);
  const runout = (x: number) => {
    const t = THREE.MathUtils.clamp((x - x1) / L, 0, 1);
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    return y1 * h00 + L * slope * h10 + floorY * h01;
  };
  profile(track, runout, x1, x1 + L, type, 0, width);
  return { arc, runout, end: x1 + L, flat: floorY, top };
}

/** Highest point of an arc between two x positions. */
export function apex(arc: (x: number) => number, x0: number, x1: number) {
  let best = x0;
  for (let x = x0; x <= x1; x += 0.25) if (arc(x) > arc(best)) best = x;
  return { x: best, y: arc(best) };
}

/** A straight player line between two points (side view). */
export function line(track: Track, a: [number, number], b: [number, number], type: LineType = 'normal') {
  const A = new THREE.Vector3(a[0], a[1], 0);
  const B = new THREE.Vector3(b[0], b[1], 0);
  const n = Math.max(1, Math.ceil(A.distanceTo(B) / 0.5));
  const points: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) points.push(new THREE.Vector3().lerpVectors(A, B, i / n));
  return track.addStroke({ type, mode: 'profile', points, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
}

/** A hazard standing on the run at (x, y) (icicles hang from y). */
export function hazard(track: Track, kind: HazardKind, x: number, y: number, z = 0, scale = 1) {
  return track.addHazard({ kind, position: new THREE.Vector3(x, y, z), rotation: 0, scale });
}

/** A checkpoint gate across the run at (x, y). */
export function checkpoint(track: Track, x: number, y: number, z = 0) {
  return track.addCheckpoint({ position: new THREE.Vector3(x, y + 0.4, z), axis: new THREE.Vector3(1, 0, 0), halfWidth: 2.3 });
}

/**
 * A pit floor under a jump, `depth` below `y`, from x0 to x1, with hazards spread along it.
 * Add it after measuring the jump's landing (the flight passes high over it).
 */
export function pit(track: Track, x0: number, x1: number, y: number, kind: HazardKind, count: number, depth = 3) {
  const floor = y - depth;
  profile(track, () => floor, x0, x1);
  for (let k = 0; k < count; k++) hazard(track, kind, x0 + ((k + 0.5) * (x1 - x0)) / count, floor);
}
