import * as THREE from 'three';
import type { Track } from '../track/Track';
import { buildDemoTrack } from '../demoTrack';
import { vehicleById, type VehicleId } from '../physics/vehicles';
import { apex, cosine, finish, forest, landing, measureArc, path, profile, riderLine, star, start } from './builders';
import type { BiomeId, WorldConfig } from '../world/worlds';

export interface LevelDef {
  id: string;
  name: string;
  /** What the level teaches, shown on its card and intro. */
  tip: string;
  /** Levels made for one ride. */
  vehicle?: VehicleId;
  /** Home world (Alpine by day if not set); players may pick another. */
  world?: Partial<WorldConfig>;
  build(track: Track): void;
}

/** The chapter (world) a level belongs to. */
export const chapterOf = (l: LevelDef): BiomeId => l.world?.biome ?? 'alpine';

const ALL: LevelDef[] = [
  {
    id: 'first-run',
    name: 'First Run',
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
    id: 'ice-age',
    name: 'Ice Age',
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
    tip: 'A huge kicker. Time a flip, release early and land flat for a Perfect.',
    build(t) {
      buildDemoTrack(t);
      t.targetScore = 6000;
    },
  },
  {
    id: 'ring-road',
    name: 'Ring Road',
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
    id: 'grand-finale',
    name: 'Grand Finale',
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
  // ---------------------------------------------------------------- ride levels
  {
    id: 'pump-track',
    name: 'Pump Track',
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
    id: 'slalom',
    name: 'Slalom',
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
    vehicle: 'snowboard',
    tip: 'Snowboard park: a monster kicker. Hold ↑ to spin, add ←/→ for flips. Land a 720 for the crowd!',
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
    id: 'canyon-jump',
    name: 'Canyon Jump',
    vehicle: 'moto',
    world: { biome: 'desert', time: 'sunset' },
    tip: 'Motorbike: full throttle (→) down the boost lane and send it across the canyon. Brake (←) tips the nose for the landing.',
    build(t) {
      t.clear();
      const V = vehicleById('moto');
      const h = cosine(30, 10, -2, 40);
      profile(t, h, -2, 40);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      profile(t, () => 10, 40, 44);
      profile(t, () => 10, 44, 54, 'accel');
      star(t, 50, 11.3);
      // A long, gentle kicker: at this speed a tight lip would fold the rider.
      profile(t, () => 10, 54, 58);
      profile(t, (x) => 10 + 0.035 * (x - 58) ** 2, 58, 68);
      const l = landing(t, 68, 13.5, 3, 4, 'normal', V);
      const top = apex(l.arc, 68, l.end);
      star(t, top.x, top.y + 0.3);
      t.addRing({ position: new THREE.Vector3(l.end + 10, l.flat + 1.3, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.7 });
      profile(t, () => l.flat, l.end, l.end + 40);
      star(t, l.end + 24, l.flat + 1.3);
      finish(t, l.end + 32, l.flat);
      t.targetScore = 6000;
      forest(t, -8, l.end + 44, 12, ['mesa', 'cactus', 'rock', 'cactus', 'skull', 'windmill']);
    },
  },
  {
    id: 'quarry-run',
    name: 'Quarry Run',
    vehicle: 'buggy',
    world: { biome: 'desert' },
    tip: 'Buggy: let the suspension eat the whoops, hit the boost and fly off the quarry ramp. Keep it off the roof!',
    build(t) {
      t.clear();
      const V = vehicleById('buggy');
      const h = cosine(20, 8, -2, 30);
      profile(t, h, -2, 30);
      start(t, 0, h(0));
      // Whoops: a row of short sharp bumps on a gentle descent.
      const whoop = (x: number) => 8 - (x - 30) * 0.05 + 0.45 * Math.sin((Math.PI * (x - 30)) / 6) ** 2;
      profile(t, whoop, 30, 72);
      for (const x of [39, 57]) star(t, x, whoop(x) + 1.3);
      const by = whoop(72);
      profile(t, () => by, 72, 80, 'accel');
      profile(t, (x) => by + 0.05 * (x - 80) ** 2, 80, 90);
      const l = landing(t, 90, by + 5, 4, 2, 'normal', V);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 30);
      star(t, l.end + 10, l.flat + 1.3);
      finish(t, l.end + 22, l.flat);
      t.targetScore = 3500;
      forest(t, -8, l.end + 34, 13, ['rock', 'mesa', 'barrel', 'lamp', 'cactus', 'tumbleweed']);
    },
  },
  // ---------------------------------------------------------------- forest
  {
    id: 'timberline',
    name: 'Timberline',
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
    id: 'misty-hollow',
    name: 'Misty Hollow',
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
  // ---------------------------------------------------------------- beach
  {
    id: 'boardwalk',
    name: 'Boardwalk',
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
  // ---------------------------------------------------------------- desert
  {
    id: 'mesa-drop',
    name: 'Mesa Drop',
    world: { biome: 'desert' },
    tip: 'Off the top of the mesa: a huge drop into a long jump. Time your flip, land it, then hit the ring.',
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
      forest(t, -8, l2.end + 32, 41, ['cactus', 'mesa', 'barrel', 'rock', 'skull'], 5, 9);
    },
  },
  {
    id: 'dune-bash',
    name: 'Dune Bash',
    vehicle: 'buggy',
    world: { biome: 'desert', time: 'dawn' },
    tip: 'Buggy over the dunes: two sets of whoops, a boost, and a double to send it.',
    build(t) {
      t.clear();
      const V = vehicleById('buggy');
      const h = cosine(22, 10, -2, 30);
      profile(t, h, -2, 30);
      start(t, 0, h(0));
      const whoop = (x0: number, y0: number) => (x: number) => y0 - (x - x0) * 0.05 + 0.5 * Math.sin((Math.PI * (x - x0)) / 7) ** 2;
      const w1 = whoop(30, 10);
      profile(t, w1, 30, 58);
      star(t, 44, w1(44) + 1.3);
      const by = w1(58);
      profile(t, () => by, 58, 66, 'accel');
      profile(t, (x) => by + 0.05 * (x - 66) ** 2, 66, 76);
      const l = landing(t, 76, by + 5, 4, 3, 'normal', V);
      star(t, l.top, l.arc(l.top) + 0.3);
      const w2 = whoop(l.end, l.flat);
      profile(t, w2, l.end, l.end + 28);
      star(t, l.end + 14, w2(l.end + 14) + 1.3);
      const fy = w2(l.end + 28);
      profile(t, () => fy, l.end + 28, l.end + 56);
      finish(t, l.end + 46, fy);
      t.targetScore = 3500;
      forest(t, -8, l.end + 60, 42, ['barrel', 'cactus', 'tumbleweed', 'rock', 'skull'], 5, 9);
    },
  },
  {
    id: 'sandstorm-rally',
    name: 'Sandstorm Rally',
    vehicle: 'moto',
    world: { biome: 'desert', weather: 'sandstorm' },
    tip: 'Rally through the sandstorm: boost, jump, boost again, and clear the big one. Keep the throttle pinned.',
    build(t) {
      t.clear();
      const V = vehicleById('moto');
      const h = cosine(26, 9, -2, 36);
      profile(t, h, -2, 36);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      profile(t, () => 9, 36, 46, 'accel');
      profile(t, () => 9, 46, 50);
      profile(t, (x) => 9 + 0.035 * (x - 50) ** 2, 50, 58);
      const l1 = landing(t, 58, 11.24, 3, 6, 'normal', V);
      star(t, apex(l1.arc, 58, l1.end).x, apex(l1.arc, 58, l1.end).y + 0.3);
      const b = l1.end;
      profile(t, () => l1.flat, b, b + 10, 'accel');
      profile(t, () => l1.flat, b + 10, b + 14);
      profile(t, (x) => l1.flat + 0.035 * (x - b - 14) ** 2, b + 14, b + 24);
      const l2 = landing(t, b + 24, l1.flat + 3.5, 3, 3, 'normal', V);
      const top = apex(l2.arc, b + 24, l2.end);
      star(t, top.x, top.y + 0.3);
      profile(t, () => l2.flat, l2.end, l2.end + 34);
      star(t, l2.end + 16, l2.flat + 1.3);
      finish(t, l2.end + 26, l2.flat);
      t.targetScore = 6500;
      forest(t, -8, l2.end + 40, 43, ['mesa', 'cactus', 'windmill', 'rock', 'tumbleweed'], 6, 10);
    },
  },
  // ---------------------------------------------------------------- city
  {
    id: 'rooftop-run',
    name: 'Rooftop Run',
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

const ORDER = [
  'first-run',
  'little-hop',
  'boost-lane',
  'ice-age',
  'boing-boing',
  'flip-academy',
  'ring-road',
  'slalom',
  'big-air',
  'grand-finale',
  'timberline',
  'treetop-trail',
  'pump-track',
  'misty-hollow',
  'boardwalk',
  'surfs-up',
  'sunset-cruise',
  'mesa-drop',
  'canyon-jump',
  'dune-bash',
  'quarry-run',
  'sandstorm-rally',
  'rooftop-run',
  'downtown-drift',
  'neon-nights',
];

/** All levels, chapter by chapter (each world's levels together). */
export const LEVELS: LevelDef[] = ORDER.map((id) => ALL.find((l) => l.id === id)!);
