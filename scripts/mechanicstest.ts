import * as THREE from 'three';
import { Track, validateTrack } from '../src/track/Track';
import { Simulation } from '../src/physics/Simulation';
import { CRUMBLE_HOLD, INPUT, P } from '../src/physics/Rider';
import { buildTemplate } from '../src/editor/templates';
import { RunStats } from '../src/game/RunStats';
import { check } from './assert';
import type { LineType } from '../src/track/types';

/** Checkpoints, hazards, mud, crumbling lines and low gravity. */

function line(track: Track, type: LineType, x0: number, x1: number, fn: (x: number) => number) {
  const points: THREE.Vector3[] = [];
  for (let x = x0; x <= x1 + 1e-6; x += 0.5) points.push(new THREE.Vector3(x, fn(x), 0));
  return track.addStroke({ type, mode: 'profile', points, planeNormal: new THREE.Vector3(0, 0, 1), bank: 0, width: 2.4 });
}

const slope = (x: number) => Math.max(2, 30 - x * 0.36);
const speed = (sim: Simulation) => sim.rider.velocity(new THREE.Vector3()).length() * 40;
const x = (sim: Simulation) => sim.rider.pos[P.butt].x;

// Mud: the same slope, the middle third muddy.
{
  const plain = new Track();
  line(plain, 'normal', -2, 120, slope);
  plain.setStart(new THREE.Vector3(0, 30.8, 0));
  const muddy = new Track();
  line(muddy, 'normal', -2, 30, slope);
  line(muddy, 'mud', 30, 60, slope);
  line(muddy, 'normal', 60, 120, slope);
  muddy.setStart(new THREE.Vector3(0, 30.8, 0));
  const a = new Simulation(plain);
  const b = new Simulation(muddy);
  a.seek(160);
  b.seek(160);
  console.log(`mud      plain x${x(a).toFixed(1)} v${speed(a).toFixed(1)} | muddy x${x(b).toFixed(1)} v${speed(b).toFixed(1)}${b.rider.crashed ? ' X' : ''}`);
  check(!b.rider.crashed, 'mud: the rider stays on');
  check(speed(b) < speed(a) * 0.75, `mud slows the rider (${speed(b).toFixed(1)} vs ${speed(a).toFixed(1)})`);
}

// Crumble: a flat crumbling bridge over a drop. Ride it fast: fine; stop on it: it falls.
{
  const t = new Track();
  line(t, 'normal', -2, 20, (x) => Math.max(10, 20 - x * 0.5));
  const bridge = line(t, 'crumble', 20, 30, () => 10);
  line(t, 'normal', 30, 60, () => 10);
  t.setStart(new THREE.Vector3(0, 20.8, 0));
  const sim = new Simulation(t);
  let touched = -1;
  let gone = -1;
  let across = '';
  for (let f = 0; f <= 200; f++) {
    sim.seek(f);
    const age = sim.rider.crumbleAge(bridge.id);
    if (age > 0 && touched < 0) touched = f;
    if (age > CRUMBLE_HOLD && gone < 0) gone = f;
    if (!across && x(sim) > 40) across = `x${x(sim).toFixed(1)} y${sim.rider.pos[P.butt].y.toFixed(1)}${sim.rider.crashed ? ' X' : ''}`;
  }
  console.log(`crumble  touched at ${touched}, gone at ${gone}, past the bridge ${across}`);
  check(touched > 0 && gone === touched + CRUMBLE_HOLD, 'crumble: falls away a fixed time after the first touch');
  check(across !== '' && !across.endsWith('X'), 'crumble: a fast rider makes it across');
  // Scrubbing back and forth gives the same states (the crumble timer is recorded).
  sim.seek(gone + 5);
  const before = sim.rider.pos[P.butt].clone();
  sim.seek(3);
  sim.seek(gone + 5);
  check(sim.rider.pos[P.butt].equals(before) && sim.rider.crumbleAge(bridge.id) === CRUMBLE_HOLD + 6, 'crumble: deterministic when scrubbing');
  // A slow rider (dropped onto the middle) falls through.
  const slow = new Track();
  const b2 = line(slow, 'crumble', 0, 30, () => 10);
  slow.setStart(new THREE.Vector3(10, 10.8, 0));
  const s2 = new Simulation(slow);
  s2.seek(120);
  console.log(`crumble  slow rider y${s2.rider.pos[P.butt].y.toFixed(1)} age ${s2.rider.crumbleAge(b2.id)}`);
  check(s2.rider.pos[P.butt].y < 5, 'crumble: a slow rider falls through');
}

// Hazard: a cactus on a flat run.
{
  const t = new Track();
  line(t, 'normal', -2, 80, (x) => Math.max(2, 12 - x * 0.5));
  t.setStart(new THREE.Vector3(0, 12.8, 0));
  t.addHazard({ kind: 'cactus', position: new THREE.Vector3(40, 2, 0), rotation: 0, scale: 1 });
  const sim = new Simulation(t);
  let crash = -1;
  for (let f = 0; f <= 200 && crash < 0; f++) {
    sim.seek(f);
    if (sim.rider.crashed) crash = f;
  }
  console.log(`hazard   crash at ${crash} x${x(sim).toFixed(1)} (${sim.rider.crashReason})`);
  check(crash > 0 && Math.abs(x(sim) - 40) < 3 && sim.rider.crashReason.startsWith('hazard'), 'hazard: touching the cactus is a crash');
  // Moved off to the side, it's harmless.
  t.removeHazard([...t.hazards.values()][0]);
  t.addHazard({ kind: 'cactus', position: new THREE.Vector3(40, 2, 3), rotation: 0, scale: 1 });
  const safe = new Simulation(t);
  safe.seek(200);
  check(!safe.rider.crashed, 'hazard: a near miss is clean');
}

// Checkpoint: a gap too wide to jump; after the crash the rider comes back to the gate.
{
  const t = new Track();
  line(t, 'normal', -2, 40, (x) => Math.max(8, 20 - x * 0.4));
  line(t, 'normal', 70, 120, () => 8);
  t.setStart(new THREE.Vector3(0, 20.8, 0));
  t.addCheckpoint({ position: new THREE.Vector3(24, 10.4, 0), axis: new THREE.Vector3(1, 0, 0), halfWidth: 2 });
  const sim = new Simulation(t);
  const stats = new RunStats();
  let crash = -1;
  let pass = -1;
  for (let f = 0; f <= 300 && crash < 0; f++) {
    sim.seek(f);
    stats.advance(sim, f, 40);
    if (sim.rider.checkpoint > 0 && pass < 0) pass = f;
    if (sim.rider.crashed) crash = f;
  }
  check(pass > 0 && crash > pass, `checkpoint: passed at ${pass}, crash at ${crash}`);
  const at = crash + 40;
  sim.seek(at);
  check(sim.canRespawn(at) && sim.respawn(at), 'checkpoint: can respawn after the crash');
  sim.seek(at + 1);
  stats.advance(sim, at + 1, 40);
  const back = sim.rider.pos[P.butt];
  console.log(`checkpt  passed ${pass} crash ${crash} respawn → x${back.x.toFixed(1)} y${back.y.toFixed(1)} respawns ${stats.stats.respawns}`);
  check(!sim.rider.crashed && Math.abs(back.x - 24) < 2, 'checkpoint: back at the gate, riding');
  check(stats.stats.respawns === 1 && sim.respawnsUpTo(at + 1) === 1, 'checkpoint: the comeback is counted');
  // Replaying from the start gives the same comeback.
  sim.seek(0);
  sim.seek(at + 20);
  const again = sim.rider.pos[P.butt].clone();
  sim.seek(at + 20);
  check(again.equals(sim.rider.pos[P.butt]) && !sim.rider.crashed, 'checkpoint: deterministic after the comeback');
}

// Low gravity: the same kicker flies much further on the Moon.
{
  const flight = (gravity: number) => {
    const t = new Track();
    line(t, 'normal', -2, 30, (x) => (x < 22 ? Math.max(10, 24 - x * 0.7) : 10 + (x - 22) * 0.6));
    t.setStart(new THREE.Vector3(0, 24.8, 0));
    const sim = new Simulation(t);
    sim.setGravity(gravity);
    let air = 0;
    for (let f = 0; f <= 600; f++) {
      sim.seek(f);
      if (x(sim) > 31 && !sim.rider.contact.some((c) => c)) air++;
      if (x(sim) > 31 && sim.rider.contact.some((c) => c)) break;
    }
    return air;
  };
  const earth = flight(1);
  const moon = flight(0.45);
  console.log(`gravity  airtime earth ${earth} steps, moon ${moon} steps`);
  check(moon > earth * 1.3, 'low gravity: longer flights');
}

// Round trip of checkpoints, hazards and the new lines through the save format.
{
  const t = new Track();
  line(t, 'mud', 0, 5, () => 1);
  line(t, 'crumble', 5, 10, () => 1);
  t.addCheckpoint({ position: new THREE.Vector3(1, 2, 3), axis: new THREE.Vector3(1, 0, 0), halfWidth: 2 });
  t.addHazard({ kind: 'lava', position: new THREE.Vector3(4, 5, 6), rotation: 0.5, scale: 1.2 });
  const data = validateTrack(JSON.parse(JSON.stringify(t.serialize())));
  const u = new Track();
  u.load(data);
  const types = [...u.strokes.values()].map((s) => s.type).join(',');
  console.log(`format   ${types} checkpoints ${u.checkpoints.size} hazards ${[...u.hazards.values()].map((h) => h.kind)}`);
  check(types === 'mud,crumble' && u.checkpoints.size === 1 && u.hazards.size === 1, 'format: round trip');
  // Old tracks have none of them.
  const old = validateTrack({ version: 1, start: [0, 12, 0], strokes: [], decor: [] });
  check(!('checkpoints' in old) && !('hazards' in old), 'format: old tracks unchanged');
}

// Jump: a well-timed hop clears a cactus on the track; holding the key hops only once.
{
  const t = new Track();
  line(t, 'normal', -2, 110, (x) => Math.max(4, 22 - x * 0.25));
  t.setStart(new THREE.Vector3(0, 22.8, 0));
  t.addHazard({ kind: 'cactus', position: new THREE.Vector3(40, 12, 0), rotation: 0, scale: 1 });
  const clears = (from: number, frames: number) => {
    const sim = new Simulation(t);
    for (let k = from; k < from + frames; k++) sim.setInput(k, INPUT.jump);
    for (let g = 0; g < 400; g++) {
      sim.seek(g);
      if (sim.rider.crashed) return false;
      if (x(sim) > 52) return true;
    }
    return false;
  };
  const window: number[] = [];
  for (let f = 60; f < 160; f++) if (clears(f, 4)) window.push(f);
  console.log(`jump     cactus cleared pressing at steps ${window[0]}–${window[window.length - 1]} (${window.length})`);
  check(!clears(0, 0), 'jump: riding straight into the cactus is a crash');
  check(window.length >= 8, 'jump: a fair timing window over a cactus');
  // Held from the start: one hop, then the key must be let go.
  const sim = new Simulation(t);
  for (let k = 0; k < 400; k++) sim.setInput(k, INPUT.jump);
  // A hop shows as the body rising off the slope (it only ever drops while riding it).
  let hops = 0;
  let rising = false;
  for (let g = 1; g < 160; g++) {
    sim.seek(g);
    const up = sim.rider.velocity(new THREE.Vector3()).y > 0.05;
    if (up && !rising) hops++;
    rising = up;
  }
  check(hops === 1, `jump: holding the key hops once (${hops})`);
}

// Gap jump piece: a hazard in its pit stays under the flight.
{
  const t = new Track();
  buildTemplate(t, 'jumps');
  const pit = [...t.strokes.values()].find((s) => s.points.every((p) => Math.abs(p.y - s.points[0].y) < 1e-6) && s.points.length < 20)!;
  const mid = pit.points[Math.floor(pit.points.length / 2)];
  t.addHazard({ kind: 'urchin', position: mid.clone(), rotation: 0, scale: 1 });
  const sim = new Simulation(t);
  let end = '';
  for (let f = 0; f < 900 && !end; f++) {
    sim.seek(f);
    if (sim.rider.crashed) end = 'crash';
    else if (sim.rider.finished) end = 'finish';
  }
  console.log(`gap pit  urchin in the pit at x${mid.x.toFixed(1)}: ${end}`);
  check(end === 'finish', 'gap pit: the jump clears a hazard in the pit');
}
