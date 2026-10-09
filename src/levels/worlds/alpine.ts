import * as THREE from 'three';
import { buildDemoTrack } from '../../demoTrack';
import { vehicleById } from '../../physics/vehicles';
import { apex, cosine, finish, forest, hazard, landing, line, measureArc, path, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { clearPath, climb, cliffAir, ledge } from '../puzzleKit';

/** Alpine: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'first-run',
    name: 'First Run',
    difficulty: 1,
    tip: 'Press play and enjoy the ride. Collect the stars and cross the finish.',
    build(t) {
      t.clear();
      const h = cosine(16, 3, -2, 60);
      profile(t, h, -2, 60);
      profile(t, () => 3, 60, 96);
      start(t, 0, h(0));
      for (const x of [14, 28, 42]) star(t, x, h(x) + 1.3);
      t.addRing({ position: new THREE.Vector3(66, 4.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      star(t, 76, 4.3);
      finish(t, 88, 3);
      t.targetScore = 600;
      forest(t, -6, 100, 1);
    },
  },
  {
    id: 'little-hop',
    name: 'Little Hop',
    difficulty: 1,
    tip: 'Fly off the kicker! In rider mode, hold ← in the air for a backflip and let go before landing.',
    build(t) {
      t.clear();
      const h = cosine(24, 8, -2, 36);
      profile(t, h, -2, 36);
      profile(t, (x) => 8 + 0.1 * (x - 36) ** 2, 36, 40);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 40, 9.6, 2, 3);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      star(t, l.end + 8, l.flat + 1.3);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 3000;
      forest(t, -6, l.end + 36, 2);
    },
  },
  {
    id: 'boost-lane',
    name: 'Boost Lane',
    difficulty: 1,
    tip: 'Red boost strips and golden rings speed Bosh up. Keep the speed to clear the hill!',
    build(t) {
      t.clear();
      const h = cosine(12, 3, -2, 24);
      profile(t, h, -2, 24);
      profile(t, () => 3, 24, 34);
      profile(t, () => 3, 34, 46, 'accel');
      const hill = cosine(3, 5, 52, 70);
      profile(t, () => 3, 46, 52);
      profile(t, hill, 52, 70);
      const down = cosine(5, 3, 70, 76);
      profile(t, down, 70, 76);
      profile(t, () => 3, 76, 84, 'accel');
      profile(t, () => 3, 84, 124);
      start(t, 0, h(0));
      t.addRing({ position: new THREE.Vector3(92, 4.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      for (const [x, y] of [
        [40, 4.3],
        [64, 6.3],
        [80, 4.3],
        [104, 4.3],
      ])
        star(t, x, y);
      finish(t, 116, 3);
      t.targetScore = 3000;
      forest(t, -6, 126, 3, ['pine', 'pine', 'lamp', 'rock']);
    },
  },
  {
    id: 'long-glide',
    name: 'Long Glide',
    difficulty: 1,
    tip: 'A long, rolling run down the mountain. Sit back, enjoy the view, and catch every star.',
    build(t) {
      t.clear();
      const top = cosine(30, 20, -2, 30);
      const roll = (x: number) => 20 - (x - 30) * 0.07 + 1.2 * Math.sin((x - 30) / 9);
      profile(t, top, -2, 30);
      profile(t, roll, 30, 250);
      start(t, 0, top(0));
      for (const p of riderLine(t, [55, 95, 135, 175, 215])) star(t, p.x, p.y + 0.6);
      // A ring in a dip: points, and a little push for the last hills.
      const [r] = riderLine(t, [148]);
      t.addRing({ position: new THREE.Vector3(r.x, r.y + 0.6, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      finish(t, 240, roll(240));
      t.targetScore = 600;
      forest(t, -6, 256, 21, ['pine', 'pine', 'pine', 'cabin', 'snowman', 'rock']);
    },
  },
  {
    id: 'ice-age',
    name: 'Ice Age',
    difficulty: 1,
    tip: 'Ice has no grip: the banked turn holds you in. Stay on the line!',
    build(t) {
      t.clear();
      // Entry speed matched to the auto-bank (≈7 units of drop before the turn).
      const h = cosine(21.5, 14, -2, 22);
      profile(t, h, -2, 22);
      start(t, 0, h(0));
      // A descending 180° ice turn, auto-banked like a bobsled run.
      const pts: THREE.Vector3[] = [new THREE.Vector3(22, h(22), 0)];
      let y = h(22);
      let prev = pts[0].clone();
      const R = 16;
      for (let a = 0.08; a <= Math.PI + 1e-6; a += 0.08) {
        const p = new THREE.Vector3(22 + R * Math.sin(a), 0, -R + R * Math.cos(a));
        y -= Math.hypot(p.x - prev.x, p.z - prev.z) * 0.035;
        p.y = y;
        pts.push(p);
        prev = p;
      }
      // Straight run back, still descending gently.
      const end = pts[pts.length - 1].clone();
      for (let d = 2; d <= 40; d += 2) pts.push(new THREE.Vector3(end.x - d, end.y - d * 0.06, end.z));
      path(t, pts, 'ice', 4);
      for (const a of [0.7, 1.6, 2.5]) {
        const i = Math.round(a / 0.08);
        star(t, pts[i].x, pts[i].y + 1.4, pts[i].z);
      }
      const last = pts[pts.length - 1];
      for (const d of [12, 26]) {
        const p = pts[pts.length - 1 - d / 2];
        t.addRing({ position: p.clone().add(new THREE.Vector3(0, 1.3, 0)), axis: new THREE.Vector3(-1, 0, 0), radius: 1.7 });
      }
      star(t, last.x + 18, last.y + 1.08 + 1.3, last.z);
      finish(t, last.x + 6, last.y + 0.36, last.z, new THREE.Vector3(-1, 0, 0));
      t.targetScore = 1500;
      forest(t, -6, 40, 4);
    },
  },
  {
    id: 'boing-boing',
    name: 'Boing Boing',
    difficulty: 1,
    tip: 'Pink pads are trampolines. Bounce from pad to pad and grab the stars in the air.',
    build(t) {
      t.clear();
      const h = cosine(20, 8, -2, 26);
      profile(t, h, -2, 26);
      profile(t, (x) => 8 + 0.04 * (x - 26) ** 2, 26, 30);
      start(t, 0, h(0));
      star(t, 14, h(14) + 1.3);
      // Each pad goes where the previous flight comes down to its height.
      let fromX = 30;
      const padY = [6.5, 7];
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
      profile(t, () => l.flat, l.end, l.end + 26);
      finish(t, l.end + 18, l.flat);
      t.targetScore = 5000;
      forest(t, -6, l.end + 30, 5, ['pine', 'gift', 'pine', 'snowman']);
    },
  },
  {
    id: 'flip-academy',
    name: 'Flip Academy',
    difficulty: 2,
    tip: 'A huge kicker. Time a flip, release early and land flat for a Perfect.',
    build(t) {
      buildDemoTrack(t);
      t.targetScore = 6000;
    },
  },
  {
    id: 'ring-road',
    name: 'Ring Road',
    difficulty: 2,
    tip: 'A winding bobsled road. The walls hold you in; rings on the straights add speed.',
    build(t) {
      t.clear();
      // S-curves descending down the mountain, built up gently from rest.
      const pts: THREE.Vector3[] = [];
      let y = 30;
      let prev = new THREE.Vector3(0, y, 0);
      for (let s = 0; s <= 160; s += 1) {
        const p = new THREE.Vector3(s, 0, 5 * Math.sin((s / 60) * Math.PI * 2) * Math.min(1, s / 25));
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * 0.1;
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      // Rings where the road crosses its centerline (straightest bits).
      for (const s of [60, 120]) {
        const dir = pts[s + 1].clone().sub(pts[s - 1]).normalize();
        t.addRing({ position: pts[s].clone().add(new THREE.Vector3(0, 1.3, 0)), axis: dir, radius: 1.7 });
      }
      // Stars on the line Bosh rides through the banked turns.
      for (const p of riderLine(t, [30, 45, 75, 105, 135])) star(t, p.x, p.y + 0.4, p.z);
      finish(t, pts[150].x, pts[150].y, pts[150].z, pts[151].clone().sub(pts[149]));
      t.targetScore = 1350;
      forest(t, -6, 170, 7);
    },
  },
  {
    id: 'icicle-alley',
    name: 'Icicle Alley',
    difficulty: 2,
    tip: 'Icicles hang over the run: touch one and it is a wipeout. Stay low under them and you are fine.',
    build(t) {
      t.clear();
      const h = cosine(30, 16, -2, 36);
      const run = (x: number) => 16 - (x - 36) * 0.05;
      profile(t, h, -2, 36);
      profile(t, run, 36, 132);
      start(t, 0, h(0));
      for (const x of [62, 86, 110]) hazard(t, 'icicles', x, run(x) + 3.6);
      for (const p of riderLine(t, [20, 74, 98])) star(t, p.x, p.y + 0.6);
      // Out of the alley: a kicker and a landing.
      profile(t, (x) => run(132) + 0.08 * (x - 132) ** 2, 132, 136);
      const l = landing(t, 136, run(132) + 1.28, 3, 4);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 3000;
      forest(t, -6, l.end + 36, 22, ['pine', 'pine', 'rock', 'cabin', 'lamp']);
    },
  },
  {
    id: 'slalom',
    name: 'Slalom',
    difficulty: 2,
    vehicle: 'skis',
    tip: 'Skis on! Carve the banked gates, grab the rings and spin a 360 (↑) off the final kicker.',
    build(t) {
      t.clear();
      const V = vehicleById('skis');
      const pts: THREE.Vector3[] = [];
      let y = 26;
      let prev = new THREE.Vector3(0, y, 0);
      for (let s = 0; s <= 150; s += 1) {
        // Curves fade in at the top and out at the bottom, so the road ends straight.
        const p = new THREE.Vector3(s, 0, 5.5 * Math.sin((s / 70) * Math.PI * 2) * Math.min(1, s / 25, (150 - s) / 25));
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * 0.08;
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      // Gates: flags on both sides at each turn.
      for (let s = 15; s < 140; s += 30) {
        const c = pts[s];
        for (const side of [-2.6, 2.6]) t.addDecor({ kind: 'flag', position: new THREE.Vector3(c.x, 0, c.z + side), rotation: 0, scale: 1 });
      }
      for (const s of [60]) {
        const dir = pts[s + 1].clone().sub(pts[s - 1]).normalize();
        t.addRing({ position: pts[s].clone().add(new THREE.Vector3(0, 1.3, 0)), axis: dir, radius: 1.7 });
      }
      for (const p of riderLine(t, [30, 90, 120], V)) star(t, p.x, p.y + 0.4, p.z);
      // Straight finish with a kicker.
      const end = pts[pts.length - 1];
      const fy = end.y;
      const S = 24;
      profile(t, (x) => fy - (x - end.x) * 0.08, end.x, end.x + S, 'normal', 0, 4);
      const ky = fy - 0.08 * S;
      profile(t, (x) => ky + 0.1 * (x - end.x - S) ** 2, end.x + S, end.x + S + 4, 'normal', 0, 4);
      const l = landing(t, end.x + S + 4, ky + 1.6, 2, Math.max(2, ky - 8), 'normal', V, 5);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 26, 'normal', 0, 5);
      finish(t, l.end + 18, l.flat);
      t.targetScore = 12000;
      forest(t, -10, l.end + 30, 10, ['pine', 'pine', 'pine', 'cabin', 'snowman']);
    },
  },
  {
    id: 'big-air',
    name: 'Big Air Park',
    difficulty: 2,
    vehicle: 'snowboard',
    tip: 'Snowboard park: a monster kicker. Hold ↑ for flat spins, add ←/→ for flips. Land a 720 for the crowd!',
    build(t) {
      t.clear();
      const V = vehicleById('snowboard');
      const h = cosine(46, 18, -2, 44);
      profile(t, h, -2, 44);
      start(t, 0, h(0));
      for (const x of [14, 30]) star(t, x, h(x) + 1.3);
      profile(t, (x) => 18 + 0.09 * (x - 44) ** 2, 44, 49);
      const l1 = landing(t, 49, 20.25, 4, 8, 'normal', V);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      // Step-down second kicker.
      const k2 = l1.end + 8;
      profile(t, () => l1.flat, l1.end, k2);
      profile(t, (x) => l1.flat + 0.1 * (x - k2) ** 2, k2, k2 + 4);
      const l2 = landing(t, k2 + 4, l1.flat + 1.6, 2, 2, 'normal', V);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 20, l2.flat);
      t.targetScore = 18000;
      forest(t, -6, l2.end + 34, 11, ['pine', 'flag', 'lamp', 'pine', 'gift']);
    },
  },
  {
    id: 'ski-jump',
    name: 'Ski Jump',
    difficulty: 2,
    vehicle: 'skis',
    tip: 'A real ski jump: a steep in-run, the table, and a long flight down the landing hill.',
    build(t) {
      t.clear();
      const h = cosine(52, 20, -2, 52);
      profile(t, h, -2, 52);
      profile(t, (x) => 20 + 0.1 * (x - 52) ** 2, 52, 56);
      start(t, 0, h(0));
      star(t, 26, h(26) + 1.3);
      const l = landing(t, 56, 21.6, 2, 10, 'normal', vehicleById('skis'));
      for (const k of [0.45, 1, 1.5]) {
        const x = 56 + (l.top - 56) * k;
        star(t, x, l.arc(x) + 0.3);
      }
      profile(t, () => l.flat, l.end, l.end + 30);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 6000;
      forest(t, -6, l.end + 36, 23, ['pine', 'pine', 'flag', 'cabin', 'lamp']);
    },
  },
  {
    id: 'avalanche-run',
    name: 'Avalanche Run',
    difficulty: 2,
    tip: 'The longest run yet: a boost, two big jumps and a ring. Keep your speed all the way down.',
    build(t) {
      t.clear();
      const h = cosine(46, 24, -2, 40);
      profile(t, h, -2, 40);
      profile(t, () => 24, 40, 48, 'accel');
      profile(t, (x) => 24 + 0.05 * (x - 48) ** 2, 48, 52);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l1 = landing(t, 52, 24.8, 2, 16);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      // A run with a ring, then the second kicker.
      profile(t, () => l1.flat, l1.end, l1.end + 20);
      t.addRing({ position: new THREE.Vector3(l1.end + 10, l1.flat + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      // A long, gentle kicker: the ring brings Bosh in fast.
      const k = l1.end + 20;
      profile(t, (x) => l1.flat + 0.04 * (x - k) ** 2, k, k + 6);
      const l2 = landing(t, k + 6, l1.flat + 1.44, 3, 6);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      // A boost down the last straight to the line.
      profile(t, () => l2.flat, l2.end, l2.end + 10);
      profile(t, () => l2.flat, l2.end + 10, l2.end + 18, 'accel');
      profile(t, () => l2.flat, l2.end + 18, l2.end + 40);
      star(t, l2.end + 26, l2.flat + 1.3);
      finish(t, l2.end + 34, l2.flat);
      t.targetScore = 8000;
      forest(t, -6, l2.end + 46, 24, ['pine', 'pine', 'cabin', 'lamp', 'snowman', 'rock']);
    },
  },
  {
    id: 'grand-finale',
    name: 'Grand Finale',
    difficulty: 2,
    tip: 'Everything you learned: big air, bounce, ice and rings. Go for three stars!',
    build(t) {
      t.clear();
      const h = cosine(44, 16, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 16 + 0.12 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l = landing(t, 44, 17.9, 2, 9);
      star(t, l.top, l.arc(l.top) + 0.3);
      // Ice run with a ring.
      profile(t, () => l.flat, l.end, l.end + 14, 'ice');
      t.addRing({ position: new THREE.Vector3(l.end + 8, l.flat + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      // Small drop onto a bouncy pad, then a final landing.
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
      forest(t, -6, l2.end + 30, 8, ['pine', 'pine', 'cabin', 'lamp', 'snowman', 'rock']);
    },
  },
];

export const puzzles: PuzzleDef[] = [
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
  {
    id: 'bridge-in-one',
    name: 'Bridge in One',
    kind: 'oneline',
    tip: 'Two gaps, one line: draw a single stroke that spans them both.',
    ink: 34,
    par: 26,
    types: ['normal'],
    build(t) {
      const h = cosine(24, 10, -2, 28);
      profile(t, h, -2, 28);
      profile(t, () => 10, 28, 34);
      profile(t, () => 10, 44, 48);
      profile(t, () => 10, 58, 100);
      start(t, 0, h(0));
      star(t, 46, 11.3);
      finish(t, 88, 10);
      forest(t, -6, 106, 17);
    },
    solution(t) {
      line(t, [33, 10], [59, 10]);
    },
  },
  {
    id: 'ring-toss',
    name: 'Ring Toss',
    kind: 'rings',
    tip: "Bosh can't get over the hill on his own. Hang a boost ring on the track to push him over.",
    ink: 3,
    par: 1,
    types: ['normal'],
    build(t) {
      const h = cosine(14, 4, -2, 30);
      profile(t, h, -2, 30);
      profile(t, () => 4, 30, 44);
      // Higher than the start: only a boost gets Bosh over (a wide crest keeps him on it).
      const hill = (x: number) => (x < 74 ? cosine(4, 16, 44, 74)(x) : cosine(16, 4, 74, 104)(x));
      profile(t, hill, 44, 104);
      profile(t, () => 4, 104, 140);
      start(t, 0, h(0));
      star(t, 74, 17.3);
      finish(t, 128, 4);
      forest(t, -6, 146, 18);
    },
    solution(t) {
      t.addRing({ position: new THREE.Vector3(38, 5.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
    },
  },
  ledge({
    id: 'snow-slide',
    name: 'Snow Slide',
    tip: 'The low ledge is too far to jump to. Draw a slide from the edge down to it.',
    top: 26,
    high: 16,
    low: 6,
    edge: 50,
    land: 76,
    end: 120,
    seed: 51,
  }),
  clearPath({
    id: 'clear-the-way',
    name: 'Clear the Way',
    tip: 'Someone built a wall across the run! Erase it (and only it) to let Bosh through.',
    top: 24,
    y: 14,
    slope: 0.06,
    humps: [60],
    spares: [[45, 4], [92, 5]],
    end: 130,
    seed: 52,
  }),
  climb({
    id: 'ring-chain',
    name: 'Ring Chain',
    kind: 'rings',
    tip: 'Two hills, both higher than the start. One ring before each gets Bosh over.',
    y: 6,
    top: 16,
    hills: [
      { at: 50, height: 8 },
      { at: 124, height: 9 },
    ],
    end: 210,
    seed: 53,
  }),
  cliffAir({
    id: 'first-flight',
    name: 'First Flight',
    tip: 'Rolling off the cliff is just a drop. Draw a kicker at the edge for a whole second in the air!',
    top: 26,
    y: 12,
    edge: 50,
    floor: 2,
    kicker: 0.05,
    seed: 54,
  }),
];
