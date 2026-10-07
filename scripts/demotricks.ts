import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT } from '../src/physics/Rider';
import { RunStats } from '../src/game/RunStats';
import { buildDemoTrack } from '../src/demoTrack';

for (const [name, key, hold] of [['classic', 0, 0], ['backflip', INPUT.brake, 22], ['frontflip', INPUT.push, 20], ['push all', INPUT.push, 999]] as const) {
  const t = new Track();
  buildDemoTrack(t);
  const sim = new Simulation(t);
  let takeoff = 0;
  for (let f = 50; f < 300; f++) { sim.seek(f); if (!sim.rider.contact.some((c) => c)) { takeoff = f; break; } }
  if (hold === 999) for (let f = 0; f < 600; f++) sim.setInput(f, key);
  else for (let f = takeoff; f < takeoff + hold; f++) sim.setInput(f, key);
  const stats = new RunStats();
  const tricks: string[] = [];
  let end = 0;
  for (let f = 0; f <= 600; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    for (const tr of stats.takeTricks()) tricks.push(`${tr.name} +${tr.points}`);
    if (stats.stats.still > 1.2 && f > 60) { end = f; break; }
  }
  const s = stats.stats;
  console.log(name.padEnd(10), 'takeoff', takeoff, 'end', end, s.crashed ? 'CRASH' : 'clean', 'score', s.score, 'rings', s.rings, 'top', (s.topSpeed * 2.16).toFixed(0) + 'km/h', tricks.join(', '));
}
