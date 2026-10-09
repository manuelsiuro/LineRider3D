/**
 * Finds a jump plan for a level that needs jumping (over hazards, up to stars):
 * rides it, and at each crash tries full-charge jumps let go at earlier and earlier
 * steps until one gets further; prints the plan to paste as the level's `solution`.
 *   npx tsx scripts/dev/jumpsolve.ts <level-id> [hold steps = 24] [push] [brake]
 * With `brake`, braking stretches are tried too (for levels where too much speed crashes).
 * With `push`, an autopilot pushes whenever the ride touches the ground (for mud and slow
 * climbs); the inputs it played are what gets printed. WINDOW=<steps> (default 70) sets how
 * far before a failure jumps are tried: falls last longer on the Moon.
 */
import { INPUT } from '../../src/physics/Rider';
import { LEVELS } from '../../src/levels/levels';
import { rideLevel, cleanRun, type InputPlan } from '../../src/levels/ride';

const level = LEVELS.find((l) => l.id === process.argv[2]);
if (!level) throw new Error(`No level ${process.argv[2]}`);
const hold = Number(process.argv[3] ?? 24);
const push = process.argv[4] === 'push';

/** An input held over [from, to): a charged jump (let go at `to`) or a brake. */
interface Action {
  from: number;
  to: number;
  mask: number;
}
const actions: Action[] = [];
const planOf = (acts: Action[]): InputPlan => {
  const out: InputPlan = [];
  for (const a of [...acts].sort((p, q) => p.from - q.from)) out.push([a.from, a.mask], [a.to, 0]);
  return out;
};
const progress = (acts: Action[]) => {
  const r = rideLevel(level, { plan: planOf(acts), push });
  return { r, score: r.stats.finished ? 1e6 + r.stats.stars * 1e4 : r.end.x };
};
const brakes = process.argv.includes('brake');
const WINDOW = Number(process.env.WINDOW ?? 70);

for (let round = 0; round < 14; round++) {
  const { r } = progress(actions);
  if (cleanRun(r)) break;
  if (r.stats.finished) {
    console.log(`finishes, but with ${r.stats.stars}/${r.track.stars.size} stars`);
    break;
  }
  const fail = r.frames;
  const after = actions.length ? Math.max(...actions.map((a) => a.to)) + 4 : 0;
  // Candidates: a full-charge jump let go at each step before the failure, or a brake.
  const tries: Action[] = [];
  // Taps and half charges too: a low spike strip needs only a hop, and a full charge needs time.
  for (const h of [...new Set([4, 12, hold])]) for (let at = Math.max(after + h, fail - WINDOW); at < fail; at++) tries.push({ from: at - h, to: at, mask: INPUT.jump });
  if (brakes) for (let end = Math.max(after + 8, fail - 90); end < fail; end += 2) for (const len of [8, 16, 24, 36, 48]) if (end - len >= after) tries.push({ from: end - len, to: end, mask: INPUT.brake });
  let best: { act: Action; score: number } | null = null;
  for (const act of tries) {
    const { score } = progress([...actions, act]);
    if (!best || score > best.score) best = { act, score };
  }
  if (!best || best.score <= r.end.x + 1) {
    console.log(`stuck at step ${fail} (x ${r.end.x.toFixed(1)}): ${r.stats.crashed ? 'crash' : 'stopped'}`);
    break;
  }
  actions.push(best.act);
  console.log(`${best.act.mask === INPUT.brake ? 'brake' : 'jump'} ${best.act.from}–${best.act.to}`);
}
const final = rideLevel(level, { plan: planOf(actions), push });
// The plan to store: exactly what was played (replayed without the autopilot).
const check = rideLevel(level, { plan: final.played });
console.log(cleanRun(check) ? 'CLEAN' : 'NOT CLEAN', `stars ${check.stats.stars}/${check.track.stars.size}`, check.stats.finished ? `finish ${check.stats.finishTime.toFixed(1)}s` : '', `(${final.played.length} changes)`);
console.log(`solution: ${JSON.stringify(final.played)},`);
