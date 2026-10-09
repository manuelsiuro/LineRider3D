import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { apex, checkpoint, cosine, finish, forest, hazard, landing, measureArc, pit, profile, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { bounce, bridge, clearPath, climb, cliffAir, ledge } from '../puzzleKit';

/** Beach: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'boardwalk',
    name: 'Boardwalk',
    difficulty: 2,
    world: { biome: 'beach' },
    tip: 'Bounce down the boardwalk: two trampolines, stars in the air, and a ring to finish.',
    build(t) {
      t.clear();
      const h = cosine(22, 9, -2, 28);
      profile(t, h, -2, 28);
      profile(t, (x) => 9 + 0.04 * (x - 28) ** 2, 28, 32);
      start(t, 0, h(0));
      star(t, 15, h(15) + 1.3);
      let fromX = 32;
      const padY = [7.4, 6.8];
      for (let k = 0; k < padY.length; k++) {
        const arc = measureArc(t, fromX);
        let x = fromX + 2;
        while (arc(x) - 0.9 > padY[k] && x < fromX + 80) x += 0.25;
        const top = apex(arc, fromX, x);
        star(t, top.x, top.y + 0.3);
        profile(t, () => padY[k], x - 3, x + 5, 'bouncy');
        fromX = x + 5;
      }
      const l = landing(t, fromX, padY[padY.length - 1], 0.5, 2.5);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      t.addRing({ position: new THREE.Vector3(l.end + 8, l.flat + 1.3, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.7 });
      finish(t, l.end + 22, l.flat);
      t.targetScore = 6000;
      forest(t, -6, l.end + 34, 31, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut'], 5, 8);
    },
  },
  {
    id: 'shell-beach',
    name: 'Shell Beach',
    difficulty: 2,
    world: { biome: 'beach' },
    tip: 'Sea urchins in the pits: one touch is a wipeout. Fly high over them and land on the far side.',
    build(t) {
      t.clear();
      const h = cosine(28, 12, -2, 32);
      profile(t, h, -2, 32);
      profile(t, (x) => 12 + 0.08 * (x - 32) ** 2, 32, 36);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      const l1 = landing(t, 36, 13.28, 2, 6);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      const k = l1.end + 10;
      profile(t, () => l1.flat, l1.end, k);
      profile(t, (x) => l1.flat + 0.08 * (x - k) ** 2, k, k + 4);
      const l2 = landing(t, k + 4, l1.flat + 1.28, 2, 3);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      // The pits, under the flights (added after measuring them).
      pit(t, 39, l1.top + 2, 12, 'urchin', 3, 4);
      pit(t, k + 7, l2.top + 2, l1.flat, 'urchin', 2, 4);
      t.targetScore = 4000;
      forest(t, -6, l2.end + 36, 41, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'surfs-up',
    name: "Surf's Up",
    difficulty: 2,
    vehicle: 'snowboard',
    world: { biome: 'beach' },
    tip: 'Sandboarding! Drop in, spin (↑) off the wave kicker, then ride the swell into a second hit.',
    build(t) {
      t.clear();
      const V = vehicleById('snowboard');
      const h = cosine(40, 16, -2, 40);
      profile(t, h, -2, 40);
      start(t, 0, h(0));
      for (const x of [12, 28]) star(t, x, h(x) + 1.3);
      profile(t, (x) => 16 + 0.1 * (x - 40) ** 2, 40, 45);
      const l1 = landing(t, 45, 18.5, 4, 8, 'normal', V);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      // A rolling swell before the second kicker.
      const s0 = l1.end;
      const swell = (x: number) => l1.flat + 1.2 * Math.sin((Math.PI * (x - s0)) / 16) ** 2;
      profile(t, swell, s0, s0 + 16);
      star(t, s0 + 8, swell(s0 + 8) + 1.3);
      const k2 = s0 + 22;
      profile(t, () => l1.flat, s0 + 16, k2);
      profile(t, (x) => l1.flat + 0.1 * (x - k2) ** 2, k2, k2 + 4);
      const l2 = landing(t, k2 + 4, l1.flat + 1.6, 2, 2, 'normal', V);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 20, l2.flat);
      t.targetScore = 15000;
      forest(t, -6, l2.end + 34, 32, ['palm', 'surfboard', 'umbrella', 'lifeguard', 'palm'], 5, 8);
    },
  },
  {
    id: 'tide-pools',
    name: 'Tide Pools',
    difficulty: 2,
    world: { biome: 'beach', time: 'sunset' },
    tip: 'Bounce from pad to pad over the tide pools. The urchins down there are best left alone.',
    build(t) {
      t.clear();
      const h = cosine(24, 10, -2, 28);
      profile(t, h, -2, 28);
      profile(t, (x) => 10 + 0.04 * (x - 28) ** 2, 28, 32);
      start(t, 0, h(0));
      star(t, 14, h(14) + 1.3);
      let fromX = 32;
      const pads = [8, 7];
      const spans: [number, number, number][] = [];
      for (const y of pads) {
        const arc = measureArc(t, fromX);
        let x = fromX + 2;
        while (arc(x) - 0.9 > y && x < fromX + 80) x += 0.25;
        const top = apex(arc, fromX, x);
        star(t, top.x, top.y + 0.3);
        profile(t, () => y, x - 3, x + 5, 'bouncy');
        spans.push([fromX + 2, x - 4, y]);
        fromX = x + 5;
      }
      const l = landing(t, fromX, pads[pads.length - 1], 0.5, 2.5);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      finish(t, l.end + 22, l.flat);
      for (const [a, b, y] of spans) if (b - a > 4) pit(t, a, b, y, 'urchin', 2, 2.5);
      t.targetScore = 6000;
      forest(t, -6, l.end + 36, 42, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'sunset-cruise',
    name: 'Sunset Cruise',
    difficulty: 2,
    vehicle: 'bike',
    world: { biome: 'beach', time: 'sunset' },
    tip: 'A long, flowing BMX line along the beach at sunset. Pedal the rollers, flip the three tables.',
    build(t) {
      t.clear();
      const V = vehicleById('bike');
      const h = cosine(28, 8, -2, 40);
      profile(t, h, -2, 40);
      start(t, 0, h(0));
      star(t, 22, h(22) + 1.3);
      const roll = (x: number) => 8 + 0.45 * Math.sin((Math.PI * (x - 40)) / 9) ** 2;
      profile(t, roll, 40, 58);
      star(t, 49, roll(49) + 1.3);
      let y = 8;
      let x = 58;
      for (let k = 0; k < 3; k++) {
        profile(t, (q) => y + 0.06 * (q - x) ** 2, x, x + 7);
        const l = landing(t, x + 7, y + 2.94, 3, Math.max(2, y - 2), 'normal', V);
        star(t, l.top, l.arc(l.top) + 0.3);
        x = l.end + 6;
        profile(t, () => l.flat, l.end, x);
        y = l.flat;
      }
      profile(t, () => y, x, x + 26);
      finish(t, x + 18, y);
      t.targetScore = 6000;
      forest(t, -6, x + 30, 33, ['palm', 'hut', 'umbrella', 'palm', 'deckchair'], 5, 9);
    },
  },
  {
    id: 'pier-run',
    name: 'Pier Run',
    difficulty: 3,
    world: { biome: 'beach', time: 'day', weather: 'clear' },
    tip: 'All the way down the long pier: three jumps over the rocks and a checkpoint halfway.',
    build(t) {
      t.clear();
      const h = cosine(36, 22, -2, 32);
      profile(t, h, -2, 32);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      let x0 = 32;
      let y0 = 22;
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
      for (const [a, b, y] of pits) pit(t, a, b, y, 'urchin', 2, 4);
      t.targetScore = 6000;
      forest(t, -6, x0 + 36, 43, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'spike-strip',
    name: 'Spike Strip',
    difficulty: 3,
    world: { biome: 'beach' },
    tip: 'Spike strips across the boardwalk! They are low: a quick tap of Jump hops right over.',
    // Hops over the spike strips.
    solution: [[116, 8], [140, 0], [184, 8], [208, 0]],
    build(t) {
      t.clear();
      const h = cosine(26, 16, -2, 34);
      const run = (x: number) => 16 - (x - 34) * 0.08;
      profile(t, h, -2, 34);
      profile(t, run, 34, 180);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      for (const x of [62, 100, 138]) {
        hazard(t, 'spikes', x, run(x));
        star(t, x, run(x) + 2.2);
      }
      finish(t, 168, run(168));
      t.targetScore = 1500;
      forest(t, -6, 186, 44, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'crab-cove',
    name: 'Crab Cove',
    difficulty: 3,
    world: { biome: 'beach', time: 'sunset' },
    tip: 'Urchins and spike strips down the cove. Big hop for the urchins, little hop for the spikes.',
    // Hops over the urchins and spikes.
    solution: [[157, 8], [161, 0], [251, 8], [263, 0]],
    build(t) {
      t.clear();
      const h = cosine(30, 20, -2, 34);
      const run = (x: number) => 20 - (x - 34) * 0.09;
      profile(t, h, -2, 34);
      profile(t, run, 34, 240);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const items: [number, 'urchin' | 'spikes'][] = [[62, 'urchin'], [106, 'spikes'], [148, 'urchin'], [192, 'spikes']];
      for (const [x, kind] of items) {
        hazard(t, kind, x, run(x));
        star(t, x, run(x) + (kind === 'urchin' ? 3 : 2.2));
      }
      finish(t, 228, run(228));
      t.targetScore = 2500;
      forest(t, -6, 246, 45, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'lighthouse',
    name: 'Lighthouse Climb',
    difficulty: 3,
    world: { biome: 'beach', time: 'dawn' },
    tip: 'The lighthouse sits higher than where you start: push (→) all the way up, then enjoy the ride down.',
    // Pushing on the ground, all the way up the climb.
    solution: [[6, 1], [247, 0], [250, 1], [254, 0], [255, 1], [347, 0], [371, 1]],
    build(t) {
      t.clear();
      const h = cosine(20, 8, -2, 30);
      profile(t, h, -2, 30);
      profile(t, () => 8, 30, 40);
      // A long climb above the start height.
      const up = cosine(8, 24, 40, 110);
      profile(t, up, 40, 110);
      profile(t, () => 24, 110, 124);
      const down = cosine(24, 4, 124, 170);
      profile(t, down, 124, 170);
      profile(t, () => 4, 170, 210);
      start(t, 0, h(0));
      for (const x of [16, 60, 90]) star(t, x, (x < 30 ? h(x) : up(x)) + 1.3);
      star(t, 117, 25.3);
      star(t, 150, down(150) + 1.3);
      finish(t, 198, 4);
      t.addDecor({ kind: 'tower', position: new THREE.Vector3(117, 0, -9), rotation: 0, scale: 1.2 });
      t.targetScore = 800;
      forest(t, -6, 216, 46, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'high-tide',
    name: 'High Tide',
    difficulty: 3,
    world: { biome: 'beach', weather: 'rain' },
    tip: 'Too much speed and you fly right over the jetty, onto the urchins. Brake (←) before the kicker.',
    // Braking down the slope, before the kicker.
    solution: [[60, 2], [100, 0]],
    build(t) {
      t.clear();
      const h = cosine(40, 12, -2, 46);
      profile(t, h, -2, 46);
      profile(t, () => 12, 46, 56);
      profile(t, (x) => 12 + 0.05 * (x - 56) ** 2, 56, 60);
      // The jetty: just long enough for a calm landing.
      const deck = (x: number) => 10.5 - (x - 70) * 0.25 * Math.max(0, Math.min(1, (x - 70) / 6));
      profile(t, deck, 66, 96);
      profile(t, () => deck(96), 96, 120);
      start(t, 0, h(0));
      star(t, 22, h(22) + 1.3);
      star(t, 50, 13.3);
      star(t, 108, deck(96) + 1.3);
      finish(t, 114, deck(96));
      for (const x of [104, 116, 128, 140]) hazard(t, 'urchin', x + 20, 0);
      t.targetScore = 600;
      forest(t, -6, 126, 47, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'reef-hopper',
    name: 'Reef Hopper',
    difficulty: 3,
    world: { biome: 'beach' },
    tip: 'Hop the reef from deck to deck. Charge each jump: urchins wait in every gap.',
    // A charged jump across each gap.
    solution: [[96, 8], [120, 0], [227, 8], [251, 0], [278, 8], [302, 0]],
    build(t) {
      t.clear();
      const h = cosine(34, 22, -2, 34);
      profile(t, h, -2, 34);
      const deck = (x: number) => 22 - (x - 34) * 0.06;
      const decks: [number, number][] = [[34, 66], [75, 116], [125, 164], [173, 214]];
      for (const [a, b] of decks) profile(t, deck, a, b);
      for (let j = 1; j < decks.length; j++) {
        const [a] = decks[j];
        const g0 = decks[j - 1][1];
        pit(t, g0 + 1, a - 1, deck(a), 'urchin', 1, 3);
        star(t, a - 4, deck(a) + 2.6);
      }
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      finish(t, 204, deck(204));
      t.targetScore = 2000;
      forest(t, -6, 220, 48, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
  {
    id: 'coral-coast',
    name: 'Coral Coast',
    difficulty: 4,
    world: { biome: 'beach', time: 'sunset', weather: 'clear' },
    tip: 'The whole coast: a big jump, urchins and spikes to hop, a climb to push up, and checkpoints.',
    // Pushing on the ground, and charged jumps over the hazards.
    solution: [[6, 1], [94, 0], [144, 1], [177, 0], [180, 1], [192, 9], [204, 1], [205, 0], [240, 1], [353, 0], [354, 1], [355, 0], [356, 1], [467, 0], [469, 1]],
    build(t) {
      t.clear();
      // The measured jump first; then the parts that need you.
      const h = cosine(46, 32, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 32 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 38, 33.28, 2, 24);
      star(t, l.top, l.arc(l.top) + 0.3);
      pit(t, 41, l.top + 2, 32, 'urchin', 3, 4);
      const a = l.end;
      profile(t, () => 24, a, a + 10);
      checkpoint(t, a + 6, 24);
      const run = (x: number) => 24 - (x - a - 10) * 0.09;
      profile(t, run, a + 10, a + 120);
      for (const [x, kind] of [[a + 40, 'urchin'], [a + 80, 'spikes']] as const) {
        hazard(t, kind, x, run(x));
        star(t, x, run(x) + (kind === 'urchin' ? 3 : 2.2));
      }
      // A climb to push up, then down to the finish.
      const yb = run(a + 120);
      profile(t, () => yb, a + 120, a + 130);
      checkpoint(t, a + 126, yb);
      const up = cosine(yb, yb + 6, a + 130, a + 170);
      profile(t, up, a + 130, a + 170);
      // A flat top, then a long, gentle way down (a sharp crest would throw Bosh off).
      profile(t, () => yb + 6, a + 170, a + 182);
      star(t, a + 176, yb + 7.3);
      const down = cosine(yb + 6, 10, a + 182, a + 240);
      profile(t, down, a + 182, a + 240);
      profile(t, () => 10, a + 240, a + 270);
      finish(t, a + 260, 10);
      t.targetScore = 4000;
      forest(t, -6, a + 286, 49, ['palm', 'umbrella', 'deckchair', 'surfboard', 'palm', 'hut', 'lifeguard'], 5, 8);
    },
  },
];

export const puzzles: PuzzleDef[] = [
  bridge({
    id: 'washed-out',
    name: 'Washed Out',
    tip: 'The tide took a piece of the boardwalk. Draw it back in.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    danger: 'urchin',
    y: 12,
    top: 24,
    gaps: [[44, 54]],
    end: 100,
    seed: 81,
  }),
  climb({
    id: 'surf-rings',
    name: 'Surf Rings',
    kind: 'rings',
    tip: 'A dune higher than the start. Hang a ring before it and ride the push over the top.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    y: 6,
    top: 16,
    hills: [{ at: 52, height: 11 }],
    end: 140,
    seed: 82,
  }),
  bounce({
    id: 'trampoline-tide',
    name: 'Trampoline Tide',
    tip: 'The far ledge is higher than you. A bouncy pad in the pit springs Bosh up there.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    danger: 'urchin',
    dy: 2,
    seed: 83,
  }),
  clearPath({
    id: 'driftwood',
    name: 'Driftwood',
    tip: 'Driftwood piled across the boardwalk. Clear the pile, leave the rest.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    top: 24,
    y: 14,
    slope: 0.06,
    humps: [62],
    spares: [
      [44, 4],
      [96, 5],
    ],
    end: 130,
    seed: 84,
  }),
  bridge({
    id: 'boardwalk-gaps',
    name: 'Boardwalk Gaps',
    kind: 'oneline',
    tip: 'Two holes in the boardwalk, one line to fix them both.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    danger: 'urchin',
    y: 10,
    top: 22,
    gaps: [
      [44, 52],
      [60, 68],
    ],
    end: 110,
    seed: 85,
  }),
  cliffAir({
    id: 'cliff-dive',
    name: 'Cliff Dive',
    tip: 'Off the sea cliff: draw a kicker at the edge and stay up for a whole second.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    danger: 'urchin',
    top: 28,
    y: 14,
    edge: 50,
    floor: 4,
    kicker: 0.08,
    seed: 86,
  }),
  ledge({
    id: 'dune-slide',
    name: 'Dune Slide',
    tip: 'Down from the high dune to the beach: draw the slide.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    top: 28,
    high: 18,
    low: 6,
    edge: 50,
    land: 80,
    end: 124,
    seed: 87,
  }),
  climb({
    id: 'boost-wave',
    name: 'Boost Wave',
    kind: 'draw',
    tip: 'A wave of sand to climb: draw a red boost strip before it.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    y: 6,
    top: 16,
    hills: [{ at: 54, height: 12 }],
    end: 142,
    seed: 88,
  }),
  clearPath({
    id: 'seaweed-snarl',
    name: 'Seaweed Snarl',
    tip: 'Three snarls of seaweed block the way, among loose strands. Erase only the three.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    top: 26,
    y: 16,
    slope: 0.06,
    humps: [50, 86, 122],
    spares: [
      [68, 5],
      [104, 4],
    ],
    end: 170,
    seed: 89,
  }),
  bounce({
    id: 'sea-spring',
    name: 'Sea Spring',
    tip: 'Up from the rock pool: draw a trampoline in the pit to reach the ledge.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    danger: 'urchin',
    dy: 6,
    seed: 90,
  }),
  bridge({
    id: 'pier-planks',
    name: 'Pier Planks',
    tip: 'Three planks missing on the pier, and just enough ink to replace them.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    danger: 'urchin',
    y: 12,
    top: 24,
    gaps: [
      [40, 48],
      [58, 66],
      [78, 86],
    ],
    end: 130,
    seed: 91,
  }),
  ledge({
    id: 'lighthouse-line',
    name: 'Lighthouse Line',
    kind: 'oneline',
    tip: 'From the lighthouse rocks down to the sand, in a single line.',
    world: { biome: 'beach' },
    decor: ['palm', 'umbrella', 'deckchair', 'surfboard', 'hut', 'rock'],
    top: 34,
    high: 24,
    low: 6,
    edge: 50,
    land: 86,
    end: 134,
    seed: 92,
  }),
];
