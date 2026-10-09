import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { pointFrames } from '../track/frames';
import type { Stroke } from '../track/types';
import { terrainHeight } from '../world/terrain';

const SPACING = 4;
const POST = 0.16;
const MIN_HEIGHT = 0.5;
const UNDER = 0.18;

export const supportMaterial = new THREE.MeshStandardMaterial({ color: 0x8a5a36, roughness: 0.85, flatShading: true });

/** Scaffolding material per world: timber, driftwood, rusty or painted steel. */
export function setSupportStyle(style: 'timber' | 'driftwood' | 'rust' | 'steel') {
  const s = { timber: [0x8a5a36, 0.85, 0], driftwood: [0xb8a48a, 0.9, 0], rust: [0x8a4a2e, 0.7, 0.35], steel: [0x5f6873, 0.45, 0.6] }[style];
  supportMaterial.color.setHex(s[0]);
  supportMaterial.roughness = s[1];
  supportMaterial.metalness = s[2];
}

const box = new THREE.BoxGeometry(1, 1, 1);
const m = new THREE.Matrix4();
const q = new THREE.Quaternion();
const Y = new THREE.Vector3(0, 1, 0);

/** A box stretched between two points. */
function beam(a: THREE.Vector3, b: THREE.Vector3, thickness: number): THREE.BufferGeometry {
  const d = new THREE.Vector3().subVectors(b, a);
  const len = d.length();
  q.setFromUnitVectors(Y, d.divideScalar(len));
  m.compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), q, new THREE.Vector3(thickness, len, thickness));
  return box.clone().applyMatrix4(m);
}

/**
 * Wooden scaffolding holding a ribbon above the snow: pairs of posts with a
 * crossbeam, plus X-bracing on tall spans. Purely decorative.
 */
export function buildSupports(stroke: Stroke): THREE.BufferGeometry | null {
  // Crumbling lines hang in the air: scaffolding would make them look safe.
  if (stroke.type === 'scenery' || stroke.type === 'crumble' || stroke.points.length < 2) return null;
  const frames = pointFrames(stroke);
  const pts = stroke.points;
  const parts: THREE.BufferGeometry[] = [];
  const hw = stroke.width / 2 - 0.2;
  let along = SPACING / 2;
  let lastPair: [THREE.Vector3, THREE.Vector3] | null = null;

  for (let i = 1; i < pts.length; i++) {
    along += pts[i].distanceTo(pts[i - 1]);
    if (along < SPACING && i !== pts.length - 1) continue;
    along = 0;
    const f = frames[i];
    // Only under surfaces that face upward (not inside loops or walls).
    if (f.up.y < 0.55) {
      lastPair = null;
      continue;
    }
    const pair: THREE.Vector3[] = [];
    for (const s of [-1, 1]) {
      const top = pts[i].clone().addScaledVector(f.side, s * hw).addScaledVector(f.up, -UNDER);
      const ground = terrainHeight(top.x, top.z);
      if (top.y - ground < MIN_HEIGHT) break;
      const bottom = new THREE.Vector3(top.x, ground - 0.1, top.z);
      parts.push(beam(bottom, top, POST * (1 + Math.min(1, (top.y - ground) / 20))));
      // Footing block.
      parts.push(beam(new THREE.Vector3(top.x, ground - 0.1, top.z), new THREE.Vector3(top.x, ground + 0.25, top.z), POST * 2.2));
      pair.push(top);
    }
    if (pair.length !== 2) {
      lastPair = null;
      continue;
    }
    // Crossbeam under the ribbon.
    const a = pair[0].clone().addScaledVector(f.side, -0.15).addScaledVector(Y, -0.08);
    const b = pair[1].clone().addScaledVector(f.side, 0.15).addScaledVector(Y, -0.08);
    parts.push(beam(a, b, POST * 0.9));
    // Lower crossbeam on tall posts.
    const height = pair[0].y - terrainHeight(pair[0].x, pair[0].z);
    if (height > 4) {
      const mid = height * 0.5;
      parts.push(beam(pair[0].clone().setY(pair[0].y - mid), pair[1].clone().setY(pair[1].y - mid), POST * 0.8));
    }
    // X-bracing between consecutive posts on the same side.
    if (lastPair && height > 2.5) {
      for (let k = 0; k < 2; k++) {
        const p0 = lastPair[k];
        const p1 = pair[k];
        if (p0.distanceTo(p1) > SPACING * 2) continue;
        const g0 = terrainHeight(p0.x, p0.z) + 0.3;
        const g1 = terrainHeight(p1.x, p1.z) + 0.3;
        parts.push(beam(new THREE.Vector3(p0.x, Math.max(g0, p0.y - 0.3), p0.z), new THREE.Vector3(p1.x, Math.max(g1, (p1.y + g1) / 2), p1.z), POST * 0.6));
      }
    }
    lastPair = [pair[0], pair[1]];
  }
  if (parts.length === 0) return null;
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}
