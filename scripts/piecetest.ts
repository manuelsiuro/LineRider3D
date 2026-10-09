import * as THREE from 'three';
import { Track } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { RunStats } from '../src/game/RunStats';
import { VEHICLES } from '../src/physics/vehicles';
import { P } from '../src/physics/Rider';
import { profilePiece, pathPiece, type PathPiece, type PieceSize, type ProfilePiece } from '../src/editor/pieces';
import { check } from './assert';

/**
 * Build-tool pieces: chains of them must join without kinks, and every ride must get
 * from the start to the finish on them with no input.
 */
const N = new THREE.Vector3(0, 0, 1);
const U = new THREE.Vector3(1, 0, 0);
const deg = (r: number) => (r * 180) / Math.PI;

function buildProfile(t: Track, chain: [ProfilePiece, PieceSize][]) {
  t.clear();
  const start = new THREE.Vector3(0, 45, 0);
  t.setStart(start);
  let origin = start.clone().add(new THREE.Vector3(0, -1.2, 0));
  let heading = THREE.MathUtils.degToRad(-15);
  // A joint may turn no more than the sharpest step inside the pieces (chords on arcs turn too).
  let maxKink = 0;
  let maxStep = 0;
  let prevTan: THREE.Vector3 | null = null;
  for (const [kind, size] of chain) {
    const r = profilePiece(kind, size, { origin, u: U, normal: N, heading, width: 2.4 });
    const first = r.strokes[0];
    const inTan = first[1].clone().sub(first[0]).normalize();
    if (prevTan) maxKink = Math.max(maxKink, deg(inTan.angleTo(prevTan)));
    for (const pts of r.strokes)
      for (let i = 2; i < pts.length; i++) maxStep = Math.max(maxStep, deg(pts[i].clone().sub(pts[i - 1]).angleTo(pts[i - 1].clone().sub(pts[i - 2]))));
    for (const pts of r.strokes) t.addStroke({ type: 'normal', mode: 'profile', points: pts, planeNormal: N.clone(), bank: 0, width: 2.4 });
    if (r.finish) t.setFinish({ position: r.finish.position, axis: r.finish.axis, halfWidth: 2.1 });
    const last = r.strokes[r.strokes.length - 1];
    prevTan = last[last.length - 1].clone().sub(last[last.length - 2]).normalize();
    origin = r.end;
    heading = Math.atan2(r.tangent.y, r.tangent.dot(U));
  }
  return maxKink - maxStep;
}

function buildPath(t: Track, chain: PathPiece[]) {
  t.clear();
  const start = new THREE.Vector3(0, 60, 0);
  t.setStart(start);
  let origin = start.clone().add(new THREE.Vector3(0, -1.2, 0));
  let dir = new THREE.Vector3(1, 0, 0);
  for (const kind of chain) {
    const r = pathPiece(kind, 'M', origin, dir, 12);
    // As the Build tool lays them: a bobsled run, held in by its walls.
    for (const pts of r.strokes) t.addStroke({ type: 'normal', mode: 'path', points: pts, planeNormal: new THREE.Vector3(0, 1, 0), bank: 0, autoBank: false, walls: true, width: 4 });
    origin = r.end;
    dir = r.tangent;
  }
  const end = origin;
  t.setFinish({ position: end.clone().add(new THREE.Vector3(0, 1.2, 0)).addScaledVector(dir.clone().setY(0).normalize(), -2), axis: dir.clone().setY(0).normalize(), halfWidth: 3 });
}

/** Loops need a ride that stays seated upside down: the sled and the coffin fall out. */
const LOOPERS = new Set(['skis', 'snowboard', 'bike', 'moto', 'buggy']);

function ride(t: Track, only?: Set<string>) {
  const out: string[] = [];
  let allOk = true;
  for (const v of VEHICLES) {
    if (only && !only.has(v.id)) continue;
    const sim = new Simulation(t, v);
    const stats = new RunStats();
    let f = 0;
    for (; f <= 2400; f++) {
      sim.seek(f);
      stats.advance(sim, f, 40);
      const s = stats.stats;
      if (!Number.isFinite(sim.rider.pos[P.butt].x)) break;
      if ((s.finished && f > s.finishTime * 40 + 20) || s.crashed || (s.still > 1.5 && f > 80)) break;
    }
    const s = stats.stats;
    const ok = s.finished && !s.crashed;
    if (!ok) allOk = false;
    out.push(`${v.id}:${ok ? 'ok' : s.crashed ? `X@${(f / 40).toFixed(1)}` : 'stop'}`);
  }
  return { allOk, line: out.join(' ') };
}

const t = new Track();
const chains: [string, [ProfilePiece, PieceSize][]][] = [
  ['rolling', [['slope', 'M'], ['dip', 'M'], ['straight', 'S'], ['bump', 'M'], ['slope', 'L'], ['finish', 'M']]],
  ['steep', [['slope', 'M'], ['drop', 'M'], ['straight', 'M'], ['dip', 'L'], ['finish', 'M']]],
  ['jump', [['slope', 'M'], ['drop', 'M'], ['gap', 'M'], ['slope', 'S'], ['finish', 'M']]],
  ['loop', [['slope', 'M'], ['drop', 'L'], ['loop', 'M'], ['slope', 'S'], ['finish', 'M']]],
  ['small', [['slope', 'S'], ['dip', 'S'], ['kicker', 'S'], ['slope', 'S'], ['bump', 'S'], ['finish', 'S']]],
];
for (const [name, chain] of chains) {
  const kink = buildProfile(t, chain);
  check(kink < 0.5, `${name}: joints should be as smooth as the pieces (${kink.toFixed(2)}° over)`);
  const r = ride(t, name === 'loop' ? LOOPERS : undefined);
  check(r.allOk, `${name}: every ride should finish`);
  console.log(name.padEnd(8), kink < 0.5 ? 'smooth' : 'KINK', r.line);
}
buildPath(t, ['straight', 'left45', 'right90', 'sbend', 'straight']);
const r = ride(t);
check(r.allOk, 'path: every ride should finish');
console.log('path'.padEnd(8), r.line);
