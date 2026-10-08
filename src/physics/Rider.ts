import * as THREE from 'three';
import type { Segment } from '../track/types';
import type { Track } from '../track/Track';
import { terrainHeight } from '../world/terrain';
import { P, SLED, type Bone, type VehicleDef } from './vehicles';

/**
 * Bosh, the rider: a Verlet ragdoll on his ride (sled, skis, bike...), adapted
 * from classic Line Rider to 3D. Units follow the original scaled by 0.1
 * (sled ≈ 1.75 long). The vehicle shapes live in vehicles.ts.
 */

export const GRAVITY = new THREE.Vector3(0, -0.0175, 0);
const ITERATIONS = 6;
const HIT_DEPTH = 1.0;
const SEG_EXT = 0.05;
const ACCEL = 0.012;
const GROUND_FRICTION = 0.04;
/** Most speed the snow can take away in one step (units/step). */
const SNOW_MAX_DRAG = 0.006;
/** Bouncy lines return this much of the impact speed... */
const RESTITUTION = 0.9;
/** ...and always give at least this little hop. */
const MIN_BOUNCE = 0.06;
/** Velocity added (per step) when passing through a boost ring. */
const RING_BOOST = 0.22;

/** Player input bits for one step (rider mode). */
export const INPUT = { push: 1, brake: 2, spin: 4 } as const;

/** One-off events of a step, for sound and effects. */
export const EVENT = { ring: 1, bounce: 2, star: 4, finish: 8 } as const;

/** Max number of stars per track (one bit each in the recorded state). */
export const MAX_STARS = 48;
const STAR_RADIUS = 2.5;

export { P };

/**
 * Recorded state layout: 6 numbers per point (position, previous position),
 * then these fields at `points * 6 + offset`.
 */
export const META = { crashed: 0, contact: 1, events: 2, spin: 3, stars: 4, finished: 5, yaw: 6 } as const;
export const META_SIZE = 7;
export const stateSize = (def: VehicleDef) => def.points.length * 6 + META_SIZE;

/**
 * The same bones with left/right swapped. Gauss-Seidel relaxation is order
 * dependent, so alternating both orders keeps the ragdoll symmetric and stops
 * it from drifting sideways.
 */
const mirroredBones = new WeakMap<VehicleDef, Bone[]>();
function bonesMirrored(def: VehicleDef): Bone[] {
  let out = mirroredBones.get(def);
  if (!out) {
    const m = (i: number) => def.mirror[i] ?? i;
    out = def.bones.map((b) => ({ ...b, a: m(b.a), b: m(b.b) }));
    mirroredBones.set(def, out);
  }
  return out;
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const vel = new THREE.Vector3();
// Scratch objects for spins and assists, so stepping allocates nothing.
const sFwd = new THREE.Vector3();
const sLat = new THREE.Vector3();
const sUp = new THREE.Vector3();
const sN = new THREE.Vector3();
const sD = new THREE.Vector3();
const sV = new THREE.Vector3();
const sSide = new THREE.Vector3();
const sCross = new THREE.Vector3();
const sPrevFwd = new THREE.Vector3();
const sC = new THREE.Vector3();
const qA = new THREE.Quaternion();
const qB = new THREE.Quaternion();

export class Rider {
  readonly pos: THREE.Vector3[];
  readonly prev: THREE.Vector3[];
  crashed = false;
  /** Why the last crash happened (debugging aid, not part of the state). */
  crashReason = '';
  /** EVENT bitmask of the last step. */
  events = 0;
  /** Contact flags of the last step (for effects). */
  readonly contact: boolean[];
  readonly count: number;

  private nearby = new Set<Segment>();
  private bonesMirrored: Bone[];
  private scratch: THREE.Vector3[];
  private original: THREE.Vector3[];

  /** Ground drag multiplier of the world's surface (snow = 1). */
  groundDrag = 1;

  constructor(readonly def: VehicleDef = SLED) {
    this.count = def.points.length;
    const vecs = () => def.points.map(() => new THREE.Vector3());
    this.pos = vecs();
    this.prev = vecs();
    this.scratch = vecs();
    this.original = vecs();
    this.contact = def.points.map(() => false);
    this.bonesMirrored = bonesMirrored(def);
  }

  get stateSize() {
    return this.count * 6 + META_SIZE;
  }

  reset(start: THREE.Vector3, yaw: number, speed = 0.04) {
    const rot = new THREE.Matrix4().makeRotationY(yaw);
    const forward = new THREE.Vector3(1, 0, 0).applyMatrix4(rot);
    this.def.points.forEach((def, i) => {
      this.pos[i].set(...def.pos).applyMatrix4(rot).add(start);
      this.prev[i].copy(this.pos[i]).addScaledVector(forward, -speed);
    });
    this.crashed = false;
    this.spin = 0;
    this.yawSpin = 0;
    this.stars = 0;
    this.finished = false;
  }

  private ringRef = new THREE.Vector3();
  /** Strongest bouncy-line hit of this step, applied to the whole rider. */
  private bounce: { up: THREE.Vector3; speed: number } | null = null;

  /** Player-driven flip spin (rad/step) while airborne. */
  spin = 0;
  /** Player-driven flat spin (rad/step) while airborne. */
  yawSpin = 0;
  /** Bit mask of collected stars (by Track.starList order). */
  stars = 0;
  finished = false;

  step(track: Track, input = 0) {
    // Without flat spins, the spin key simply pushes.
    if (input & INPUT.spin && !this.def.handling.yaw) input |= INPUT.push;
    if (input && !this.crashed) this.control(input);
    this.applySpin(input);
    this.ringRef.copy(this.pos[P.butt]);
    this.bounce = null;
    this.events = 0;
    // Integrate.
    for (let i = 0; i < this.count; i++) {
      const p = this.pos[i];
      vel.subVectors(p, this.prev[i]);
      this.prev[i].copy(p);
      p.add(vel).add(GRAVITY);
      this.contact[i] = false;
    }

    this.normalSum.set(0, 0, 0);
    this.dirSum.set(0, 0, 0);
    this.offSum.set(0, 0, 0);
    this.offCount = 0;
    this.gripContacts = 0;
    this.forward(this.heading);
    for (let it = 0; it < ITERATIONS; it++) {
      this.satisfyBonesSymmetric(it === 0);
      this.collide(track);
    }
    this.assist(input);
    this.applyBounce();
    this.passRings(track, this.ringRef, this.pos[P.butt]);
    this.collectStars(track);
    this.checkFinish(track, this.ringRef, this.pos[P.butt]);
  }

  /** Picks up stars near the body or the vehicle. */
  private collectStars(track: Track) {
    if (track.stars.size === 0 || this.crashed) return;
    const list = track.starList();
    const probes = [this.pos[P.butt], this.pos[P.shoulder], this.pos[P.string]];
    for (let k = 0; k < list.length && k < MAX_STARS; k++) {
      const bit = 2 ** k;
      if (Math.floor(this.stars / bit) % 2 === 1) continue;
      if (probes.some((p) => p.distanceToSquared(list[k].position) < STAR_RADIUS * STAR_RADIUS)) {
        this.stars += bit;
        this.events |= EVENT.star;
      }
    }
  }

  /** Crossing the finish gate's plane inside the gate ends the run. */
  private checkFinish(track: Track, from: THREE.Vector3, to: THREE.Vector3) {
    const fin = track.finish;
    if (!fin || this.finished || this.crashed) return;
    const d0 = tmp.subVectors(from, fin.position).dot(fin.axis);
    const d1 = tmp.subVectors(to, fin.position).dot(fin.axis);
    if (!(d0 < 0 && d1 >= 0)) return;
    const t = d0 / (d0 - d1);
    const hit = tmp.lerpVectors(from, to, t).sub(fin.position);
    hit.addScaledVector(fin.axis, -hit.dot(fin.axis));
    if (Math.abs(hit.y) > 5 || hit.length() > fin.halfWidth + 2) return;
    this.finished = true;
    this.events |= EVENT.finish;
  }

  /**
   * Bouncy lines launch the whole rider at once (like a trampoline); bouncing
   * only the contact points would rip Bosh off his ride.
   */
  private applyBounce() {
    if (!this.bounce) return;
    const { up, speed } = this.bounce;
    // Average velocity of the whole rider.
    const avg = new THREE.Vector3();
    for (let i = 0; i < this.count; i++) avg.add(tmp.subVectors(this.pos[i], this.prev[i]));
    avg.divideScalar(this.count);
    const vn = avg.dot(up);
    if (speed - vn <= 0) return;
    if (speed - vn > 0.08) this.events |= EVENT.bounce;
    // Launch as one rigid body: same velocity for every point, so a bounce
    // never adds spin (which would pile up over several pads).
    avg.addScaledVector(up, speed - vn);
    for (let i = 0; i < this.count; i++) this.prev[i].copy(this.pos[i]).sub(avg);
  }

  /** Surface normal summed over the contacts of this step (for balance). */
  private normalSum = new THREE.Vector3();
  /** Track direction summed over the contacts of this step (for steering). */
  private dirSum = new THREE.Vector3();
  private heading = new THREE.Vector3();
  private offSum = new THREE.Vector3();
  private offCount = 0;
  /** Runner contacts with grip this step (not on ice). */
  private gripContacts = 0;

  /**
   * Rotates pos and prev about their own pivots (reorients without adding
   * speed): the center of mass, or the contact patch when `aboutBase`.
   */
  private rotateAll(q: THREE.Quaternion, aboutBase = false) {
    for (const pts of [this.pos, this.prev]) {
      const c = sC.set(0, 0, 0);
      if (aboutBase) {
        for (const i of [P.tailL, P.tailR, P.noseL, P.noseR]) c.add(pts[i]);
        c.divideScalar(4);
      } else {
        for (const p of pts) c.add(p);
        c.divideScalar(this.count);
      }
      for (const p of pts) p.sub(c).applyQuaternion(q).add(c);
    }
  }

  /**
   * Arcade assists of the new rides: riders balance on the ground (no tipping
   * over in banked turns), and in the air the nose slowly follows the flight
   * path when no flip key is held.
   */
  private assist(input: number) {
    const h = this.def.handling;
    if (this.crashed || (h.balance === 0 && h.airAlign === 0 && h.steer === 0)) return;
    const fwd = this.forward(sFwd);
    const lat = sLat.subVectors(this.pos[P.tailR], this.pos[P.tailL]).normalize();
    const up = sUp.crossVectors(lat, fwd).normalize();
    const grounded = [P.tailL, P.tailR, P.noseL, P.noseR].some((i) => this.contact[i]);
    if (grounded && h.balance > 0 && this.normalSum.lengthSq() > 1e-6) {
      // Roll and pitch toward the surface normal.
      const n = sN.copy(this.normalSum).normalize();
      const angle = up.angleTo(n);
      if (angle > 1e-4 && angle < 1.2) {
        qA.setFromUnitVectors(up, n);
        this.rotateAll(qB.identity().slerp(qA, h.balance), true);
      }
    }
    if (grounded && h.steer > 0 && this.dirSum.lengthSq() > 1e-6) {
      // Yaw (around the vehicle's up axis) toward the track direction, aiming
      // a little toward the center line (lane keeping).
      const d = sD.copy(this.dirSum).normalize();
      if (this.offCount > 0) {
        const off = sV.copy(this.offSum).divideScalar(this.offCount);
        const len = off.length();
        if (len > 1e-6) d.addScaledVector(off, -Math.min(len * 0.15, 0.25) / len);
      }
      d.addScaledVector(up, -d.dot(up));
      if (d.lengthSq() > 1e-6) {
        d.normalize();
        const yaw = Math.atan2(sCross.crossVectors(fwd, d).dot(up), fwd.dot(d));
        if (Math.abs(yaw) > 1e-4 && Math.abs(yaw) < 0.9) this.rotateAll(qA.setFromAxisAngle(up, yaw * h.steer), true);
      }
    }
    if (grounded && h.carve > 0 && this.gripContacts > 0) {
      // Carve: the whole rider follows the edges instead of sliding wide.
      const n = this.normalSum.lengthSq() > 1e-6 ? sN.copy(this.normalSum).normalize() : up;
      const side = sSide.copy(lat).addScaledVector(n, -lat.dot(n)).normalize();
      const v = sV.set(0, 0, 0);
      for (let i = 0; i < this.count; i++) v.add(tmp.subVectors(this.pos[i], this.prev[i]));
      v.divideScalar(this.count);
      const slip = v.dot(side) * h.carve;
      for (let i = 0; i < this.count; i++) this.prev[i].addScaledVector(side, slip);
    }
    const airborne = !this.contact.some((c) => c);
    if (airborne && h.airAlign > 0 && !(input & (INPUT.push | INPUT.brake)) && Math.abs(this.spin) < 0.02) {
      // Angular-velocity controller on pitch: the nose eases toward the
      // direction of flight instead of tumbling from the takeoff.
      const v = sV.set(0, 0, 0);
      for (let i = 0; i < this.count; i++) v.add(tmp.subVectors(this.pos[i], this.prev[i]));
      v.addScaledVector(lat, -v.dot(lat));
      if (v.lengthSq() > 1e-6) {
        v.normalize();
        const pitchErr = Math.atan2(sCross.crossVectors(fwd, v).dot(lat), fwd.dot(v));
        // Only near the flight direction: a flip in progress is left alone.
        if (Math.abs(pitchErr) < 1.6) {
          const prevFwd = sPrevFwd
            .addVectors(this.prev[P.noseL], this.prev[P.noseR])
            .sub(this.prev[P.tailL])
            .sub(this.prev[P.tailR])
            .normalize();
          const omega = Math.atan2(sCross.crossVectors(prevFwd, fwd).dot(lat), prevFwd.dot(fwd));
          const target = THREE.MathUtils.clamp(pitchErr * 0.08, -0.04, 0.04);
          const delta = (omega - target) * h.airAlign;
          // Turning the previous pose toward the current one changes the spin rate only.
          const c = sC.set(0, 0, 0);
          for (const p of this.prev) c.add(p);
          c.divideScalar(this.count);
          const q = qA.setFromAxisAngle(lat, delta);
          for (const p of this.prev) p.sub(c).applyQuaternion(q).add(c);
        }
      }
    }
  }

  /** Forward axis of the vehicle (tail to nose). */
  private forward(out: THREE.Vector3) {
    const tailMid = tmp.addVectors(this.pos[P.tailL], this.pos[P.tailR]).multiplyScalar(0.5);
    return out.addVectors(this.pos[P.noseL], this.pos[P.noseR]).multiplyScalar(0.5).sub(tailMid).normalize();
  }

  /**
   * Player control: push / brake while the vehicle touches a track, flips
   * while airborne. Works on velocities (prev positions) so it stays
   * deterministic.
   */
  private control(input: number) {
    const h = this.def.handling;
    const down = [P.tailL, P.tailR, P.noseL, P.noseR].some((i) => this.contact[i]);
    if (!down) return;
    const fwd = this.forward(tmp2);
    if (input & INPUT.push) {
      const speed = vel.subVectors(this.pos[P.butt], this.prev[P.butt]).dot(fwd);
      if (speed < h.pushMax) for (let i = 0; i < this.count; i++) this.prev[i].addScaledVector(fwd, -h.pushAccel);
    }
    if (input & INPUT.brake) {
      for (let i = 0; i < this.count; i++) {
        vel.subVectors(this.pos[i], this.prev[i]).multiplyScalar(h.brake);
        this.prev[i].add(vel);
      }
    }
  }

  /**
   * Arcade air control: holding a key spins the rider around the vehicle's
   * lateral axis (flips) or up axis (flat spins); releasing it settles the
   * spin. Positions and previous positions are rotated about their own
   * centers, so the flight path is untouched.
   */
  private applySpin(input: number) {
    const h = this.def.handling;
    const airborne = !this.contact.some((c) => c);
    if (!airborne || this.crashed) {
      // Touching down mid-spin throws Bosh off his ride.
      if (!airborne && !this.crashed && (Math.abs(this.spin) > h.spinCrash || Math.abs(this.yawSpin) > h.spinCrash)) {
        this.crashed = true;
        this.crashReason = 'spin';
      }
      this.spin = 0;
      this.yawSpin = 0;
      return;
    }
    const lean = h.flipSign * h.flipAccel;
    if (input & INPUT.push) this.spin = THREE.MathUtils.clamp(this.spin - lean, -h.flipMax, h.flipMax);
    else if (input & INPUT.brake) this.spin = THREE.MathUtils.clamp(this.spin + lean, -h.flipMax, h.flipMax);
    else this.spin *= h.flipSettle;
    if (Math.abs(this.spin) < 1e-4) this.spin = 0;
    if (h.yaw) {
      if (input & INPUT.spin) this.yawSpin = Math.min(this.yawSpin + h.yaw.accel, h.yaw.max);
      else this.yawSpin *= h.flipSettle;
      if (Math.abs(this.yawSpin) < 1e-4) this.yawSpin = 0;
    }
    if (this.spin === 0 && this.yawSpin === 0) return;
    const lat = sLat.subVectors(this.pos[P.tailR], this.pos[P.tailL]).normalize();
    const q = qA.identity();
    if (this.spin !== 0) q.setFromAxisAngle(lat, this.spin);
    if (this.yawSpin !== 0) {
      const fwd = this.forward(sFwd);
      const up = sUp.crossVectors(lat, fwd).normalize();
      q.premultiply(qB.setFromAxisAngle(up, this.yawSpin));
    }
    for (const pts of [this.pos, this.prev]) {
      const c = sC.set(0, 0, 0);
      for (const p of pts) c.add(p);
      c.divideScalar(this.count);
      for (const p of pts) p.sub(c).applyQuaternion(q).add(c);
    }
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
      for (let i = 0; i < this.count; i++) this.prev[i].addScaledVector(ring.axis, -dir * RING_BOOST);
    }
  }

  /**
   * Relaxes the bones in both orders (normal and left/right mirrored) from the
   * same start and averages the results, so the solver has no left/right bias
   * and Bosh doesn't slowly drift or tip sideways.
   */
  private satisfyBonesSymmetric(checkBreak: boolean) {
    for (let i = 0; i < this.count; i++) this.original[i].copy(this.pos[i]);
    this.satisfyBones(this.def.bones, checkBreak);
    for (let i = 0; i < this.count; i++) {
      this.scratch[i].copy(this.pos[i]);
      this.pos[i].copy(this.original[i]);
    }
    this.satisfyBones(this.bonesMirrored, checkBreak);
    for (let i = 0; i < this.count; i++) this.pos[i].add(this.scratch[i]).multiplyScalar(0.5);
  }

  private satisfyBones(bones: Bone[], checkBreak: boolean) {
    const breakStrain = this.def.handling.breakStrain;
    for (const bone of bones) {
      if (bone.kind === 'mount' && this.crashed) continue;
      const pa = this.pos[bone.a];
      const pb = this.pos[bone.b];
      tmp.subVectors(pb, pa);
      const dist = tmp.length();
      if (dist < 1e-9) continue;
      if (bone.kind === 'repel' && dist >= bone.rest) continue;
      const diff = (dist - bone.rest) / dist;
      if (bone.kind === 'mount' && checkBreak && Math.abs(dist - bone.rest) / bone.rest > breakStrain) {
        if (!this.crashed) this.crashReason = `mount ${bone.a}-${bone.b} ${((dist - bone.rest) / bone.rest).toFixed(2)}`;
        this.crashed = true;
        continue;
      }
      tmp.multiplyScalar(bone.kind === 'spring' ? diff * 0.5 * bone.k : diff * 0.5);
      pa.add(tmp);
      pb.sub(tmp);
    }
  }

  private collide(track: Track) {
    const h = this.def.handling;
    const tallWalls = h.tallWalls;
    const side = tmp2.subVectors(this.pos[P.tailR], this.pos[P.tailL]).normalize().clone();
    for (let i = 0; i < this.count; i++) {
      const p = this.pos[i];
      const def = this.def.points[i];
      this.nearby.clear();
      track.querySegments(p, this.nearby);
      // With tall walls only the vehicle is walled in; the body may lean over.
      const body = tallWalls && i >= P.butt && i <= P.rFoot;
      for (const seg of this.nearby) {
        if (body && seg.wall) continue;
        tmp.subVectors(p, seg.a);
        const d = tmp.dot(seg.up);
        if (d >= 0 || d < -HIT_DEPTH) continue;
        const t = tmp.dot(seg.dir);
        if (t < -SEG_EXT || t > seg.len + SEG_EXT) continue;
        const s = tmp.dot(seg.side);
        // Beyond the segment's sides; for walls "high" is the top edge.
        const high = seg.side.y >= 0 ? s > seg.halfWidth : s < -seg.halfWidth;
        // Tall walls also reach a little below the surface, so edges can't slip under.
        const bottom = seg.wall && tallWalls ? seg.halfWidth + 0.35 : seg.halfWidth;
        const low = seg.side.y >= 0 ? s < -bottom : s > bottom;
        if (low || (high && !(seg.wall && tallWalls))) continue;
        vel.subVectors(p, this.prev[i]);
        const incoming = vel.dot(seg.up);
        if (incoming > 0) continue; // moving away: let it pass
        const type = seg.wall ? 'normal' : seg.stroke.type;

        // Push out of the surface.
        p.addScaledVector(seg.up, -d);
        if (i < 4 && !seg.wall) {
          this.normalSum.add(seg.up);
          // Track direction, oriented the way the ride faces.
          const sgn = seg.dir.dot(this.heading) >= 0 ? 1 : -1;
          this.dirSum.addScaledVector(seg.dir, sgn);
          // How far off the center line (as a vector from the line to the point).
          this.offSum.addScaledVector(seg.side, s);
          this.offCount++;
        }
        this.contact[i] = true;
        if (def.fatal && !this.crashed && !seg.wall) {
          this.crashed = true;
          this.crashReason = `fatal ${i} track`;
        }

        vel.subVectors(p, this.prev[i]);
        const vn = vel.dot(seg.up);
        const vt = vel.addScaledVector(seg.up, -vn);
        // Friction proportional to penetration (normal force). Ice has none.
        if (def.friction > 0 && type !== 'ice') {
          const speed = vt.length();
          if (speed > 1e-9) vt.multiplyScalar(Math.max(0, 1 - (def.friction * -d) / speed));
        }
        // Runners resist sliding sideways (mostly at the rear, so the ride self-aligns).
        if (def.runner && !this.crashed && type !== 'ice' && !seg.wall) {
          this.gripContacts++;
          const lat = tmp.copy(side).addScaledVector(seg.up, -side.dot(seg.up));
          if (lat.lengthSq() > 1e-6) {
            lat.normalize();
            vt.addScaledVector(lat, -vt.dot(lat) * h.grip);
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
        if (i < 4) this.normalSum.y += 1;
        this.contact[i] = true;
        if (def.fatal && !this.crashed) {
          this.crashed = true;
          this.crashReason = `fatal ${i} ground`;
        }
        vel.subVectors(p, this.prev[i]);
        vel.y = 0;
        // Ground drag, capped so fast arrivals slow down instead of stopping dead.
        const speed = vel.length();
        const drag = h.snowDrag * this.groundDrag;
        if (speed > 1e-9) vel.multiplyScalar(Math.max(0, speed - Math.min(speed * GROUND_FRICTION * drag, SNOW_MAX_DRAG * drag)) / speed);
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
    const n = this.count;
    for (let i = 0; i < n; i++) {
      this.pos[i].toArray(buf, i * 6);
      this.prev[i].toArray(buf, i * 6 + 3);
    }
    const m = n * 6;
    buf[m + META.crashed] = this.crashed ? 1 : 0;
    let mask = 0;
    for (let i = 0; i < n; i++) if (this.contact[i]) mask |= 1 << i;
    buf[m + META.contact] = mask;
    buf[m + META.events] = this.events;
    buf[m + META.spin] = this.spin;
    buf[m + META.stars] = this.stars;
    buf[m + META.finished] = this.finished ? 1 : 0;
    buf[m + META.yaw] = this.yawSpin;
  }

  readState(buf: Float64Array) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      this.pos[i].fromArray(buf, i * 6);
      this.prev[i].fromArray(buf, i * 6 + 3);
    }
    const m = n * 6;
    this.crashed = buf[m + META.crashed] === 1;
    const mask = buf[m + META.contact];
    for (let i = 0; i < n; i++) this.contact[i] = (mask & (1 << i)) !== 0;
    this.events = buf[m + META.events];
    this.spin = buf[m + META.spin];
    this.stars = buf[m + META.stars];
    this.finished = buf[m + META.finished] === 1;
    this.yawSpin = buf[m + META.yaw];
  }
}
