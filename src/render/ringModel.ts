import * as THREE from 'three';
import type { Ring } from '../track/types';

const gold = new THREE.MeshStandardMaterial({
  color: 0xffc23d,
  emissive: 0xff8a00,
  emissiveIntensity: 0.6,
  metalness: 0.5,
  roughness: 0.3,
});
const arrowMat = new THREE.MeshBasicMaterial({ color: 0xfff1c2, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
const veilMat = new THREE.MeshBasicMaterial({
  color: 0xffd46b,
  transparent: true,
  opacity: 0.12,
  side: THREE.DoubleSide,
  depthWrite: false,
});

/**
 * Boost ring: a glowing golden hoop with chevrons on both sides (it boosts in
 * whichever direction the rider passes through).
 */
export function buildRing(ring: Ring): THREE.Group {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.name = 'spin';
  const torus = new THREE.Mesh(new THREE.TorusGeometry(ring.radius, 0.13, 10, 40), gold);
  torus.castShadow = true;
  spin.add(torus);
  // Studs around the hoop so the spin is visible.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), arrowMat);
    stud.position.set(Math.cos(a) * ring.radius, Math.sin(a) * ring.radius, 0);
    spin.add(stud);
  }
  g.add(spin);
  const veil = new THREE.Mesh(new THREE.CircleGeometry(ring.radius - 0.1, 32), veilMat);
  g.add(veil);
  // Chevrons pointing out of both faces: the boost follows your direction.
  for (const dir of [1, -1]) {
    const shape = new THREE.Shape([
      new THREE.Vector2(-0.5, -0.25),
      new THREE.Vector2(0, 0.25),
      new THREE.Vector2(0.5, -0.25),
      new THREE.Vector2(0.5, -0.05),
      new THREE.Vector2(0, 0.45),
      new THREE.Vector2(-0.5, -0.05),
    ]);
    const chevron = new THREE.Mesh(new THREE.ShapeGeometry(shape), arrowMat);
    // Lay the chevron flat in the ring plane's local XZ so it points along ±Z.
    chevron.rotation.x = (dir * Math.PI) / 2;
    chevron.position.set(0, -ring.radius * 0.55, dir * 0.35);
    g.add(chevron);
  }
  g.position.copy(ring.position);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), ring.axis);
  g.userData.ringId = ring.id;
  g.traverse((o) => (o.userData.ringId = ring.id));
  return g;
}

/** Spins the hoop and pulses it when the rider is close. */
export function animateRing(obj: THREE.Object3D, time: number, riderDistance: number) {
  const spin = obj.getObjectByName('spin');
  if (spin) spin.rotation.z = time * 1.5;
  const near = THREE.MathUtils.clamp(1 - riderDistance / 4, 0, 1);
  const s = 1 + Math.sin(time * 4) * 0.03 + near * 0.25;
  obj.scale.setScalar(s);
}
