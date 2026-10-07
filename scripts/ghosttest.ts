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
