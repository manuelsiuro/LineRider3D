import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { cosine, finish, forest, landing, path, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';

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
];

