import * as THREE from 'three';
import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { VEHICLES } from '../../src/physics/vehicles';
import { P } from '../../src/physics/Rider';
import { profilePiece, type PieceSize, type ProfilePiece } from '../../src/editor/pieces';
/** Flight off the gap piece's lip, per ride (no landing): x, y relative to the lip. */
const N = new THREE.Vector3(0, 0, 1), U = new THREE.Vector3(1, 0, 0);
const chain = JSON.parse(process.argv[2] ?? '[["slope","M"],["drop","M"],["gap","M"]]') as [ProfilePiece, PieceSize][];
const t = new Track(); t.setStart(new THREE.Vector3(0, 45, 0));
let origin = new THREE.Vector3(0, 43.8, 0), heading = -15 * Math.PI / 180;
let lip = new THREE.Vector3();
for (const [k, s] of chain) {
  const r = profilePiece(k, s, { origin, u: U, normal: N, heading, width: 2.4 });
  const pts = r.strokes[0];
  t.addStroke({ type: 'normal', mode: 'profile', points: pts, planeNormal: N.clone(), bank: 0, width: 2.4 });
  lip = pts.at(-1)!.clone();
  if (r.strokes.length > 1) break;
  origin = r.end; heading = Math.atan2(r.tangent.y, r.tangent.dot(U));
}
for (const v of VEHICLES) {
  const sim = new Simulation(t, v); const row: string[] = [];
  let next = 0;
  for (let f = 0; f < 600; f++) {
    sim.seek(f); const b = sim.rider.pos[P.butt];
    const dx = b.x - lip.x;
    if (dx >= next) { row.push(`${next}:${(b.y - lip.y).toFixed(1)}`); next += 4; }
    if (b.y < lip.y - 26 || next > 40) break;
  }
  console.log(v.id.padEnd(9), row.join(' '));
}
