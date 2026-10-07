import * as THREE from 'three';

export type LineType = 'normal' | 'accel' | 'ice' | 'bouncy' | 'scenery';

/**
 * How a stroke was drawn:
 * - profile: drawn on a vertical plane; the stroke is the side profile of the
 *   track and the ribbon is extruded along the plane normal (classic Line Rider).
 * - path: drawn on the ground plane seen from above; the ribbon lies flat along
 *   the path and descends with a constant grade.
 */
export type DrawMode = 'profile' | 'path';

export interface Stroke {
  id: number;
  type: LineType;
  mode: DrawMode;
  points: THREE.Vector3[];
  /** Normal of the drawing plane (profile mode). */
  planeNormal: THREE.Vector3;
  /** Roll of the ribbon around its direction, radians. */
  bank: number;
  /** Path strokes: tilt turns inward automatically, like a bobsled run. */
  autoBank?: boolean;
  width: number;
}

export type DecorKind = 'pine' | 'snowman' | 'cabin' | 'rock' | 'lamp' | 'flag' | 'gift';

/** A ring in space that launches the rider along its axis. */
export interface Ring {
  id: number;
  position: THREE.Vector3;
  /** Unit vector: the boost direction. */
  axis: THREE.Vector3;
  radius: number;
}

export interface Decor {
  id: number;
  kind: DecorKind;
  position: THREE.Vector3;
  rotation: number;
  scale: number;
}

/** A collision segment derived from a stroke. */
export interface Segment {
  stroke: Stroke;
  a: THREE.Vector3;
  b: THREE.Vector3;
  dir: THREE.Vector3;
  len: number;
  up: THREE.Vector3;
  side: THREE.Vector3;
  halfWidth: number;
}

export const LINE_COLORS: Record<LineType, number> = {
  normal: 0x2f7fd8,
  accel: 0xe0433a,
  ice: 0x9fe3f5,
  bouncy: 0xf0529c,
  scenery: 0x3aa15a,
};
