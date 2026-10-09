import * as THREE from 'three';
import { apex, checkpoint, cosine, finish, forest, hazard, home, landing, measureArc, pit, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { bridge, clearPath, cliffAir, climb, crumbleRush, ledge } from '../puzzleKit';

/** Moon: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'moonwalk',
    name: 'Moonwalk',
    difficulty: 3,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'Less than half the gravity: every jump floats. Enjoy the view of the Earth on the way down.',
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(26, 10, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 10 + 0.08 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l = landing(t, 44, 11.28, 3, 4);
      // Stars along the long, slow arc.
      for (const k of [0.3, 0.55]) {
        const x = 44 + (l.top - 44) * k * 2;
        star(t, x, l.arc(x) + 0.3);
      }
      profile(t, () => l.flat, l.end, l.end + 32);
      finish(t, l.end + 24, l.flat);
      t.targetScore = 4000;
      forest(t, -6, l.end + 40, 81, ['crater', 'crystal', 'rock', 'crater', 'moonflag'], 5, 9);
    },
  },
  {
    id: 'crater-hop',
    name: 'Crater Hop',
    difficulty: 3,
    world: { biome: 'moon', time: 'day', weather: 'clear' },
    tip: 'Crystal shards on the track! Hold Jump to charge it and let go to float over them.',
    // Three full-charge jumps, one before each crystal.
    solution: [[202, 8], [226, 0], [271, 8], [295, 0], [327, 8], [351, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(40, 28, -2, 40);
      profile(t, h, -2, 40);
      const run = (x: number) => 28 - (x - 40) * 0.16;
      profile(t, run, 40, 180);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      for (const x of [64, 100, 136]) hazard(t, 'crystal', x, run(x));
      // A star floats over each crystal: only a jump gets it.
      for (const x of [64, 100, 136]) star(t, x, run(x) + 3.4);
      finish(t, 168, run(168));
      t.targetScore = 3000;
      forest(t, -6, 186, 82, ['crater', 'crystal', 'rock', 'lander', 'dish'], 5, 9);
    },
  },
  {
    id: 'low-orbit',
    name: 'Low Orbit',
    difficulty: 3,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'Two long, floaty jumps across the craters. Plenty of time in the air: try a flip, but land flat.',
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(32, 18, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 18 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      const l1 = landing(t, 38, 19.28, 3, 13);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      const k2 = l1.end + 8;
      profile(t, () => l1.flat, l1.end, k2);
      profile(t, (x) => l1.flat + 0.08 * (x - k2) ** 2, k2, k2 + 4);
      const l2 = landing(t, k2 + 4, l1.flat + 1.28, 2, 10);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 28);
      finish(t, l2.end + 20, l2.flat);
      t.targetScore = 5000;
      forest(t, -6, l2.end + 32, 181, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 5, 9);
    },
  },
  {
    id: 'rover-rally',
    name: 'Rover Rally',
    difficulty: 3,
    world: { biome: 'moon', time: 'day', weather: 'clear' },
    tip: 'A rally across the Sea of Tranquility: each ring pushes you into the next.',
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(30, 20, -2, 32);
      const run = (x: number) => 20 - (x - 32) * 0.05;
      profile(t, h, -2, 32);
      profile(t, run, 32, 210);
      start(t, 0, h(0));
      for (const x of [50, 80, 110, 140, 170]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [18, 65, 125, 185])) star(t, p.x, p.y + 0.6);
      finish(t, 198, run(198));
      t.targetScore = 4000;
      forest(t, -8, 216, 182, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'crater-bounce',
    name: 'Crater Bounce',
    difficulty: 3,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'Springy pads in the bottoms of the craters. In low gravity every bounce is a slow, high float.',
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(40, 22, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 22 + 0.06 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l = landing(t, 44, 22.96, 2, 15);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 8);
      let fromX = l.end + 8;
      for (const y of [13, 12]) {
        const arc = measureArc(t, fromX);
        let x = fromX + 2;
        while (arc(x) - 0.9 > y && x < fromX + 100) x += 0.25;
        const top = apex(arc, fromX, x);
        star(t, top.x, top.y + 0.3);
        profile(t, () => y, x - 3, x + 5, 'bouncy');
        fromX = x + 5;
      }
      const l2 = landing(t, fromX, 12, 0.5, 10);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      t.targetScore = 6000;
      forest(t, -8, l2.end + 36, 183, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'crystal-field',
    name: 'Crystal Field',
    difficulty: 4,
    world: { biome: 'moon', time: 'day', weather: 'clear' },
    tip: 'Crystal shards and a crater full of them. Full jumps for the tall ones; the crater needs your longest float.',
    // Full jumps over the crystals, the crater floated over.
    solution: [[197, 8], [221, 0], [294, 8], [318, 0], [389, 8], [401, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(44, 34, -2, 34);
      const run = (x: number) => 34 - (x - 34) * 0.15;
      profile(t, h, -2, 34);
      profile(t, run, 34, 120);
      profile(t, run, 130, 220);
      pit(t, 120, 130, run(125), 'crystal', 2, 4);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      for (const x of [70, 170]) {
        hazard(t, 'crystal', x, run(x));
        star(t, x, run(x) + 3.4);
      }
      star(t, 125, run(125) + 3);
      finish(t, 208, run(208));
      t.targetScore = 3000;
      forest(t, -8, 226, 184, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'dust-sea',
    name: 'Dust Sea',
    difficulty: 4,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'Deep moondust swallows your speed. Push (→) through it, and hop the crystals on the far shore.',
    // Pushing on the ground through the dust, jumps over the crystals.
    solution: [[9, 1], [291, 9], [303, 1], [304, 0], [357, 1], [364, 9], [376, 1], [377, 0], [430, 1], [498, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(24, 16, -2, 34);
      profile(t, h, -2, 34);
      profile(t, () => 16, 34, 42);
      profile(t, () => 16, 42, 78, 'mud');
      profile(t, () => 16, 78, 86);
      const run = (x: number) => 16 - (x - 86) * 0.07;
      profile(t, run, 86, 210);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      star(t, 60, 17.3);
      for (const x of [118, 160]) {
        hazard(t, 'crystal', x, run(x));
        star(t, x, run(x) + 3.4);
      }
      finish(t, 198, run(198));
      t.targetScore = 1500;
      forest(t, -8, 216, 185, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'fractured-ridge',
    name: 'Fractured Ridge',
    difficulty: 4,
    world: { biome: 'moon', time: 'day', weather: 'clear' },
    tip: 'The ridge cracks up under your weight. Hop each fissure before the ground gives way, or float over the lot.',
    // One long float over the cracked ridge, a jump over the crystal.
    solution: [[170, 8], [194, 0], [335, 8], [347, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(56, 44, -2, 34);
      profile(t, h, -2, 34);
      const deck = (x: number) => 44 - (x - 34) * 0.15;
      // Short slabs: Bosh is slow up here, and each one falls soon after he lands on it.
      profile(t, deck, 34, 40);
      const slabs: [number, number][] = [[40, 50], [56, 66], [72, 82], [88, 98]];
      for (const [a, b] of slabs) profile(t, deck, a, b, 'crumble');
      const out = (x: number) => deck(104) - (x - 104) * 0.1;
      profile(t, out, 104, 220);
      for (let j = 1; j <= slabs.length; j++) {
        const a = j < slabs.length ? slabs[j][0] : 104;
        star(t, a - 3, deck(a) + 2.6);
      }
      hazard(t, 'crystal', 150, out(150));
      star(t, 150, out(150) + 3.4);
      start(t, 0, h(0));
      finish(t, 196, out(196));
      t.targetScore = 2500;
      forest(t, -8, 226, 186, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'lander-pad',
    name: 'Lander Pad',
    difficulty: 4,
    world: { biome: 'moon', time: 'day', weather: 'clear' },
    tip: 'Touch down on the landing pad. In low gravity you float a long way: brake (←) before the ramp.',
    // Braking down the slope, before the ramp.
    solution: [[90, 2], [150, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(40, 14, -2, 52);
      profile(t, h, -2, 52);
      profile(t, () => 14, 52, 62);
      profile(t, (x) => 14 + 0.05 * (x - 62) ** 2, 62, 66);
      const deck = (x: number) => 12 - (x - 78) * 0.2 * Math.max(0, Math.min(1, (x - 78) / 6));
      profile(t, deck, 72, 100);
      profile(t, () => deck(100), 100, 106);
      start(t, 0, h(0));
      star(t, 26, h(26) + 1.3);
      star(t, 57, 15.3);
      star(t, 94, deck(94) + 1.3);
      finish(t, 98, deck(98));
      for (const x of [112, 122, 132, 142]) hazard(t, 'crystal', x, 0);
      t.targetScore = 600;
      forest(t, -8, 128, 187, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'earthrise',
    name: 'Earthrise',
    difficulty: 4,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'Off the crater wall into the longest flight in the game, with the Earth rising ahead. A ring waits below.',
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(46, 26, -2, 44);
      profile(t, h, -2, 44);
      profile(t, (x) => 26 + 0.08 * (x - 44) ** 2, 44, 48);
      start(t, 0, h(0));
      for (const x of [16, 32]) star(t, x, h(x) + 1.3);
      const l = landing(t, 48, 27.28, 3, 16);
      const arc = l.arc;
      for (const k of [0.4, 1]) {
        const x = 48 + (l.top - 48) * k;
        star(t, x, arc(x) + 0.3);
      }
      profile(t, () => l.flat, l.end, l.end + 16);
      t.addRing({ position: new THREE.Vector3(l.end + 8, l.flat + 1.3, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.7 });
      const k2 = l.end + 16;
      profile(t, (x) => l.flat + 0.035 * (x - k2) ** 2, k2, k2 + 8);
      const l2 = landing(t, k2 + 8, l.flat + 2.24, 2, 13);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 28);
      finish(t, l2.end + 20, l2.flat);
      t.targetScore = 9000;
      forest(t, -8, l2.end + 32, 188, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'far-side',
    name: 'Far Side',
    difficulty: 5,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'The dark side of the Moon: wide chasms between the mesas, crystals on top. Long, well-timed jumps.',
    // Jumps across the chasms and over the crystals.
    solution: [[243, 8], [255, 0], [311, 8], [335, 0], [394, 8], [398, 0], [451, 8], [463, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(60, 50, -2, 34);
      profile(t, h, -2, 34);
      const roof = (x: number) => 50 - (x - 34) * 0.14;
      const roofs: [number, number][] = [[34, 68], [80, 146], [164, 246]];
      for (const [a, b] of roofs) profile(t, roof, a, b);
      for (let j = 1; j < roofs.length; j++) star(t, roofs[j][0] - 6, roof(roofs[j][0]) + 2.6);
      for (const x of [118, 212]) {
        hazard(t, 'crystal', x, roof(x));
        star(t, x, roof(x) + 3.4);
      }
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      finish(t, 234, roof(234));
      t.targetScore = 3000;
      forest(t, -8, 250, 189, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
  {
    id: 'moonshot',
    name: 'Moonshot',
    difficulty: 5,
    world: { biome: 'moon', time: 'night', weather: 'clear' },
    tip: 'The grand finale: a crater leap, a crumbling ridge, crystals, a dust sea, a last huge jump and checkpoints.',
    // Jumps over the crystals (the dust sea is crossed on momentum).
    solution: [[336, 8], [348, 0], [399, 8], [411, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'moon' });
      const h = cosine(60, 44, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 44 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 38, 45.28, 2, 38);
      star(t, l.top, l.arc(l.top) + 0.3);
      pit(t, 41, l.top + 2, 44, 'crystal', 3, 5);
      const a = l.end;
      const ridge = (x: number) => 38 - (x - a) * 0.1;
      profile(t, ridge, a, a + 10);
      checkpoint(t, a + 6, ridge(a + 6));
      for (let k = 0; k < 3; k++) profile(t, ridge, a + 10 + k * 8, a + 18 + k * 8, 'crumble');
      star(t, a + 22, ridge(a + 22) + 1.3);
      const run = (x: number) => ridge(a + 34) - (x - a - 34) * 0.14;
      profile(t, run, a + 34, a + 110);
      for (const x of [a + 62, a + 92]) {
        hazard(t, 'crystal', x, run(x));
        star(t, x, run(x) + 3.4);
      }
      const yb = run(a + 110);
      checkpoint(t, a + 106, run(a + 106));
      profile(t, () => yb, a + 110, a + 134, 'mud');
      star(t, a + 122, yb + 1.3);
      const down = cosine(yb, 20, a + 134, a + 170);
      profile(t, down, a + 134, a + 170);
      profile(t, () => 20, a + 170, a + 210);
      finish(t, a + 200, 20);
      t.targetScore = 4000;
      forest(t, -8, a + 220, 190, ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'], 6, 9);
    },
  },
];

export const puzzles: PuzzleDef[] = [
  bridge({
    id: 'crater-gap',
    name: 'Crater Gap',
    tip: 'A crack across the plain. Draw a bridge over it.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    danger: 'crystal',
    y: 14,
    top: 26,
    gaps: [[44, 56]],
    end: 100,
    seed: 211,
  }),
  climb({
    id: 'crater-rim',
    name: 'Crater Rim',
    kind: 'rings',
    tip: 'The crater rim is higher than the start: a ring before it carries Bosh over.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    y: 8,
    top: 18,
    hills: [{ at: 52, height: 11 }],
    end: 140,
    seed: 212,
  }),
  clearPath({
    id: 'boulder-field',
    name: 'Boulder Field',
    tip: 'Moon boulders on the track. Erase the two in the way, and leave the rest.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    top: 26,
    y: 16,
    slope: 0.06,
    humps: [60, 104],
    spares: [[40, 4], [78, 6], [118, 4]],
    end: 150,
    seed: 213,
  }),
  cliffAir({
    id: 'moon-leap',
    name: 'Moon Leap',
    tip: 'A floaty leap: draw a kicker at the edge and stay in the air for a second.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    danger: 'crystal',
    top: 32,
    y: 18,
    edge: 50,
    floor: 7,
    kicker: 0.1,
    seed: 214,
  }),
  bridge({
    id: 'rille-crossing',
    name: 'Rille Crossing',
    kind: 'oneline',
    tip: 'Three narrow rilles in a row: one line over all of them.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    danger: 'crystal',
    y: 12,
    top: 24,
    gaps: [[44, 50], [56, 62], [68, 74]],
    end: 120,
    seed: 215,
  }),
  ledge({
    id: 'crater-descent',
    name: 'Crater Descent',
    kind: 'oneline',
    tip: 'Down into the deep crater in one stroke: a single line from the rim to the floor.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    top: 34,
    high: 24,
    low: 10,
    edge: 50,
    land: 88,
    end: 134,
    seed: 216,
  }),
  crumbleRush({
    id: 'brittle-crust',
    name: 'Brittle Crust',
    kind: 'draw',
    tip: 'The crust crumbles under a slow rider. Draw a boost strip to rush across.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    danger: 'crystal',
    top: 20,
    y: 14,
    slabs: 4,
    rise: 5,
    boosts: 1,
    seed: 217,
  }),
  ledge({
    id: 'lunar-ledge',
    name: 'Lunar Ledge',
    tip: 'From the high ridge down to the crater floor: draw the way down.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    top: 32,
    high: 22,
    low: 8,
    edge: 50,
    land: 82,
    end: 128,
    seed: 218,
  }),
  climb({
    id: 'boost-ridge',
    name: 'Boost Ridge',
    kind: 'draw',
    tip: 'Two ridges in a row, both too high. Draw boost strips to power over them.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    y: 8,
    top: 18,
    hills: [{ at: 46, height: 11 }, { at: 120, height: 11 }],
    end: 200,
    seed: 219,
  }),
  bridge({
    id: 'lunar-bridges',
    name: 'Lunar Bridges',
    tip: 'Three chasms across the trail. Bridge them all.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    danger: 'crystal',
    y: 14,
    top: 26,
    gaps: [[42, 50], [62, 70], [84, 92]],
    end: 136,
    seed: 220,
  }),
  clearPath({
    id: 'space-debris',
    name: 'Space Debris',
    tip: 'Old lander parts littered the track. Erase the three in the way, and only them.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    top: 28,
    y: 18,
    slope: 0.06,
    humps: [50, 84, 118],
    spares: [[68, 5]],
    end: 165,
    seed: 221,
  }),
  crumbleRush({
    id: 'crumbling-crater',
    name: 'Crumbling Crater',
    kind: 'rings',
    tip: 'The crater floor gives way under a slow rider. Rings before it rush Bosh across.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    danger: 'crystal',
    top: 20,
    y: 14,
    slabs: 4,
    rise: 5,
    boosts: 2,
    seed: 222,
  }),
  cliffAir({
    id: 'escape-velocity',
    name: 'Escape Velocity',
    tip: 'The last puzzle: off the highest cliff on the Moon. Draw the kicker for the biggest float.',
    world: { biome: 'moon', time: 'night' },
    decor: ['crater', 'crystal', 'rock', 'lander', 'dish', 'rover', 'moonflag'],
    danger: 'crystal',
    top: 40,
    y: 24,
    edge: 50,
    floor: 10,
    kicker: 0.1,
    seed: 223,
  }),
];
