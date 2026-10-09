/**
 * Finds inputs for every ride on the levels that need input, where the level's stored
 * solution (made for the sled) doesn't work for that ride, so every ride gets medals.
 * Prints one line per solved pair: `level:ride<TAB>plan json`; failures go to stderr.
 *   npx tsx scripts/dev/ridesolve.ts [shard] [shards]
 * scripts/dev/ridesolveall.sh runs the shards in parallel and writes src/levels/rideSolutions.ts.
 */
import { INPUT } from '../../src/physics/Rider';
import { LEVELS } from '../../src/levels/levels';
import { medalPairs } from '../../src/levels/medalTimes';
import { rideLevel, cleanRun, solutionFor, type InputPlan } from '../../src/levels/ride';
import type { LevelDef } from '../../src/levels/levels';
import type { VehicleDef } from '../../src/physics/vehicles';

const shard = Number(process.argv[2] ?? 0);
const shards = Number(process.argv[3] ?? 1);

interface Action {
  from: number;
  to: number;
  mask: number;
}
const planOf = (acts: Action[]): InputPlan => {
  const out: InputPlan = [];
  for (const a of [...acts].sort((p, q) => p.from - q.from)) out.push([a.from, a.mask], [a.to, 0]);
  return out;
};

/** Greedy search, as scripts/dev/jumpsolve.ts: at each failure, the one action that gets furthest. */
function solve(level: LevelDef, vehicle: VehicleDef, opts: { push: boolean; brake: boolean; window: number }): InputPlan | null {
  const actions: Action[] = [];
  const progress = (acts: Action[]) => {
    const r = rideLevel(level, { plan: planOf(acts), push: opts.push, vehicle });
    return { r, score: r.stats.finished ? 1e6 + r.stats.stars * 1e4 : r.end.x };
  };
  for (let round = 0; round < 14; round++) {
    const { r } = progress(actions);
    if (cleanRun(r) || r.stats.finished) break;
    const fail = r.frames;
    const after = actions.length ? Math.max(...actions.map((a) => a.to)) + 4 : 0;
    const tries: Action[] = [];
    for (const h of [4, 12, 24]) for (let at = Math.max(after + h, fail - opts.window); at < fail; at++) tries.push({ from: at - h, to: at, mask: INPUT.jump });
    if (opts.brake) for (let end = Math.max(after + 8, fail - 90); end < fail; end += 2) for (const len of [8, 16, 24, 36, 48]) if (end - len >= after) tries.push({ from: end - len, to: end, mask: INPUT.brake });
    let best: { act: Action; score: number } | null = null;
    for (const act of tries) {
      const { score } = progress([...actions, act]);
      if (!best || score > best.score) best = { act, score };
    }
    if (!best || best.score <= r.end.x + 1) break;
    actions.push(best.act);
  }
  const final = rideLevel(level, { plan: planOf(actions), push: opts.push, vehicle });
  const check = rideLevel(level, { plan: final.played, vehicle });
  return cleanRun(check) ? final.played : null;
}

const pairs = medalPairs(LEVELS).filter(([l]) => !!l.solution);
pairs.forEach(([level, v], i) => {
  if (i % shards !== shard) return;
  const key = `${level.id}:${v.id}`;
  if (cleanRun(rideLevel(level, { plan: solutionFor(level, v.id), vehicle: v }))) return;
  const own = level.solution ?? [];
  const pushes = own.some(([, m]) => m & INPUT.push);
  const brakes = own.some(([, m]) => m & INPUT.brake);
  const tries = [
    { push: pushes, brake: brakes, window: 70 },
    { push: pushes, brake: brakes, window: 120 },
    { push: !pushes, brake: true, window: 120 },
  ];
  for (const opts of tries) {
    const plan = solve(level, v, opts);
    if (plan) {
      console.log(`${key}\t${JSON.stringify(plan)}`);
      return;
    }
  }
  console.error(`unsolved ${key}`);
});
