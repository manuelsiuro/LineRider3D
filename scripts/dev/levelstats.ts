/**
 * The difficulty curve, measured: per level its length, duration, airtime, top speed,
 * how much input it needs, hazards and checkpoints, next to its difficulty rating.
 *   npx tsx scripts/dev/levelstats.ts [world]
 */
import { LEVELS, chapterOf } from '../../src/levels/levels';
import { rideLevel } from '../../src/levels/ride';

const METERS = 0.6;
const KMH = 3.6 * METERS;
let world = '';
console.log('level'.padEnd(18), 'diff', 'length'.padStart(7), 'time'.padStart(6), 'air'.padStart(5), 'top'.padStart(8), 'input', 'haz', 'chk', 'stars');
for (const level of LEVELS) {
  if (process.argv[2] && chapterOf(level) !== process.argv[2]) continue;
  if (chapterOf(level) !== world) {
    world = chapterOf(level);
    console.log(`-- ${world}`);
  }
  const r = rideLevel(level, { plan: level.solution });
  const s = r.stats;
  console.log(
    level.id.padEnd(18),
    String(level.difficulty).padStart(4),
    `${Math.round(s.distance * METERS)} m`.padStart(7),
    `${(s.finished ? s.finishTime : r.frames / 40).toFixed(1)}s`.padStart(6),
    `${(r.airFrames / 40).toFixed(1)}s`.padStart(5),
    `${Math.round(s.topSpeed * KMH)} km/h`.padStart(8),
    String(level.solution?.length ?? 0).padStart(5),
    String(r.track.hazards.size).padStart(3),
    String(r.track.checkpoints.size).padStart(3),
    `${s.stars}/${r.track.stars.size}${s.finished ? '' : ' NO FINISH'}${s.crashed ? ' CRASH' : ''}`,
  );
}
