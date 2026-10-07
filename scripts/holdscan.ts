import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT } from '../src/physics/Rider';
import { RunStats } from '../src/game/RunStats';
import { buildDemoTrack } from '../src/demoTrack';

// Which hold durations at takeoff land each trick on the demo jump?
for (const [label, key] of [['back', INPUT.brake], ['front', INPUT.push]] as const) {
  const row: string[] = [];
  for (let hold = 4; hold <= 44; hold += 2) {
    const t = new Track();
    buildDemoTrack(t);
    const sim = new Simulation(t);
    for (let f = 130; f < 130 + hold; f++) sim.setInput(f, key);
    const stats = new RunStats();
    let trick = '-';
    for (let f = 0; f <= 330; f++) {
      sim.seek(f);
      stats.advance(sim, f, 40);
      for (const tr of stats.takeTricks()) if (trick === '-') trick = tr.bailed ? 'BAIL' : `${tr.grade![0].toUpperCase()}:${tr.name.replace('Frontflip', 'F').replace('Backflip', 'B').replace('Double ', '2').replace('Big Air', 'air')}`;
    }
    if (stats.stats.crashed && trick === '-') trick = 'crash';
    row.push(`${hold}=${trick}`);
  }
  console.log(label, row.join(' '));
}
