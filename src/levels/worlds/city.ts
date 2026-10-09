import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { apex, cosine, finish, forest, landing, measureArc, path, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';

/** City: its levels (in play order) and puzzles. */
export const levels: LevelDef[] = [
  {
    id: 'rooftop-run',
    name: 'Rooftop Run',
    difficulty: 2,
    world: { biome: 'city', time: 'sunset' },
    tip: 'Leap from roof to roof across the city. Three gaps, each one lower. Don’t look down!',
    build(t) {
      t.clear();
      const h = cosine(30, 18, -2, 30);
      profile(t, h, -2, 30);
      start(t, 0, h(0));
      star(t, 15, h(15) + 1.3);
      let y = 18;
      let x = 30;
      for (let k = 0; k < 3; k++) {
        profile(t, () => y, x, x + 6);
        profile(t, (q) => y + 0.06 * (q - x - 6) ** 2, x + 6, x + 10);
        const l = landing(t, x + 10, y + 0.96, 2.5, y - 4);
        star(t, l.top, l.arc(l.top) + 0.3);
        // A building under each landing roof.
        t.addDecor({ kind: 'tower', position: new THREE.Vector3(l.end - 6, 0, -9), rotation: 0, scale: 1.4 });
        x = l.end;
        y = l.flat;
      }
      profile(t, () => y, x, x + 26);
      finish(t, x + 18, y);
      t.targetScore = 5000;
      forest(t, -6, x + 30, 51, ['tower', 'streetlight', 'billboard', 'planter', 'tower'], 9, 8);
    },
  },
  {
    id: 'downtown-drift',
    name: 'Downtown Drift',
    difficulty: 2,
    vehicle: 'skis',
    world: { biome: 'city', weather: 'rain' },
    tip: 'Ski the rainy streets! Carve the bends, glide the slick stretch and spin a 360 (↑) off the final kicker.',
    build(t) {
      t.clear();
      const V = vehicleById('skis');
      const pts: THREE.Vector3[] = [];
      let y = 26;
      let prev = new THREE.Vector3(0, y, 0);
      for (let s = 0; s <= 150; s += 1) {
        const p = new THREE.Vector3(s, 0, 5.5 * Math.sin((s / 70) * Math.PI * 2) * Math.min(1, s / 25, (150 - s) / 25));
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * 0.08;
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      for (const s of [70]) {
        const dir = pts[s + 1].clone().sub(pts[s - 1]).normalize();
        t.addRing({ position: pts[s].clone().add(new THREE.Vector3(0, 1.3, 0)), axis: dir, radius: 1.7 });
      }
      for (const p of riderLine(t, [30, 95, 125], V)) star(t, p.x, p.y + 0.4, p.z);
      for (let s = 12; s < 140; s += 25) {
        const c = pts[s];
        for (const side of [-2.8, 2.8]) t.addDecor({ kind: 'cone', position: new THREE.Vector3(c.x, 0, c.z + side), rotation: s, scale: 1 });
      }
      const end = pts[pts.length - 1];
      const fy = end.y;
      const S = 24;
      // A slick wet stretch on the straight, then the kicker.
      profile(t, (x) => fy - (x - end.x) * 0.08, end.x, end.x + 6, 'normal', 0, 4);
      profile(t, (x) => fy - (x - end.x) * 0.08, end.x + 6, end.x + 18, 'ice', 0, 4);
      profile(t, (x) => fy - (x - end.x) * 0.08, end.x + 18, end.x + S, 'normal', 0, 4);
      const ky = fy - 0.08 * S;
      profile(t, (x) => ky + 0.1 * (x - end.x - S) ** 2, end.x + S, end.x + S + 4, 'normal', 0, 4);
      const l = landing(t, end.x + S + 4, ky + 1.6, 2, Math.max(2, ky - 8), 'normal', V, 5);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 26, 'normal', 0, 5);
      finish(t, l.end + 18, l.flat);
      t.targetScore = 12000;
      forest(t, -10, l.end + 30, 52, ['streetlight', 'car', 'planter', 'streetlight', 'tower'], 9, 8);
    },
  },
  {
    id: 'neon-nights',
    name: 'Neon Nights',
    difficulty: 3,
    world: { biome: 'city', time: 'night' },
    tip: 'The city finale after dark: big air, boost rings, a trampoline and one last jump under the neon.',
    build(t) {
      t.clear();
      const h = cosine(44, 16, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 16 + 0.12 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l = landing(t, 44, 17.9, 2, 9);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 8, 'accel');
      profile(t, () => l.flat, l.end + 8, l.end + 16);
      for (const d of [6, 13]) t.addRing({ position: new THREE.Vector3(l.end + d, l.flat + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
      const dropEnd = l.end + 24;
      profile(t, cosine(l.flat, l.flat - 2, l.end + 16, dropEnd), l.end + 16, dropEnd);
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
      forest(t, -6, l2.end + 30, 53, ['billboard', 'tower', 'streetlight', 'car', 'tower'], 9, 8);
    },
  },
];

export const puzzles: PuzzleDef[] = [];
