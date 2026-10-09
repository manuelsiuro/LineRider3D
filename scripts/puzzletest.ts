/**
 * Puzzles: each known solution finishes with every star (and the trick, in trick puzzles)
 * within par, so three stars are possible, and no puzzle is complete untouched (Star
 * Route finishes by itself, but misses its stars).
 */
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { RunStats } from '../src/game/RunStats';
import { PUZZLES, puzzleBase, puzzleKind, puzzleSpent, trickDone, type PuzzleDef } from '../src/levels/puzzles';
import { gravityOf, normalizeWorld } from '../src/world/worlds';
import { check } from './assert';

function ride(t: Track, p: PuzzleDef) {
  const sim = new Simulation(t);
  sim.setGravity(gravityOf(normalizeWorld(p.world)));
  const st = new RunStats();
  for (let f = 0; f <= 1200; f++) {
    sim.seek(f);
    st.advance(sim, f, 40);
    const s = st.stats;
    if ((s.finished && f > s.finishTime * 40 + 20) || s.crashed || (s.still > 1.5 && f > 80)) break;
  }
  return st.stats;
}

/** Built as the game does: locked, except erasable lines in erase puzzles. */
function build(p: PuzzleDef) {
  const t = new Track();
  p.build(t);
  if (puzzleKind(p) !== 'erase') for (const s of t.strokes.values()) s.locked = true;
  return t;
}

const UNIT = { draw: 'ink', oneline: 'ink', trick: 'ink', rings: 'rings', erase: 'erased' } as const;

const ids = new Set<string>();
for (const p of PUZZLES) {
  const kind = puzzleKind(p);
  check(!ids.has(p.id), `duplicate puzzle id ${p.id}`);
  ids.add(p.id);
  check(p.par <= p.ink, `${p.id}: par above the budget`);
  check(kind !== 'trick' || !!p.trick, `${p.id}: a trick puzzle names its trick`);
  const bare = build(p);
  const unsolved = ride(bare, p);
  const finishes = unsolved.finished && !unsolved.crashed;
  check(!(finishes && unsolved.stars === bare.stars.size && trickDone(p, unsolved)), `${p.id}: complete without the player`);
  const t = build(p);
  const base = puzzleBase(t);
  p.solution(t);
  const s = ride(t, p);
  const spent = puzzleSpent(p, t, base);
  check(s.finished && !s.crashed, `${p.id}: the solution does not finish`);
  check(s.stars === t.stars.size, `${p.id}: the solution misses stars (${s.stars}/${t.stars.size})`);
  check(trickDone(p, s), `${p.id}: the solution lands no ${p.trick} (best: ${s.bestTrick || 'none'})`);
  check(spent <= p.par + 1e-6, `${p.id}: the solution spends ${spent.toFixed(1)}, par is ${p.par}`);
  if (kind === 'oneline') check([...t.strokes.values()].filter((x) => !x.locked).length === 1, `${p.id}: one line only`);
  const used = UNIT[kind] === 'ink' ? spent.toFixed(1) : String(spent);
  console.log(
    `${p.id.padEnd(15)} unsolved ${finishes ? 'finishes' : 'fails   '} solved ${s.finishTime.toFixed(2)}s stars ${s.stars}/${t.stars.size} ${UNIT[kind]} ${used}/${p.par}/${p.ink}${kind === 'trick' ? ` trick ${s.bestTrick}` : ''}`,
  );
}
