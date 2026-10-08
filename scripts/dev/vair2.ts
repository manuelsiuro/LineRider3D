import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { LEVELS } from '../../src/levels/levels';
import { vehicleById } from '../../src/physics/vehicles';

/** Takeoffs and airtimes of a classic run: npx tsx scripts/vair2.ts "Pump Track" */
const level = LEVELS.find((l) => l.name === process.argv[2])!;
const t = new Track();
level.build(t);
const sim = new Simulation(t, vehicleById(process.argv[3] ?? level.vehicle));
let air = 0;
let from = 0;
for (let f = 0; f < 800; f++) {
  sim.seek(f);
  const a = !sim.rider.contact.some((c) => c);
  if (a && air === 0) from = f;
  if (a) air++;
  else if (air > 0) {
    if (air > 4) console.log(`takeoff f${from} x${sim.rider.pos[6].x.toFixed(0)} air ${(air / 40).toFixed(2)}s`);
    air = 0;
  }
  if (sim.rider.crashed) break;
}
