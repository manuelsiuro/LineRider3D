import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { apex, cosine, finish, forest, landing, profile, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';

/** Desert: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'mesa-drop',
    name: 'Mesa Drop',
    difficulty: 2,
    world: { biome: 'desert' },
    tip: 'Off the top of the mesa: a huge drop into a long jump. Time your flip, land it, then hit the ring.',
    build(t) {
      t.clear();
      const h = cosine(48, 20, -2, 46);
      profile(t, h, -2, 46);
      profile(t, (x) => 20 + 0.1 * (x - 46) ** 2, 46, 50);
      start(t, 0, h(0));
      for (const x of [16, 32]) star(t, x, h(x) + 1.3);
      const l = landing(t, 50, 21.6, 2, 10);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 16);
      t.addRing({ position: new THREE.Vector3(l.end + 8, l.flat + 1.3, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.7 });
      const k2 = l.end + 16;
      profile(t, (x) => l.flat + 0.035 * (x - k2) ** 2, k2, k2 + 8);
      const l2 = landing(t, k2 + 8, l.flat + 2.24, 2, 3);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 28);
      finish(t, l2.end + 20, l2.flat);
      t.targetScore = 9000;
      forest(t, -8, l2.end + 32, 41, ['cactus', 'mesa', 'barrel', 'rock', 'skull'], 5, 9);
    },
  },
  {
    id: 'canyon-jump',
    name: 'Canyon Jump',
    difficulty: 2,
    vehicle: 'moto',
    world: { biome: 'desert', time: 'sunset' },
    tip: 'Motorbike: full throttle (→) down the boost lane and send it across the canyon. Brake (←) tips the nose for the landing.',
    build(t) {
      t.clear();
      const V = vehicleById('moto');
      const h = cosine(30, 10, -2, 40);
      profile(t, h, -2, 40);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      profile(t, () => 10, 40, 44);
      profile(t, () => 10, 44, 54, 'accel');
      star(t, 50, 11.3);
      // A long, gentle kicker: at this speed a tight lip would fold the rider.
      profile(t, () => 10, 54, 58);
      profile(t, (x) => 10 + 0.035 * (x - 58) ** 2, 58, 68);
      const l = landing(t, 68, 13.5, 3, 4, 'normal', V);
      const top = apex(l.arc, 68, l.end);
      star(t, top.x, top.y + 0.3);
      t.addRing({ position: new THREE.Vector3(l.end + 10, l.flat + 1.3, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.7 });
      profile(t, () => l.flat, l.end, l.end + 40);
      star(t, l.end + 24, l.flat + 1.3);
      finish(t, l.end + 32, l.flat);
      t.targetScore = 6000;
      forest(t, -8, l.end + 44, 12, ['mesa', 'cactus', 'rock', 'cactus', 'skull', 'windmill']);
    },
  },
  {
    id: 'dune-bash',
    name: 'Dune Bash',
    difficulty: 2,
    vehicle: 'buggy',
    world: { biome: 'desert', time: 'dawn' },
    tip: 'Buggy over the dunes: two sets of whoops, a boost, and a double to send it.',
    build(t) {
      t.clear();
      const V = vehicleById('buggy');
      const h = cosine(22, 10, -2, 30);
      profile(t, h, -2, 30);
      start(t, 0, h(0));
      const whoop = (x0: number, y0: number) => (x: number) => y0 - (x - x0) * 0.05 + 0.5 * Math.sin((Math.PI * (x - x0)) / 7) ** 2;
      const w1 = whoop(30, 10);
      profile(t, w1, 30, 58);
      star(t, 44, w1(44) + 1.3);
      const by = w1(58);
      profile(t, () => by, 58, 66, 'accel');
      profile(t, (x) => by + 0.05 * (x - 66) ** 2, 66, 76);
      const l = landing(t, 76, by + 5, 4, 3, 'normal', V);
      star(t, l.top, l.arc(l.top) + 0.3);
      const w2 = whoop(l.end, l.flat);
      profile(t, w2, l.end, l.end + 28);
      star(t, l.end + 14, w2(l.end + 14) + 1.3);
      const fy = w2(l.end + 28);
      profile(t, () => fy, l.end + 28, l.end + 56);
      finish(t, l.end + 46, fy);
      t.targetScore = 3500;
      forest(t, -8, l.end + 60, 42, ['barrel', 'cactus', 'tumbleweed', 'rock', 'skull'], 5, 9);
    },
  },
  {
    id: 'quarry-run',
    name: 'Quarry Run',
    difficulty: 2,
    vehicle: 'buggy',
    world: { biome: 'desert' },
    tip: 'Buggy: let the suspension eat the whoops, hit the boost and fly off the quarry ramp. Keep it off the roof!',
    build(t) {
      t.clear();
      const V = vehicleById('buggy');
      const h = cosine(20, 8, -2, 30);
      profile(t, h, -2, 30);
      start(t, 0, h(0));
      // Whoops: a row of short sharp bumps on a gentle descent.
      const whoop = (x: number) => 8 - (x - 30) * 0.05 + 0.45 * Math.sin((Math.PI * (x - 30)) / 6) ** 2;
      profile(t, whoop, 30, 72);
      for (const x of [39, 57]) star(t, x, whoop(x) + 1.3);
      const by = whoop(72);
      profile(t, () => by, 72, 80, 'accel');
      profile(t, (x) => by + 0.05 * (x - 80) ** 2, 80, 90);
      const l = landing(t, 90, by + 5, 4, 2, 'normal', V);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      star(t, l.end + 10, l.flat + 1.3);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 3500;
      forest(t, -8, l.end + 34, 13, ['rock', 'mesa', 'barrel', 'lamp', 'cactus', 'tumbleweed']);
    },
  },
  {
    id: 'sandstorm-rally',
    name: 'Sandstorm Rally',
    difficulty: 2,
    vehicle: 'moto',
    world: { biome: 'desert', weather: 'sandstorm' },
    tip: 'Rally through the sandstorm: boost, jump, boost again, and clear the big one. Keep the throttle pinned.',
    build(t) {
      t.clear();
      const V = vehicleById('moto');
      const h = cosine(26, 9, -2, 36);
      profile(t, h, -2, 36);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      profile(t, () => 9, 36, 46, 'accel');
      profile(t, () => 9, 46, 50);
      profile(t, (x) => 9 + 0.035 * (x - 50) ** 2, 50, 58);
      const l1 = landing(t, 58, 11.24, 3, 6, 'normal', V);
      star(t, apex(l1.arc, 58, l1.end).x, apex(l1.arc, 58, l1.end).y + 0.3);
      const b = l1.end;
      profile(t, () => l1.flat, b, b + 10, 'accel');
      profile(t, () => l1.flat, b + 10, b + 14);
      profile(t, (x) => l1.flat + 0.035 * (x - b - 14) ** 2, b + 14, b + 24);
      const l2 = landing(t, b + 24, l1.flat + 3.5, 3, 3, 'normal', V);
      const top = apex(l2.arc, b + 24, l2.end);
      star(t, top.x, top.y + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 34);
      star(t, l2.end + 16, l2.flat + 1.3);
      finish(t, l2.end + 26, l2.flat);
      t.targetScore = 6500;
      forest(t, -8, l2.end + 40, 43, ['mesa', 'cactus', 'windmill', 'rock', 'tumbleweed'], 6, 10);
    },
  },
];

export const puzzles: PuzzleDef[] = [];
