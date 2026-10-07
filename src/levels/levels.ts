import * as THREE from 'three';
import type { Track } from '../track/Track';
import { buildDemoTrack } from '../demoTrack';
import { vehicleById, type VehicleDef, type VehicleId } from '../physics/vehicles';
import { cosine, finish, forest, measureArc, path, profile, riderLine, star } from './builders';

export interface LevelDef {
  id: string;
  name: string;
  /** What the level teaches, shown on its card and intro. */
  tip: string;
  /** Levels made for one ride. */
  vehicle?: VehicleId;
  build(track: Track): void;
}

function start(track: Track, x: number, y: number, z = 0) {
  track.setStart(new THREE.Vector3(x, y + 0.8, z));
}

/**
 * Lands a jump: a ramp that follows the measured flight arc, then eases out
 * to level ground at `floorY` with a smooth (Hermite) curve. The touchdown
 * point is chosen high enough that the curve-out stays gentle and never dips
 * below the floor.
 */
function landing(track: Track, fromX: number, fromY: number, drop: number, floorY: number, type: 'normal' | 'ice' = 'normal', vehicle?: VehicleDef, width = 2.4) {
  const arc = measureArc(track, fromX, vehicle);
  const landY = (x: number) => arc(x) - 0.9;
  const slopeAt = (x: number) => (landY(x + 0.25) - landY(x - 0.25)) / 0.5;
  let top = fromX;
  for (let x = fromX; x < fromX + 120; x += 0.25) if (arc(x) > arc(top)) top = x;
  // Touch down `drop` below the takeoff, or earlier if the curve-out would be too tight.
  let x1 = top + 2;
  while (landY(x1) > fromY - drop && x1 < top + 120) x1 += 0.25;
  while (x1 > top + 3 && landY(x1) - floorY < 9 * Math.abs(slopeAt(x1))) x1 -= 0.25;
  const x0 = Math.max(top + 2, x1 - 10);
  profile(track, landY, x0, x1, type, 0, width);
  const y1 = landY(x1);
  const slope = Math.min(-0.02, slopeAt(x1));
  const L = Math.max(26, (2.5 * (y1 - floorY)) / -slope);
  const runout = (x: number) => {
    const t = THREE.MathUtils.clamp((x - x1) / L, 0, 1);
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1;
    const h10 = t ** 3 - 2 * t ** 2 + t;
    const h01 = -2 * t ** 3 + 3 * t ** 2;
    return y1 * h00 + L * slope * h10 + floorY * h01;
  };
  profile(track, runout, x1, x1 + L, type, 0, width);
  return { arc, runout, end: x1 + L, flat: floorY, top };
}

/** Highest point of an arc between two x positions. */
function apex(arc: (x: number) => number, x0: number, x1: number) {
  let best = x0;
  for (let x = x0; x <= x1; x += 0.25) if (arc(x) > arc(best)) best = x;
  return { x: best, y: arc(best) };
}

export const LEVELS: LevelDef[] = [
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
      forest(t, -6, l2.end + 34, 9, ['pine', 'lamp', 'pine', 'rock', 'flag']);
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
        const p = new THREE.Vector3(s, 0, 5 * Math.sin((s / 60) * Math.PI * 2) * Math.min(1, s / 25, (150 - s) / 25));
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
      forest(t, -8, l.end + 44, 12, ['rock', 'rock', 'pine', 'cabin']);
    },
  },
  {
    id: 'quarry-run',
    name: 'Quarry Run',
    vehicle: 'buggy',
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
      forest(t, -8, l.end + 34, 13, ['rock', 'rock', 'pine', 'lamp']);
    },
  },
];
