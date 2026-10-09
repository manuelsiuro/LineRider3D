import * as THREE from 'three';
import { apex, cosine, finish, forest, landing, measureArc, path, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';

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
];

export const puzzles: PuzzleDef[] = [];
