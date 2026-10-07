import * as THREE from 'three';
import { P } from '../physics/Rider';
import { SLED, type VehicleDef } from '../physics/vehicles';
import { Limb, MAT } from './riderParts';
import { buildVehicleModel, type Basis, type VehicleModel } from './vehicleModels';

/** Paint job of the ride (overrides the outfit's ride colors). */
export function applyPaint(main: number, accent: number) {
  MAT.wood.color.setHex(main);
  MAT.paint.color.setHex(main);
  MAT.accent.color.setHex(accent);
}

/** Recolors Bosh and his ride (all player riders share these materials). */
const X_AXIS = new THREE.Vector3(1, 0, 0);

export function applyOutfit(o: { jacket: number; pants: number; scarf: number; hat: number; sled: number }) {
  MAT.jacket.color.setHex(o.jacket);
  MAT.pants.color.setHex(o.pants);
  MAT.scarf.color.setHex(o.scarf);
  MAT.hat.color.setHex(o.hat);
  MAT.wood.color.setHex(o.sled);
  MAT.paint.color.setHex(o.sled);
  MAT.accent.color.setHex(o.scarf);
}

export class RiderView {
  readonly root = new THREE.Group();
  pts: THREE.Vector3[] = [];
  def: VehicleDef = SLED;
  private model: VehicleModel;
  private torso: Limb;
  private arms: Limb[];
  private thighs: Limb[];
  private shins: Limb[];
  private head = new THREE.Group();
  private hands: THREE.Mesh[];
  private feet: THREE.Mesh[];
  private scarf: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private scarfLimbs: Limb[];
  /** Label floating upright above the ghost. */
  private tag: THREE.Sprite | null = null;
  private ghostMat: THREE.Material | null = null;

  constructor(scene: THREE.Scene, ghost = false) {
    scene.add(this.root);
    this.torso = new Limb(0.13, MAT.jacket, this.root, 0.11);
    this.arms = [new Limb(0.045, MAT.jacket, this.root), new Limb(0.045, MAT.jacket, this.root)];
    this.thighs = [new Limb(0.06, MAT.pants, this.root), new Limb(0.06, MAT.pants, this.root)];
    this.shins = [new Limb(0.055, MAT.pants, this.root), new Limb(0.055, MAT.pants, this.root)];
    this.scarfLimbs = [new Limb(0.04, MAT.scarf, this.root), new Limb(0.035, MAT.scarf, this.root)];
    const sphere = (r: number, m: THREE.Material) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
      s.castShadow = true;
      this.root.add(s);
      return s;
    };
    this.hands = [sphere(0.06, MAT.scarf), sphere(0.06, MAT.scarf)];
    this.feet = [sphere(0.075, MAT.boot), sphere(0.075, MAT.boot)];
    for (const f of this.feet) f.scale.set(1.7, 0.9, 1);
    this.hands.forEach((hnd) => hnd.scale.set(1.1, 1, 0.9));
    this.buildHead();
    this.root.add(this.head);
    this.model = buildVehicleModel(SLED, this.root);
    this.setVehicle(SLED, true);
    if (ghost) this.makeGhost();
  }

  /** Swaps the ride (rebuilds the vehicle model). */
  setVehicle(def: VehicleDef, force = false) {
    if (def === this.def && !force) return;
    this.def = def;
    this.model.dispose();
    this.model = buildVehicleModel(def, this.root);
    this.pts = def.points.map(() => new THREE.Vector3());
    for (const s of this.shins) s.visible = def.legLength > 0;
    this.applyGhostLook();
  }

  private applyGhostLook() {
    const mat = this.ghostMat;
    if (!mat) return;
    this.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = mat;
        o.castShadow = false;
        o.renderOrder = 5;
      }
    });
  }

  /** Translucent, glowing look for the best-run ghost, with a "BEST" tag. */
  private makeGhost() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.38, depthWrite: false });
    this.ghostMat = mat;
    this.applyGhostLook();
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 48;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = 'rgba(40,120,200,0.85)';
    ctx.beginPath();
    ctx.roundRect(4, 4, 120, 40, 20);
    ctx.fill();
    ctx.fillStyle = 'white';
    ctx.font = 'bold 26px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('BEST', 64, 25);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    tag.scale.set(1.0, 0.375, 1);
    tag.renderOrder = 6;
    this.tag = tag;
    this.root.add(tag);
  }

  set visible(v: boolean) {
    this.root.visible = v;
  }

  private buildHead() {
    const face = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 10), MAT.skin);
    face.castShadow = true;
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), MAT.hat);
    hat.position.y = 0.03;
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 6, 16), MAT.scarf);
    brim.rotation.x = Math.PI / 2;
    brim.position.y = 0.04;
    const pompom = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), MAT.scarf);
    pompom.position.y = 0.21;
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    for (const z of [-0.06, 0.06]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.022, 6, 4), eyeMat);
      eye.position.set(0.145, 0.0, z);
      this.head.add(eye);
    }
    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.nose);
    nose.position.set(0.16, -0.03, 0);
    const blush = new THREE.MeshBasicMaterial({ color: 0xff9a9a, transparent: true, opacity: 0.6 });
    for (const z of [-0.09, 0.09]) {
      const cheek = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), blush);
      cheek.position.set(0.125, -0.05, z);
      cheek.scale.set(0.4, 0.7, 1);
      this.head.add(cheek);
    }
    this.head.add(nose);
    const neckScarf = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 6, 14), MAT.scarf);
    neckScarf.rotation.x = Math.PI / 2;
    neckScarf.position.y = -0.17;
    this.head.add(face, hat, brim, pompom, neckScarf);
  }

  /** Leg from hip to foot, bending the knee toward `bend` when the leg is short. */
  private leg(k: number, hip: THREE.Vector3, foot: THREE.Vector3, bend: THREE.Vector3) {
    const L = this.def.legLength;
    if (L <= 0) {
      this.thighs[k].set(hip, foot);
      return;
    }
    const d = hip.distanceTo(foot);
    const half = L / 2;
    const lift = d < L ? Math.sqrt(half * half - (d / 2) * (d / 2)) : 0;
    const axis = new THREE.Vector3().subVectors(foot, hip).normalize();
    const out = bend.clone().addScaledVector(axis, -bend.dot(axis));
    if (out.lengthSq() < 1e-6) out.set(0, 0, 0);
    else out.normalize();
    const knee = new THREE.Vector3().addVectors(hip, foot).multiplyScalar(0.5).addScaledVector(out, lift);
    this.thighs[k].set(hip, knee);
    this.shins[k].set(knee, foot);
  }

  /** Reused per frame (no allocations while riding). */
  private v = {
    tail: new THREE.Vector3(),
    nose: new THREE.Vector3(),
    fwd: new THREE.Vector3(),
    right: new THREE.Vector3(),
    up: new THREE.Vector3(),
    spine: new THREE.Vector3(),
    toe: new THREE.Vector3(),
    neck: new THREE.Vector3(),
    look: new THREE.Vector3(),
    side: new THREE.Vector3(),
    knot: new THREE.Vector3(),
    target: new THREE.Vector3(),
    d: new THREE.Vector3(),
  };
  private m = new THREE.Matrix4();
  private basis: Basis = { origin: this.v.tail, fwd: this.v.fwd, up: this.v.up, right: this.v.right };

  /** Positions every part from the simulated points. */
  update(dt: number, crashed: boolean) {
    const p = this.pts;
    // Vehicle basis from the contact points.
    const tail = this.v.tail.addVectors(p[P.tailL], p[P.tailR]).multiplyScalar(0.5);
    const nose = this.v.nose.addVectors(p[P.noseL], p[P.noseR]).multiplyScalar(0.5);
    const fwd = this.v.fwd.subVectors(nose, tail).normalize();
    const right = this.v.right.subVectors(p[P.tailR], p[P.tailL]);
    right.addScaledVector(fwd, -right.dot(fwd)).normalize();
    this.v.up.crossVectors(right, fwd).normalize();
    const posed = this.model.update(p, this.basis, dt, crashed);

    // Body.
    const shoulder = p[P.shoulder];
    const butt = p[P.butt];
    const spine = this.v.spine.subVectors(shoulder, butt).normalize();
    const feet = posed && posed.feet ? posed.feet : [p[P.lFoot], p[P.rFoot]];
    this.torso.set(butt, shoulder);
    this.arms[0].set(shoulder, p[P.lHand]);
    this.arms[1].set(shoulder, p[P.rHand]);
    // Knees bend forward, or toward the toe edge when standing sideways.
    const bend = this.def.sideways ? right : fwd;
    this.leg(0, butt, feet[0], bend);
    this.leg(1, butt, feet[1], bend);
    this.hands[0].position.copy(p[P.lHand]);
    this.hands[1].position.copy(p[P.rHand]);
    this.feet[0].position.copy(feet[0]);
    this.feet[1].position.copy(feet[1]);
    // Boots point along the ride (across the board when sideways), or along the leg once thrown off.
    for (let k = 0; k < 2; k++) {
      let toe: THREE.Vector3;
      if (!crashed) toe = this.v.toe.copy(this.def.sideways ? right : fwd);
      else {
        const leg = this.v.toe.subVectors(this.feet[k].position, butt);
        leg.y = Math.min(leg.y, 0);
        toe = leg.lengthSq() > 1e-6 ? leg.normalize() : leg.copy(fwd);
      }
      this.feet[k].quaternion.setFromUnitVectors(X_AXIS, toe);
    }

    // Head looks where the ride is going (at the hands once thrown off).
    const neck = this.v.neck.copy(shoulder).addScaledVector(spine, 0.2);
    this.head.position.copy(neck);
    const look = crashed ? this.v.look.addVectors(p[P.lHand], p[P.rHand]).multiplyScalar(0.5).sub(shoulder) : this.v.look.copy(fwd);
    look.addScaledVector(spine, -look.dot(spine));
    if (look.lengthSq() < 1e-6) look.copy(fwd);
    look.normalize();
    const side = this.v.side.crossVectors(look, spine).normalize();
    this.head.quaternion.setFromRotationMatrix(this.m.makeBasis(look, spine, side));

    // Scarf: two segments trailing behind with a little lag.
    const knot = this.v.knot.copy(neck).addScaledVector(spine, -0.17).addScaledVector(look, -0.1);
    const k = 1 - Math.exp(-dt * 18);
    this.scarf[0].copy(knot);
    const seg = 0.22;
    for (let i = 1; i < 3; i++) {
      const target = this.v.target.copy(this.scarf[i - 1]).addScaledVector(look, -seg).addScaledVector(spine, -0.05);
      this.scarf[i].lerp(target, k);
      const d = this.v.d.subVectors(this.scarf[i], this.scarf[i - 1]);
      if (d.length() > seg) this.scarf[i].copy(this.scarf[i - 1]).addScaledVector(d.normalize(), seg);
      if (!Number.isFinite(this.scarf[i].x) || this.scarf[i].distanceTo(knot) > 2) this.scarf[i].copy(target);
    }
    if (this.tag) this.tag.position.copy(butt).y += 1.5;
    this.scarfLimbs[0].set(this.scarf[0], this.scarf[1]);
    this.scarfLimbs[1].set(this.scarf[1], this.scarf[2]);
  }
}
