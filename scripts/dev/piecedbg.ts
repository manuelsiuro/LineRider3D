import * as THREE from 'three';
import { Track } from '../../src/track/Track';
import { Simulation } from '../../src/physics/Simulation';
import { RunStats } from '../../src/game/RunStats';
import { VEHICLES } from '../../src/physics/vehicles';
import { P } from '../../src/physics/Rider';
import { profilePiece, type PieceSize, type ProfilePiece } from '../../src/editor/pieces';
const N = new THREE.Vector3(0, 0, 1), U = new THREE.Vector3(1, 0, 0);
const chain = JSON.parse(process.argv[2]) as [ProfilePiece, PieceSize][];
const t = new Track(); t.setStart(new THREE.Vector3(0, 45, 0));
let origin = new THREE.Vector3(0, 43.8, 0), heading = -15 * Math.PI / 180;
for (const [k, s] of chain) {
  const r = profilePiece(k, s, { origin, u: U, normal: N, heading, width: 2.4 });
  for (const pts of r.strokes) { t.addStroke({ type: 'normal', mode: 'profile', points: pts, planeNormal: N.clone(), bank: 0, width: 2.4 }); console.log(k, 'from', pts[0].toArray().map(v=>v.toFixed(1)).join(','), 'to', pts.at(-1)!.toArray().map(v=>v.toFixed(1)).join(','), 'minY', Math.min(...pts.map(p=>p.y)).toFixed(1)); }
  if (r.finish) t.setFinish({ position: r.finish.position, axis: r.finish.axis, halfWidth: 2.1 });
  origin = r.end; heading = Math.atan2(r.tangent.y, r.tangent.dot(U));
}
const v = VEHICLES.find(v => v.id === (process.argv[3] ?? 'sled'))!;
const sim = new Simulation(t, v); const st = new RunStats();
for (let f = 0; f <= 1200; f++) { sim.seek(f); st.advance(sim, f, 40); const b = sim.rider.pos[P.butt]; if (f % 5 === 0 || st.stats.crashed) console.log(f, b.toArray().map(x => x.toFixed(1)).join(','), st.stats.crashed ? 'CRASH ' + sim.rider.crashReason : '', st.stats.finished ? 'FIN' : ''); if (st.stats.crashed || st.stats.finished) break; }
