import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT } from '../src/physics/Rider';
import { RunStats } from '../src/game/RunStats';
import { rateRun } from '../src/game/rating';
import { LEVELS } from '../src/levels/levels';

/** Plays a level with an input plan; returns stats. */
function play(t: Track, plan: Map<number, number>, pushAll: boolean) {
  const sim = new Simulation(t);
  for (let f = 0; f < 1000; f++) sim.setInput(f, (plan.get(f) ?? 0) | (pushAll ? INPUT.push : 0));
  const stats = new RunStats();
  const takeoffs: number[] = [];
  let wasGrounded = false;
  for (let f = 0; f <= 1000; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    const grounded = sim.rider.contact.some((c) => c);
    if (wasGrounded && !grounded) takeoffs.push(f);
    wasGrounded = grounded;
    const s = stats.stats;
    if ((s.finished && f > s.finishTime * 40 + 40) || s.crashed || (s.still > 1.5 && f > 80)) break;
  }
  return { stats: stats.stats, takeoffs };
}

/** Greedy search: at each takeoff try flip holds, keep the best. */
for (const level of LEVELS) {
  const t = new Track();
  level.build(t);
  let bestScore = -1;
  let bestDesc = '';
  for (const pushAll of [false, true]) {
    const plan = new Map<number, number>();
    let { stats, takeoffs } = play(t, plan, pushAll);
    let score = stats.finished ? stats.score : -1;
    let desc = pushAll ? 'push' : 'classic';
    const done = new Set<number>();
    for (let round = 0; round < 4; round++) {
      const next = takeoffs.find((f) => !done.has(f));
      if (next === undefined) break;
      done.add(next);
      let bestHere: { plan: Map<number, number>; score: number; d: string } | null = null;
      for (const key of [INPUT.brake, INPUT.push]) {
        for (let hold = 12; hold <= 32; hold += 2) {
          const p = new Map(plan);
          for (let f = next; f < next + hold; f++) p.set(f, key);
          const r = play(t, p, pushAll && key !== INPUT.brake);
          const sc = r.stats.finished ? r.stats.score : -1;
          if (!bestHere || sc > bestHere.score) bestHere = { plan: p, score: sc, d: `${key === INPUT.brake ? 'B' : 'F'}${hold}@${next}` };
        }
      }
      if (bestHere && bestHere.score > score) {
        for (const [k, v] of bestHere.plan) plan.set(k, v);
        score = bestHere.score;
        desc += ' ' + bestHere.d;
        ({ takeoffs } = play(t, plan, pushAll));
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestDesc = desc;
    }
  }
  const ok = bestScore >= t.targetScore;
  console.log(`${ok ? 'OK  ' : 'HARD'} ${level.name.padEnd(14)} best ${bestScore} / target ${t.targetScore}  (${bestDesc})`);
}
void rateRun;
