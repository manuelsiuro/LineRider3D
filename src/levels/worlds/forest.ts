import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { checkpoint, cosine, finish, forest, hazard, landing, path, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { bridge, clearPath, climb, cliffAir, ledge, mudBrakes } from '../puzzleKit';

/** Forest: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'timberline',
    name: 'Timberline',
    difficulty: 2,
    world: { biome: 'forest' },
    tip: 'A log flume through the woods. The walls carry you through the bends; rings on the straights.',
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
      // Rings and stars on the line the rider actually takes through the bends.
      // (Each ring boosts the rider, so the line is measured again after it.)
      for (const x of [40, 120]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [25, 68, 112, 155])) star(t, p.x, p.y + 0.4, p.z);
      finish(t, pts[162].x, pts[162].y, pts[162].z, pts[163].clone().sub(pts[161]));
      t.targetScore = 1300;
      forest(t, -6, 180, 21, ['oak', 'pine', 'birch', 'bush', 'log', 'mushroom'], 5, 8);
    },
  },
  {
    id: 'muddy-lane',
    name: 'Muddy Lane',
    difficulty: 2,
    world: { biome: 'forest', weather: 'rain' },
    tip: 'Brown lines are mud: they slow Bosh right down. Keep it downhill and he slides on through.',
    build(t) {
      t.clear();
      const h = cosine(30, 18, -2, 34);
      const down = (x: number) => 18 - (x - 34) * 0.16;
      profile(t, h, -2, 34);
      profile(t, down, 34, 50);
      profile(t, down, 50, 80, 'mud');
      profile(t, down, 80, 96);
      profile(t, cosine(down(96), 4, 96, 120), 96, 120);
      profile(t, () => 4, 120, 150);
      start(t, 0, h(0));
      for (const p of riderLine(t, [20, 60, 75, 110])) star(t, p.x, p.y + 0.6);
      finish(t, 140, 4);
      t.targetScore = 600;
      forest(t, -6, 156, 31, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
  {
    id: 'treetop-trail',
    name: 'Treetop Trail',
    difficulty: 2,
    world: { biome: 'forest', time: 'sunset' },
    tip: 'Plank platforms high in the trees. Jump the gaps, flip if you dare, land flat.',
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
      t.targetScore = 4500;
      forest(t, -6, l2.end + 32, 22, ['oak', 'oak', 'birch', 'pine', 'log'], 5, 8);
    },
  },
  {
    id: 'bog-hop',
    name: 'Bog Hop',
    difficulty: 2,
    world: { biome: 'forest', time: 'sunset' },
    tip: 'The bog takes your speed; the drop after it gives it back just in time for the jump.',
    build(t) {
      t.clear();
      const h = cosine(32, 18, -2, 34);
      const down = (x: number) => 18 - (x - 34) * 0.14;
      profile(t, h, -2, 34);
      profile(t, down, 34, 56, 'mud');
      // Out of the bog, a steeper drop gives the speed back for the jump.
      const drop = cosine(down(56), down(56) - 5, 56, 74);
      profile(t, drop, 56, 74);
      const k = 74;
      const y0 = down(56) - 5;
      profile(t, (x) => y0 + 0.08 * (x - k) ** 2, k, k + 4);
      start(t, 0, h(0));
      for (const p of riderLine(t, [18, 46, 68])) star(t, p.x, p.y + 0.6);
      const l = landing(t, k + 4, y0 + 1.28, 2, 4);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 3000;
      forest(t, -6, l.end + 36, 32, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
  {
    id: 'pump-track',
    name: 'Pump Track',
    difficulty: 2,
    vehicle: 'bike',
    world: { biome: 'forest' },
    tip: 'BMX time! Pedal (→) over the rollers, then throw a backflip (→ in the air) over each double.',
    build(t) {
      t.clear();
      const V = vehicleById('bike');
      const h = cosine(26, 6, -2, 40);
      profile(t, h, -2, 40);
      start(t, 0, h(0));
      // Rollers: four smooth bumps.
      const roll = (x: number) => 6 + 0.5 * Math.sin((Math.PI * (x - 40)) / 10) ** 2;
      profile(t, roll, 40, 70);
      for (const x of [45, 65]) star(t, x, roll(x) + 1.3);
      // First double.
      profile(t, (x) => 6 + 0.06 * (x - 70) ** 2, 70, 78);
      const l1 = landing(t, 78, 9.84, 4, 4, 'normal', V);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      // Second double.
      const k2 = l1.end + 6;
      profile(t, () => l1.flat, l1.end, k2);
      profile(t, (x) => l1.flat + 0.06 * (x - k2) ** 2, k2, k2 + 7);
      const l2 = landing(t, k2 + 7, l1.flat + 2.94, 3, 2, 'normal', V);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 20, l2.flat);
      t.targetScore = 4000;
      forest(t, -6, l2.end + 34, 9, ['oak', 'pine', 'birch', 'lamp', 'bush', 'sign']);
    },
  },
  {
    id: 'woodland-trail',
    name: 'Woodland Trail',
    difficulty: 2,
    world: { biome: 'forest', time: 'dawn', weather: 'fog' },
    tip: 'A long trail with a checkpoint gate halfway. In rider mode, a wipeout after it sends you back to it.',
    build(t) {
      t.clear();
      const h = cosine(40, 26, -2, 36);
      profile(t, h, -2, 36);
      profile(t, (x) => 26 + 0.08 * (x - 36) ** 2, 36, 40);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l1 = landing(t, 40, 27.28, 2, 18);
      star(t, l1.top, l1.arc(l1.top) + 0.3);
      // Rolling woodland, a checkpoint, a mud patch on a slope, and a second jump.
      const a = l1.end;
      const roll = (x: number) => 18 - (x - a) * 0.08 + 0.8 * Math.sin((x - a) / 7);
      profile(t, roll, a, a + 60);
      checkpoint(t, a + 8, roll(a + 8));
      profile(t, roll, a + 60, a + 76, 'mud');
      const k = a + 76;
      const yk = roll(k);
      profile(t, (x) => yk + 0.08 * (x - k) ** 2, k, k + 4);
      for (const p of riderLine(t, [a + 22, a + 44])) star(t, p.x, p.y + 0.6);
      const l2 = landing(t, k + 4, yk + 1.28, 2, 4);
      star(t, l2.top, l2.arc(l2.top) + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      t.targetScore = 5000;
      forest(t, -6, l2.end + 36, 33, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
  {
    id: 'misty-hollow',
    name: 'Misty Hollow',
    difficulty: 2,
    world: { biome: 'forest', time: 'dawn', weather: 'fog' },
    tip: 'Dawn fog in the hollow: follow the banked turn down, then ride the icy straight through the rings.',
    build(t) {
      t.clear();
      const h = cosine(22, 14, -2, 22);
      profile(t, h, -2, 22);
      start(t, 0, h(0));
      // A descending 180° turn the other way, then an icy straight back.
      const pts: THREE.Vector3[] = [new THREE.Vector3(22, h(22), 0)];
      let y = h(22);
      let prev = pts[0].clone();
      const R = 18;
      for (let a = 0.08; a <= Math.PI + 1e-6; a += 0.08) {
        const p = new THREE.Vector3(22 + R * Math.sin(a), 0, R - R * Math.cos(a));
        y -= Math.hypot(p.x - prev.x, p.z - prev.z) * 0.035;
        p.y = y;
        pts.push(p);
        prev = p;
      }
      const end = pts[pts.length - 1].clone();
      for (let d = 2; d <= 44; d += 2) pts.push(new THREE.Vector3(end.x - d, end.y - d * 0.06, end.z));
      path(t, pts, 'ice', 4);
      for (const a of [0.8, 1.6, 2.4]) {
        const i = Math.round(a / 0.08);
        star(t, pts[i].x, pts[i].y + 1.4, pts[i].z);
      }
      const last = pts[pts.length - 1];
      for (const d of [10, 24]) {
        const p = pts[pts.length - 1 - d / 2];
        t.addRing({ position: p.clone().add(new THREE.Vector3(0, 0.9, 1.4)), axis: new THREE.Vector3(-1, 0, 0), radius: 1.7 });
      }
      star(t, last.x + 18, last.y + 1.08 + 1.3, last.z);
      finish(t, last.x + 6, last.y + 0.36, last.z, new THREE.Vector3(-1, 0, 0));
      t.targetScore = 1600;
      forest(t, -6, 44, 23, ['birch', 'oak', 'mushroom', 'log', 'bush']);
    },
  },
  {
    id: 'log-flume',
    name: 'Log Flume',
    difficulty: 3,
    world: { biome: 'forest', time: 'sunset' },
    tip: 'Down the old flume: tight S-bends between the walls. The rings keep you flying.',
    build(t) {
      t.clear();
      const pts: THREE.Vector3[] = [];
      let y = 46;
      let prev = new THREE.Vector3(0, y, 0);
      const L = 290;
      for (let s = 0; s <= L; s += 1) {
        // Bends ease in and out smoothly (a kink in the walls would throw Bosh out).
        const ease = THREE.MathUtils.smoothstep(Math.min(s, L - s), 0, 40);
        // Swings that widen down the hill.
        const p = new THREE.Vector3(s, 0, (4 + s / 200) * Math.sin((s / 70) * Math.PI * 2) * ease);
        // Steady at first, then flatter: speed would keep growing into the last bends.
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * (0.1 - 0.06 * THREE.MathUtils.smoothstep(s, 100, 170));
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      for (const x of [55, 115]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [30, 95, 140, 200, 235])) star(t, p.x, p.y + 0.4, p.z);
      finish(t, pts[270].x, pts[270].y, pts[270].z, pts[271].clone().sub(pts[269]));
      t.targetScore = 1500;
      forest(t, -6, L + 10, 34, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 7, 8);
    },
  },
  {
    id: 'push-through',
    name: 'Push Through',
    difficulty: 3,
    world: { biome: 'forest', weather: 'rain' },
    tip: 'A flat bog stops Bosh dead. Push (→) to get through it: the run goes on downhill after.',
    solution: [[6, 1], [286, 0], [304, 1]],
    build(t) {
      t.clear();
      const h = cosine(26, 12, -2, 34);
      profile(t, h, -2, 34);
      profile(t, () => 12, 34, 46);
      profile(t, () => 12, 46, 74, 'mud');
      profile(t, () => 12, 74, 80);
      profile(t, cosine(12, 4, 80, 108), 80, 108);
      profile(t, () => 4, 108, 140);
      start(t, 0, h(0));
      for (const p of riderLine(t, [18, 40])) star(t, p.x, p.y + 0.6);
      star(t, 66, 13.3);
      star(t, 96, cosine(12, 4, 80, 108)(96) + 1.3);
      finish(t, 130, 4);
      t.targetScore = 600;
      forest(t, -6, 146, 35, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
  {
    id: 'thorn-gully',
    name: 'Thorn Gully',
    difficulty: 3,
    world: { biome: 'forest' },
    tip: 'Thorn bushes on the trail! Hold Jump to charge it, let go to hop over each one.',
    solution: [[147, 8], [171, 0], [194, 8], [218, 0], [240, 8], [264, 0]],
    build(t) {
      t.clear();
      const h = cosine(30, 20, -2, 36);
      const run = (x: number) => 20 - (x - 36) * 0.1;
      profile(t, h, -2, 36);
      profile(t, run, 36, 200);
      start(t, 0, h(0));
      for (const x of [64, 108, 152]) {
        hazard(t, 'thorns', x, run(x));
        star(t, x, run(x) + 3.2);
      }
      star(t, 20, h(20) + 1.3);
      finish(t, 186, run(186));
      t.targetScore = 2000;
      forest(t, -6, 206, 36, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
  {
    id: 'deep-woods',
    name: 'Deep Woods',
    difficulty: 3,
    world: { biome: 'forest', time: 'night' },
    tip: 'Deep in the woods at night: push through the bog, jump the thorns, and use the checkpoints.',
    // Pushing through the bog (only on the ground) and charged jumps over the thorns.
    solution: [[6, 1], [59, 9], [83, 1], [84, 0], [93, 1], [94, 0], [121, 1], [122, 0], [130, 1], [132, 0], [134, 1], [221, 9], [245, 1], [246, 0], [282, 8], [285, 9], [306, 1], [307, 0], [346, 1], [390, 0], [406, 1]],
    build(t) {
      t.clear();
      // The jump comes first: its landing is measured on an untouched run (which would
      // stop in the bog). Then the bog, the thorns and the checkpoints.
      const h = cosine(40, 26, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 26 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 38, 27.28, 2, 18);
      star(t, l.top, l.arc(l.top) + 0.3);
      const a = l.end;
      profile(t, () => 18, a, a + 8);
      checkpoint(t, a + 4, 18);
      profile(t, () => 18, a + 8, a + 32, 'mud');
      star(t, a + 20, 19.3);
      profile(t, () => 18, a + 32, a + 38);
      const run = (x: number) => 18 - (x - a - 38) * 0.12;
      profile(t, run, a + 38, a + 150);
      for (const x of [a + 66, a + 112]) {
        hazard(t, 'thorns', x, run(x));
        star(t, x, run(x) + 3.2);
      }
      checkpoint(t, a + 90, run(a + 90));
      finish(t, a + 140, run(a + 140));
      t.targetScore = 4000;
      forest(t, -6, a + 156, 37, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
  {
    id: 'canopy-run',
    name: 'Canopy Run',
    difficulty: 3,
    world: { biome: 'forest', time: 'sunset' },
    tip: 'Tree-top platforms with gaps between them. Charge your jumps: a short hop falls short.',
    solution: [[130, 8], [154, 0], [206, 8], [230, 0], [251, 8], [275, 0]],
    build(t) {
      t.clear();
      const h = cosine(36, 24, -2, 34);
      profile(t, h, -2, 34);
      const deck = (x: number) => 24 - (x - 34) * 0.06;
      // Platforms with gaps to jump.
      const decks: [number, number][] = [[34, 64], [72, 112], [121, 160], [169, 210]];
      for (const [a, b] of decks) profile(t, deck, a, b);
      start(t, 0, h(0));
      for (const [a] of decks.slice(1)) star(t, a - 4, deck(a) + 2.6);
      star(t, 20, h(20) + 1.3);
      finish(t, 200, deck(200));
      t.targetScore = 2000;
      forest(t, -6, 216, 38, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
  {
    id: 'wildwood',
    name: 'Wildwood',
    difficulty: 3,
    world: { biome: 'forest', time: 'day', weather: 'clear' },
    tip: 'The whole forest in one long ride: mud, thorns, gaps and a big jump, with checkpoints along the way.',
    // Pushing through the bog (only on the ground) and charged jumps over the thorns.
    solution: [[6, 1], [96, 0], [145, 1], [233, 9], [257, 1], [258, 0], [297, 1], [324, 9], [348, 1], [349, 0], [366, 8], [386, 9], [390, 1], [391, 0], [404, 8], [417, 9], [428, 1], [429, 0], [463, 1], [484, 0], [494, 1]],
    build(t) {
      t.clear();
      // The big jump first (its landing is measured on an untouched run), then the forest.
      const h = cosine(50, 34, -2, 36);
      profile(t, h, -2, 36);
      profile(t, (x) => 34 + 0.08 * (x - 36) ** 2, 36, 40);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 40, 35.28, 2, 26);
      star(t, l.top, l.arc(l.top) + 0.3);
      const a = l.end;
      profile(t, () => 26, a, a + 8);
      checkpoint(t, a + 4, 26);
      // Mud to push through.
      profile(t, () => 26, a + 8, a + 28, 'mud');
      star(t, a + 18, 27.3);
      profile(t, () => 26, a + 28, a + 34);
      // Thorns on a slope, a gap between platforms, more thorns.
      const run = (x: number) => 26 - (x - a - 34) * 0.1;
      profile(t, run, a + 34, a + 110);
      hazard(t, 'thorns', a + 64, run(a + 64));
      star(t, a + 64, run(a + 64) + 3.2);
      checkpoint(t, a + 96, run(a + 96));
      profile(t, run, a + 118, a + 220);
      star(t, a + 114, run(a + 114) + 2.6);
      hazard(t, 'thorns', a + 150, run(a + 150));
      star(t, a + 150, run(a + 150) + 3.2);
      checkpoint(t, a + 170, run(a + 170));
      hazard(t, 'thorns', a + 196, run(a + 196));
      finish(t, a + 212, run(a + 212));
      t.targetScore = 5000;
      forest(t, -6, a + 226, 39, ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'], 5, 8);
    },
  },
];

export const puzzles: PuzzleDef[] = [
  {
    id: 'detour',
    name: 'Detour',
    kind: 'erase',
    world: { biome: 'forest' },
    tip: 'The curl at the end of the top track throws Bosh back. Erase it, and he drops to the track below.',
    ink: 2,
    par: 1,
    types: ['normal'],
    build(t) {
      const h = cosine(26, 14, -2, 34);
      profile(t, h, -2, 34);
      profile(t, () => 14, 34, 42);
      // The way down: a steep landing hill under the end of the top track.
      const down = cosine(13, 2, 38, 74);
      profile(t, down, 38, 74);
      profile(t, () => 2, 74, 120);
      for (const s of t.strokes.values()) s.locked = true;
      start(t, 0, h(0));
      star(t, 60, down(60) + 1.3);
      finish(t, 108, 2);
      // The curl (erasable), and a harmless spare line.
      profile(t, (x) => 14 + 0.5 * (x - 42) ** 2, 42, 47);
      profile(t, (x) => 22 + 0.1 * (x - 10), 10, 16);
      forest(t, -6, 126, 19, ['oak', 'pine', 'birch', 'bush'], 5, 8);
    },
    solution(t) {
      const curl = [...t.strokes.values()].find((s) => !s.locked && s.points[0].x === 42)!;
      t.removeStroke(curl);
    },
  },
  {
    id: 'cliff-launch',
    name: 'Cliff Launch',
    kind: 'trick',
    trick: 'air',
    world: { biome: 'forest' },
    tip: 'Rolling off the cliff is not enough: draw a kicker at the edge and stay in the air for a whole second.',
    ink: 14,
    par: 8,
    types: ['normal'],
    build(t) {
      const h = cosine(26, 12, -2, 34);
      profile(t, h, -2, 34);
      profile(t, () => 12, 34, 44);
      start(t, 0, h(0));
      // The landing fits the flight off a kicker at the edge (taken away again: the player
      // draws their own).
      const kicker = profile(t, (x) => 12 + 0.05 * (x - 40) ** 2, 40, 45);
      const l = landing(t, 45, 13.25, 4, 1);
      t.removeStroke(kicker);
      profile(t, () => l.flat, l.end, l.end + 30);
      star(t, l.top, l.arc(l.top) + 0.3);
      finish(t, l.end + 22, l.flat);
      forest(t, -6, 170, 20, ['oak', 'pine', 'birch', 'bush'], 5, 8);
    },
    solution(t) {
      profile(t, (x) => 12 + 0.05 * (x - 40) ** 2, 40, 45);
    },
  },
  bridge({
    id: 'fallen-log',
    name: 'Fallen Log',
    tip: 'A tree came down and took the bridge with it. Draw a new one.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    y: 12,
    top: 24,
    gaps: [[44, 53]],
    end: 100,
    seed: 61,
  }),
  mudBrakes({
    id: 'mud-brakes',
    name: 'Mud Brakes',
    tip: 'Too fast! The bump flings Bosh into the icicles. Draw mud on the slope to slow him down first.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    top: 30,
    y: 20,
    slope: 0.25,
    bumpAt: 80,
    end: 130,
    seed: 62,
  }),
  climb({
    id: 'boost-root',
    name: 'Boost Root',
    kind: 'draw',
    tip: 'A hill higher than the start. Draw a red boost strip on the flat before it.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    y: 6,
    top: 16,
    hills: [{ at: 52, height: 11 }],
    end: 140,
    seed: 63,
  }),
  bridge({
    id: 'stepping-stones',
    name: 'Stepping Stones',
    kind: 'oneline',
    tip: 'Three gaps in a row and only one line: bridge them all in a single stroke.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    y: 10,
    top: 22,
    gaps: [
      [44, 50],
      [56, 62],
      [68, 74],
    ],
    end: 120,
    seed: 64,
  }),
  clearPath({
    id: 'tangled-branches',
    name: 'Tangled Branches',
    tip: 'Branches block the way and spare ones hang about. Erase just the two in the way.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    top: 24,
    y: 14,
    slope: 0.06,
    humps: [55, 98],
    spares: [
      [40, 4],
      [78, 6],
      [118, 4],
    ],
    end: 150,
    seed: 65,
  }),
  cliffAir({
    id: 'treetop-leap',
    name: 'Treetop Leap',
    tip: 'Leap from the treetops: draw a kicker at the edge and stay in the air for a second.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    top: 30,
    y: 16,
    edge: 50,
    floor: 5,
    kicker: 0.1,
    seed: 66,
  }),
  ledge({
    id: 'waterfall',
    name: 'Waterfall',
    kind: 'oneline',
    tip: 'Down the waterfall in one line: from the high ledge to the pool below.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    top: 32,
    high: 22,
    low: 6,
    edge: 50,
    land: 84,
    end: 130,
    seed: 67,
  }),
  climb({
    id: 'root-hills',
    name: 'Root Hills',
    kind: 'rings',
    tip: 'Three hills over gnarled roots: a ring before each one.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    y: 6,
    top: 16,
    hills: [
      { at: 46, height: 11 },
      { at: 116, height: 11 },
      { at: 186, height: 12 },
    ],
    end: 270,
    seed: 68,
  }),
  bridge({
    id: 'broken-boardwalk',
    name: 'Broken Boardwalk',
    tip: 'The boardwalk over the marsh has three holes. Patch them all with the ink you have.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    y: 12,
    top: 24,
    gaps: [
      [40, 47],
      [60, 69],
      [84, 91],
    ],
    end: 130,
    seed: 69,
  }),
  clearPath({
    id: 'deadfall',
    name: 'Deadfall',
    tip: 'Three fallen trees across the trail. Erase them, but leave the rest of the woods alone.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    top: 26,
    y: 16,
    slope: 0.06,
    humps: [50, 84, 118],
    spares: [[68, 5]],
    end: 165,
    seed: 70,
  }),
  mudBrakes({
    id: 'slippery-slope',
    name: 'Slippery Slope',
    tip: 'An even steeper slope into the bump. Lay the mud where it counts: there is just enough.',
    world: { biome: 'forest' },
    decor: ['oak', 'pine', 'birch', 'bush', 'mushroom', 'log'],
    top: 38,
    y: 28,
    slope: 0.3,
    bumpAt: 92,
    end: 140,
    seed: 71,
  }),
];

