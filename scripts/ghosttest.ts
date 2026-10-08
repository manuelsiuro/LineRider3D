import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT, P } from '../src/physics/Rider';
import { buildDemoTrack } from '../src/demoTrack';
import { GhostRun, decodeInputs, encodeInputs } from '../src/game/Ghost';

// A recorded run, encoded and replayed as a ghost, must match exactly.
const t = new Track();
buildDemoTrack(t);
const sim = new Simulation(t);
for (let f = 130; f < 155; f++) sim.setInput(f, INPUT.brake);
for (let f = 200; f < 230; f++) sim.setInput(f, INPUT.push);
sim.seek(320);
const inputs = sim.inputsUpTo(320);
const rle = encodeInputs(inputs);
if (decodeInputs(rle).join() !== inputs.join()) throw new Error('RLE round trip failed');
const ghost = new GhostRun(t, { rle, frames: 320, score: 0, finishTime: 0 });
let maxDiff = 0;
for (let f = 0; f <= 320; f += 10) {
  sim.seek(f);
  ghost.sim.seek(f);
  maxDiff = Math.max(maxDiff, sim.rider.pos[P.butt].distanceTo(ghost.sim.rider.pos[P.butt]));
}
console.log('ghost rle', JSON.stringify(rle), 'max divergence', maxDiff);
if (maxDiff !== 0) throw new Error('ghost diverged');

// Racing your own run: the live gap stays at zero all the way.
{
  const { GhostRun: GR, encodeInputs: enc } = await import('../src/game/Ghost');
  const { RunStats: RS } = await import('../src/game/RunStats');
  const { buildDemoTrack: demo } = await import('../src/demoTrack');
  const { Track: T } = await import('../src/track/Track');
  const { Simulation: S } = await import('../src/physics/Simulation');
  const { check } = await import('./assert');
  const t = new T();
  demo(t);
  const sim = new S(t);
  const stats = new RS();
  for (let f = 0; f <= 300; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
  }
  const ghost = new GR(t, { rle: enc(sim.inputsUpTo(300)), frames: 300, score: 0, finishTime: 0 });
  const replay = new S(t);
  const rs = new RS();
  let worst = 0;
  for (let f = 0; f <= 280; f++) {
    replay.seek(f);
    rs.advance(replay, f, 40);
    const g = f > 40 ? ghost.gap(f, rs.stats.distance, 40) : 0;
    if (g !== null) worst = Math.max(worst, Math.abs(g));
  }
  check(worst < 0.03, `own ghost gap should be ~0, got ${worst.toFixed(3)}s`);
  console.log('own ghost gap max', worst.toFixed(3) + 's');
}
