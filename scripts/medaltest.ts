/** The medal table matches the physics (regenerate with scripts/dev/medals.ts) and every medal is ordered. */
import { LEVELS } from '../src/levels/levels';
import { MEDAL_TIMES } from '../src/levels/medals';
import { computeMedals, medalPairs } from '../src/levels/medalTimes';
import { check } from './assert';

const pairs = medalPairs(LEVELS);
// Every pair has medals, except rides that can't finish a level needing input with its solution.
const missing = pairs.filter(([l, v]) => !MEDAL_TIMES[`${l.id}:${v.id}`]);
check(missing.every(([l]) => !!l.solution), `missing medals for ${missing.map(([l, v]) => `${l.id}:${v.id}`).join(', ')}: run npx tsx scripts/dev/medals.ts`);
check(Object.keys(MEDAL_TIMES).length + missing.length === pairs.length, `table has ${Object.keys(MEDAL_TIMES).length} entries for ${pairs.length} pairs: run npx tsx scripts/dev/medals.ts`);
for (const [key, m] of Object.entries(MEDAL_TIMES)) check(m[0] > m[1] && m[1] > m[2] && m[2] > m[3], `${key}: medal times out of order ${m.join('/')}`);
// Recompute a spread of pairs (all of them takes ~40 s).
pairs.forEach(([level, v], i) => {
  if (i % 4) return;
  const key = `${level.id}:${v.id}`;
  const m = computeMedals(level, v);
  const same = JSON.stringify(m ?? undefined) === JSON.stringify(MEDAL_TIMES[key]);
  check(same, `${key}: table says ${MEDAL_TIMES[key]?.join('/')}, physics gives ${m?.join('/')}: run npx tsx scripts/dev/medals.ts`);
  console.log(key.padEnd(26), m?.join(' / '));
});
