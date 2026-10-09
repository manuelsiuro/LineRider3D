/**
 * Finds a jump plan for a level that needs jumping (over hazards, up to stars):
 * rides it, and at each crash tries full-charge jumps let go at earlier and earlier
 * steps until one gets further; prints the plan to paste as the level's `solution`.
 *   npx tsx scripts/dev/jumpsolve.ts <level-id> [hold steps = 24]
 */
import { INPUT } from '../../src/physics/Rider';
import { LEVELS } from '../../src/levels/levels';
import { rideLevel, cleanRun, type InputPlan } from '../../src/levels/ride';

const level = LEVELS.find((l) => l.id === process.argv[2]);
if (!level) throw new Error(`No level ${process.argv[2]}`);
const hold = Number(process.argv[3] ?? 24);

const jumps: number[] = [];
const planOf = (releases: number[]): InputPlan => releases.flatMap((r) => [[r - hold, INPUT.jump], [r, 0]] as [number, number][]);
const progress = (releases: number[]) => {
  const r = rideLevel(level, { plan: planOf(releases) });
  return { r, score: r.stats.finished ? 1e6 + r.stats.stars * 1e4 : r.end.x };
};

for (let round = 0; round < 12; round++) {
  const { r } = progress(jumps);
  if (cleanRun(r)) break;
  if (r.stats.finished) {
    console.log(`finishes, but with ${r.stats.stars}/${r.track.stars.size} stars`);
    break;
  }
  const fail = r.frames;
  const after = jumps.length ? jumps[jumps.length - 1] + 4 : hold;
  let best: { at: number; score: number } | null = null;
  for (let at = Math.max(after + hold, fail - 70); at < fail; at++) {
    const { score } = progress([...jumps, at]);
    if (!best || score > best.score) best = { at, score };
  }
  if (!best || best.score <= r.end.x + 1) {
    console.log(`stuck at step ${fail} (x ${r.end.x.toFixed(1)}): ${r.stats.crashed ? 'crash' : 'stopped'}`);
    break;
  }
  jumps.push(best.at);
  console.log(`jump let go at step ${best.at}`);
}
const final = rideLevel(level, { plan: planOf(jumps) });
console.log(cleanRun(final) ? 'CLEAN' : 'NOT CLEAN', `stars ${final.stats.stars}/${final.track.stars.size}`, final.stats.finished ? `finish ${final.stats.finishTime.toFixed(1)}s` : '');
console.log(`solution: ${JSON.stringify(planOf(jumps))},`);
