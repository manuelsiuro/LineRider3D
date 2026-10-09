import * as THREE from 'three';
import { apex, checkpoint, cosine, finish, forest, hazard, landing, measureArc, path, pit, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { bounce, bridge, clearPath, climb, cliffAir, crumbleRush, ledge, mudBrakes } from '../puzzleKit';

/** Haunted Hollow: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'pumpkin-patch',
    name: 'Pumpkin Patch',
    difficulty: 2,
    world: { biome: 'halloween', time: 'night', weather: 'fog' },
    tip: 'A gentle night ride through the pumpkin patch. Grab the stars, hop the kicker and mind the grinning faces.',
    build(t) {
      t.clear();
      const h = cosine(22, 8, -2, 34);
      profile(t, h, -2, 34);
      profile(t, () => 8, 34, 40);
      profile(t, (x) => 8 + 0.1 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      for (const x of [12, 26]) star(t, x, h(x) + 1.3);
      const l = landing(t, 44, 9.6, 2, 3);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      star(t, l.end + 8, l.flat + 1.3);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 3500;
      forest(t, -6, l.end + 36, 61, ['pumpkin', 'pumpkin', 'scarecrow', 'pumpkin', 'deadtree', 'candles'], 4, 7);
    },
  },
  {
    id: 'graveyard-shift',
    name: 'Graveyard Shift',
    difficulty: 2,
    world: { biome: 'halloween', time: 'night', weather: 'clear' },
    tip: 'Leap the graveyard in two jumps under the harvest moon. Flip if you dare, and land flat.',
    build(t) {
      t.clear();
      const h = cosine(30, 14, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 14 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      const l1 = landing(t, 38, 15.28, 3, 9);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      const k2 = l1.end + 8;
      profile(t, () => l1.flat, l1.end, k2);
      star(t, l1.end + 4, l1.flat + 1.3);
      profile(t, (x) => l1.flat + 0.08 * (x - k2) ** 2, k2, k2 + 4);
      const l2 = landing(t, k2 + 4, l1.flat + 1.28, 2, 4);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 28);
      finish(t, l2.end + 20, l2.flat);
      t.targetScore = 5000;
      forest(t, -6, l2.end + 32, 62, ['tombstone', 'tombstone', 'crypt', 'deadtree', 'tombstone', 'ghost'], 5, 8);
    },
  },
  {
    id: 'bat-cave-drop',
    name: 'Bat Cave Drop',
    difficulty: 3,
    world: { biome: 'halloween', time: 'night', weather: 'storm' },
    tip: 'A huge drop in the thunderstorm, a long flight with the bats, then a ring and one more jump.',
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
      forest(t, -8, l2.end + 32, 63, ['deadtree', 'rock', 'deadtree', 'ghost', 'cauldron'], 5, 9);
    },
  },
  {
    id: 'haunted-manor',
    name: 'Haunted Manor',
    difficulty: 3,
    world: { biome: 'halloween', time: 'night', weather: 'fog' },
    tip: 'The winding drive down from the manor. The walls hold you in the bends; ghostly rings speed you up.',
    build(t) {
      t.clear();
      const pts: THREE.Vector3[] = [];
      let y = 32;
      let prev = new THREE.Vector3(0, y, 0);
      const L = 170;
      for (let s = 0; s <= L; s += 1) {
        const p = new THREE.Vector3(s, 0, 4.5 * Math.sin((s / 80) * Math.PI * 2) * Math.min(1, s / 25, (L - s) / 25));
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * 0.1;
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      for (const x of [40, 120]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [25, 68, 112, 155])) star(t, p.x, p.y + 0.4, p.z);
      finish(t, pts[162].x, pts[162].y, pts[162].z, pts[163].clone().sub(pts[161]));
      t.targetScore = 1300;
      forest(t, -6, 180, 64, ['deadtree', 'candles', 'crypt', 'ghost', 'tombstone', 'pumpkin'], 5, 8);
    },
  },
  {
    id: 'witching-hour',
    name: 'Witching Hour',
    difficulty: 3,
    world: { biome: 'halloween', time: 'night', weather: 'clear' },
    tip: 'The Halloween finale at midnight: big air, an icy ring run, a trampoline and one last spooky jump.',
    build(t) {
      t.clear();
      const h = cosine(44, 16, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 16 + 0.12 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l = landing(t, 44, 17.9, 2, 9);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 14, 'ice');
      t.addRing({ position: new THREE.Vector3(l.end + 8, l.flat + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      const dropEnd = l.end + 22;
      profile(t, cosine(l.flat, l.flat - 2, l.end + 14, dropEnd), l.end + 14, dropEnd);
      const arc = measureArc(t, dropEnd);
      let x = dropEnd + 2;
      const padY = Math.max(1.5, l.flat - 5);
      while (arc(x) - 0.9 > padY && x < dropEnd + 60) x += 0.25;
      star(t, apex(arc, dropEnd, x).x, apex(arc, dropEnd, x).y + 0.3);
      profile(t, () => padY, x - 3, x + 5, 'bouncy');
      const l2 = landing(t, x + 5, padY, 0.5, 2.5);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 26);
      finish(t, l2.end + 18, l2.flat);
      t.targetScore = 12000;
      forest(t, -6, l2.end + 30, 65, ['cauldron', 'pumpkin', 'scarecrow', 'ghost', 'candles', 'deadtree'], 9, 8);
    },
  },
  {
    id: 'ghost-train',
    name: 'Ghost Train',
    difficulty: 3,
    world: { biome: 'halloween', time: 'night', weather: 'fog' },
    tip: 'All aboard the ghost train: a winding chute through the graveyard, walls on both sides.',
    build(t) {
      t.clear();
      const pts: THREE.Vector3[] = [];
      let y = 44;
      let prev = new THREE.Vector3(0, y, 0);
      const L = 250;
      for (let s = 0; s <= L; s += 1) {
        const ease = THREE.MathUtils.smoothstep(Math.min(s, L - s), 0, 40);
        const p = new THREE.Vector3(s, 0, 5 * Math.sin((s / 80) * Math.PI * 2) * ease);
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * (0.1 - 0.05 * THREE.MathUtils.smoothstep(s, 100, 160));
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      for (const x of [70, 140]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [35, 105, 175, 210])) star(t, p.x, p.y + 0.4, p.z);
      finish(t, pts[230].x, pts[230].y, pts[230].z, pts[231].clone().sub(pts[229]));
      t.targetScore = 1500;
      forest(t, -8, L + 10, 131, ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'cauldron', 'scarecrow', 'crypt', 'candles'], 7, 8);
    },
  },
  {
    id: 'haunted-hayride',
    name: 'Haunted Hayride',
    difficulty: 3,
    world: { biome: 'halloween', time: 'night', weather: 'clear' },
    tip: 'A long hayride over spiked pits, with a checkpoint at the scarecrow.',
    build(t) {
      t.clear();
      const h = cosine(38, 24, -2, 32);
      profile(t, h, -2, 32);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      let x0 = 32;
      let y0 = 24;
      const pits: [number, number, number][] = [];
      for (let j = 0; j < 3; j++) {
        profile(t, (x) => y0 + 0.08 * (x - x0) ** 2, x0, x0 + 4);
        const l = landing(t, x0 + 4, y0 + 1.28, 2, y0 - 6);
        star(t, l.top, l.arc(l.top) + 0.3);
        pits.push([x0 + 7, l.top + 2, y0]);
        profile(t, () => l.flat, l.end, l.end + 16);
        if (j === 1) checkpoint(t, l.end + 8, l.flat);
        x0 = l.end + 16;
        y0 = l.flat;
      }
      profile(t, () => y0, x0, x0 + 30);
      finish(t, x0 + 22, y0);
      for (const [a, b, y] of pits) pit(t, a, b, y, 'spikes', 2, 4);
      t.targetScore = 6000;
      forest(t, -8, x0 + 36, 132, ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'cauldron', 'scarecrow', 'crypt', 'candles'], 6, 8);
    },
  },
  {
    id: 'wisp-woods',
    name: 'Wisp Woods',
    difficulty: 3,
    world: { biome: 'halloween', time: 'night', weather: 'fog' },
    tip: 'Ghost wisps float over the path. Charge a full jump to clear one: a hop goes right into it.',
    // Full jumps over the wisps.
    solution: [[154, 8], [166, 0], [227, 8], [239, 0], [275, 8], [287, 0]],
    build(t) {
      t.clear();
      const h = cosine(30, 20, -2, 34);
      const run = (x: number) => 20 - (x - 34) * 0.08;
      profile(t, h, -2, 34);
      profile(t, run, 34, 210);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      for (const x of [66, 116, 166]) {
        hazard(t, 'wisp', x, run(x));
        star(t, x, run(x) + 4);
      }
      finish(t, 198, run(198));
      t.targetScore = 2500;
      forest(t, -8, 216, 133, ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'cauldron', 'scarecrow', 'crypt', 'candles'], 6, 8);
    },
  },
  {
    id: 'bog-of-souls',
    name: 'Bog of Souls',
    difficulty: 4,
    world: { biome: 'halloween', time: 'night', weather: 'rain' },
    tip: 'A cursed bog: push (→) through the mud, then jump the spikes on the way out.',
    // Pushing on the ground through the bog, hops over the spikes.
    solution: [[6, 1], [231, 9], [243, 1], [244, 0], [279, 1], [297, 9], [301, 1], [302, 0], [328, 1], [398, 0]],
    build(t) {
      t.clear();
      const h = cosine(26, 14, -2, 34);
      profile(t, h, -2, 34);
      profile(t, () => 14, 34, 42);
      profile(t, () => 14, 42, 72, 'mud');
      profile(t, () => 14, 72, 80);
      const run = (x: number) => 14 - (x - 80) * 0.06;
      profile(t, run, 80, 200);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      star(t, 57, 15.3);
      for (const x of [110, 150]) {
        hazard(t, 'spikes', x, run(x));
        star(t, x, run(x) + 2.2);
      }
      finish(t, 190, run(190));
      t.targetScore = 1500;
      forest(t, -8, 206, 134, ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'cauldron', 'scarecrow', 'crypt', 'candles'], 6, 8);
    },
  },
  {
    id: 'crumbling-crypt',
    name: 'Crumbling Crypt',
    difficulty: 4,
    world: { biome: 'halloween', time: 'night', weather: 'storm' },
    tip: 'The crypt floor crumbles away, and wisps guard the way out. Keep moving.',
    // Hops over the gaps, a jump over the wisp.
    solution: [[120, 8], [132, 0], [162, 8], [186, 0], [276, 8], [288, 0]],
    build(t) {
      t.clear();
      const h = cosine(34, 22, -2, 34);
      profile(t, h, -2, 34);
      const deck = (x: number) => 22 - (x - 34) * 0.06;
      const slabs: [number, number][] = [[34, 58], [66, 86], [94, 114]];
      for (const [a, b] of slabs) profile(t, deck, a, b, 'crumble');
      // Out of the crypt, downhill (a jump lands softer on a slope).
      const out = (x: number) => deck(122) - (x - 122) * 0.09;
      profile(t, out, 122, 210);
      for (let j = 1; j <= slabs.length; j++) {
        const a = j < slabs.length ? slabs[j][0] : 122;
        star(t, a - 4, deck(a) + 2.6);
      }
      hazard(t, 'wisp', 160, out(160));
      star(t, 160, out(160) + 4);
      start(t, 0, h(0));
      finish(t, 200, out(200));
      t.targetScore = 2500;
      forest(t, -8, 216, 135, ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'cauldron', 'scarecrow', 'crypt', 'candles'], 6, 8);
    },
  },
  {
    id: 'gravedigger',
    name: 'Gravedigger',
    difficulty: 4,
    world: { biome: 'halloween', time: 'night', weather: 'clear' },
    tip: 'Down into the open grave and out again: too fast and you overshoot the ledge. Brake (←) first.',
    // Braking down the slope, before the kicker.
    solution: [[60, 2], [100, 0]],
    build(t) {
      t.clear();
      const h = cosine(44, 14, -2, 48);
      profile(t, h, -2, 48);
      profile(t, () => 14, 48, 58);
      profile(t, (x) => 14 + 0.05 * (x - 58) ** 2, 58, 62);
      const deck = (x: number) => 12.5 - (x - 72) * 0.25 * Math.max(0, Math.min(1, (x - 72) / 6));
      profile(t, deck, 68, 98);
      profile(t, () => deck(98), 98, 122);
      start(t, 0, h(0));
      star(t, 24, h(24) + 1.3);
      star(t, 52, 15.3);
      star(t, 110, deck(98) + 1.3);
      finish(t, 116, deck(98));
      for (const x of [126, 134, 142, 150]) hazard(t, 'spikes', x, 0);
      t.targetScore = 600;
      forest(t, -8, 128, 136, ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'cauldron', 'scarecrow', 'crypt', 'candles'], 6, 8);
    },
  },
  {
    id: 'nightmare',
    name: 'Nightmare',
    difficulty: 4,
    world: { biome: 'halloween', time: 'night', weather: 'storm' },
    tip: 'The Haunted Hollow finale: a leap over the spikes, a crumbling crypt, wisps, a bog and checkpoints.',
    // Pushing on the ground, and a jump over the wisp.
    solution: [[6, 1], [93, 0], [146, 1], [149, 0], [151, 1], [209, 0], [212, 8], [213, 9], [224, 1], [225, 0], [259, 1], [454, 0]],
    build(t) {
      t.clear();
      const h = cosine(52, 36, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 36 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 38, 37.28, 2, 28);
      star(t, l.top, l.arc(l.top) + 0.3);
      pit(t, 41, l.top + 2, 36, 'spikes', 3, 5);
      const a = l.end;
      profile(t, () => 28, a, a + 10);
      checkpoint(t, a + 6, 28);
      // The crypt: cracked slabs.
      for (let k = 0; k < 3; k++) profile(t, () => 28, a + 10 + k * 8, a + 18 + k * 8, 'crumble');
      star(t, a + 22, 29.3);
      const run = (x: number) => 28 - (x - a - 34) * 0.08;
      profile(t, run, a + 34, a + 100);
      hazard(t, 'wisp', a + 66, run(a + 66));
      star(t, a + 66, run(a + 66) + 4);
      // The bog.
      const yb = run(a + 100);
      checkpoint(t, a + 96, run(a + 96));
      profile(t, () => yb, a + 100, a + 124, 'mud');
      star(t, a + 112, yb + 1.3);
      const down = cosine(yb, 16, a + 124, a + 170);
      profile(t, down, a + 124, a + 170);
      profile(t, () => 16, a + 170, a + 200);
      finish(t, a + 190, 16);
      t.targetScore = 4000;
      forest(t, -8, a + 210, 137, ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'cauldron', 'scarecrow', 'crypt', 'candles'], 6, 8);
    },
  },
];

export const puzzles: PuzzleDef[] = [
  bridge({
    id: 'rotten-bridge',
    name: 'Rotten Bridge',
    tip: 'The old bridge rotted through. Draw a new plank across.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    danger: 'spikes',
    y: 12,
    top: 24,
    gaps: [[44, 54]],
    end: 100,
    seed: 161,
  }),
  mudBrakes({
    id: 'graveyard-brakes',
    name: 'Graveyard Brakes',
    tip: 'Too fast down the hill and the bump throws Bosh into the icicles of the old crypt. Draw mud to slow him.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    top: 30,
    y: 20,
    slope: 0.25,
    bumpAt: 80,
    end: 130,
    seed: 162,
  }),
  climb({
    id: 'witch-rings',
    name: 'Witch Rings',
    kind: 'rings',
    tip: 'A hill higher than the start: a ring before it carries Bosh over.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    y: 6,
    top: 16,
    hills: [{ at: 52, height: 11 }],
    end: 140,
    seed: 163,
  }),
  clearPath({
    id: 'cobwebs',
    name: 'Cobwebs',
    tip: 'Cobwebs across the path! Sweep away the two in the way, and leave the rest.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    top: 24,
    y: 14,
    slope: 0.06,
    humps: [56, 98],
    spares: [
      [40, 4],
      [78, 6],
      [118, 4],
    ],
    end: 150,
    seed: 164,
  }),
  bounce({
    id: 'coffin-spring',
    name: 'Coffin Spring',
    tip: 'Out of the open grave: a trampoline in the pit springs Bosh up to the ledge.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    danger: 'spikes',
    dy: 2,
    seed: 165,
  }),
  bridge({
    id: 'grave-steps',
    name: 'Grave Steps',
    kind: 'oneline',
    tip: 'Three open graves in a row: one line over all of them.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    danger: 'spikes',
    y: 10,
    top: 22,
    gaps: [
      [44, 50],
      [56, 62],
      [68, 74],
    ],
    end: 120,
    seed: 166,
  }),
  cliffAir({
    id: 'bat-flight',
    name: 'Bat Flight',
    tip: 'Fly like a bat: a kicker at the cliff edge, a second in the air.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    danger: 'spikes',
    top: 30,
    y: 16,
    edge: 50,
    floor: 5,
    kicker: 0.1,
    seed: 167,
  }),
  crumbleRush({
    id: 'crypt-crossing',
    name: 'Crypt Crossing',
    kind: 'rings',
    tip: 'The crypt floor crumbles under a slow rider. A ring before it rushes Bosh across.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    danger: 'spikes',
    top: 18,
    y: 12,
    slabs: 4,
    rise: 5,
    boosts: 1,
    seed: 168,
  }),
  ledge({
    id: 'tower-drop',
    name: 'Tower Drop',
    tip: 'From the bell tower down to the graveyard: draw the way down.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    top: 30,
    high: 20,
    low: 6,
    edge: 50,
    land: 82,
    end: 128,
    seed: 169,
  }),
  clearPath({
    id: 'deadwood',
    name: 'Deadwood',
    tip: 'Three dead trees fell across the path. Erase them, and only them.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    top: 26,
    y: 16,
    slope: 0.06,
    humps: [50, 84, 118],
    spares: [[68, 5]],
    end: 165,
    seed: 170,
  }),
  mudBrakes({
    id: 'swamp-slide',
    name: 'Swamp Slide',
    tip: 'The steepest slope in the Hollow, straight into the bump. Lay the mud just right.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    top: 38,
    y: 28,
    slope: 0.3,
    bumpAt: 92,
    end: 140,
    seed: 171,
  }),
  bridge({
    id: 'haunted-pier',
    name: 'Haunted Pier',
    tip: 'Three planks missing from the haunted pier. Patch them all.',
    world: { biome: 'halloween', time: 'night' },
    decor: ['pumpkin', 'tombstone', 'deadtree', 'ghost', 'crypt', 'candles'],
    danger: 'spikes',
    y: 12,
    top: 24,
    gaps: [
      [40, 48],
      [58, 66],
      [78, 86],
    ],
    end: 130,
    seed: 172,
  }),
];
