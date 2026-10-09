import { rateRun } from '../src/game/rating';
import { LEVELS } from '../src/levels/levels';
import { cleanRun, rideLevel } from '../src/levels/ride';

/**
 * Each level must be finishable with all stars, without crashing, on its home world:
 * untouched, or, for levels that need the player, with their stored solution (and then
 * an untouched run must not make it).
 */
let failed = false;
let slowest = 0;
for (const level of LEVELS) {
  const t0 = performance.now();
  const r = rideLevel(level, { plan: level.solution, maxFrames: 1600 });
  slowest = Math.max(slowest, performance.now() - t0);
  const s = r.stats;
  const t = r.track;
  const rating = rateRun(t, s);
  let ok = cleanRun(r);
  let note = '';
  if (level.solution) {
    const untouched = rideLevel(level, { maxFrames: 1600 });
    const tooEasy = cleanRun(untouched);
    if (tooEasy) ok = false;
    note = `  solution (${level.solution.length} changes)${tooEasy ? ' BUT NEEDS NO INPUT' : ''}`;
  }
  if (!ok) failed = true;
  console.log(
    `${ok ? 'OK  ' : 'FAIL'} ${level.name.padEnd(14)} stars ${s.stars}/${t.stars.size}  ${s.finished ? `finish ${s.finishTime.toFixed(1)}s` : 'NO FINISH'}${s.crashed ? ' CRASH' : ''}  score ${s.score}/${t.targetScore}  ${'★'.repeat(rating.stars)}${'☆'.repeat(3 - rating.stars)}  end x=${r.end.x.toFixed(0)},y=${r.end.y.toFixed(1)},z=${r.end.z.toFixed(1)} f${r.frames}${note}`,
  );
}
console.error(`slowest build: ${slowest.toFixed(0)}ms`);
if (failed) process.exitCode = 1;
