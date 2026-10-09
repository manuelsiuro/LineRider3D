import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { apex, checkpoint, cosine, finish, forest, hazard, landing, pit, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { bounce, bridge, clearPath, climb, cliffAir, crumbleRush, ledge } from '../puzzleKit';

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
  {
    id: 'cracked-mesa',
    name: 'Cracked Mesa',
    difficulty: 3,
    world: { biome: 'desert' },
    tip: 'Cracked sandstone crumbles away a moment after you touch it. At full speed, you are long gone.',
    build(t) {
      t.clear();
      const h = cosine(34, 18, -2, 36);
      profile(t, h, -2, 36);
      profile(t, () => 18, 36, 44);
      // A bridge in three cracked slabs.
      for (const [a, b] of [[44, 54], [54, 64], [64, 74]]) profile(t, () => 18, a, b, 'crumble');
      profile(t, () => 18, 74, 80);
      profile(t, (x) => 18 + 0.08 * (x - 80) ** 2, 80, 84);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      star(t, 59, 19.3);
      const l = landing(t, 84, 19.28, 2, 8);
      star(t, l.top, l.arc(l.top) + 0.3);
      // A second cracked run to the line.
      profile(t, () => l.flat, l.end, l.end + 6);
      profile(t, () => l.flat, l.end + 6, l.end + 20, 'crumble');
      profile(t, () => l.flat, l.end + 20, l.end + 44);
      star(t, l.end + 13, l.flat + 1.3);
      finish(t, l.end + 36, l.flat);
      t.targetScore = 3000;
      forest(t, -8, l.end + 50, 51, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
  {
    id: 'dune-surf',
    name: 'Dune Surf',
    difficulty: 3,
    vehicle: 'snowboard',
    world: { biome: 'desert', time: 'sunset' },
    tip: 'Surf the dunes on a board: roll over the crests and float the big one.',
    build(t) {
      t.clear();
      const h = cosine(32, 20, -2, 30);
      profile(t, h, -2, 30);
      const dunes = (x: number) => 20 - (x - 30) * 0.1 + 1.6 * Math.sin((x - 30) / 8);
      profile(t, dunes, 30, 120);
      const yk = dunes(120);
      start(t, 0, h(0));
      for (const p of riderLine(t, [16, 50, 75, 100], vehicleById('snowboard'))) star(t, p.x, p.y + 0.6);
      profile(t, (x) => yk + 0.08 * (x - 120) ** 2, 120, 124);
      const l = landing(t, 124, yk + 1.28, 2, 4, 'normal', vehicleById('snowboard'));
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 5000;
      forest(t, -8, l.end + 36, 52, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
  {
    id: 'mirage',
    name: 'Mirage',
    difficulty: 3,
    world: { biome: 'desert', time: 'day', weather: 'clear' },
    tip: 'A long, hot run with a checkpoint: two jumps, and cracked slabs that fall away behind you.',
    build(t) {
      t.clear();
      const h = cosine(40, 26, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 26 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l1 = landing(t, 38, 27.28, 2, 18);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      const a = l1.end;
      const run = (x: number) => 18 - (x - a) * 0.07;
      profile(t, run, a, a + 12);
      checkpoint(t, a + 6, run(a + 6));
      for (let k = 0; k < 4; k++) profile(t, run, a + 12 + k * 10, a + 22 + k * 10, 'crumble');
      profile(t, run, a + 52, a + 70);
      star(t, a + 32, run(a + 32) + 1.3);
      const k = a + 70;
      const yk = run(k);
      profile(t, (x) => yk + 0.08 * (x - k) ** 2, k, k + 4);
      const l2 = landing(t, k + 4, yk + 1.28, 2, 6);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      t.targetScore = 5000;
      forest(t, -8, l2.end + 36, 53, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
  {
    id: 'cactus-row',
    name: 'Cactus Row',
    difficulty: 3,
    world: { biome: 'desert' },
    tip: 'Cacti across the trail. They are tall: charge your jump fully before you let go.',
    // Charged jumps over the cacti.
    solution: [[119, 8], [143, 0], [217, 8], [229, 0], [263, 8], [275, 0]],
    build(t) {
      t.clear();
      const h = cosine(30, 20, -2, 34);
      const run = (x: number) => 20 - (x - 34) * 0.1;
      profile(t, h, -2, 34);
      profile(t, run, 34, 200);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      for (const x of [64, 110, 156]) {
        hazard(t, 'cactus', x, run(x));
        star(t, x, run(x) + 3.8);
      }
      finish(t, 188, run(188));
      t.targetScore = 2500;
      forest(t, -8, 206, 54, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
  {
    id: 'sinking-bridge',
    name: 'Sinking Bridge',
    difficulty: 3,
    world: { biome: 'desert' },
    tip: 'A long, slightly uphill bridge of cracked slabs. Push (→) to keep your speed, or it crumbles under you.',
    // Pushing on the ground, up the cracked bridge.
    solution: [[6, 1], [218, 0], [220, 1], [233, 0], [263, 1], [318, 0], [342, 1]],
    build(t) {
      t.clear();
      const h = cosine(20, 14, -2, 32);
      profile(t, h, -2, 32);
      profile(t, () => 14, 32, 40);
      // Climbing to nearly the start height: without a push, Bosh stalls on the slabs.
      const up = (x: number) => 14 + (x - 40) * 0.1;
      for (let k = 0; k < 8; k++) profile(t, up, 40 + k * 8, 48 + k * 8, 'crumble');
      const top = up(104);
      profile(t, () => top, 104, 112);
      const down = cosine(top, 6, 112, 142);
      profile(t, down, 112, 142);
      profile(t, () => 6, 142, 176);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      for (const x of [60, 90]) star(t, x, up(x) + 1.3);
      star(t, 126, down(126) + 1.3);
      finish(t, 166, 6);
      t.targetScore = 800;
      forest(t, -8, 182, 55, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
  {
    id: 'canyon-crumble',
    name: 'Canyon Crumble',
    difficulty: 4,
    world: { biome: 'desert', time: 'sunset' },
    tip: 'Slabs over the canyon with gaps between. Hop each gap before the slab under you gives way.',
    // A hop over each gap.
    solution: [[112, 8], [136, 0], [190, 8], [194, 0], [230, 8], [234, 0], [266, 8], [270, 0]],
    build(t) {
      t.clear();
      const h = cosine(34, 22, -2, 34);
      profile(t, h, -2, 34);
      const deck = (x: number) => 22 - (x - 34) * 0.06;
      const slabs: [number, number][] = [[34, 60], [68, 92], [100, 124], [132, 156]];
      for (const [a, b] of slabs) profile(t, deck, a, b, 'crumble');
      profile(t, deck, 164, 200);
      for (let j = 1; j <= slabs.length; j++) {
        const a = j < slabs.length ? slabs[j][0] : 164;
        star(t, a - 4, deck(a) + 2.6);
      }
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      finish(t, 190, deck(190));
      t.targetScore = 2500;
      forest(t, -8, 206, 56, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
  {
    id: 'rattlesnake-pass',
    name: 'Rattlesnake Pass',
    difficulty: 4,
    world: { biome: 'desert', weather: 'sandstorm' },
    tip: 'In the sandstorm: cross the cracked ledge at full speed, then jump the cacti on the way down.',
    // Jumps over the cacti.
    solution: [[177, 8], [189, 0], [234, 8], [246, 0], [277, 8], [289, 0]],
    build(t) {
      t.clear();
      const h = cosine(48, 26, -2, 44);
      profile(t, h, -2, 44);
      profile(t, () => 26, 44, 54);
      // A short cracked ledge, then a drop onto the cactus slope.
      profile(t, () => 26, 54, 66, 'crumble');
      const run = (x: number) => 22 - (x - 72) * 0.06;
      profile(t, cosine(26, 22, 66, 72), 66, 72);
      profile(t, run, 72, 250);
      start(t, 0, h(0));
      star(t, 22, h(22) + 1.3);
      star(t, 60, 27.3);
      for (const x of [110, 160, 210]) {
        hazard(t, 'cactus', x, run(x));
        star(t, x, run(x) + 3.8);
      }
      finish(t, 240, run(240));
      t.targetScore = 3000;
      forest(t, -8, 256, 57, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
  {
    id: 'sun-temple',
    name: 'Sun Temple',
    difficulty: 4,
    world: { biome: 'desert', time: 'sunset', weather: 'clear' },
    tip: 'The desert finale: a big jump, cracked bridges, cacti and a climb to the temple. Checkpoints help.',
    // Pushing on the ground, and charged jumps over the cacti.
    solution: [[6, 1], [93, 0], [146, 1], [149, 0], [151, 1], [209, 0], [213, 1], [217, 9], [229, 1], [230, 0], [263, 8], [265, 9], [275, 1], [276, 0], [309, 1], [484, 0], [487, 1]],
    build(t) {
      t.clear();
      const h = cosine(50, 34, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 34 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 38, 35.28, 2, 26);
      star(t, l.top, l.arc(l.top) + 0.3);
      pit(t, 41, l.top + 2, 34, 'cactus', 2, 5);
      const a = l.end;
      profile(t, () => 26, a, a + 10);
      checkpoint(t, a + 6, 26);
      // Cracked slabs, then cacti on the slope.
      for (let k = 0; k < 3; k++) profile(t, () => 26, a + 10 + k * 8, a + 18 + k * 8, 'crumble');
      star(t, a + 22, 27.3);
      const run = (x: number) => 26 - (x - a - 34) * 0.09;
      profile(t, run, a + 34, a + 140);
      for (const x of [a + 66, a + 112]) {
        hazard(t, 'cactus', x, run(x));
        star(t, x, run(x) + 3.8);
      }
      checkpoint(t, a + 130, run(a + 130));
      // The climb to the temple, then down to the line.
      const yb = run(a + 140);
      const up = cosine(yb, yb + 5, a + 140, a + 180);
      profile(t, up, a + 140, a + 180);
      profile(t, () => yb + 5, a + 180, a + 192);
      star(t, a + 186, yb + 6.3);
      const down = cosine(yb + 5, 14, a + 192, a + 250);
      profile(t, down, a + 192, a + 250);
      profile(t, () => 14, a + 250, a + 280);
      finish(t, a + 270, 14);
      t.addDecor({ kind: 'mesa', position: new THREE.Vector3(a + 186, 0, -10), rotation: 0, scale: 2.2 });
      t.targetScore = 4000;
      forest(t, -8, a + 290, 58, ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'], 5, 9);
    },
  },
];

export const puzzles: PuzzleDef[] = [
  crumbleRush({
    id: 'quick-crossing',
    name: 'Quick Crossing',
    kind: 'rings',
    tip: 'The cracked bridge falls away under a slow rider. A ring before it gets Bosh across in time.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    top: 18,
    y: 12,
    slabs: 4,
    rise: 5,
    boosts: 1,
    seed: 101,
  }),
  bridge({
    id: 'canyon-gap',
    name: 'Canyon Gap',
    tip: 'A gap in the canyon trail. Bridge it.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    danger: 'cactus',
    y: 14,
    top: 26,
    gaps: [[44, 55]],
    end: 104,
    seed: 102,
  }),
  cliffAir({
    id: 'mesa-leap',
    name: 'Mesa Leap',
    tip: 'Leap off the mesa: a kicker at the edge, and a second in the air.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    danger: 'cactus',
    top: 28,
    y: 14,
    edge: 50,
    floor: 4,
    kicker: 0.08,
    seed: 103,
  }),
  clearPath({
    id: 'rockfall',
    name: 'Rockfall',
    tip: 'Rocks fell across the trail. Erase the pile, not the loose stones.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    top: 24,
    y: 14,
    slope: 0.06,
    humps: [58],
    spares: [
      [42, 4],
      [90, 5],
    ],
    end: 128,
    seed: 104,
  }),
  crumbleRush({
    id: 'boost-the-bridge',
    name: 'Boost the Bridge',
    kind: 'draw',
    tip: 'Too slow for the cracked bridge: draw a red boost strip before it.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    top: 18,
    y: 12,
    slabs: 4,
    rise: 5,
    boosts: 1,
    seed: 105,
  }),
  ledge({
    id: 'canyon-descent',
    name: 'Canyon Descent',
    tip: 'From the canyon rim to the floor: draw the way down.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    top: 30,
    high: 20,
    low: 6,
    edge: 50,
    land: 82,
    end: 128,
    seed: 106,
  }),
  climb({
    id: 'dune-rings',
    name: 'Dune Rings',
    kind: 'rings',
    tip: 'Two dunes higher than the start: a ring before each.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    y: 6,
    top: 16,
    hills: [
      { at: 48, height: 11 },
      { at: 120, height: 11 },
    ],
    end: 204,
    seed: 107,
  }),
  bridge({
    id: 'three-canyons',
    name: 'Three Canyons',
    kind: 'oneline',
    tip: 'Three narrow canyons in a row: one line across them all.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    danger: 'cactus',
    y: 12,
    top: 24,
    gaps: [
      [42, 48],
      [54, 60],
      [66, 72],
    ],
    end: 118,
    seed: 108,
  }),
  bounce({
    id: 'cactus-spring',
    name: 'Cactus Spring',
    tip: 'A pit full of cacti, and the ledge out of reach. A trampoline springs Bosh over them.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    danger: 'cactus',
    dy: 4,
    seed: 109,
  }),
  clearPath({
    id: 'tumbleweeds',
    name: 'Tumbleweeds',
    tip: 'Tumbleweeds snagged across the trail. Erase the two in the way.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    top: 26,
    y: 16,
    slope: 0.06,
    humps: [54, 96],
    spares: [
      [40, 4],
      [76, 6],
      [116, 4],
    ],
    end: 150,
    seed: 110,
  }),
  climb({
    id: 'boost-dune',
    name: 'Boost Dune',
    kind: 'draw',
    tip: 'Two dunes, each higher than the last. Boost before both, with the ink you have.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    y: 6,
    top: 16,
    hills: [
      { at: 52, height: 11 },
      { at: 126, height: 12 },
    ],
    end: 212,
    seed: 111,
  }),
  crumbleRush({
    id: 'crumbling-climb',
    name: 'Crumbling Climb',
    kind: 'rings',
    tip: 'A longer, steeper cracked bridge. It takes two rings to get across.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    top: 18,
    y: 12,
    slabs: 6,
    rise: 6,
    boosts: 2,
    seed: 112,
  }),
  cliffAir({
    id: 'sun-leap',
    name: 'Sun Leap',
    tip: 'The highest leap in the desert: draw the kicker that keeps Bosh up a full second.',
    world: { biome: 'desert' },
    decor: ['cactus', 'mesa', 'barrel', 'rock', 'skull', 'tumbleweed'],
    danger: 'cactus',
    top: 32,
    y: 18,
    edge: 50,
    floor: 6,
    kicker: 0.09,
    seed: 113,
  }),
];
