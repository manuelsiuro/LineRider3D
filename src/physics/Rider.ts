import * as THREE from 'three';
import type { Segment } from '../track/types';
import type { Track } from '../track/Track';
import { terrainHeight } from '../world/terrain';

/**
 * Bosh, the rider: a Verlet ragdoll on a sled, adapted from classic Line Rider
 * to 3D. Units follow the original scaled by 0.1 (sled ≈ 1.75 long).
 */

export const GRAVITY = new THREE.Vector3(0, -0.0175, 0);
const ITERATIONS = 6;
const HIT_DEPTH = 1.0;
const SEG_EXT = 0.05;
const ACCEL = 0.012;
const BREAK_STRAIN = 0.3;
const RUNNER_GRIP = 0.25;
const GROUND_FRICTION = 0.04;
/** Bouncy lines return this much of the impact speed... */
const RESTITUTION = 0.9;
/** ...and always give at least this little hop. */
const MIN_BOUNCE = 0.06;
/** Velocity added (per step) when passing through a boost ring. */
const RING_BOOST = 0.22;

/** One-off events of a step, for sound and effects. */
export const EVENT = { ring: 1, bounce: 2 } as const;

export const P = {
  tailL: 0,
  tailR: 1,
  noseL: 2,
  noseR: 3,
  peg: 4,
  string: 5,
  butt: 6,
  shoulder: 7,
  lHand: 8,
  rHand: 9,
  lFoot: 10,
  rFoot: 11,
} as const;

interface PointDef {
  pos: [number, number, number];
  friction: number;
  runner?: boolean;
}

const POINTS: PointDef[] = [
  { pos: [0, -0.5, -0.25], friction: 0, runner: true },
  { pos: [0, -0.5, 0.25], friction: 0, runner: true },
  { pos: [1.5, -0.5, -0.25], friction: 0 },
  { pos: [1.5, -0.5, 0.25], friction: 0 },
  { pos: [0, 0, 0], friction: 0.8 },
  { pos: [1.75, 0, 0], friction: 0 },
  { pos: [0.5, 0, 0], friction: 0.8 },
  { pos: [0.5, 0.55, 0], friction: 0.8 },
  { pos: [1.15, 0.5, -0.15], friction: 0.1 },
  { pos: [1.15, 0.5, 0.15], friction: 0.1 },
  { pos: [1.0, -0.35, -0.15], friction: 0 },
  { pos: [1.0, -0.35, 0.15], friction: 0 },
];

type BoneKind = 'rigid' | 'mount' | 'repel';

interface Bone {
  a: number;
  b: number;
  rest: number;
  kind: BoneKind;
}

function defineBones(): Bone[] {
  const bones: Bone[] = [];
  const add = (a: number, b: number, kind: BoneKind, restScale = 1) => {
    const pa = new THREE.Vector3(...POINTS[a].pos);
    const pb = new THREE.Vector3(...POINTS[b].pos);
    bones.push({ a, b, kind, rest: pa.distanceTo(pb) * restScale });
  };
  // Sled: fully braced rigid body.
  const sled = [P.tailL, P.tailR, P.noseL, P.noseR, P.peg, P.string];
  for (let i = 0; i < sled.length; i++)
    for (let j = i + 1; j < sled.length; j++) add(sled[i], sled[j], 'rigid');
  // Body.
  add(P.butt, P.shoulder, 'rigid');
  add(P.shoulder, P.lHand, 'rigid');
  add(P.shoulder, P.rHand, 'rigid');
  add(P.butt, P.lFoot, 'rigid');
  add(P.butt, P.rFoot, 'rigid');
  // Attachments to the sled: these break on hard impacts.
  for (const s of [P.peg, P.tailL, P.tailR, P.noseL, P.noseR]) add(P.butt, s, 'mount');
  add(P.shoulder, P.peg, 'mount');
  add(P.shoulder, P.noseL, 'mount');
  add(P.shoulder, P.noseR, 'mount');
  add(P.lHand, P.string, 'mount');
  add(P.rHand, P.string, 'mount');
  add(P.lFoot, P.noseL, 'mount');
  add(P.rFoot, P.noseR, 'mount');
  // Keep feet from folding into the chest.
  add(P.shoulder, P.lFoot, 'repel', 0.5);
  add(P.shoulder, P.rFoot, 'repel', 0.5);
  return bones;
}

const BONES = defineBones();

/**
 * Same bones with left/right swapped. Gauss-Seidel relaxation is order
 * dependent, so alternating both orders keeps the ragdoll symmetric and stops
 * it from drifting sideways.
 */
const MIRROR: Record<number, number> = {
  [P.tailL]: P.tailR,
  [P.tailR]: P.tailL,
  [P.noseL]: P.noseR,
  [P.noseR]: P.noseL,
  [P.lHand]: P.rHand,
  [P.rHand]: P.lHand,
  [P.lFoot]: P.rFoot,
  [P.rFoot]: P.lFoot,
};
const mirror = (i: number) => MIRROR[i] ?? i;
const BONES_MIRRORED = BONES.map((b) => ({ ...b, a: mirror(b.a), b: mirror(b.b) }));
export const POINT_COUNT = POINTS.length;

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const vel = new THREE.Vector3();

export class Rider {
  pos: THREE.Vector3[] = POINTS.map(() => new THREE.Vector3());
  prev: THREE.Vector3[] = POINTS.map(() => new THREE.Vector3());
  crashed = false;
  /** EVENT bitmask of the last step. */
  events = 0;
  /** Contact flags of the last step (for effects). */
  contact: boolean[] = POINTS.map(() => false);

  private nearby = new Set<Segment>();

  reset(start: THREE.Vector3, yaw: number, speed = 0.04) {
    const rot = new THREE.Matrix4().makeRotationY(yaw);
    const forward = new THREE.Vector3(1, 0, 0).applyMatrix4(rot);
    POINTS.forEach((def, i) => {
      this.pos[i].set(...def.pos).applyMatrix4(rot).add(start);
      this.prev[i].copy(this.pos[i]).addScaledVector(forward, -speed);
    });
    this.crashed = false;
  }

  private ringRef = new THREE.Vector3();
  /** Strongest bouncy-line hit of this step, applied to the whole rider. */
  private bounce: { up: THREE.Vector3; speed: number } | null = null;

  step(track: Track) {
    this.ringRef.copy(this.pos[P.butt]);
    this.bounce = null;
    this.events = 0;
    // Integrate.
    for (let i = 0; i < POINT_COUNT; i++) {
      const p = this.pos[i];
      vel.subVectors(p, this.prev[i]);
      this.prev[i].copy(p);
      p.add(vel).add(GRAVITY);
      this.contact[i] = false;
    }

    for (let it = 0; it < ITERATIONS; it++) {
      this.satisfyBones(it % 2 === 0 ? BONES : BONES_MIRRORED, it === 0);
      this.collide(track);
    }
    this.applyBounce();
    this.passRings(track, this.ringRef, this.pos[P.butt]);
  }

  /**
   * Bouncy lines launch the whole rider at once (like a trampoline); bouncing
   * only the contact points would rip Bosh off his sled.
   */
  private applyBounce() {
    if (!this.bounce) return;
    const { up, speed } = this.bounce;
    let avg = 0;
    for (let i = 0; i < POINT_COUNT; i++) avg += tmp.subVectors(this.pos[i], this.prev[i]).dot(up);
    avg /= POINT_COUNT;
    const delta = speed - avg;
    if (delta <= 0) return;
    if (delta > 0.08) this.events |= EVENT.bounce;
    for (let i = 0; i < POINT_COUNT; i++) this.prev[i].addScaledVector(up, -delta);
  }

  /** Boosts the rider when the body crosses a ring's plane inside its radius. */
  private passRings(track: Track, from: THREE.Vector3, to: THREE.Vector3) {
    for (const ring of track.rings.values()) {
      const d0 = tmp.subVectors(from, ring.position).dot(ring.axis);
      const d1 = tmp.subVectors(to, ring.position).dot(ring.axis);
      if (d0 === d1 || Math.sign(d0) === Math.sign(d1)) continue;
      // Where the path crosses the ring plane.
      const t = d0 / (d0 - d1);
      const hit = tmp.lerpVectors(from, to, t).sub(ring.position);
      hit.addScaledVector(ring.axis, -hit.dot(ring.axis));
      if (hit.length() > ring.radius) continue;
      // Push along the axis, in the direction the rider is travelling.
      const dir = d1 > d0 ? 1 : -1;
      this.events |= EVENT.ring;
      for (let i = 0; i < POINT_COUNT; i++) this.prev[i].addScaledVector(ring.axis, -dir * RING_BOOST);
    }
  }

  private satisfyBones(bones: Bone[], checkBreak: boolean) {
    for (const bone of bones) {
      if (bone.kind === 'mount' && this.crashed) continue;
      const pa = this.pos[bone.a];
      const pb = this.pos[bone.b];
      tmp.subVectors(pb, pa);
      const dist = tmp.length();
      if (dist < 1e-9) continue;
      if (bone.kind === 'repel' && dist >= bone.rest) continue;
      const diff = (dist - bone.rest) / dist;
      if (bone.kind === 'mount' && checkBreak && Math.abs(dist - bone.rest) / bone.rest > BREAK_STRAIN) {
        this.crashed = true;
        continue;
      }
      tmp.multiplyScalar(diff * 0.5);
      pa.add(tmp);
      pb.sub(tmp);
    }
  }

  /** Lateral axis of the sled, used for runner grip. */
  private sledSide(out: THREE.Vector3) {
    return out.subVectors(this.pos[P.tailR], this.pos[P.tailL]).normalize();
  }

  private collide(track: Track) {
    const side = this.sledSide(tmp2.clone());
    for (let i = 0; i < POINT_COUNT; i++) {
      const p = this.pos[i];
      const def = POINTS[i];
      this.nearby.clear();
      track.querySegments(p, this.nearby);
      for (const seg of this.nearby) {
        tmp.subVectors(p, seg.a);
        const d = tmp.dot(seg.up);
        if (d >= 0 || d < -HIT_DEPTH) continue;
        const t = tmp.dot(seg.dir);
        if (t < -SEG_EXT || t > seg.len + SEG_EXT) continue;
        const s = tmp.dot(seg.side);
        if (s < -seg.halfWidth || s > seg.halfWidth) continue;
        vel.subVectors(p, this.prev[i]);
        const incoming = vel.dot(seg.up);
        if (incoming > 0) continue; // moving away: let it pass
        const type = seg.stroke.type;

        // Push out of the surface.
        p.addScaledVector(seg.up, -d);
        this.contact[i] = true;

        vel.subVectors(p, this.prev[i]);
        const vn = vel.dot(seg.up);
        const vt = vel.addScaledVector(seg.up, -vn);
        // Friction proportional to penetration (normal force). Ice has none.
        if (def.friction > 0 && type !== 'ice') {
          const speed = vt.length();
          if (speed > 1e-9) vt.multiplyScalar(Math.max(0, 1 - (def.friction * -d) / speed));
        }
        // Sled runners resist sliding sideways (rear only, so the sled self-aligns).
        if (def.runner && !this.crashed && type !== 'ice') {
          const lat = tmp.copy(side).addScaledVector(seg.up, -side.dot(seg.up));
          if (lat.lengthSq() > 1e-6) {
            lat.normalize();
            vt.addScaledVector(lat, -vt.dot(lat) * RUNNER_GRIP);
          }
        }
        if (type === 'accel') vt.addScaledVector(seg.dir, ACCEL);
        if (type === 'bouncy') {
          const speed = Math.max(-incoming * RESTITUTION, MIN_BOUNCE);
          if (!this.bounce || speed > this.bounce.speed) this.bounce = { up: seg.up, speed };
        }
        this.prev[i].copy(p).sub(vt).addScaledVector(seg.up, -vn);
      }

      // Snowy ground.
      const ground = terrainHeight(p.x, p.z);
      if (p.y < ground) {
        p.y = ground;
        this.contact[i] = true;
        vel.subVectors(p, this.prev[i]);
        vel.y = 0;
        vel.multiplyScalar(1 - GROUND_FRICTION);
        this.prev[i].set(p.x - vel.x, p.y, p.z - vel.z);
      }
    }
  }

  center(out: THREE.Vector3) {
    return out.copy(this.pos[P.butt]);
  }

  velocity(out: THREE.Vector3) {
    return out.subVectors(this.pos[P.butt], this.prev[P.butt]);
  }

  writeState(buf: Float64Array) {
    for (let i = 0; i < POINT_COUNT; i++) {
      this.pos[i].toArray(buf, i * 6);
      this.prev[i].toArray(buf, i * 6 + 3);
    }
    buf[POINT_COUNT * 6] = this.crashed ? 1 : 0;
    let mask = 0;
    for (let i = 0; i < POINT_COUNT; i++) if (this.contact[i]) mask |= 1 << i;
    buf[POINT_COUNT * 6 + 1] = mask;
    buf[POINT_COUNT * 6 + 2] = this.events;
  }

  readState(buf: Float64Array) {
    for (let i = 0; i < POINT_COUNT; i++) {
      this.pos[i].fromArray(buf, i * 6);
      this.prev[i].fromArray(buf, i * 6 + 3);
    }
    this.crashed = buf[POINT_COUNT * 6] === 1;
    const mask = buf[POINT_COUNT * 6 + 1];
    for (let i = 0; i < POINT_COUNT; i++) this.contact[i] = (mask & (1 << i)) !== 0;
    this.events = buf[POINT_COUNT * 6 + 2];
  }
}

export const STATE_SIZE = POINT_COUNT * 6 + 3;
