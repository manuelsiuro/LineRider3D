import * as THREE from 'three';

const mat = (color: number, roughness = 0.7, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });

/** Materials shared by every player rider (the outfit recolors them). */
export const MAT = {
  wood: mat(0xb5793f),
  woodDark: mat(0x7a4b25),
  metal: mat(0xcfd6de, 0.3, 0.7),
  jacket: mat(0x2f6fd0),
  pants: mat(0x2a2f3a),
  skin: mat(0xf2c9a0),
  scarf: mat(0xe0332b),
  hat: mat(0xf2f2f2),
  boot: mat(0x3a2a1e),
  rope: mat(0xe8dcc0),
  /** Glossy vehicle paint, follows the outfit's sled color. */
  paint: mat(0xb5793f, 0.32, 0.25),
  /** Second paint tone (outfit scarf color). */
  accent: mat(0xe0332b, 0.4, 0.1),
  tire: mat(0x1d1f24, 0.92),
  dark: mat(0x2a2d33, 0.55, 0.3),
  chrome: mat(0xe8edf2, 0.18, 0.95),
  rubber: mat(0x3b3f47, 0.85),
  glass: new THREE.MeshStandardMaterial({ color: 0xbfe6ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 }),
  light: new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xfff1c0, emissiveIntensity: 1.6 }),
  base: mat(0xf4f4f6, 0.4),
  nose: mat(0xf0a080),
  /** Coffin fittings. */
  brass: mat(0xc9a24a, 0.45, 0.35),
};

export const UP = new THREE.Vector3(0, 1, 0);
const limbDir = new THREE.Vector3();

/** A capsule (cylinder + rounded ends) that can be stretched between two points. */
export class Limb {
  mesh: THREE.Mesh;
  private capA: THREE.Mesh;
  private capB: THREE.Mesh;
  constructor(radius: number, material: THREE.Material, parent: THREE.Object3D, radiusEnd = radius, caps = true) {
    const geo = new THREE.CylinderGeometry(radiusEnd, radius, 1, 10, 1, true);
    this.mesh = new THREE.Mesh(geo, material);
    this.capA = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), material);
    this.capB = new THREE.Mesh(new THREE.SphereGeometry(radiusEnd, 10, 8), material);
    this.capA.visible = this.capB.visible = caps;
    for (const m of [this.mesh, this.capA, this.capB]) {
      m.castShadow = true;
      parent.add(m);
    }
    this.caps = caps;
  }
  private caps: boolean;
  set visible(v: boolean) {
    this.mesh.visible = v;
    this.capA.visible = this.capB.visible = v && this.caps;
  }
  set(a: THREE.Vector3, b: THREE.Vector3) {
    const d = limbDir.subVectors(b, a);
    const len = d.length();
    this.mesh.position.addVectors(a, b).multiplyScalar(0.5);
    if (len > 1e-6) this.mesh.quaternion.setFromUnitVectors(UP, d.divideScalar(len));
    this.mesh.scale.set(1, Math.max(len, 1e-3), 1);
    this.capA.position.copy(a);
    this.capB.position.copy(b);
  }
}

/** Helper to add a mesh to a group at a position. */
export function part(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  m: THREE.Material,
  x: number,
  y: number,
  z: number,
  rot?: [number, number, number],
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, m);
  mesh.position.set(x, y, z);
  if (rot) mesh.rotation.set(...rot);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}

/** A static tube between two local points. */
export function tube(parent: THREE.Object3D, a: [number, number, number], b: [number, number, number], r: number, m: THREE.Material) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8, 1), m);
  mesh.position.copy(va).add(vb).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, d.normalize());
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
