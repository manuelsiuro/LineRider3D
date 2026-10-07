import * as THREE from 'three';
import type { Stroke } from './types';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export interface Frame {
  tangent: THREE.Vector3;
  up: THREE.Vector3;
  side: THREE.Vector3;
}

/** Computes base orientation (before banking) for a direction. */
function baseFrame(stroke: Stroke, tangent: THREE.Vector3): Frame {
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  if (stroke.mode === 'profile') {
    // Ribbon width runs along the plane normal; "up" is in-plane, to the left of
    // the drawing direction, so strokes drawn left-to-right are solid on top.
    side.copy(stroke.planeNormal).addScaledVector(tangent, -stroke.planeNormal.dot(tangent));
    if (side.lengthSq() < 1e-8) side.set(0, 0, 1);
    side.normalize();
    up.crossVectors(side, tangent).normalize();
  } else {
    up.copy(WORLD_UP).addScaledVector(tangent, -WORLD_UP.dot(tangent));
    if (up.lengthSq() < 1e-8) up.set(1, 0, 0);
    up.normalize();
    side.crossVectors(tangent, up).normalize();
  }
  return { tangent: tangent.clone(), up, side };
}

function applyBank(f: Frame, bank: number): Frame {
  if (bank !== 0) {
    f.up.applyAxisAngle(f.tangent, bank);
    f.side.applyAxisAngle(f.tangent, bank);
  }
  return f;
}

/** Speed²/gravity of a typical ride, used to size automatic banking. */
const BANK_FACTOR = 14;
const MAX_AUTO_BANK = THREE.MathUtils.degToRad(70);
const autoBankCache = new WeakMap<Stroke, { key: string; banks: number[] }>();

/**
 * Per-point roll that leans turns inward, from the horizontal curvature of the
 * path (smoothed so the ribbon twists gradually).
 */
function autoBanks(stroke: Stroke): number[] {
  const pts = stroke.points;
  const key = `${pts.length}:${pts[0]?.x}:${pts[pts.length - 1]?.z}`;
  const cached = autoBankCache.get(stroke);
  if (cached && cached.key === key) return cached.banks;
  const n = pts.length;
  const raw = new Array<number>(n).fill(0);
  const WINDOW = 3;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - WINDOW)];
    const b = pts[i];
    const c = pts[Math.min(n - 1, i + WINDOW)];
    const t1x = b.x - a.x, t1z = b.z - a.z;
    const t2x = c.x - b.x, t2z = c.z - b.z;
    const l1 = Math.hypot(t1x, t1z);
    const l2 = Math.hypot(t2x, t2z);
    if (l1 < 1e-6 || l2 < 1e-6) continue;
    // Signed turn angle; positive turns toward the ribbon's +side.
    const cross = (t1x * t2z - t1z * t2x) / (l1 * l2);
    const dot = (t1x * t2x + t1z * t2z) / (l1 * l2);
    const curvature = Math.atan2(cross, dot) / ((l1 + l2) / 2);
    raw[i] = THREE.MathUtils.clamp(Math.atan(curvature * BANK_FACTOR), -MAX_AUTO_BANK, MAX_AUTO_BANK);
  }
  // Ease in/out at the ends and smooth.
  const banks = raw.map((_, i) => {
    let sum = 0;
    let w = 0;
    for (let j = Math.max(0, i - WINDOW); j <= Math.min(n - 1, i + WINDOW); j++) {
      sum += raw[j];
      w++;
    }
    return sum / w;
  });
  autoBankCache.set(stroke, { key, banks });
  return banks;
}

function bankAt(stroke: Stroke, i: number): number {
  if (stroke.mode !== 'path' || !stroke.autoBank) return stroke.bank;
  return stroke.bank + autoBanks(stroke)[i];
}

/** Per-point frames used for building the ribbon mesh. */
export function pointFrames(stroke: Stroke): Frame[] {
  const pts = stroke.points;
  const n = pts.length;
  const frames: Frame[] = [];
  for (let i = 0; i < n; i++) {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(n - 1, i + 1)];
    const t = new THREE.Vector3().subVectors(next, prev);
    if (t.lengthSq() < 1e-10) t.set(1, 0, 0);
    t.normalize();
    frames.push(applyBank(baseFrame(stroke, t), bankAt(stroke, i)));
  }
  return frames;
}

/** Frame for the segment between points i and i+1. */
export function segmentFrame(stroke: Stroke, i: number): Frame {
  const t = new THREE.Vector3().subVectors(stroke.points[i + 1], stroke.points[i]);
  if (t.lengthSq() < 1e-10) t.set(1, 0, 0);
  t.normalize();
  return applyBank(baseFrame(stroke, t), (bankAt(stroke, i) + bankAt(stroke, i + 1)) / 2);
}
