import * as THREE from 'three';
import { P, POINT_COUNT } from '../physics/Rider';

const mat = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
const MAT = {
  wood: mat(0xb5793f),
  woodDark: mat(0x7a4b25),
  metal: new THREE.MeshStandardMaterial({ color: 0xcfd6de, metalness: 0.7, roughness: 0.3 }),
  jacket: mat(0x2f6fd0),
  pants: mat(0x2a2f3a),
  skin: mat(0xf2c9a0),
  scarf: mat(0xe0332b),
  hat: mat(0xf2f2f2),
  boot: mat(0x3a2a1e),
  rope: mat(0xe8dcc0),
};

const UP = new THREE.Vector3(0, 1, 0);

/** A cylinder that can be stretched between two points. */
class Limb {
  mesh: THREE.Mesh;
  constructor(radius: number, material: THREE.Material, parent: THREE.Object3D) {
    const geo = new THREE.CylinderGeometry(radius, radius, 1, 8);
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.castShadow = true;
    parent.add(this.mesh);
  }
  set(a: THREE.Vector3, b: THREE.Vector3) {
    const d = new THREE.Vector3().subVectors(b, a);
    const len = d.length();
    this.mesh.position.addVectors(a, b).multiplyScalar(0.5);
    if (len > 1e-6) this.mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    this.mesh.scale.set(1, Math.max(len, 1e-3), 1);
  }
}

export class RiderView {
  readonly root = new THREE.Group();
  readonly pts: THREE.Vector3[] = Array.from({ length: POINT_COUNT }, () => new THREE.Vector3());
  private sled = new THREE.Group();
  private torso: Limb;
  private arms: Limb[];
  private legs: Limb[];
  private ropes: Limb[];
  private head = new THREE.Group();
  private hands: THREE.Mesh[];
  private feet: THREE.Mesh[];
  private scarf: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  private scarfLimbs: Limb[];

  constructor(scene: THREE.Scene) {
    scene.add(this.root);
    this.buildSled();
    this.root.add(this.sled);
    this.torso = new Limb(0.12, MAT.jacket, this.root);
    this.arms = [new Limb(0.045, MAT.jacket, this.root), new Limb(0.045, MAT.jacket, this.root)];
    this.legs = [new Limb(0.06, MAT.pants, this.root), new Limb(0.06, MAT.pants, this.root)];
    this.ropes = [new Limb(0.012, MAT.rope, this.root), new Limb(0.012, MAT.rope, this.root)];
    this.scarfLimbs = [new Limb(0.04, MAT.scarf, this.root), new Limb(0.035, MAT.scarf, this.root)];
    const sphere = (r: number, m: THREE.Material) => {
      const s = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), m);
      s.castShadow = true;
      this.root.add(s);
      return s;
    };
    this.hands = [sphere(0.06, MAT.scarf), sphere(0.06, MAT.scarf)];
    this.feet = [sphere(0.075, MAT.boot), sphere(0.075, MAT.boot)];
    this.buildHead();
    this.root.add(this.head);
  }

  private buildSled() {
    const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geo, m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      this.sled.add(mesh);
      return mesh;
    };
    // Local frame: x forward from tail, y up from the runner bottom, z right.
    for (const z of [-0.12, 0, 0.12]) add(new THREE.BoxGeometry(1.45, 0.04, 0.11), MAT.wood, 0.72, 0.4, z);
    add(new THREE.BoxGeometry(0.06, 0.05, 0.5), MAT.woodDark, 0.1, 0.36, 0);
    add(new THREE.BoxGeometry(0.06, 0.05, 0.5), MAT.woodDark, 1.25, 0.36, 0);
    for (const z of [-0.25, 0.25]) {
      add(new THREE.BoxGeometry(1.45, 0.035, 0.035), MAT.metal, 0.72, 0.02, z);
      // Front curl of the runner.
      const curl = add(new THREE.TorusGeometry(0.15, 0.018, 6, 10, Math.PI), MAT.metal, 1.45, 0.17, z);
      curl.rotation.z = -Math.PI / 2;
      for (const x of [0.2, 0.75, 1.25]) add(new THREE.BoxGeometry(0.035, 0.36, 0.035), MAT.woodDark, x, 0.2, z);
    }
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
    const neckScarf = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.045, 6, 14), MAT.scarf);
    neckScarf.rotation.x = Math.PI / 2;
    neckScarf.position.y = -0.17;
    this.head.add(face, hat, brim, pompom, neckScarf);
  }

  /** Positions every part from the simulated points. */
  update(dt: number, crashed: boolean) {
    const p = this.pts;
    // Sled basis.
    const tail = new THREE.Vector3().addVectors(p[P.tailL], p[P.tailR]).multiplyScalar(0.5);
    const nose = new THREE.Vector3().addVectors(p[P.noseL], p[P.noseR]).multiplyScalar(0.5);
    const fwd = new THREE.Vector3().subVectors(nose, tail).normalize();
    const right = new THREE.Vector3().subVectors(p[P.tailR], p[P.tailL]);
    right.addScaledVector(fwd, -right.dot(fwd)).normalize();
    const up = new THREE.Vector3().crossVectors(right, fwd).normalize();
    this.sled.position.copy(tail);
    this.sled.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(fwd, up, right));

    // Body.
    const shoulder = p[P.shoulder];
    const butt = p[P.butt];
    const spine = new THREE.Vector3().subVectors(shoulder, butt).normalize();
    this.torso.set(butt, shoulder);
    this.arms[0].set(shoulder, p[P.lHand]);
    this.arms[1].set(shoulder, p[P.rHand]);
    this.legs[0].set(butt, p[P.lFoot]);
    this.legs[1].set(butt, p[P.rFoot]);
    this.hands[0].position.copy(p[P.lHand]);
    this.hands[1].position.copy(p[P.rHand]);
    this.feet[0].position.copy(p[P.lFoot]);
    this.feet[1].position.copy(p[P.rFoot]);
    const ropeAnchor = p[P.string];
    if (crashed) {
      this.ropes.forEach((r) => (r.mesh.visible = false));
    } else {
      this.ropes.forEach((r) => (r.mesh.visible = true));
      this.ropes[0].set(p[P.lHand], ropeAnchor);
      this.ropes[1].set(p[P.rHand], ropeAnchor);
    }

    // Head faces forward: use the hands' midpoint as a look hint.
    const neck = shoulder.clone().addScaledVector(spine, 0.2);
    this.head.position.copy(neck);
    const handsMid = new THREE.Vector3().addVectors(p[P.lHand], p[P.rHand]).multiplyScalar(0.5);
    const look = handsMid.sub(shoulder);
    look.addScaledVector(spine, -look.dot(spine));
    if (look.lengthSq() < 1e-6) look.copy(fwd);
    look.normalize();
    const side = new THREE.Vector3().crossVectors(look, spine).normalize();
    this.head.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(look, spine, side));

    // Scarf: two segments trailing behind with a little lag.
    const knot = neck.clone().addScaledVector(spine, -0.17).addScaledVector(look, -0.1);
    const k = 1 - Math.exp(-dt * 18);
    this.scarf[0].copy(knot);
    const seg = 0.22;
    for (let i = 1; i < 3; i++) {
      const target = this.scarf[i - 1].clone().addScaledVector(look, -seg).addScaledVector(spine, -0.05);
      this.scarf[i].lerp(target, k);
      const d = this.scarf[i].clone().sub(this.scarf[i - 1]);
      if (d.length() > seg) this.scarf[i].copy(this.scarf[i - 1]).addScaledVector(d.normalize(), seg);
      if (!Number.isFinite(this.scarf[i].x) || this.scarf[i].distanceTo(knot) > 2) this.scarf[i].copy(target);
    }
    this.scarfLimbs[0].set(this.scarf[0], this.scarf[1]);
    this.scarfLimbs[1].set(this.scarf[1], this.scarf[2]);
  }
}
