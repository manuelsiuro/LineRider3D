import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Hazard, HazardKind } from '../track/types';

/**
 * Low-poly models of the deadly obstacles. Each sits a little outside its collision
 * shape (physics/hazards.ts) and wears a red danger ring, so it reads as "keep away".
 */

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, flatShading: true, ...extra });

const MATS = {
  ice: mat(0xbfe9ff, { roughness: 0.15, metalness: 0.1, emissive: 0x5aa8d8, emissiveIntensity: 0.25, transparent: true, opacity: 0.92 }),
  snow: mat(0xf4f8ff),
  bush: mat(0x2f5a2a),
  thorn: mat(0x8a3a24),
  urchin: mat(0x3a1f4a),
  spine: mat(0x7a4a9a),
  cactus: mat(0x3f7f3c),
  cactusSpine: mat(0xf2e6c4),
  red: mat(0xd8342c),
  white: mat(0xf4f4f4),
  steel: mat(0x9aa3ad, { metalness: 0.6, roughness: 0.35 }),
  dark: mat(0x2a2d33, { metalness: 0.3 }),
  wisp: new THREE.MeshStandardMaterial({ color: 0xcfe8ff, emissive: 0x7fc4ff, emissiveIntensity: 1.1, transparent: true, opacity: 0.72, roughness: 0.3 }),
  eye: mat(0x101820),
  rock: mat(0x3a2a24),
  lava: new THREE.MeshStandardMaterial({ color: 0xff7a1a, emissive: 0xff4a00, emissiveIntensity: 1.6, roughness: 0.4 }),
  crystal: mat(0x9d6bff, { emissive: 0x6a2cff, emissiveIntensity: 0.6, roughness: 0.2, metalness: 0.2 }),
  danger: new THREE.MeshBasicMaterial({ color: 0xff3b30, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }),
};

const mesh = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
};

/** Cones pointing out of a sphere, merged into one mesh. */
function spikyBall(radius: number, spikes: number, length: number, seed: number) {
  const parts: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < spikes; i++) {
    // Fibonacci sphere: evenly spread directions.
    const y = 1 - ((i + 0.5) / spikes) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = i * 2.39996 + seed;
    const dir = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
    const cone = new THREE.ConeGeometry(radius * 0.16, length, 4);
    cone.translate(0, radius + length / 2 - 0.05, 0);
    cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir));
    parts.push(cone);
  }
  return mergeGeometries(parts);
}

const BUILDERS: Record<HazardKind, (g: THREE.Group) => void> = {
  icicles(g) {
    // An ice gantry over the track: posts down to the surface at both edges.
    g.add(mesh(new THREE.BoxGeometry(1.6, 0.35, 3.6), MATS.snow, 0, 0.1, 0));
    for (const z of [-1.65, 1.65]) g.add(mesh(new THREE.BoxGeometry(0.3, 3.7, 0.3), MATS.ice, 0, -1.75, z));
    for (const [x, len, r] of [[-0.55, 1.35, 0.22], [0, 1.9, 0.26], [0.55, 1.25, 0.22], [-0.25, 0.8, 0.14], [0.3, 0.9, 0.15]] as const) {
      const c = mesh(new THREE.ConeGeometry(r, len, 6), MATS.ice, x, -len / 2, (x * 7) % 0.3);
      c.rotation.x = Math.PI;
      g.add(c);
    }
  },
  thorns(g) {
    g.add(mesh(new THREE.DodecahedronGeometry(0.75, 0), MATS.bush, 0, 0.55, 0));
    g.add(mesh(new THREE.DodecahedronGeometry(0.5, 0), MATS.bush, 0.45, 0.45, 0.2));
    g.add(mesh(spikyBall(0.72, 28, 0.32, 1), MATS.thorn, 0, 0.55, 0));
  },
  urchin(g) {
    g.add(mesh(new THREE.IcosahedronGeometry(0.42, 1), MATS.urchin, 0, 0.4, 0));
    g.add(mesh(spikyBall(0.38, 40, 0.42, 2), MATS.spine, 0, 0.4, 0));
  },
  cactus(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.34, 0.38, 2.4, 8), MATS.cactus, 0, 1.2, 0));
    g.add(mesh(new THREE.SphereGeometry(0.34, 8, 6), MATS.cactus, 0, 2.4, 0));
    for (const [z, y0, y1] of [[-0.6, 1.1, 1.85], [0.6, 1.3, 2.05]] as const) {
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, y1 - y0, 7), MATS.cactus, 0, (y0 + y1) / 2, z));
      g.add(mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.5, 7).rotateX(Math.PI / 2), MATS.cactus, 0, y0, z / 2));
      g.add(mesh(new THREE.SphereGeometry(0.2, 7, 5), MATS.cactus, 0, y1, z));
    }
    const spines = new THREE.Group();
    for (let i = 0; i < 26; i++) {
      const a = i * 2.4;
      const y = 0.3 + (i / 26) * 2.1;
      const s = mesh(new THREE.ConeGeometry(0.03, 0.22, 3), MATS.cactusSpine, Math.cos(a) * 0.42, y, Math.sin(a) * 0.42);
      s.rotation.z = -Math.cos(a) * Math.PI / 2;
      s.rotation.x = Math.sin(a) * Math.PI / 2;
      s.castShadow = false;
      spines.add(s);
    }
    g.add(spines);
  },
  barrier(g) {
    for (let k = -4; k < 4; k++) g.add(mesh(new THREE.BoxGeometry(0.22, 0.42, 0.34), k % 2 ? MATS.red : MATS.white, 0, 0.62, k * 0.34 + 0.17));
    for (const z of [-1.1, 1.1]) {
      g.add(mesh(new THREE.BoxGeometry(0.12, 0.6, 0.12), MATS.dark, 0, 0.3, z));
      g.add(mesh(new THREE.BoxGeometry(0.7, 0.08, 0.16), MATS.dark, 0, 0.04, z));
    }
    const lamp = mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffa020, emissive: 0xff8000, emissiveIntensity: 1.5 }), 0, 0.92, 1.1);
    lamp.name = 'blink';
    g.add(lamp);
  },
  spikes(g) {
    g.add(mesh(new THREE.BoxGeometry(0.5, 0.06, 2.6), MATS.dark, 0, 0.03, 0));
    const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < 13; k++) for (const x of [-0.13, 0.13]) parts.push(new THREE.ConeGeometry(0.07, 0.3, 4).translate(x, 0.2, -1.2 + k * 0.2));
    g.add(mesh(mergeGeometries(parts), MATS.steel));
  },
  wisp(g) {
    const body = new THREE.Group();
    body.name = 'bob';
    body.add(mesh(new THREE.SphereGeometry(0.62, 12, 10), MATS.wisp, 0, 1.3, 0));
    body.add(mesh(new THREE.ConeGeometry(0.5, 0.8, 10).rotateX(Math.PI), MATS.wisp, 0, 0.75, 0));
    for (const z of [-0.2, 0.2]) body.add(mesh(new THREE.SphereGeometry(0.09, 6, 5), MATS.eye, -0.55, 1.42, z));
    body.add(mesh(new THREE.SphereGeometry(0.12, 6, 5).scale(0.6, 1.3, 1), MATS.eye, -0.57, 1.15, 0));
    g.add(body);
  },
  lava(g) {
    g.add(mesh(new THREE.CylinderGeometry(0.9, 1.2, 0.5, 8), MATS.rock, 0, 0.2, 0));
    const jet = mesh(new THREE.CylinderGeometry(0.35, 0.6, 4, 8, 1, true), MATS.lava, 0, 2, 0);
    jet.name = 'jet';
    g.add(jet);
    for (let i = 0; i < 5; i++) g.add(mesh(new THREE.IcosahedronGeometry(0.16 + (i % 2) * 0.06, 0), MATS.lava, Math.cos(i * 1.3) * 0.5, 4 + (i % 3) * 0.3, Math.sin(i * 1.3) * 0.5));
  },
  crystal(g) {
    const shard = (h: number, r: number, x: number, z: number, tx: number, tz: number) => {
      const m = mesh(new THREE.OctahedronGeometry(1, 0).scale(r, h / 2, r), MATS.crystal, x, h / 2 - 0.1, z);
      m.rotation.set(tx, 0, tz);
      g.add(m);
    };
    shard(2, 0.36, 0.05, 0, 0, -0.08);
    shard(1.2, 0.24, -0.4, 0.25, 0.15, 0.35);
    shard(0.9, 0.2, 0.35, -0.3, -0.2, -0.4);
  },
};

/** The model of a hazard, placed and turned. */
export function buildHazard(h: Hazard): THREE.Group {
  const g = new THREE.Group();
  BUILDERS[h.kind](g);
  // Danger ring on the ground (or under the ceiling for hanging ones).
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.05, 1.3, 24).rotateX(-Math.PI / 2), MATS.danger);
  ring.name = 'danger';
  ring.position.y = h.kind === 'icicles' ? -0.02 : 0.03;
  ring.renderOrder = 2;
  g.add(ring);
  g.position.copy(h.position);
  g.rotation.y = h.rotation;
  g.scale.setScalar(h.scale);
  g.userData.hazardId = h.id;
  g.traverse((o) => (o.userData.hazardId = h.id));
  return g;
}

/** Idle motion: the wisp bobs, the lava pulses, the barrier lamp blinks. */
export function animateHazard(obj: THREE.Object3D, time: number) {
  const phase = obj.userData.hazardId * 1.7;
  const bob = obj.getObjectByName('bob');
  if (bob) bob.position.y = Math.sin(time * 2.2 + phase) * 0.12;
  const jet = obj.getObjectByName('jet');
  if (jet) jet.scale.set(1 + Math.sin(time * 9 + phase) * 0.08, 1, 1 + Math.cos(time * 7 + phase) * 0.08);
  const blink = obj.getObjectByName('blink') as THREE.Mesh | undefined;
  if (blink) blink.visible = Math.sin(time * 6 + phase) > 0;
  const danger = obj.getObjectByName('danger') as THREE.Mesh | undefined;
  if (danger) (danger.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(time * 4) * 0.15;
}
