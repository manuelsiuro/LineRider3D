import * as THREE from 'three';
import type { Track } from '../track/Track';
import { buildDemoTrack } from '../demoTrack';
import { cosine, finish, forest, measureArc, path, profile, riderLine, star } from './builders';

export interface LevelDef {
  id: string;
  name: string;
  /** What the level teaches, shown on its card and intro. */
  tip: string;
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
function landing(track: Track, fromX: number, fromY: number, drop: number, floorY: number, type: 'normal' | 'ice' = 'normal') {
  const arc = measureArc(track, fromX);
  const landY = (x: number) => arc(x) - 0.9;
  const slopeAt = (x: number) => (landY(x + 0.25) - landY(x - 0.25)) / 0.5;
  let top = fromX;
  for (let x = fromX; x < fromX + 120; x += 0.25) if (arc(x) > arc(top)) top = x;
  // Touch down `drop` below the takeoff, or earlier if the curve-out would be too tight.
  let x1 = top + 2;
  while (landY(x1) > fromY - drop && x1 < top + 120) x1 += 0.25;
  while (x1 > top + 3 && landY(x1) - floorY < 9 * Math.abs(slopeAt(x1))) x1 -= 0.25;
  const x0 = Math.max(top + 2, x1 - 10);
  profile(track, landY, x0, x1, type);
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
  profile(track, runout, x1, x1 + L, type);
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
];
