import * as THREE from 'three';
import { vehicleById } from '../../physics/vehicles';
import { apex, checkpoint, cosine, finish, forest, hazard, landing, measureArc, path, profile, riderLine, star, start } from '../builders';
import type { LevelDef } from '../levels';
import type { PuzzleDef } from '../puzzles';
import { bounce, bridge, clearPath, climb, cliffAir, crumbleRush, ledge } from '../puzzleKit';

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
  {
    id: 'rush-hour',
    name: 'Rush Hour',
    difficulty: 3,
    world: { biome: 'city', time: 'day' },
    tip: 'A chain of rings down the boulevard: each one pushes you into the next. Ride the green wave.',
    build(t) {
      t.clear();
      const h = cosine(30, 18, -2, 32);
      const run = (x: number) => 18 - (x - 32) * 0.05;
      profile(t, h, -2, 32);
      profile(t, run, 32, 220);
      start(t, 0, h(0));
      // Each ring is placed on the line the rider takes after the ones before it.
      for (const x of [50, 80, 110, 140, 170]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [18, 65, 125, 185])) star(t, p.x, p.y + 0.6);
      finish(t, 208, run(208));
      t.targetScore = 5000;
      forest(t, -8, 226, 121, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
  {
    id: 'skyline-drop',
    name: 'Skyline Drop',
    difficulty: 3,
    world: { biome: 'city', time: 'sunset' },
    tip: 'Off the tallest tower: a long drop, a big landing, then two trampolines on the rooftops below.',
    build(t) {
      t.clear();
      const h = cosine(46, 22, -2, 40);
      profile(t, h, -2, 40);
      profile(t, (x) => 22 + 0.06 * (x - 40) ** 2, 40, 44);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      const l = landing(t, 44, 22.96, 2, 14);
      star(t, l.top, l.arc(l.top) + 0.3);
      profile(t, () => l.flat, l.end, l.end + 8);
      let fromX = l.end + 8;
      for (const y of [12, 11]) {
        const arc = measureArc(t, fromX);
        let x = fromX + 2;
        while (arc(x) - 0.9 > y && x < fromX + 80) x += 0.25;
        const top = apex(arc, fromX, x);
        star(t, top.x, top.y + 0.3);
        profile(t, () => y, x - 3, x + 5, 'bouncy');
        fromX = x + 5;
      }
      const l2 = landing(t, fromX, 11, 0.5, 8);
      profile(t, () => l2.flat, l2.end, l2.end + 30);
      finish(t, l2.end + 22, l2.flat);
      t.targetScore = 7000;
      forest(t, -8, l2.end + 36, 122, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
  {
    id: 'subway-dash',
    name: 'Subway Dash',
    difficulty: 3,
    world: { biome: 'city', time: 'night' },
    tip: 'Through the subway tunnels: the walls hold you in the bends, the rings keep you rolling.',
    build(t) {
      t.clear();
      const pts: THREE.Vector3[] = [];
      let y = 44;
      let prev = new THREE.Vector3(0, y, 0);
      const L = 250;
      for (let s = 0; s <= L; s += 1) {
        const ease = THREE.MathUtils.smoothstep(Math.min(s, L - s), 0, 40);
        const p = new THREE.Vector3(s, 0, 4.5 * Math.sin((s / 75) * Math.PI * 2) * ease);
        if (s > 0) y -= p.distanceTo(new THREE.Vector3(prev.x, p.y, prev.z)) * (0.1 - 0.05 * THREE.MathUtils.smoothstep(s, 100, 160));
        p.y = y;
        pts.push(p);
        prev = p;
      }
      path(t, pts, 'normal', 4);
      start(t, pts[1].x, pts[1].y);
      for (const x of [60, 125]) {
        const [a, b] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: a.clone().lerp(b, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: b.clone().sub(a).normalize(), radius: 1.7 });
      }
      for (const p of riderLine(t, [30, 95, 160, 200])) star(t, p.x, p.y + 0.4, p.z);
      finish(t, pts[230].x, pts[230].y, pts[230].z, pts[231].clone().sub(pts[229]));
      t.targetScore = 1500;
      forest(t, -8, L + 10, 123, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 7, 8);
    },
  },
  {
    id: 'rooftop-hop',
    name: 'Rooftop Hop',
    difficulty: 3,
    world: { biome: 'city', time: 'sunset' },
    tip: 'Roof to roof across the alleys. Charge each jump: the gaps are wide.',
    // A charged jump across each alley.
    solution: [[96, 8], [120, 0], [217, 8], [229, 0], [312, 8], [316, 0]],
    build(t) {
      t.clear();
      const h = cosine(36, 24, -2, 34);
      profile(t, h, -2, 34);
      const roof = (x: number) => 24 - (x - 34) * 0.06;
      const roofs: [number, number][] = [[34, 66], [75, 116], [125, 164], [173, 214]];
      for (const [a, b] of roofs) profile(t, roof, a, b);
      for (let j = 1; j < roofs.length; j++) star(t, roofs[j][0] - 4, roof(roofs[j][0]) + 2.6);
      start(t, 0, h(0));
      star(t, 20, h(20) + 1.3);
      finish(t, 204, roof(204));
      t.targetScore = 2000;
      forest(t, -8, 220, 124, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
  {
    id: 'roadworks',
    name: 'Roadworks',
    difficulty: 3,
    world: { biome: 'city', weather: 'rain' },
    tip: 'Barriers and spike strips all over the road. A big jump for a barrier, a little hop for spikes.',
    // Hops over the barriers and spike strips.
    solution: [[154, 8], [158, 0], [267, 8], [279, 0], [320, 8], [324, 0]],
    build(t) {
      t.clear();
      const h = cosine(32, 22, -2, 34);
      const run = (x: number) => 22 - (x - 34) * 0.08;
      profile(t, h, -2, 34);
      profile(t, run, 34, 240);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const items: [number, 'barrier' | 'spikes'][] = [[64, 'barrier'], [108, 'spikes'], [152, 'barrier'], [196, 'spikes']];
      for (const [x, kind] of items) {
        hazard(t, kind, x, run(x));
        star(t, x, run(x) + (kind === 'barrier' ? 3 : 2.2));
      }
      finish(t, 228, run(228));
      t.targetScore = 2500;
      forest(t, -8, 246, 125, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
  {
    id: 'crosstown',
    name: 'Crosstown',
    difficulty: 4,
    world: { biome: 'city', time: 'dawn' },
    tip: 'Flat avenues across town, then up the overpass. Push (→) all the way, and hop the barriers.',
    // Pushing on the ground, and a hop over the barrier.
    solution: [[6, 1], [123, 9], [127, 1], [128, 0], [154, 1], [401, 0]],
    build(t) {
      t.clear();
      const h = cosine(22, 14, -2, 30);
      profile(t, h, -2, 30);
      profile(t, () => 14, 30, 110);
      hazard(t, 'barrier', 70, 14);
      star(t, 70, 17);
      const up = cosine(14, 22, 110, 150);
      profile(t, up, 110, 150);
      profile(t, () => 22, 150, 164);
      star(t, 157, 23.3);
      const down = cosine(22, 12, 164, 200);
      profile(t, down, 164, 200);
      profile(t, () => 12, 200, 236);
      start(t, 0, h(0));
      star(t, 16, h(16) + 1.3);
      finish(t, 226, 12);
      t.targetScore = 1500;
      forest(t, -8, 244, 126, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
  {
    id: 'construction-site',
    name: 'Construction Site',
    difficulty: 4,
    world: { biome: 'city', time: 'day' },
    tip: 'Loose scaffolding that falls away under you, with gaps between. Keep moving and hop each gap.',
    // Hops over the gaps before the scaffolding falls.
    solution: [[120, 8], [132, 0], [162, 8], [186, 0], [214, 8], [238, 0]],
    build(t) {
      t.clear();
      const h = cosine(34, 22, -2, 34);
      profile(t, h, -2, 34);
      const deck = (x: number) => 22 - (x - 34) * 0.06;
      const slabs: [number, number][] = [[34, 58], [66, 86], [94, 114], [122, 142]];
      for (const [a, b] of slabs) profile(t, deck, a, b, 'crumble');
      profile(t, deck, 150, 192);
      hazard(t, 'spikes', 172, deck(172));
      star(t, 172, deck(172) + 2.2);
      for (let j = 1; j <= slabs.length; j++) {
        const a = j < slabs.length ? slabs[j][0] : 150;
        star(t, a - 4, deck(a) + 2.6);
      }
      start(t, 0, h(0));
      finish(t, 186, deck(186));
      t.targetScore = 2500;
      forest(t, -8, 202, 127, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
  {
    id: 'brake-lights',
    name: 'Brake Lights',
    difficulty: 4,
    world: { biome: 'city', time: 'night', weather: 'rain' },
    tip: 'A steep ramp onto a short rooftop. Too fast and you sail right past it: brake (←) before the kicker.',
    // Braking down the ramp, before the kicker.
    solution: [[70, 2], [110, 0]],
    build(t) {
      t.clear();
      const h = cosine(44, 14, -2, 48);
      profile(t, h, -2, 48);
      profile(t, () => 14, 48, 58);
      profile(t, (x) => 14 + 0.05 * (x - 58) ** 2, 58, 62);
      const deck = (x: number) => 12.5 - (x - 72) * 0.25 * Math.max(0, Math.min(1, (x - 72) / 6));
      profile(t, deck, 68, 98);
      profile(t, () => deck(98), 98, 122);
      start(t, 0, h(0));
      star(t, 24, h(24) + 1.3);
      star(t, 52, 15.3);
      star(t, 110, deck(98) + 1.3);
      finish(t, 116, deck(98));
      for (const x of [126, 136, 146]) hazard(t, 'barrier', x, 0);
      t.targetScore = 600;
      forest(t, -8, 128, 128, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
  {
    id: 'midnight-express',
    name: 'Midnight Express',
    difficulty: 4,
    world: { biome: 'city', time: 'night' },
    tip: 'The city finale: a tower jump, a ring chain, barriers, an overpass to push up and checkpoints.',
    // Pushing on the ground, and jumps over the barriers.
    solution: [[6, 1], [93, 0], [146, 1], [149, 0], [151, 1], [204, 9], [228, 1], [229, 0], [268, 1], [302, 0], [315, 1], [321, 0], [342, 1], [386, 0], [397, 1], [419, 0]],
    build(t) {
      t.clear();
      const h = cosine(52, 36, -2, 34);
      profile(t, h, -2, 34);
      profile(t, (x) => 36 + 0.08 * (x - 34) ** 2, 34, 38);
      start(t, 0, h(0));
      star(t, 18, h(18) + 1.3);
      const l = landing(t, 38, 37.28, 2, 28);
      star(t, l.top, l.arc(l.top) + 0.3);
      const a = l.end;
      const run = (x: number) => 28 - (x - a) * 0.06;
      profile(t, run, a, a + 130);
      checkpoint(t, a + 6, run(a + 6));
      // Rings first (placed on the measured line), then the barriers.
      for (const x of [a + 20, a + 40]) {
        const [p, q] = riderLine(t, [x - 1, x + 1]);
        t.addRing({ position: p.clone().lerp(q, 0.5).add(new THREE.Vector3(0, 0.6, 0)), axis: q.clone().sub(p).normalize(), radius: 1.7 });
      }
      for (const x of [a + 74, a + 112]) {
        hazard(t, 'barrier', x, run(x));
        star(t, x, run(x) + 3);
      }
      const yb = run(a + 130);
      checkpoint(t, a + 126, yb);
      const up = cosine(yb, yb + 5, a + 130, a + 170);
      profile(t, up, a + 130, a + 170);
      profile(t, () => yb + 5, a + 170, a + 182);
      star(t, a + 176, yb + 6.3);
      const down = cosine(yb + 5, 16, a + 182, a + 240);
      profile(t, down, a + 182, a + 240);
      profile(t, () => 16, a + 240, a + 270);
      finish(t, a + 260, 16);
      t.targetScore = 4000;
      forest(t, -8, a + 280, 129, ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter', 'lamp'], 6, 8);
    },
  },
];

export const puzzles: PuzzleDef[] = [
  bridge({
    id: 'broken-overpass',
    name: 'Broken Overpass',
    tip: 'The overpass has a hole in it. Draw the missing piece.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    danger: 'barrier',
    y: 14,
    top: 26,
    gaps: [[46, 57]],
    end: 104,
    seed: 141,
  }),
  climb({
    id: 'ramp-rings',
    name: 'Ramp Rings',
    kind: 'rings',
    tip: 'A ramp higher than the start: hang a ring on the street before it.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    y: 8,
    top: 18,
    hills: [{ at: 52, height: 11 }],
    end: 140,
    seed: 142,
  }),
  clearPath({
    id: 'road-closed',
    name: 'Road Closed',
    tip: 'A barricade blocks the street. Take it down, and leave the signs alone.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    top: 24,
    y: 14,
    slope: 0.06,
    humps: [60],
    spares: [
      [44, 4],
      [94, 5],
    ],
    end: 130,
    seed: 143,
  }),
  ledge({
    id: 'fire-escape',
    name: 'Fire Escape',
    tip: 'Down from the rooftop to the street: draw the slide.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    top: 30,
    high: 20,
    low: 8,
    edge: 50,
    land: 80,
    end: 126,
    seed: 144,
  }),
  crumbleRush({
    id: 'old-scaffold',
    name: 'Old Scaffold',
    kind: 'rings',
    tip: 'The old scaffolding gives way under a slow rider. A ring before it gets Bosh across.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    danger: 'spikes',
    top: 18,
    y: 12,
    slabs: 4,
    rise: 5,
    boosts: 1,
    seed: 145,
  }),
  cliffAir({
    id: 'rooftop-launch',
    name: 'Rooftop Launch',
    tip: 'Launch off the rooftop: a kicker at the edge, a whole second in the air.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    danger: 'barrier',
    top: 28,
    y: 14,
    edge: 50,
    floor: 4,
    kicker: 0.08,
    seed: 146,
  }),
  bridge({
    id: 'street-gaps',
    name: 'Street Gaps',
    kind: 'oneline',
    tip: 'Two open manholes on the street: one line over both.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    danger: 'spikes',
    y: 10,
    top: 22,
    gaps: [
      [44, 51],
      [60, 67],
    ],
    end: 110,
    seed: 147,
  }),
  bounce({
    id: 'trampoline-park',
    name: 'Trampoline Park',
    tip: 'The next roof is higher. A trampoline in the courtyard springs Bosh up there.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    danger: 'barrier',
    dy: 3,
    seed: 148,
  }),
  climb({
    id: 'boost-lane-city',
    name: 'Bus Lane Boost',
    kind: 'draw',
    tip: 'Two ramps, each higher than the start. Paint a boost strip before each one.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    y: 6,
    top: 16,
    hills: [
      { at: 50, height: 11 },
      { at: 124, height: 12 },
    ],
    end: 210,
    seed: 149,
  }),
  clearPath({
    id: 'traffic-jam',
    name: 'Traffic Jam',
    tip: 'Three wrecks block the road, with junk all around. Clear only the three wrecks.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    top: 26,
    y: 16,
    slope: 0.06,
    humps: [50, 86, 122],
    spares: [
      [68, 5],
      [104, 4],
    ],
    end: 170,
    seed: 150,
  }),
  crumbleRush({
    id: 'condemned',
    name: 'Condemned',
    kind: 'draw',
    tip: 'A long, crumbling walkway up the condemned block. Two boost strips get Bosh up it.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    top: 18,
    y: 12,
    slabs: 6,
    rise: 6,
    boosts: 2,
    seed: 151,
  }),
  ledge({
    id: 'skyscraper-slide',
    name: 'Skyscraper Slide',
    kind: 'oneline',
    tip: 'From the skyscraper to the street in a single line.',
    world: { biome: 'city' },
    decor: ['tower', 'streetlight', 'cone', 'billboard', 'car', 'planter'],
    top: 36,
    high: 26,
    low: 8,
    edge: 50,
    land: 88,
    end: 136,
    seed: 152,
  }),
];
