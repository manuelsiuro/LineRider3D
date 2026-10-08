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

export type HeadKind = 'bosh' | 'pumpkin' | 'skull' | 'vampire';

/** Black onesie with white bones printed on it (the Skeleton costume). */
let bonesTex: THREE.CanvasTexture | null = null;
function bonesTexture() {
  if (bonesTex) return bonesTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, 64, 64);
  ctx.fillStyle = '#f2ecdc';
  // Ribs / limb bones: a bar across with knobbly ends, repeated.
  for (let y = 4; y < 64; y += 16) {
    ctx.fillRect(10, y + 3, 44, 5);
    for (const x of [10, 54]) {
      ctx.beginPath();
      ctx.arc(x, y + 3, 3.5, 0, Math.PI * 2);
      ctx.arc(x, y + 8, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  bonesTex = new THREE.CanvasTexture(c);
  bonesTex.colorSpace = THREE.SRGBColorSpace;
  bonesTex.wrapS = bonesTex.wrapT = THREE.RepeatWrapping;
  bonesTex.repeat.set(1, 3);
  return bonesTex;
}

export function applyOutfit(o: { jacket: number; pants: number; scarf: number; hat: number; sled: number; skin?: number; boot?: number; pattern?: 'bones' }) {
  const bones = o.pattern === 'bones' ? bonesTexture() : null;
  for (const m of [MAT.jacket, MAT.pants]) {
    if (m.map !== bones) {
      m.map = bones;
      m.needsUpdate = true;
    }
  }
  // A printed pattern shows its own colors.
  MAT.jacket.color.setHex(bones ? 0xffffff : o.jacket);
  MAT.pants.color.setHex(bones ? 0xffffff : o.pants);
  MAT.skin.color.setHex(o.skin ?? 0xf2c9a0);
  MAT.boot.color.setHex(o.boot ?? 0x3a2a1e);
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
  private headKind: HeadKind = 'bosh';
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
    this.buildHead('bosh');
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

  /** Costume heads: a jack-o'-lantern, a skull or a vampire's. */
  setHead(kind: HeadKind = 'bosh') {
    if (kind === this.headKind) return;
    this.headKind = kind;
    const old = [...this.head.children];
    for (const o of old) {
      o.removeFromParent();
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        // Per-head materials (eyes, glow); the shared MAT ones stay.
        if (!Object.values(MAT).includes(o.material) && o.material !== this.ghostMat) (o.material as THREE.Material).dispose();
      }
    }
    this.buildHead(kind);
    this.applyGhostLook();
  }

  private buildHead(kind: HeadKind) {
    const neckScarf = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 6, 14), MAT.scarf);
    neckScarf.rotation.x = Math.PI / 2;
    neckScarf.position.y = -0.17;
    if (kind === 'pumpkin') return this.pumpkinHead(neckScarf);
    if (kind === 'skull') return this.skullHead(neckScarf);
    if (kind === 'vampire') return this.vampireHead(neckScarf);
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
    this.head.add(face, hat, brim, pompom, neckScarf);
  }

  private mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    o.castShadow = true;
    this.head.add(o);
    return o;
  }

  /** A carved jack-o'-lantern whose eyes and grin glow. */
  private pumpkinHead(neck: THREE.Mesh) {
    const orange = new THREE.MeshStandardMaterial({ color: 0xf07a1c, roughness: 0.6 });
    const dark = new THREE.MeshStandardMaterial({ color: 0xc85a10, roughness: 0.6 });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rib = this.mesh(new THREE.SphereGeometry(0.15, 12, 10), i % 2 ? orange : dark, Math.cos(a) * 0.07, 0.03, Math.sin(a) * 0.07);
      rib.scale.set(0.85, 0.95, 0.85);
    }
    this.mesh(new THREE.CylinderGeometry(0.02, 0.03, 0.09, 6), new THREE.MeshStandardMaterial({ color: 0x4a5a22 }), 0, 0.2, 0).rotation.z = 0.3;
    const glow = new THREE.MeshBasicMaterial({ color: 0xffc040 });
    for (const z of [-0.065, 0.065]) {
      const eye = this.mesh(new THREE.ConeGeometry(0.035, 0.05, 3), glow, 0.2, 0.06, z);
      eye.rotation.set(Math.PI, 0, -Math.PI / 2);
      eye.castShadow = false;
    }
    const grin = this.mesh(new THREE.BoxGeometry(0.03, 0.03, 0.15), glow, 0.2, -0.04, 0);
    grin.castShadow = false;
    for (const z of [-0.04, 0.04]) this.mesh(new THREE.BoxGeometry(0.031, 0.02, 0.02), orange, 0.2, -0.03, z);
    this.head.add(neck);
  }

  /** A grinning skull. */
  private skullHead(neck: THREE.Mesh) {
    const bone = new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 0.55 });
    const hole = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const cranium = this.mesh(new THREE.SphereGeometry(0.16, 14, 10), bone, -0.01, 0.02, 0);
    cranium.scale.set(1.05, 1, 0.95);
    const jaw = this.mesh(new THREE.BoxGeometry(0.16, 0.08, 0.17), bone, 0.06, -0.11, 0);
    jaw.rotation.z = 0.1;
    for (const z of [-0.065, 0.065]) this.mesh(new THREE.SphereGeometry(0.045, 8, 6), hole, 0.125, 0.01, z).scale.set(0.6, 1, 1);
    this.mesh(new THREE.ConeGeometry(0.022, 0.04, 3), hole, 0.15, -0.045, 0).rotation.z = Math.PI;
    for (let i = -2; i <= 2; i++) this.mesh(new THREE.BoxGeometry(0.01, 0.035, 0.004), hole, 0.141, -0.1, i * 0.024);
    this.head.add(neck);
  }

  /** Slicked hair, pale skin, red eyes and two little fangs. */
  private vampireHead(neck: THREE.Mesh) {
    this.mesh(new THREE.SphereGeometry(0.16, 14, 10), MAT.skin);
    const hair = this.mesh(new THREE.SphereGeometry(0.168, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.42), MAT.hat, -0.01, 0.01, 0);
    hair.rotation.z = 0.35;
    // Widow's peak.
    const peak = this.mesh(new THREE.ConeGeometry(0.035, 0.07, 4), MAT.hat, 0.135, 0.09, 0);
    peak.rotation.z = Math.PI;
    const eye = new THREE.MeshBasicMaterial({ color: 0xff2030 });
    for (const z of [-0.06, 0.06]) this.mesh(new THREE.SphereGeometry(0.022, 6, 4), eye, 0.145, 0.0, z);
    const fang = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const z of [-0.03, 0.03]) this.mesh(new THREE.ConeGeometry(0.01, 0.035, 4), fang, 0.152, -0.075, z).rotation.z = Math.PI;
    // A tall cape collar behind the head.
    const cape = new THREE.MeshStandardMaterial({ color: 0x1d1a22, roughness: 0.5, side: THREE.DoubleSide });
    const collar = this.mesh(new THREE.CylinderGeometry(0.2, 0.13, 0.22, 12, 1, true, Math.PI * 0.25, Math.PI * 1.5), cape, -0.02, -0.06, 0);
    collar.rotation.y = Math.PI / 2;
    this.head.add(neck);
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
  update(dt: number, crashed: boolean, airborne = false) {
    const p = this.pts;
    // Vehicle basis from the contact points.
    const tail = this.v.tail.addVectors(p[P.tailL], p[P.tailR]).multiplyScalar(0.5);
    const nose = this.v.nose.addVectors(p[P.noseL], p[P.noseR]).multiplyScalar(0.5);
    const fwd = this.v.fwd.subVectors(nose, tail).normalize();
    const right = this.v.right.subVectors(p[P.tailR], p[P.tailL]);
    right.addScaledVector(fwd, -right.dot(fwd)).normalize();
    this.v.up.crossVectors(right, fwd).normalize();
    const posed = this.model.update(p, this.basis, dt, crashed, airborne);

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
