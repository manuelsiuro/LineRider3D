import * as THREE from 'three';
import { P, type VehicleDef } from '../physics/vehicles';
import { Limb, MAT, part, tube } from './riderParts';

/** Orientation of a vehicle: origin plus forward / up / right axes. */
export interface Basis {
  origin: THREE.Vector3;
  fwd: THREE.Vector3;
  up: THREE.Vector3;
  right: THREE.Vector3;
}

export interface VehicleModel {
  /** Posed in world space each frame. */
  group: THREE.Group;
  /**
   * Poses the model from the simulated points. May return where the feet
   * should be drawn (e.g. on spinning pedals).
   */
  update(p: THREE.Vector3[], basis: Basis, dt: number, crashed: boolean, airborne?: boolean): { feet?: [THREE.Vector3, THREE.Vector3] } | void;
  dispose(): void;
}

const tmpM = new THREE.Matrix4();

function pose(obj: THREE.Object3D, origin: THREE.Vector3, fwd: THREE.Vector3, up: THREE.Vector3, right: THREE.Vector3) {
  obj.position.copy(origin);
  obj.quaternion.setFromRotationMatrix(tmpM.makeBasis(fwd, up, right));
}

/** Local point of a basis-posed object → world. */
function toWorld(b: Basis, x: number, y: number, z: number, out = new THREE.Vector3()) {
  return out.copy(b.origin).addScaledVector(b.fwd, x).addScaledVector(b.up, y).addScaledVector(b.right, z);
}

function basisFrom(origin: THREE.Vector3, front: THREE.Vector3, rightHint: THREE.Vector3): Basis {
  const fwd = new THREE.Vector3().subVectors(front, origin).normalize();
  const right = rightHint.clone().addScaledVector(fwd, -rightHint.dot(fwd)).normalize();
  const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
  return { origin: origin.clone(), fwd, up, right };
}

/** Rolls wheels from the distance travelled. */
class Roller {
  angle = 0;
  private last = new THREE.Vector3();
  private has = false;
  constructor(private radius: number) {}
  roll(pos: THREE.Vector3, fwd: THREE.Vector3) {
    if (this.has) {
      const d = new THREE.Vector3().subVectors(pos, this.last);
      if (d.lengthSq() < 4) this.angle += d.dot(fwd) / this.radius;
    }
    this.last.copy(pos);
    this.has = true;
    return this.angle;
  }
}

/**
 * Visual suspension: a damped spring driven by the chassis's vertical
 * acceleration, so landings squat the body toward the wheels and it rebounds.
 */
class Suspension {
  x = 0;
  private v = 0;
  private lastPos = new THREE.Vector3();
  private lastVel = 0;
  private has = false;
  constructor(
    private travel: number,
    private stiffness = 260,
    private damping = 16,
  ) {}
  update(pos: THREE.Vector3, up: THREE.Vector3, dt: number) {
    if (dt <= 0) return this.x;
    if (!this.has || pos.distanceToSquared(this.lastPos) > 4) {
      this.lastPos.copy(pos);
      this.has = true;
      return this.x;
    }
    const vel = new THREE.Vector3().subVectors(pos, this.lastPos).dot(up) / dt;
    this.lastPos.copy(pos);
    const accel = (vel - this.lastVel) / dt;
    this.lastVel = vel;
    // A sudden stop of a fall (accel up) compresses the spring.
    const h = Math.min(dt, 1 / 30);
    this.v += (-this.stiffness * this.x - this.damping * this.v + THREE.MathUtils.clamp(accel, -60, 400) * 0.8) * h;
    this.x += this.v * h;
    if (this.x < -this.travel * 0.4) (this.x = -this.travel * 0.4), (this.v = 0);
    if (this.x > this.travel) (this.x = this.travel), (this.v = Math.min(this.v, 0));
    return this.x;
  }
}

/** A wheel spinning around its local z axis. */
function makeWheel(R: number, thick: number, width: number, style: 'bmx' | 'moto' | 'buggy'): THREE.Group {
  const g = new THREE.Group();
  const tire = part(g, new THREE.TorusGeometry(R - thick, thick, 10, 30), MAT.tire, 0, 0, 0);
  tire.scale.z = width / (2 * thick);
  if (style === 'bmx') {
    part(g, new THREE.TorusGeometry(R - thick * 1.6, 0.014, 6, 30), MAT.chrome, 0, 0, 0);
    for (let k = 0; k < 6; k++) {
      const s = part(g, new THREE.BoxGeometry(0.01, (R - thick * 1.6) * 2, 0.01), MAT.chrome, 0, 0, 0);
      s.rotation.z = (k * Math.PI) / 6;
    }
    part(g, new THREE.CylinderGeometry(0.035, 0.035, 0.1, 10), MAT.dark, 0, 0, 0, [Math.PI / 2, 0, 0]);
  } else if (style === 'moto') {
    part(g, new THREE.TorusGeometry(R - thick * 1.7, 0.02, 6, 30), MAT.chrome, 0, 0, 0);
    for (let k = 0; k < 8; k++) {
      const s = part(g, new THREE.BoxGeometry(0.012, (R - thick * 1.7) * 2, 0.012), MAT.metal, 0, 0, 0);
      s.rotation.z = (k * Math.PI) / 8;
    }
    // Brake disc and hub.
    part(g, new THREE.CylinderGeometry(R * 0.42, R * 0.42, 0.012, 20), MAT.metal, 0, 0, 0.06, [Math.PI / 2, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.06, 0.06, 0.16, 12), MAT.dark, 0, 0, 0, [Math.PI / 2, 0, 0]);
    // Knobs on the tire.
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      const knob = part(g, new THREE.BoxGeometry(0.05, 0.04, width * 0.9), MAT.tire, Math.cos(a) * R, Math.sin(a) * R, 0);
      knob.rotation.z = a;
    }
  } else {
    part(g, new THREE.CylinderGeometry(R - thick * 1.5, R - thick * 1.5, width * 0.8, 18), MAT.accent, 0, 0, 0, [Math.PI / 2, 0, 0]);
    part(g, new THREE.CylinderGeometry(0.07, 0.07, width + 0.04, 10), MAT.chrome, 0, 0, 0, [Math.PI / 2, 0, 0]);
    for (let k = 0; k < 5; k++) {
      const s = part(g, new THREE.BoxGeometry(0.04, (R - thick * 1.5) * 1.6, 0.02), MAT.dark, 0, 0, width * 0.42);
      s.rotation.z = (k * Math.PI) / 5;
    }
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const knob = part(g, new THREE.BoxGeometry(0.07, 0.05, width * 1.02), MAT.tire, Math.cos(a) * R, Math.sin(a) * R, 0);
      knob.rotation.z = a;
    }
  }
  return g;
}

function disposeGroup(g: THREE.Object3D) {
  g.traverse((o) => {
    if (o instanceof THREE.Mesh) o.geometry.dispose();
  });
  g.removeFromParent();
}

// ------------------------------------------------------------------ sled
function sledModel(world: THREE.Object3D): VehicleModel {
  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => part(group, geo, m, x, y, z);
  for (const z of [-0.12, 0, 0.12]) add(new THREE.BoxGeometry(1.45, 0.04, 0.11), MAT.wood, 0.72, 0.4, z);
  add(new THREE.BoxGeometry(0.06, 0.05, 0.5), MAT.woodDark, 0.1, 0.36, 0);
  add(new THREE.BoxGeometry(0.06, 0.05, 0.5), MAT.woodDark, 1.25, 0.36, 0);
  for (const z of [-0.25, 0.25]) {
    add(new THREE.BoxGeometry(1.45, 0.035, 0.035), MAT.metal, 0.72, 0.02, z);
    const curl = add(new THREE.TorusGeometry(0.15, 0.018, 6, 10, Math.PI), MAT.metal, 1.45, 0.17, z);
    curl.rotation.z = -Math.PI / 2;
    for (const x of [0.2, 0.75, 1.25]) add(new THREE.BoxGeometry(0.035, 0.36, 0.035), MAT.woodDark, x, 0.2, z);
  }
  // Tow rope from the hands to the front of the sled.
  const ropes = [new Limb(0.012, MAT.rope, world), new Limb(0.012, MAT.rope, world)];
  world.add(group);
  return {
    group,
    update(p, b, _dt, crashed) {
      pose(group, b.origin, b.fwd, b.up, b.right);
      ropes.forEach((r) => (r.visible = !crashed));
      if (!crashed) {
        ropes[0].set(p[P.lHand], p[P.string]);
        ropes[1].set(p[P.rHand], p[P.string]);
      }
    },
    dispose() {},
  };
}

// ------------------------------------------------------------------ skis
function skisModel(world: THREE.Object3D): VehicleModel {
  const group = new THREE.Group();
  for (const z of [-0.17, 0.17]) {
    part(group, new THREE.BoxGeometry(1.7, 0.025, 0.1), MAT.paint, 0.88, 0.013, z);
    part(group, new THREE.BoxGeometry(1.2, 0.006, 0.04), MAT.accent, 0.9, 0.028, z);
    part(group, new THREE.BoxGeometry(0.26, 0.024, 0.1), MAT.paint, 1.83, 0.06, z, [0, 0, 0.42]);
    part(group, new THREE.BoxGeometry(0.14, 0.024, 0.1), MAT.paint, -0.02, 0.03, z, [0, 0, -0.3]);
    part(group, new THREE.BoxGeometry(0.3, 0.07, 0.11), MAT.dark, 0.92, 0.06, z);
  }
  world.add(group);
  // Poles hang from the hands, baskets near the tips.
  const poles = [new Limb(0.013, MAT.chrome, world, 0.01), new Limb(0.013, MAT.chrome, world, 0.01)];
  const baskets = [0, 1].map(() => {
    const m = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 4, 12), MAT.dark);
    world.add(m);
    return m;
  });
  const tip = new THREE.Vector3();
  return {
    group,
    update(p, b) {
      pose(group, b.origin, b.fwd, b.up, b.right);
      [P.lHand, P.rHand].forEach((h, k) => {
        tip.copy(p[h]).addScaledVector(b.fwd, -0.45).addScaledVector(b.up, -0.92).addScaledVector(b.right, (k ? 1 : -1) * 0.08);
        poles[k].set(p[h], tip);
        baskets[k].position.lerpVectors(p[h], tip, 0.9);
        baskets[k].quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tip.clone().sub(p[h]).normalize());
      });
    },
    dispose() {},
  };
}

// ------------------------------------------------------------------ snowboard
function snowboardModel(world: THREE.Object3D): VehicleModel {
  const group = new THREE.Group();
  part(group, new THREE.BoxGeometry(1.2, 0.03, 0.34), MAT.paint, 0.75, 0.015, 0);
  for (const [x, dir] of [
    [0.15, -1],
    [1.35, 1],
  ] as const) {
    const end = part(group, new THREE.CylinderGeometry(0.17, 0.17, 0.03, 20, 1, false, dir > 0 ? 0 : Math.PI, Math.PI), MAT.paint, x, 0.03, 0);
    end.scale.x = 1.2;
    end.rotation.z = dir * 0.18;
  }
  // Graphic: two accent stripes and a logo dot.
  part(group, new THREE.BoxGeometry(1.0, 0.004, 0.05), MAT.accent, 0.75, 0.032, -0.08);
  part(group, new THREE.BoxGeometry(1.0, 0.004, 0.05), MAT.accent, 0.75, 0.032, 0.08);
  for (const x of [0.42, 1.08]) {
    part(group, new THREE.BoxGeometry(0.16, 0.05, 0.3), MAT.dark, x, 0.055, 0);
    // Highback along the heel edge.
    part(group, new THREE.BoxGeometry(0.15, 0.17, 0.025), MAT.dark, x, 0.13, -0.135, [-0.2, 0, 0]);
  }
  world.add(group);
  return {
    group,
    update(_p, b) {
      pose(group, b.origin, b.fwd, b.up, b.right);
    },
    dispose() {},
  };
}

// ------------------------------------------------------------------ BMX
function bikeModel(world: THREE.Object3D, def: VehicleDef): VehicleModel {
  const R = def.wheelRadius;
  const WB = 1.35;
  const group = new THREE.Group();
  const wheels = [makeWheel(R, 0.055, 0.09, 'bmx'), makeWheel(R, 0.055, 0.09, 'bmx')];
  wheels[0].position.set(0, R, 0);
  wheels[1].position.set(WB, R, 0);
  group.add(...wheels);
  const r = 0.024;
  const bb: [number, number, number] = [0.62, 0.3, 0];
  const seat: [number, number, number] = [0.42, 0.7, 0];
  const head: [number, number, number] = [1.1, 0.66, 0];
  tube(group, [0, R, 0.04], bb, r, MAT.paint);
  tube(group, [0, R, -0.04], bb, r, MAT.paint);
  tube(group, [0, R, 0.04], seat, r * 0.8, MAT.paint);
  tube(group, [0, R, -0.04], seat, r * 0.8, MAT.paint);
  tube(group, bb, seat, r, MAT.paint);
  tube(group, bb, head, r * 1.1, MAT.paint);
  tube(group, seat, head, r, MAT.paint);
  tube(group, [1.08, 0.58, 0], [1.13, 0.8, 0], r * 1.3, MAT.paint);
  // Fork, stem and bars.
  tube(group, [1.1, 0.62, 0.05], [WB, R, 0.05], r * 0.8, MAT.chrome);
  tube(group, [1.1, 0.62, -0.05], [WB, R, -0.05], r * 0.8, MAT.chrome);
  tube(group, [1.13, 0.8, 0], [1.15, 0.86, 0], r, MAT.dark);
  tube(group, [1.15, 0.86, -0.28], [1.15, 0.86, 0.28], r * 0.9, MAT.chrome);
  tube(group, [1.15, 0.86, -0.1], [1.12, 0.96, -0.12], r * 0.8, MAT.chrome);
  tube(group, [1.15, 0.86, 0.1], [1.12, 0.96, 0.12], r * 0.8, MAT.chrome);
  for (const z of [-0.26, 0.26]) part(group, new THREE.CylinderGeometry(0.03, 0.03, 0.1, 8), MAT.accent, 1.15, 0.86, z, [Math.PI / 2, 0, 0]);
  // Seat and front pegs.
  part(group, new THREE.BoxGeometry(0.26, 0.05, 0.12), MAT.dark, 0.4, 0.73, 0);
  for (const z of [-0.08, 0.08]) part(group, new THREE.CylinderGeometry(0.025, 0.025, 0.12, 8), MAT.chrome, WB, R, z * 1.8, [Math.PI / 2, 0, 0]);
  // Cranks turn with the rear wheel.
  const crank = new THREE.Group();
  crank.position.set(...bb);
  part(crank, new THREE.CylinderGeometry(0.08, 0.08, 0.02, 16), MAT.chrome, 0, 0, 0.05, [Math.PI / 2, 0, 0]);
  const arms = [1, -1].map((s) => {
    const arm = part(crank, new THREE.BoxGeometry(0.03, 0.17, 0.02), MAT.chrome, 0, 0, s * 0.09);
    arm.geometry.translate(0, -0.085, 0);
    return arm;
  });
  group.add(crank);
  world.add(group);
  const roller = new Roller(R);
  const feet: [THREE.Vector3, THREE.Vector3] = [new THREE.Vector3(), new THREE.Vector3()];
  return {
    group,
    update(_p, b, _dt, crashed) {
      pose(group, b.origin, b.fwd, b.up, b.right);
      const a = roller.roll(b.origin, b.fwd);
      for (const w of wheels) w.rotation.z = -a;
      const ca = -a * 0.55;
      arms[0].rotation.z = ca;
      arms[1].rotation.z = ca + Math.PI;
      if (crashed) return;
      for (let k = 0; k < 2; k++) {
        const t = k === 0 ? ca : ca + Math.PI;
        toWorld(b, bb[0] + Math.sin(t) * 0.17, bb[1] - Math.cos(t) * 0.17, (k === 0 ? -1 : 1) * 0.14, feet[k]);
      }
      return { feet };
    },
    dispose() {},
  };
}

// ------------------------------------------------------------------ motorbike
function motoModel(world: THREE.Object3D, def: VehicleDef): VehicleModel {
  const R = def.wheelRadius;
  const group = new THREE.Group();
  // Frame-local coordinates: origin at the rear hub, front hub at (L, 0, 0).
  part(group, new THREE.BoxGeometry(0.42, 0.3, 0.26), MAT.dark, 0.8, 0.04, 0);
  for (let k = 0; k < 4; k++) part(group, new THREE.BoxGeometry(0.2, 0.012, 0.3), MAT.metal, 0.9, 0.14 + k * 0.035, 0);
  const tank = part(group, new THREE.SphereGeometry(1, 18, 12), MAT.paint, 1.0, 0.38, 0);
  tank.scale.set(0.3, 0.14, 0.18);
  part(group, new THREE.BoxGeometry(0.2, 0.004, 0.3), MAT.accent, 1.0, 0.5, 0, [0, 0, -0.1]);
  part(group, new THREE.BoxGeometry(0.6, 0.07, 0.22), MAT.dark, 0.5, 0.4, 0, [0, 0, -0.06]);
  // Rear fender / side panels.
  part(group, new THREE.BoxGeometry(0.62, 0.035, 0.22), MAT.paint, 0.05, 0.47, 0, [0, 0, 0.18]);
  for (const z of [-0.13, 0.13]) part(group, new THREE.BoxGeometry(0.42, 0.18, 0.02), MAT.paint, 0.48, 0.3, z, [0, 0, 0.12]);
  // Frame rails.
  tube(group, [0.6, 0.05, 0.1], [1.32, 0.58, 0.05], 0.025, MAT.paint);
  tube(group, [0.6, 0.05, -0.1], [1.32, 0.58, -0.05], 0.025, MAT.paint);
  tube(group, [0.6, 0.05, 0.1], [0.3, 0.42, 0.1], 0.02, MAT.paint);
  tube(group, [0.6, 0.05, -0.1], [0.3, 0.42, -0.1], 0.02, MAT.paint);
  // Exhaust.
  tube(group, [0.85, -0.1, 0.12], [0.45, 0.12, 0.17], 0.03, MAT.chrome);
  tube(group, [0.45, 0.12, 0.17], [0.0, 0.3, 0.17], 0.05, MAT.chrome);
  // Front: number plate, headlight, bars.
  part(group, new THREE.BoxGeometry(0.03, 0.22, 0.26), MAT.accent, 1.45, 0.52, 0, [0, 0, -0.35]);
  part(group, new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), MAT.light, 1.5, 0.48, 0, [0, 0, Math.PI / 2 - 0.35]);
  tube(group, [1.38, 0.66, -0.34], [1.38, 0.66, 0.34], 0.02, MAT.dark);
  for (const z of [-0.32, 0.32]) part(group, new THREE.CylinderGeometry(0.028, 0.028, 0.1, 8), MAT.rubber, 1.38, 0.66, z, [Math.PI / 2, 0, 0]);
  world.add(group);
  const wheels = [makeWheel(R, 0.085, 0.16, 'moto'), makeWheel(R, 0.08, 0.13, 'moto')];
  world.add(...wheels);
  const swing = [new Limb(0.03, MAT.metal, world), new Limb(0.03, MAT.metal, world)];
  const fork = [new Limb(0.032, MAT.chrome, world), new Limb(0.032, MAT.chrome, world)];
  const shock = new Limb(0.035, MAT.accent, world);
  const fender = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.025, 0.16), MAT.paint);
  fender.castShadow = true;
  world.add(fender);
  const roller = new Roller(R);
  const susp = new Suspension(0.16);
  const hubR = new THREE.Vector3();
  const hubF = new THREE.Vector3();
  const v = new THREE.Vector3();
  const w = new THREE.Vector3();
  return {
    group,
    update(p, _b, dt) {
      const right = new THREE.Vector3().subVectors(p[P.tailR], p[P.tailL]);
      const b = basisFrom(p[12], p[13], right);
      // The frame squats on the suspension; wheels stay on the ground.
      b.origin.addScaledVector(b.up, -susp.update(p[12], b.up, dt));
      pose(group, b.origin, b.fwd, b.up, b.right);
      // Wheels sit above their contact points (they move with the suspension).
      hubR.addVectors(p[P.tailL], p[P.tailR]).multiplyScalar(0.5).addScaledVector(b.up, R);
      hubF.addVectors(p[P.noseL], p[P.noseR]).multiplyScalar(0.5).addScaledVector(b.up, R);
      const a = roller.roll(hubR, b.fwd);
      wheels[0].position.copy(hubR);
      wheels[1].position.copy(hubF);
      for (const wh of wheels) {
        pose(wh, wh.position.clone(), b.fwd, b.up, b.right);
        wh.rotateZ(-a);
      }
      for (const [k, s] of [-1, 1].entries()) {
        swing[k].set(toWorld(b, 0.62, 0.02, s * 0.09, v), w.copy(hubR).addScaledVector(b.right, s * 0.09));
        fork[k].set(toWorld(b, 1.34, 0.6, s * 0.09, v), w.copy(hubF).addScaledVector(b.right, s * 0.09));
      }
      shock.set(toWorld(b, 0.55, 0.36, 0, v), w.lerpVectors(toWorld(b, 0.62, 0.02, 0), hubR, 0.45));
      pose(fender, v.copy(hubF).addScaledVector(b.up, R + 0.06).addScaledVector(b.fwd, 0.04), b.fwd, b.up, b.right);
    },
    dispose() {},
  };
}

// ------------------------------------------------------------------ buggy
function buggyModel(world: THREE.Object3D, def: VehicleDef): VehicleModel {
  const R = def.wheelRadius;
  const L = 1.7;
  const group = new THREE.Group();
  // Chassis-local: origin between the rear corners (hub height), front at (L, 0, 0).
  part(group, new THREE.BoxGeometry(1.9, 0.06, 0.72), MAT.dark, 0.85, -0.06, 0);
  for (const z of [-0.36, 0.36]) part(group, new THREE.BoxGeometry(1.2, 0.2, 0.06), MAT.paint, 0.8, 0.05, z);
  const hood = part(group, new THREE.BoxGeometry(0.55, 0.12, 0.66), MAT.paint, 1.62, 0.1, 0, [0, 0, -0.12]);
  hood.castShadow = true;
  part(group, new THREE.BoxGeometry(0.3, 0.005, 0.12), MAT.accent, 1.62, 0.17, 0, [0, 0, -0.12]);
  // Rear engine with pipes.
  part(group, new THREE.BoxGeometry(0.4, 0.3, 0.5), MAT.dark, 0.02, 0.12, 0);
  for (const z of [-0.12, 0.12]) tube(group, [-0.1, 0.2, z], [-0.28, 0.42, z], 0.035, MAT.chrome);
  // Roll cage.
  const c = 0.028;
  for (const s of [-1, 1]) {
    tube(group, [0.32, 0, s * 0.34], [0.42, 0.88, s * 0.3], c, MAT.dark);
    tube(group, [1.18, 0.12, s * 0.34], [0.92, 0.88, s * 0.3], c, MAT.dark);
    tube(group, [0.42, 0.88, s * 0.3], [0.92, 0.88, s * 0.3], c, MAT.dark);
    tube(group, [0.32, 0, s * 0.34], [1.18, 0.12, s * 0.34], c, MAT.dark);
    tube(group, [0.42, 0.88, s * 0.3], [0.05, 0.27, s * 0.22], c, MAT.dark);
  }
  tube(group, [0.42, 0.88, -0.3], [0.42, 0.88, 0.3], c, MAT.dark);
  tube(group, [0.92, 0.88, -0.3], [0.92, 0.88, 0.3], c, MAT.dark);
  tube(group, [0.42, 0.88, -0.3], [0.92, 0.88, 0.3], c * 0.8, MAT.dark);
  // Light bar and headlights.
  for (let k = 0; k < 4; k++) part(group, new THREE.BoxGeometry(0.05, 0.06, 0.1), MAT.light, 0.93, 0.93, -0.22 + k * 0.146);
  for (const z of [-0.22, 0.22]) part(group, new THREE.CylinderGeometry(0.05, 0.05, 0.04, 14), MAT.light, 1.9, 0.12, z, [0, 0, Math.PI / 2]);
  // Seat, steering wheel, spare tyre.
  part(group, new THREE.BoxGeometry(0.34, 0.08, 0.36), MAT.dark, 0.66, 0.0, 0);
  part(group, new THREE.BoxGeometry(0.08, 0.4, 0.36), MAT.dark, 0.48, 0.2, 0, [0, 0, 0.25]);
  const wheel = part(group, new THREE.TorusGeometry(0.1, 0.018, 6, 16), MAT.rubber, 1.22, 0.42, 0, [0, Math.PI / 2, 0]);
  wheel.rotateX(0.5);
  tube(group, [1.22, 0.42, 0], [1.45, 0.2, 0], 0.018, MAT.metal);
  world.add(group);
  const wheels = [0, 1, 2, 3].map(() => makeWheel(R, 0.11, 0.24, 'buggy'));
  world.add(...wheels);
  const arms = [0, 1, 2, 3].map(() => new Limb(0.028, MAT.metal, world));
  const shocks = [0, 1, 2, 3].map(() => new Limb(0.04, MAT.accent, world, 0.03));
  const roller = new Roller(R);
  const susp = new Suspension(0.2, 200, 13);
  const contacts = [P.tailL, P.tailR, P.noseL, P.noseR];
  const mounts: [number, number][] = [
    [0, -1],
    [0, 1],
    [L, -1],
    [L, 1],
  ];
  const hub = new THREE.Vector3();
  const v = new THREE.Vector3();
  return {
    group,
    update(p, _b, dt) {
      const rear = new THREE.Vector3().addVectors(p[12], p[13]).multiplyScalar(0.5);
      const front = new THREE.Vector3().addVectors(p[14], p[15]).multiplyScalar(0.5);
      const b = basisFrom(rear, front, new THREE.Vector3().subVectors(p[13], p[12]));
      b.origin.addScaledVector(b.up, -susp.update(rear, b.up, dt));
      pose(group, b.origin, b.fwd, b.up, b.right);
      const a = roller.roll(rear, b.fwd);
      contacts.forEach((ci, k) => {
        const [mx, s] = mounts[k];
        hub.copy(p[ci]).addScaledVector(b.up, R).addScaledVector(b.right, s * 0.04);
        pose(wheels[k], hub, b.fwd, b.up, b.right);
        wheels[k].rotateZ(-a);
        arms[k].set(toWorld(b, mx, -0.04, s * 0.3, v), hub);
        shocks[k].set(toWorld(b, mx + (mx > 0 ? -0.12 : 0.12), 0.3, s * 0.34, v), hub);
      });
    },
    dispose() {},
  };
}

// ------------------------------------------------------------------ coffin
/** Six-sided coffin outline (x along the ride, z across), wide at Bosh's shoulders. */
function coffinShape(inset: number) {
  const pts: [number, number][] = [
    [-0.2 + inset, -0.24 + inset],
    [0.35, -0.36 + inset],
    [1.75 - inset, -0.2 + inset],
    [1.75 - inset, 0.2 - inset],
    [0.35, 0.36 - inset],
    [-0.2 + inset, 0.24 - inset],
  ];
  // Shape space is (x, -z) so that extruding along +y after rotating keeps z to the right.
  return new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
}

/** Lays an extruded outline flat: shape (x, y) → model (x, z), depth → +y. */
function slab(shape: THREE.Shape, depth: number, holes: THREE.Shape[] = []) {
  shape.holes = holes.map((h) => new THREE.Path(h.getPoints()));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  return geo;
}

function coffinModel(world: THREE.Object3D): VehicleModel {
  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => part(group, geo, m, x, y, z);
  // Skids underneath, like the sled.
  for (const z of [-0.2, 0.2]) {
    add(new THREE.BoxGeometry(1.7, 0.035, 0.035), MAT.metal, 0.75, 0.02, z);
    const curl = add(new THREE.TorusGeometry(0.12, 0.018, 6, 10, Math.PI), MAT.metal, 1.6, 0.14, z);
    curl.rotation.z = -Math.PI / 2;
    for (const x of [0.1, 0.8, 1.4]) add(new THREE.BoxGeometry(0.035, 0.14, 0.035), MAT.woodDark, x, 0.09, z);
  }
  // Floor (satin lined) and walls.
  add(slab(coffinShape(0), 0.06), MAT.paint, 0, 0.16, 0);
  add(slab(coffinShape(0.05), 0.02), MAT.accent, 0, 0.22, 0);
  add(slab(coffinShape(0), 0.4, [coffinShape(0.05)]), MAT.paint, 0, 0.22, 0);
  add(slab(coffinShape(0), 0.03, [coffinShape(0.05)]), MAT.woodDark, 0, 0.62, 0);
  // Brass handles along both sides.
  for (const z of [-1, 1])
    for (const x of [0.15, 0.75, 1.35]) {
      const w = z * (x < 0.35 ? 0.24 + (x + 0.2) * 0.22 : 0.36 - (x - 0.35) * 0.115);
      const h = add(new THREE.TorusGeometry(0.06, 0.014, 5, 10, Math.PI), MAT.brass, x, 0.36, w + z * 0.02);
      h.rotation.x = z * Math.PI / 2;
    }
  // The lid, hinged at the head end: open behind Bosh, flapping in the air.
  const lid = new THREE.Group();
  lid.position.set(-0.2, 0.64, 0);
  // Lid parts sit relative to the hinge at the head end (x = -0.2).
  part(lid, slab(coffinShape(0), 0.05), MAT.paint, 0.2, 0, 0);
  part(lid, slab(coffinShape(0.05), 0.01), MAT.accent, 0.2, -0.01, 0);
  part(lid, new THREE.BoxGeometry(0.9, 0.02, 0.07), MAT.brass, 1.15, 0.06, 0);
  part(lid, new THREE.BoxGeometry(0.07, 0.02, 0.4), MAT.brass, 0.8, 0.06, 0);
  group.add(lid);
  world.add(group);

  let flap = 0;
  let loose = false;
  const vel = new THREE.Vector3();
  const spin = new THREE.Vector3();
  const OPEN = 1.95;
  return {
    group,
    update(_p, b, dt, crashed, airborne = false) {
      pose(group, b.origin, b.fwd, b.up, b.right);
      if (crashed && !loose) {
        // The lid bursts off and tumbles away.
        loose = true;
        world.attach(lid);
        vel.copy(b.up).multiplyScalar(5).addScaledVector(b.fwd, -2).addScaledVector(b.right, (Math.random() - 0.5) * 3);
        spin.set(Math.random() * 6 - 3, Math.random() * 6 - 3, 8);
      } else if (!crashed && loose) {
        loose = false;
        group.add(lid);
        lid.position.set(-0.2, 0.64, 0);
        lid.rotation.set(0, 0, OPEN);
      }
      if (loose) {
        const step = Math.min(dt, 0.05);
        vel.y -= 14 * step;
        lid.position.addScaledVector(vel, step);
        lid.rotation.x += spin.x * step;
        lid.rotation.y += spin.y * step;
        lid.rotation.z += spin.z * step;
        spin.multiplyScalar(1 - step * 0.8);
        return;
      }
      // In the air the lid flaps; on the ground it rests open.
      flap += dt * (airborne ? 18 : 0);
      lid.rotation.set(0, 0, OPEN - (airborne ? 0.25 + Math.sin(flap) * 0.25 : 0));
    },
    dispose() {},
  };
}

export function buildVehicleModel(def: VehicleDef, world: THREE.Object3D): VehicleModel {
  // Everything a model creates lives in one layer, removed as a whole.
  const layer = new THREE.Group();
  world.add(layer);
  const build = { skis: skisModel, snowboard: snowboardModel, bike: bikeModel, moto: motoModel, buggy: buggyModel, sled: sledModel, coffin: coffinModel }[def.id];
  const model = build(layer, def);
  return {
    group: model.group,
    update: model.update,
    dispose: () => disposeGroup(layer),
  };
}
