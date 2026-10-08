import * as THREE from 'three';
import type { Track } from '../track/Track';
import type { LineType } from '../track/types';
import { cosine, finish, forest, profile, star, start } from './builders';
import type { WorldConfig } from '../world/worlds';

/**
 * "Fix the track" puzzles: a broken track and a little ink. The given pieces
 * are locked; the player draws the rest (side view, classic run: no rider
 * controls). One star for finishing, two with every star, three within par.
 */
export interface PuzzleDef {
  id: string;
  name: string;
  tip: string;
  /** Ink available, in world units of track. */
  ink: number;
  /** Ink for the third star. */
  par: number;
  /** Line types the player may draw. */
  types: LineType[];
  world?: Partial<WorldConfig>;
  build(track: Track): void;
  /** A known solution (player strokes), used by the tests. */
  solution(track: Track): void;
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

/** Length of the player's strokes (everything not locked). */
export const inkUsed = (track: Track) => track.inkUsed();

export const PUZZLES: PuzzleDef[] = [
  {
    id: 'mind-the-gap',
    name: 'Mind the Gap',
    tip: 'The bridge is out! Draw a line across the gap so Bosh can reach the finish.',
    ink: 24,
    par: 12,
    types: ['normal'],
    build(t) {
      const h = cosine(20, 10, -2, 20);
      profile(t, h, -2, 20);
      profile(t, () => 10, 20, 34);
      profile(t, () => 10, 46, 84);
      start(t, 0, h(0));
      star(t, 40, 11.3);
      star(t, 60, 11.3);
      finish(t, 74, 10);
      forest(t, -6, 90, 11);
    },
    solution(t) {
      line(t, [34, 10], [46, 10]);
    },
  },
  {
    id: 'catch-the-fall',
    name: 'Catch the Fall',
    tip: 'Bosh starts in thin air. Draw him a slide down to the platform.',
    ink: 80,
    par: 56,
    types: ['normal'],
    build(t) {
      profile(t, () => 6, 44, 80);
      start(t, 0, 29.2);
      star(t, 24, 15);
      finish(t, 70, 6);
      forest(t, -6, 90, 12);
    },
    solution(t) {
      profile(t, cosine(28, 6, -2, 44), -2, 44);
    },
  },
  {
    id: 'boost-up',
    name: 'Boost Up',
    tip: 'The finish is higher than the start. Draw a red boost line in the gap to get the speed.',
    ink: 22,
    par: 16,
    types: ['normal', 'accel'],
    build(t) {
      const h = cosine(14, 4, -2, 20);
      profile(t, h, -2, 20);
      profile(t, () => 4, 20, 24);
      profile(t, () => 4, 40, 50);
      profile(t, cosine(4, 18, 50, 80), 50, 80);
      profile(t, () => 18, 80, 110);
      start(t, 0, h(0));
      star(t, 32, 5.3);
      star(t, 90, 19.3);
      finish(t, 100, 18);
      forest(t, -6, 116, 13);
    },
    solution(t) {
      line(t, [24, 4], [40, 4], 'accel');
    },
  },
  {
    id: 'jump-it',
    name: 'Jump It',
    tip: 'A pit too wide for a bridge (not enough ink). Draw a kicker at the edge and fly over!',
    ink: 14,
    par: 8,
    types: ['normal'],
    build(t) {
      const h = cosine(26, 8, -2, 30);
      profile(t, h, -2, 30);
      profile(t, () => 8, 30, 40);
      profile(t, () => 8, 62, 110);
      start(t, 0, h(0));
      star(t, 51, 12);
      finish(t, 96, 8);
      forest(t, -6, 116, 14);
    },
    solution(t) {
      profile(t, (x) => 8 + 0.06 * (x - 36) ** 2, 36, 42);
    },
  },
  {
    id: 'bounce-back',
    name: 'Bounce Back',
    tip: 'The ledge is out of reach. A green bouncy line in the pit can spring Bosh up there.',
    ink: 18,
    par: 13,
    types: ['normal', 'bouncy'],
    build(t) {
      const h = cosine(20, 12, -2, 24);
      profile(t, h, -2, 24);
      profile(t, () => 12, 24, 32);
      profile(t, () => 14, 56, 100);
      start(t, 0, h(0));
      star(t, 55, 11.5);
      finish(t, 88, 14);
      forest(t, -6, 110, 15);
    },
    solution(t) {
      line(t, [36, 2], [48, 3.2], 'bouncy');
    },
  },
  {
    id: 'star-route',
    name: 'Star Route',
    tip: 'Bosh can finish on his own, but the stars float high above the run. Draw a ramp to fly through them.',
    ink: 20,
    par: 10,
    types: ['normal'],
    build(t) {
      const h = cosine(30, 6, -2, 40);
      profile(t, h, -2, 40);
      profile(t, () => 6, 40, 130);
      start(t, 0, h(0));
      star(t, 62, 12);
      star(t, 70, 12.5);
      star(t, 78, 11.5);
      finish(t, 118, 6);
      forest(t, -6, 136, 16);
    },
    solution(t) {
      profile(t, (x) => 6.4 + 0.04 * (x - 46) ** 2, 46, 52);
    },
  },
];
