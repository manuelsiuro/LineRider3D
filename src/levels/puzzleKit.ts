import * as THREE from 'three';
import type { Track } from '../track/Track';
import type { DecorKind, HazardKind } from '../track/types';
import type { PuzzleDef } from './puzzles';
import { cosine, finish, forest, hazard, home, landing, line, profile, star, start } from './builders';

/**
 * Puzzle templates: each builds a family of puzzles from a few numbers, with a solution
 * that is known to work (the tests ride it). The worlds' puzzle lists are made of these.
 */

type Common = Pick<PuzzleDef, 'id' | 'name' | 'tip' | 'world'> & {
  decor?: DecorKind[];
  seed?: number;
  /** Hazards on the ground below the gaps (dressing: a fall is already lost). */
  danger?: HazardKind;
};

const DECOR: DecorKind[] = ['pine', 'pine', 'rock', 'cabin', 'snowman'];
const scenery = (t: Track, c: Common, x1: number) => forest(t, -6, x1, c.seed ?? 50, c.decor ?? DECOR, 5, 8);

/** A run in from the start: a cosine slope from `top` down to `y`, ending at x = 30. */
function runIn(t: Track, top: number, y: number) {
  const h = cosine(top, y, -2, 30);
  profile(t, h, -2, 30);
  start(t, 0, h(0));
  return h;
}

/**
 * Gaps in a flat run at height `y`: draw a bridge over each (or, for 'oneline', one line
 * over all of them). A star over each gap.
 */
export function bridge(c: Common & { kind?: 'draw' | 'oneline'; y: number; top: number; gaps: [number, number][]; end: number }): PuzzleDef {
  const kind = c.kind ?? 'draw';
  const widths = c.gaps.reduce((n, [a, b]) => n + (b - a), 0);
  const span = c.gaps[c.gaps.length - 1][1] - c.gaps[0][0];
  const need = kind === 'oneline' ? span + 2 : widths + c.gaps.length * 2;
  return {
    ...c,
    kind,
    ink: Math.ceil(need * 1.35),
    par: Math.ceil(need),
    types: ['normal'],
    build(t) {
      if (c.world) home(t, c.world);
      runIn(t, c.top, c.y);
      let x = 30;
      for (const [a, b] of c.gaps) {
        profile(t, () => c.y, x, a);
        star(t, (a + b) / 2, c.y + 1.3);
        if (c.danger) hazard(t, c.danger, (a + b) / 2, 0);
        x = b;
      }
      profile(t, () => c.y, x, c.end);
      finish(t, c.end - 10, c.y);
      scenery(t, c, c.end + 6);
    },
    solution(t) {
      if (kind === 'oneline') line(t, [c.gaps[0][0] - 1, c.y], [c.gaps[c.gaps.length - 1][1] + 1, c.y]);
      else for (const [a, b] of c.gaps) line(t, [a - 1, c.y], [b + 1, c.y]);
    },
  };
}

/** A high ledge and a low one out of jumping reach: draw the slide down between them. */
export function ledge(c: Common & { kind?: 'draw' | 'oneline'; top: number; high: number; low: number; edge: number; land: number; end: number }): PuzzleDef {
  const len = Math.hypot(c.land - c.edge, c.high - c.low);
  return {
    ...c,
    kind: c.kind ?? 'draw',
    ink: Math.ceil(len * 1.5),
    par: Math.ceil(len + 1),
    types: ['normal'],
    build(t) {
      if (c.world) home(t, c.world);
      runIn(t, c.top, c.high);
      profile(t, () => c.high, 30, c.edge);
      profile(t, () => c.low, c.land, c.end);
      star(t, (c.edge + c.land) / 2, (c.high + c.low) / 2 + 1.3);
      finish(t, c.end - 10, c.low);
      scenery(t, c, c.end + 6);
    },
    solution(t) {
      line(t, [c.edge - 0.5, c.high], [c.land + 0.5, c.low]);
    },
  };
}

/**
 * A hill higher than the start: Bosh needs a push over it, from boost rings ('rings') or a
 * drawn boost strip ('draw', boost lines only). `hills` in a row, each with a flat before it.
 */
export function climb(c: Common & { kind: 'rings' | 'draw'; y: number; top: number; hills: { at: number; height: number }[]; end: number }): PuzzleDef {
  const n = c.hills.length;
  return {
    ...c,
    ink: c.kind === 'rings' ? n + 2 : n * 14,
    par: c.kind === 'rings' ? n : n * 9,
    types: c.kind === 'rings' ? ['normal'] : ['accel'],
    build(t) {
      if (c.world) home(t, c.world);
      runIn(t, c.top, c.y);
      let x = 30;
      for (const { at, height } of c.hills) {
        profile(t, () => c.y, x, at);
        const up = cosine(c.y, c.y + height, at, at + 30);
        const down = cosine(c.y + height, c.y, at + 30, at + 60);
        profile(t, (v) => (v < at + 30 ? up(v) : down(v)), at, at + 60);
        star(t, at + 30, c.y + height + 1.3);
        x = at + 60;
      }
      profile(t, () => c.y, x, c.end);
      finish(t, c.end - 10, c.y);
      scenery(t, c, c.end + 6);
    },
    solution(t) {
      for (const { at } of c.hills) {
        if (c.kind === 'rings') t.addRing({ position: new THREE.Vector3(at - 6, c.y + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
        else line(t, [at - 10, c.y + 0.02], [at - 1, c.y + 0.02], 'accel');
      }
    },
  };
}

/**
 * An erase puzzle: humps too high to climb sit on the run (erase them); a few spare lines
 * around them don't matter (don't waste erasing on them).
 */
export function clearPath(c: Common & { top: number; y: number; slope: number; humps: number[]; spares: [number, number][]; end: number }): PuzzleDef {
  return {
    ...c,
    kind: 'erase',
    ink: c.humps.length + c.spares.length,
    par: c.humps.length,
    types: ['normal'],
    build(t) {
      if (c.world) home(t, c.world);
      runIn(t, c.top, c.y);
      const run = (x: number) => c.y - (x - 30) * c.slope;
      profile(t, run, 30, c.end);
      // The run stays; the humps and spare lines below may be erased.
      for (const s of t.strokes.values()) s.locked = true;
      for (const x of c.humps) {
        // A hump the run can't get over: it starts flush with the track.
        const bump = cosine(0, 1, x, x + 10);
        profile(t, (v) => run(v) + (v < x + 10 ? bump(v) * 14 : 14 - (v - x - 10) * 1.5), x, x + 14);
        star(t, x + 18, run(x + 18) + 1.3);
      }
      // Spare lines out of the way, above the run.
      for (const [x, dy] of c.spares) profile(t, (v) => run(v) + dy + (v - x) * 0.1, x, x + 6);
      finish(t, c.end - 10, run(c.end - 10));
      scenery(t, c, c.end + 6);
    },
    solution(t) {
      for (const x of c.humps) {
        const hump = [...t.strokes.values()].find((s) => !s.locked && Math.abs(s.points[0].x - x) < 1e-6);
        if (hump) t.removeStroke(hump);
      }
    },
  };
}

/**
 * A cliff: rolling off it is not a big air (a second in the air). Draw a kicker at the edge.
 * The landing fits a reference kicker; the player draws their own.
 */
export function cliffAir(c: Common & { top: number; y: number; edge: number; floor: number; kicker: number }): PuzzleDef {
  const reach = 5;
  return {
    ...c,
    kind: 'trick',
    trick: 'air',
    ink: 14,
    par: 8,
    types: ['normal'],
    build(t) {
      if (c.world) home(t, c.world);
      runIn(t, c.top, c.y);
      profile(t, () => c.y, 30, c.edge);
      const kicker = profile(t, (x) => c.y + c.kicker * (x - (c.edge - reach)) ** 2, c.edge - reach, c.edge + 1);
      const fromY = c.y + c.kicker * (reach + 1) ** 2;
      const l = landing(t, c.edge + 1, fromY, 3, c.floor);
      t.removeStroke(kicker);
      profile(t, () => l.flat, l.end, l.end + 30);
      star(t, l.top, l.arc(l.top) + 0.3);
      finish(t, l.end + 22, l.flat);
      if (c.danger) for (const k of [0.3, 0.7]) hazard(t, c.danger, c.edge + 2 + (l.top - c.edge) * k, 0);
      scenery(t, c, l.end + 36);
    },
    solution(t) {
      profile(t, (x) => c.y + c.kicker * (x - (c.edge - reach)) ** 2, c.edge - reach, c.edge + 1);
    },
  };
}

/**
 * Too fast: a bump flings Bosh up into icicles hanging over the run. Draw mud on the slope
 * (mud lines only, laid just over the track) to slow him down first.
 */
export function mudBrakes(c: Common & { top: number; y: number; slope: number; bumpAt: number; end: number }): PuzzleDef {
  return {
    ...c,
    kind: 'draw',
    ink: 36,
    par: Math.ceil(24 * Math.hypot(1, c.slope) + 1),
    types: ['mud'],
    build(t) {
      if (c.world) home(t, c.world);
      runIn(t, c.top, c.y);
      const run = (x: number) => c.y - (x - 30) * c.slope;
      profile(t, run, 30, c.bumpAt);
      const yb = run(c.bumpAt);
      const bump = cosine(yb, yb + 1.2, c.bumpAt, c.bumpAt + 5);
      const down = cosine(yb + 1.2, yb - 1, c.bumpAt + 5, c.bumpAt + 14);
      profile(t, (x) => (x < c.bumpAt + 5 ? bump(x) : down(x)), c.bumpAt, c.bumpAt + 14);
      profile(t, () => yb - 1, c.bumpAt + 14, c.end);
      hazard(t, 'icicles', c.bumpAt + 9, yb + 4.4);
      star(t, c.bumpAt - 10, run(c.bumpAt - 10) + 1.3);
      finish(t, c.end - 10, yb - 1);
      scenery(t, c, c.end + 6);
    },
    solution(t) {
      const run = (x: number) => c.y - (x - 30) * c.slope;
      profile(t, (x) => run(x) + 0.05, c.bumpAt - 26, c.bumpAt - 2, 'mud');
    },
  };
}

/**
 * A ledge out of reach above a pit: a bouncy pad drawn in the pit springs Bosh up there.
 * (The proven Bounce Back layout, raised by `dy`: height alone doesn't change the physics.)
 */
export function bounce(c: Common & { dy: number }): PuzzleDef {
  const y = (v: number) => v + c.dy;
  return {
    ...c,
    kind: 'draw',
    ink: 18,
    par: 13,
    types: ['normal', 'bouncy'],
    build(t) {
      if (c.world) home(t, c.world);
      const h = cosine(y(20), y(12), -2, 24);
      profile(t, h, -2, 24);
      profile(t, () => y(12), 24, 32);
      profile(t, () => y(14), 56, 100);
      start(t, 0, h(0));
      star(t, 55, y(11.5));
      finish(t, 88, y(14));
      if (c.danger) for (const x of [34, 50]) hazard(t, c.danger, x, 0);
      scenery(t, c, 110);
    },
    solution(t) {
      line(t, [36, y(2)], [48, y(3.2)], 'bouncy');
    },
  };
}

/**
 * A cracked bridge (slabs that fall a moment after Bosh touches them), climbing a little:
 * he's too slow to get across. Speed him up before it, with rings ('rings') or a drawn
 * boost strip ('draw').
 */
export function crumbleRush(c: Common & { kind: 'rings' | 'draw'; top: number; y: number; slabs: number; rise: number; boosts: number }): PuzzleDef {
  const len = c.slabs * 8;
  return {
    ...c,
    ink: c.kind === 'rings' ? c.boosts + 2 : c.boosts * 14,
    par: c.kind === 'rings' ? c.boosts : c.boosts * 9,
    types: c.kind === 'rings' ? ['normal'] : ['accel'],
    build(t) {
      if (c.world) home(t, c.world);
      runIn(t, c.top, c.y);
      profile(t, () => c.y, 30, 30 + c.boosts * 14);
      const a = 30 + c.boosts * 14;
      const up = (x: number) => c.y + ((x - a) / len) * c.rise;
      for (let k = 0; k < c.slabs; k++) profile(t, up, a + k * 8, a + (k + 1) * 8, 'crumble');
      const b = a + len;
      const top = c.y + c.rise;
      profile(t, () => top, b, b + 30);
      star(t, a + len / 2, up(a + len / 2) + 1.3);
      finish(t, b + 20, top);
      if (c.danger) for (let k = 0; k < c.slabs; k += 2) hazard(t, c.danger, a + k * 8 + 4, 0);
      scenery(t, c, b + 36);
    },
    solution(t) {
      for (let k = 0; k < c.boosts; k++) {
        const x = 30 + k * 14;
        if (c.kind === 'rings') t.addRing({ position: new THREE.Vector3(x + 7, c.y + 1.2, 0), axis: new THREE.Vector3(1, 0, 0), radius: 1.6 });
        else line(t, [x + 1, c.y + 0.02], [x + 10, c.y + 0.02], 'accel');
      }
    },
  };
}
