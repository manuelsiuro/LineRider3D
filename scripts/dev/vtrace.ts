import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { LEVELS } from '../../src/levels/levels';
import { vehicleById } from '../../src/physics/vehicles';
import { P } from '../../src/physics/Rider';
import { buildDemoTrack } from '../../src/demoTrack';

/** Traces one vehicle on one level: npx tsx scripts/vtrace.ts moto "Ring Road" [input] */
const v = vehicleById(process.argv[2]);
const name = process.argv[3] ?? 'Demo';
const input = Number(process.argv[4] ?? 0);
const t = new Track();
(name === 'Demo' ? { build: buildDemoTrack } : LEVELS.find((l) => l.name === name)!).build(t);
const sim = new Simulation(t, v);
for (let f = 0; f < 1200; f++) sim.setInput(f, input);
let wasCrashed = false;
for (let f = 0; f < 1200; f++) {
  sim.seek(f);
  const r = sim.rider;
  const b = r.pos[P.butt];
  const sp = b.distanceTo(r.prev[P.butt]) * 40;
  if (f % 10 === 0 || (r.crashed && !wasCrashed)) console.log(`f${f} butt ${b.x.toFixed(1)},${b.y.toFixed(1)},${b.z.toFixed(1)} v${sp.toFixed(1)} contact ${r.contact.map((c) => (c ? 1 : 0)).join('')}${r.crashed ? ' CRASH ' + r.crashReason : ''}`);
  if (r.crashed && !wasCrashed) break;
  wasCrashed = r.crashed;
}
