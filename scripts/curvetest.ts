import { BIOMES } from '../src/world/worlds';
import { LEVELS, chapterOf } from '../src/levels/levels';
import { PUZZLES } from '../src/levels/puzzles';
import { worldGate } from '../src/game/progress';
import { check } from './assert';

/**
 * The shape of the campaign: worlds come in order with their levels together, difficulty
 * never drops inside a world, and every world's star gate can be reached with the stars
 * of the worlds before it.
 */
const ids = new Set<string>();
for (const l of [...LEVELS, ...PUZZLES]) {
  check(!ids.has(l.id), `unique id ${l.id}`);
  ids.add(l.id);
}
let before = 0;
let lastWorld = -1;
for (const b of BIOMES) {
  const levels = LEVELS.filter((l) => chapterOf(l) === b.id);
  const k = LEVELS.findIndex((l) => chapterOf(l) === b.id);
  if (levels.length) {
    // Each world's levels sit together, in world order.
    check(LEVELS.slice(k, k + levels.length).every((l) => chapterOf(l) === b.id), `${b.id}: levels together`);
    const order = BIOMES.indexOf(b);
    check(order > lastWorld, `${b.id}: worlds in order`);
    lastWorld = order;
  }
  let d = 0;
  for (const l of levels) {
    check(l.difficulty >= d, `${l.id}: difficulty ${l.difficulty} after ${d} (never drops inside a world)`);
    d = l.difficulty;
  }
  const gate = worldGate(b.id);
  check(gate <= before * 3, `${b.id}: gate ${gate} reachable with ${before * 3} stars before it`);
  const curve = levels.map((l) => `${l.difficulty}${l.solution ? '*' : ''}`).join(' ');
  const puzzles = PUZZLES.filter((p) => (p.world?.biome ?? 'alpine') === b.id).length;
  console.log(`${b.id.padEnd(10)} gate ${String(gate).padStart(3)}★  ${String(levels.length).padStart(3)} levels  ${String(puzzles).padStart(3)} puzzles  difficulty ${curve}`);
  before += levels.length;
}
console.log(`total ${LEVELS.length} levels, ${PUZZLES.length} puzzles (* needs input)`);
