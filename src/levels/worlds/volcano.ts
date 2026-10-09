import * as THREE from 'three';
import { apex, checkpoint, cosine, finish, forest, hazard, home, landing, measureArc, path, pit, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { bounce, bridge, clearPath, cliffAir, climb, crumbleRush, ledge } from '../puzzleKit';

/** Volcano: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'ember-run',
    name: 'Ember Run',
    difficulty: 3,
    world: { biome: 'volcano', time: 'sunset', weather: 'clear' },
    tip: 'Black rock and rivers of fire. The cracked bridge only holds for a moment, so keep your speed!',
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(30, 14, -2, 44);
      profile(t, h, -2, 44);
      profile(t, () => 14, 44, 52);
      // A crumbling bridge over a lava pit: lava geysers below it.
      profile(t, () => 14, 52, 70, 'crumble');
      hazard(t, 'lava', 57, 0, 0);
      hazard(t, 'lava', 65, 0, 0);
      profile(t, () => 14, 70, 78);
      profile(t, (x) => 14 + 0.08 * (x - 78) ** 2, 78, 82);
      start(t, 0, h(0));
      for (const x of [18, 32]) star(t, x, h(x) + 1.3);
      star(t, 61, 15.3);
      const l = landing(t, 82, 15.28, 3, 6);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 6000;
      forest(t, -6, l.end + 36, 71, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 5, 8);
    },
  },
  {
    id: 'ash-chute',
    name: 'Ash Chute',
    difficulty: 3,
    world: { biome: 'volcano', time: 'night', weather: 'ash' },
    tip: 'A long run down the ash slopes, with a checkpoint halfway. Fly over the geysers in the pits.',
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(40, 24, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 24 + 0.08 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      // First jump: geysers burn in the pit under the flight.
      const l1 = landing(t, 44, 25.28, 4, 16);
      hazard(t, 'lava', 50, 0);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      profile(t, () => l1.flat, l1.end, l1.end + 10);
      checkpoint(t, l1.end + 6, l1.flat);
      // A crumbling run, then the second jump.
      const c0 = l1.end + 10;
      profile(t, () => l1.flat, c0, c0 + 16, 'crumble');
      const k = c0 + 16;
      profile(t, () => l1.flat, k, k + 4);
      profile(t, (x) => l1.flat + 0.08 * (x - k - 4) ** 2, k + 4, k + 8);
      star(t, c0 + 8, l1.flat + 1.3);
      const l2 = landing(t, k + 8, l1.flat + 1.28, 3, 6);
      hazard(t, 'lava', k + 14, 0);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      t.targetScore = 8000;
      forest(t, -6, l2.end + 36, 72, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 5, 8);
    },
  },
  {
    id: 'magma-flow',
    name: 'Magma Flow',
    difficulty: 3,
    world: { biome: 'volcano', time: 'night', weather: 'clear' },
    tip: 'Ride the old lava tube down the mountain: the walls hold you in the bends, the rings keep you rolling.',
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const pts: THREE.Vector3[] = [];
      let y = 46;
      let prev = new THREE.Vector3(0, y, 0);
      const L = 260;
      for (let s = 0; s <= L; s += 1) {
        const ease = THREE.MathUtils.smoothstep(Math.min(s, L - s), 0, 40);
        const p = new THREE.Vector3(s, 0, 4.8 * Math.sin((s / 85) * Math.PI * 2) * ease);
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * (0.1 - 0.05 * THREE.MathUtils.smoothstep(s, 110, 170));
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      for (const x of [75, 150]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [35, 110, 185, 220])) star(t, p.x, p.y + 0.4, p.z);
      finish(t, pts[240].x, pts[240].y, pts[240].z, pts[241].clone().sub(pts[239]));
      t.targetScore = 1500;
      forest(t, -8, L + 10, 141, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 7, 8);
    },
  },
  {
    id: 'obsidian-steps',
    name: 'Obsidian Steps',
    difficulty: 3,
    world: { biome: 'volcano', time: 'sunset', weather: 'clear' },
    tip: 'Four jumps down the obsidian steps, over pits where the lava spits. Land flat each time.',
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(46, 34, -2, 32);
      profile(t, h, -2, 32);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      let x0 = 32;
      let y0 = 34;
      const pits: [number, number, number][] = [];
      for (let j = 0; j < 4; j++) {
        profile(t, (x) => y0 + 0.08 * (x - x0) ** 2, x0, x0 + 4);
        const l = landing(t, x0 + 4, y0 + 1.28, 2, y0 - 5);
        star(t, l.top, l.arc(l.top) + 0.3);
        pits.push([x0 + 7, l.top + 2, y0]);
        profile(t, () => l.flat, l.end, l.end + 12);
        x0 = l.end + 12;
        y0 = l.flat;
      }
      profile(t, () => y0, x0, x0 + 30);
      finish(t, x0 + 22, y0);
      for (const [a, b, y] of pits) pit(t, a, b, y, 'lava', 2, 5);
      t.targetScore = 7000;
      forest(t, -8, x0 + 36, 142, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'geyser-field',
    name: 'Geyser Field',
    difficulty: 3,
    world: { biome: 'volcano', time: 'day', weather: 'ash' },
    tip: 'Lava geysers erupt from the trail. Charge a full jump to clear each one.',
    // Full jumps over the geysers.
    solution: [[135, 8], [159, 0], [213, 8], [237, 0], [281, 8], [293, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(32, 22, -2, 34);
      const run = (x: number) => 22 - (x - 34) * 0.08;
      profile(t, h, -2, 34);
      profile(t, run, 34, 220);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      for (const x of [68, 118, 168]) {
        hazard(t, 'lava', x, run(x), 0, 0.55);
        star(t, x, run(x) + 4);
      }
      finish(t, 208, run(208));
      t.targetScore = 2500;
      forest(t, -8, 226, 143, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'caldera-crossing',
    name: 'Caldera Crossing',
    difficulty: 4,
    world: { biome: 'volcano', time: 'sunset', weather: 'ash' },
    tip: 'Basalt slabs over the caldera crack and sink under you. Hop each gap before they go.',
    // Hops over the cracks, a jump over the crystal.
    solution: [[125, 8], [137, 0], [181, 8], [185, 0], [217, 8], [221, 0], [254, 8], [266, 0], [296, 8], [308, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(36, 24, -2, 34);
      profile(t, h, -2, 34);
      const deck = (x: number) => 24 - (x - 34) * 0.06;
      const slabs: [number, number][] = [[34, 60], [68, 90], [98, 118], [126, 146]];
      for (const [a, b] of slabs) profile(t, deck, a, b, 'crumble');
      const out = (x: number) => deck(154) - (x - 154) * 0.08;
      profile(t, out, 154, 220);
      for (let j = 1; j <= slabs.length; j++) {
        const a = j < slabs.length ? slabs[j][0] : 154;
        star(t, a - 4, deck(a) + 2.6);
        hazard(t, 'lava', a - 4, deck(a) - 7, 0, 0.8);
      }
      hazard(t, 'crystal', 186, out(186));
      star(t, 186, out(186) + 3.4);
      start(t, 0, h(0));
      finish(t, 210, out(210));
      t.targetScore = 2500;
      forest(t, -8, 226, 144, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'ash-bog',
    name: 'Ash Bog',
    difficulty: 4,
    world: { biome: 'volcano', time: 'day', weather: 'ash' },
    tip: 'Thick wet ash grabs the sled. Push (→) through both bogs, and jump the geyser between them.',
    // Pushing on the ground through the ash, jumps over the geyser and the crystal.
    solution: [[6, 1], [183, 9], [207, 1], [208, 0], [247, 1], [372, 9], [384, 1], [385, 0], [420, 1], [480, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(26, 16, -2, 34);
      profile(t, h, -2, 34);
      profile(t, () => 16, 34, 42);
      profile(t, () => 16, 42, 66, 'mud');
      const run = (x: number) => 16 - (x - 66) * 0.05;
      profile(t, run, 66, 120);
      profile(t, () => run(120), 120, 144, 'mud');
      const run2 = (x: number) => run(120) - (x - 144) * 0.06;
      profile(t, run2, 144, 220);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      star(t, 54, 17.3);
      star(t, 132, run(120) + 1.3);
      hazard(t, 'lava', 94, run(94), 0, 0.55);
      star(t, 94, run(94) + 4);
      hazard(t, 'crystal', 180, run2(180));
      star(t, 180, run2(180) + 3.4);
      finish(t, 210, run2(210));
      t.targetScore = 1500;
      forest(t, -8, 226, 145, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'pyroclastic',
    name: 'Pyroclastic',
    difficulty: 4,
    world: { biome: 'volcano', time: 'night', weather: 'storm' },
    tip: 'A steep plunge to a narrow ledge over the lava lake. Brake (←) on the way down, or fly past it.',
    // Braking down the plunge, before the kicker.
    solution: [[70, 2], [110, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(48, 16, -2, 52);
      profile(t, h, -2, 52);
      profile(t, () => 16, 52, 62);
      profile(t, (x) => 16 + 0.05 * (x - 62) ** 2, 62, 66);
      const deck = (x: number) => 14.5 - (x - 76) * 0.25 * Math.max(0, Math.min(1, (x - 76) / 6));
      profile(t, deck, 72, 100);
      profile(t, () => deck(100), 100, 112);
      start(t, 0, h(0));
      star(t, 26, h(26) + 1.3);
      star(t, 57, 17.3);
      star(t, 92, deck(92) + 1.3);
      finish(t, 104, deck(100));
      for (const x of [116, 124, 132, 140]) hazard(t, 'lava', x, 0);
      t.targetScore = 600;
      forest(t, -8, 128, 146, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'eruption',
    name: 'Eruption',
    difficulty: 4,
    world: { biome: 'volcano', time: 'night', weather: 'storm' },
    tip: 'Thrown off the crater rim: a huge flight over the lava, then two hot springs bounce you home.',
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(52, 26, -2, 42);
      profile(t, h, -2, 42);
      profile(t, (x) => 26 + 0.06 * (x - 42) ** 2, 42, 46);
      start(t, 0, h(0));
      for (const x of [14, 30]) star(t, x, h(x) + 1.3);
      const l = landing(t, 46, 26.96, 2, 16);
      star(t, l.top, l.arc(l.top) + 0.3);
      pit(t, 50, l.top + 4, 26, 'lava', 3, 8);
      profile(t, () => l.flat, l.end, l.end + 8);
      let fromX = l.end + 8;
      for (const y of [14, 13]) {
        const arc = measureArc(t, fromX);
        let x = fromX + 2;
        while (arc(x) - 0.9 > y && x < fromX + 80) x += 0.25;
        const top = apex(arc, fromX, x);
        star(t, top.x, top.y + 0.3);
        profile(t, () => y, x - 3, x + 5, 'bouncy');
        fromX = x + 5;
      }
      const l2 = landing(t, fromX, 13, 0.5, 11);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      t.targetScore = 8000;
      forest(t, -8, l2.end + 36, 147, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'firewalk',
    name: 'Firewalk',
    difficulty: 5,
    world: { biome: 'volcano', time: 'night', weather: 'clear' },
    tip: 'Basalt pillars over a river of fire, geysers on top. Big jumps for the gaps, timing for the geysers.',
    // Hops across the chasms, jumps over the geysers.
    solution: [[158, 8], [162, 0], [210, 8], [222, 0], [278, 8], [282, 0], [316, 8], [328, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(42, 30, -2, 34);
      profile(t, h, -2, 34);
      const roof = (x: number) => 30 - (x - 34) * 0.05;
      const roofs: [number, number][] = [[34, 64], [73, 150], [159, 250]];
      for (const [a, b] of roofs) profile(t, roof, a, b);
      for (let j = 1; j < roofs.length; j++) {
        star(t, roofs[j][0] - 4, roof(roofs[j][0]) + 2.6);
        hazard(t, 'lava', roofs[j][0] - 4.5, roof(roofs[j][0]) - 9);
      }
      for (const x of [116, 206]) {
        hazard(t, 'lava', x, roof(x), 0, 0.55);
        star(t, x, roof(x) + 4);
      }
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      finish(t, 238, roof(238));
      t.targetScore = 3000;
      forest(t, -8, 256, 148, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'cinder-cone',
    name: 'Cinder Cone',
    difficulty: 5,
    world: { biome: 'volcano', time: 'dawn', weather: 'ash' },
    tip: 'Push (→) up the loose cinders to the summit, cross the cracked crater rim, and mind the crystals on the way down.',
    // Pushing up the cone, and jumps over the crystals.
    solution: [[6, 1], [299, 9], [311, 1], [312, 0], [345, 8], [347, 9], [357, 1], [358, 0], [391, 1], [417, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(24, 14, -2, 30);
      profile(t, h, -2, 30);
      profile(t, () => 14, 30, 60);
      const up = cosine(14, 24, 60, 110);
      profile(t, up, 60, 110);
      profile(t, () => 24, 110, 118);
      for (let k = 0; k < 3; k++) profile(t, () => 24, 118 + k * 8, 126 + k * 8, 'crumble');
      profile(t, () => 24, 142, 148);
      const down = (x: number) => 24 - (x - 148) * 0.08;
      profile(t, down, 148, 240);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      star(t, 85, up(85) + 1.3);
      star(t, 130, 25.3);
      for (const x of [174, 216]) {
        hazard(t, 'crystal', x, down(x));
        star(t, x, down(x) + 3.4);
      }
      finish(t, 232, down(232));
      t.targetScore = 2000;
      forest(t, -8, 250, 149, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
  {
    id: 'inferno',
    name: 'Inferno',
    difficulty: 5,
    world: { biome: 'volcano', time: 'night', weather: 'storm' },
    tip: 'The Volcano finale: a leap over the lava lake, a crumbling bridge, geysers, an ash bog and checkpoints.',
    // Pushing on the ground, and jumps over the geysers.
    solution: [[6, 1], [93, 0], [146, 1], [149, 0], [151, 1], [183, 9], [207, 1], [208, 0], [253, 1], [257, 9], [269, 1], [270, 0], [304, 1], [481, 0]],
    build(t) {
      t.clear();
      home(t, { biome: 'volcano' });
      const h = cosine(54, 38, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 38 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 38, 39.28, 2, 30);
      star(t, l.top, l.arc(l.top) + 0.3);
      pit(t, 41, l.top + 2, 38, 'lava', 3, 6);
      const a = l.end;
      profile(t, () => 30, a, a + 10);
      checkpoint(t, a + 6, 30);
      for (let k = 0; k < 3; k++) profile(t, () => 30, a + 10 + k * 8, a + 18 + k * 8, 'crumble');
      star(t, a + 22, 31.3);
      const run = (x: number) => 30 - (x - a - 34) * 0.08;
      profile(t, run, a + 34, a + 124);
      for (const x of [a + 58, a + 102]) {
        hazard(t, 'lava', x, run(x), 0, 0.55);
        star(t, x, run(x) + 4);
      }
      const yb = run(a + 124);
      checkpoint(t, a + 120, run(a + 120));
      profile(t, () => yb, a + 124, a + 148, 'mud');
      star(t, a + 136, yb + 1.3);
      const down = cosine(yb, 18, a + 148, a + 190);
      profile(t, down, a + 148, a + 190);
      profile(t, () => 18, a + 190, a + 220);
      finish(t, a + 210, 18);
      t.targetScore = 4000;
      forest(t, -8, a + 230, 150, ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'], 6, 8);
    },
  },
];

export const puzzles: PuzzleDef[] = [
  bridge({
    id: 'lava-gap',
    name: 'Lava Gap',
    tip: 'A gap in the trail over the lava. Draw a bridge across.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    danger: 'lava',
    y: 14,
    top: 26,
    gaps: [[44, 54]],
    end: 100,
    seed: 191,
  }),
  climb({
    id: 'magma-hill',
    name: 'Magma Hill',
    kind: 'rings',
    tip: 'A hill of cooled magma, higher than the start: a ring before it carries Bosh over.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    y: 8,
    top: 18,
    hills: [{ at: 52, height: 11 }],
    end: 140,
    seed: 192,
  }),
  clearPath({
    id: 'rockslide',
    name: 'Rockslide',
    tip: 'Boulders rolled onto the trail. Erase the two in the way, and leave the rest.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    top: 26,
    y: 16,
    slope: 0.06,
    humps: [56, 98],
    spares: [[40, 4], [78, 6], [118, 4]],
    end: 150,
    seed: 193,
  }),
  cliffAir({
    id: 'crater-leap',
    name: 'Crater Leap',
    tip: 'Fly over the lava from the crater rim: a kicker at the edge, a second in the air.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    danger: 'lava',
    top: 32,
    y: 18,
    edge: 50,
    floor: 7,
    kicker: 0.1,
    seed: 194,
  }),
  bridge({
    id: 'basalt-steps',
    name: 'Basalt Steps',
    kind: 'oneline',
    tip: 'Three lava channels cut the trail: one line over all of them.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    danger: 'lava',
    y: 12,
    top: 24,
    gaps: [[44, 50], [56, 62], [68, 74]],
    end: 120,
    seed: 195,
  }),
  bounce({
    id: 'hot-spring',
    name: 'Hot Spring',
    tip: 'The ledge is out of reach: a springy pad in the pit bounces Bosh up there.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    danger: 'lava',
    dy: 3,
    seed: 196,
  }),
  crumbleRush({
    id: 'cracked-crust',
    name: 'Cracked Crust',
    kind: 'draw',
    tip: 'The crust over the lava cracks under a slow rider. Draw a boost strip to rush across.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    danger: 'lava',
    top: 20,
    y: 14,
    slabs: 4,
    rise: 5,
    boosts: 1,
    seed: 197,
  }),
  ledge({
    id: 'vent-drop',
    name: 'Vent Drop',
    tip: 'From the high vent down to the lava fields: draw the way down.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    top: 32,
    high: 22,
    low: 8,
    edge: 50,
    land: 82,
    end: 128,
    seed: 198,
  }),
  climb({
    id: 'fire-ramp',
    name: 'Fire Ramp',
    kind: 'draw',
    tip: 'Two hot hills in a row, both too high. Draw boost strips to power over them.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    y: 8,
    top: 18,
    hills: [{ at: 46, height: 11 }, { at: 120, height: 11 }],
    end: 200,
    seed: 199,
  }),
  bridge({
    id: 'lava-river',
    name: 'Lava River',
    tip: 'Three planks of the bridge burned away. Patch them all.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    danger: 'lava',
    y: 14,
    top: 26,
    gaps: [[40, 48], [58, 66], [78, 86]],
    end: 130,
    seed: 200,
  }),
  clearPath({
    id: 'obsidian-wall',
    name: 'Obsidian Wall',
    tip: 'Three walls of obsidian block the trail. Erase them, and only them.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    top: 28,
    y: 18,
    slope: 0.06,
    humps: [50, 84, 118],
    spares: [[68, 5]],
    end: 165,
    seed: 201,
  }),
  crumbleRush({
    id: 'collapsing-caldera',
    name: 'Collapsing Caldera',
    kind: 'rings',
    tip: 'The caldera floor gives way under a slow rider. Rings before it rush Bosh across.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    danger: 'lava',
    top: 20,
    y: 14,
    slabs: 4,
    rise: 5,
    boosts: 2,
    seed: 202,
  }),
  ledge({
    id: 'last-descent',
    name: 'Last Descent',
    kind: 'oneline',
    tip: 'Down the volcano in one stroke: a single line from the high ledge to the valley.',
    world: { biome: 'volcano', time: 'night' },
    decor: ['basalt', 'charred', 'lavarock', 'obsidian', 'vent'],
    top: 34,
    high: 24,
    low: 8,
    edge: 50,
    land: 86,
    end: 132,
    seed: 203,
  }),
];
