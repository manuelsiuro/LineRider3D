import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { apex, cosine, finish, forest, landing, measureArc, profile, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';

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
];

export const puzzles: PuzzleDef[] = [];
