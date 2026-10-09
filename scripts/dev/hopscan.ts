import * as THREE from 'three';
import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { INPUT, P } from '../../src/physics/Rider';
import { HAZARD_KINDS } from '../../src/physics/hazards';
import { VEHICLES } from '../../src/physics/vehicles';
import type { HazardKind } from '../../src/track/types';

/**
 * Which hazards a jump clears: a gentle slope with one hazard on it; tries a full-charge
 * jump let go at every step and reports the timing window (in steps) that gets past clean.
 */
const slope = (x: number) => Math.max(4, 22 - x * 0.25);
function windowFor(kind: HazardKind, scale: number, vehicle = VEHICLES[0]) {
  const t = new Track();
  const points: THREE.Vector3[] = [];
  for (let x = -2; x <= 110; x += 0.5) points.push(new THREE.Vector3(x, slope(x), 0));
  t.addStroke({ type: 'normal', mode: 'profile', points, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
  t.setStart(new THREE.Vector3(0, 22.8, 0));
  const hx = 40;
  t.addHazard({ kind, position: new THREE.Vector3(hx, slope(hx), 0), rotation: 0, scale });
  const ok: number[] = [];
  for (let f = 40; f < 160; f++) {
    const sim = new Simulation(t, vehicle);
    for (let k = f - 24; k < f; k++) sim.setInput(k, INPUT.jump);
    let clean = false;
    for (let g = 0; g < 400; g++) {
      sim.seek(g);
      if (sim.rider.crashed) break;
      if (sim.rider.pos[P.butt].x > hx + 12) {
        clean = true;
        break;
      }
    }
    if (clean) ok.push(f);
  }
  return ok.length ? `${ok.length} steps (${ok[0]}–${ok[ok.length - 1]})` : 'never';
}
const kinds = process.argv[2] ? [process.argv[2] as HazardKind] : HAZARD_KINDS;
for (const kind of kinds) for (const scale of [0.6, 1]) console.log(kind.padEnd(8), `×${scale}`, windowFor(kind, scale));
