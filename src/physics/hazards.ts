import * as THREE from 'three';
import type { Hazard, HazardKind } from '../track/types';

/** A capsule in the hazard's own frame (a sphere when a and b are the same point). */
interface Capsule {
  a: [number, number, number];
  b: [number, number, number];
  r: number;
}

export interface HazardDef {
  kind: HazardKind;
  name: string;
  /** Deadly volume, local units: +X along the track, +Y up, before rotation and scale. */
  shape: Capsule[];
  /** Hangs from its position instead of standing on it (placed under a ceiling). */
  hangs?: boolean;
}

/**
 * Deadly obstacles, one or two per biome. The shapes are a little smaller than the
 * models, so a near miss that looks clean is clean.
 */
export const HAZARDS: Record<HazardKind, HazardDef> = {
  icicles: {
    kind: 'icicles',
    name: 'Icicles',
    hangs: true,
    shape: [
      { a: [-0.55, -0.1, 0], b: [-0.55, -1.2, 0], r: 0.18 },
      { a: [0, -0.1, 0], b: [0, -1.7, 0], r: 0.2 },
      { a: [0.55, -0.1, 0], b: [0.55, -1.1, 0], r: 0.18 },
    ],
  },
  thorns: { kind: 'thorns', name: 'Thorn bush', shape: [{ a: [-0.3, 0.55, 0], b: [0.3, 0.55, 0], r: 0.6 }] },
  urchin: { kind: 'urchin', name: 'Sea urchin', shape: [{ a: [0, 0.4, 0], b: [0, 0.4, 0], r: 0.5 }] },
  cactus: {
    kind: 'cactus',
    name: 'Cactus',
    shape: [
      { a: [0, 0, 0], b: [0, 2.3, 0], r: 0.32 },
      { a: [0, 1.1, -0.55], b: [0, 1.8, -0.55], r: 0.2 },
      { a: [0, 1.3, 0.55], b: [0, 2, 0.55], r: 0.2 },
    ],
  },
  barrier: { kind: 'barrier', name: 'Road barrier', shape: [{ a: [0, 0.55, -1.25], b: [0, 0.55, 1.25], r: 0.4 }] },
  spikes: { kind: 'spikes', name: 'Spike strip', shape: [{ a: [0, 0.12, -1.25], b: [0, 0.12, 1.25], r: 0.24 }] },
  wisp: { kind: 'wisp', name: 'Ghost wisp', shape: [{ a: [0, 1.3, 0], b: [0, 1.3, 0], r: 0.65 }] },
  lava: { kind: 'lava', name: 'Lava geyser', shape: [{ a: [0, 0, 0], b: [0, 4, 0], r: 0.55 }] },
  crystal: {
    kind: 'crystal',
    name: 'Crystal shards',
    shape: [
      { a: [0, 0, 0], b: [0.15, 1.7, 0], r: 0.3 },
      { a: [-0.35, 0, 0.2], b: [-0.6, 1.05, 0.3], r: 0.2 },
    ],
  },
};

export const HAZARD_KINDS = Object.keys(HAZARDS) as HazardKind[];

/** Radius around the position that holds the whole shape (for a cheap first test). */
const reach = new Map<HazardKind, number>();
for (const def of Object.values(HAZARDS)) {
  let r = 0;
  for (const c of def.shape) r = Math.max(r, Math.hypot(...c.a) + c.r, Math.hypot(...c.b) + c.r);
  reach.set(def.kind, r);
}

const local = new THREE.Vector3();
const ab = new THREE.Vector3();
const ap = new THREE.Vector3();

/** True when the point is inside the hazard's deadly volume. */
export function hazardHits(h: Hazard, p: THREE.Vector3): boolean {
  const s = h.scale || 1;
  const r0 = (reach.get(h.kind) ?? 3) * s;
  if (p.distanceToSquared(h.position) > r0 * r0) return false;
  // Into the hazard's frame: undo position, turn and scale.
  local.subVectors(p, h.position);
  const c = Math.cos(-h.rotation);
  const sn = Math.sin(-h.rotation);
  const x = local.x * c + local.z * sn;
  const z = -local.x * sn + local.z * c;
  local.set(x / s, local.y / s, z / s);
  for (const cap of HAZARDS[h.kind].shape) {
    ab.set(cap.b[0] - cap.a[0], cap.b[1] - cap.a[1], cap.b[2] - cap.a[2]);
    ap.set(local.x - cap.a[0], local.y - cap.a[1], local.z - cap.a[2]);
    const len2 = ab.lengthSq();
    const t = len2 > 1e-9 ? Math.min(1, Math.max(0, ap.dot(ab) / len2)) : 0;
    if (ap.addScaledVector(ab, -t).lengthSq() < cap.r * cap.r) return true;
  }
  return false;
}
