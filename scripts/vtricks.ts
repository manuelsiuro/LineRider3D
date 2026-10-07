import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { INPUT } from '../src/physics/Rider';
import { RunStats } from '../src/game/RunStats';
import { VEHICLES } from '../src/physics/vehicles';
import { buildDemoTrack } from '../src/demoTrack';

/**
 * Air tricks per vehicle on the demo jump: which hold durations (from the
 * takeoff) land a trick. Every ride must be able to land a flip, and the
 * spinning rides a 360.
 */
const short = (n: string) => n.replace('Frontflip', 'F').replace('Backflip', 'B').replace('Double ', '2').replace('Big Air', 'air').replace(' ', '');
let failed = false;
const only = process.argv[2];
for (const v of VEHICLES) {
  if (only && v.id !== only) continue;
  const keys: [string, number][] = [
    ['→', INPUT.push],
    ['←', INPUT.brake],
  ];
  if (v.handling.yaw) keys.push(['↑', INPUT.spin], ['↑→', INPUT.spin | INPUT.push]);
  const landed = new Set<string>();
  for (const [label, key] of keys) {
    const row: string[] = [];
    for (let hold = 6; hold <= 46; hold += 4) {
      const t = new Track();
      buildDemoTrack(t);
      const sim = new Simulation(t, v);
      for (let f = 130; f < 130 + hold; f++) sim.setInput(f, key);
      const stats = new RunStats();
      let trick = '-';
      for (let f = 0; f <= 330; f++) {
        sim.seek(f);
        stats.advance(sim, f, 40);
        for (const tr of stats.takeTricks()) {
          if (trick !== '-') continue;
          trick = tr.bailed ? 'BAIL' : `${tr.grade![0].toUpperCase()}:${short(tr.name)}`;
          if (!tr.bailed) landed.add(tr.name);
        }
      }
      if (stats.stats.crashed && trick === '-') trick = 'crash';
      row.push(`${hold}=${trick}`);
    }
    console.log(`${v.name.padEnd(10)} ${label.padEnd(3)} ${row.join(' ')}`);
  }
  const flip = [...landed].some((n) => /flip/.test(n));
  const spin = [...landed].some((n) => /360/.test(n));
  if (!flip || (v.handling.yaw && !spin)) {
    failed = true;
    console.log(`  FAIL ${v.name}: ${!flip ? 'no flip landed' : 'no 360 landed'}`);
  }
}
if (failed) process.exitCode = 1;
