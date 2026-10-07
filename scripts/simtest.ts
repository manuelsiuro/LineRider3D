import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { buildDemoTrack } from '../src/demoTrack';
import { P } from '../src/physics/Rider';

const track = new Track();
buildDemoTrack(track);
const sim = new Simulation(track);
let crashFrame = -1;
for (let f = 0; f <= 600; f++) {
  sim.seek(f);
  const r = sim.rider;
  if (r.crashed && crashFrame < 0) crashFrame = f;
  if (f % 20 === 0) {
    const b = r.pos[P.butt], s = r.pos[P.shoulder];
    console.log(f, 'butt', b.x.toFixed(2), b.y.toFixed(2), b.z.toFixed(2), 'sh', s.x.toFixed(2), s.y.toFixed(2), s.z.toFixed(2), r.crashed ? 'CRASHED' : '');
  }
}
console.log('crash frame', crashFrame);
