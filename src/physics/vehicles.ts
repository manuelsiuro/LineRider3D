import * as THREE from 'three';

/**
 * Every ride is a Verlet ragdoll described by data: its points, the bones that
 * hold them together and how it handles. All vehicles share the meaning of the
 * first 12 points (see P), so scoring, effects and the camera work for each.
 *
 * Local frame: x forward from the tail, y up (the bottom sits at y = -0.5
 * below the start point), z to the right.
 */

export type VehicleId = 'sled' | 'skis' | 'snowboard' | 'bike' | 'moto' | 'buggy';

export const P = {
  /** Rear contact pair (sled runner tails, ski tails, rear wheel...). */
  tailL: 0,
  tailR: 1,
  /** Front contact pair. */
  noseL: 2,
  noseR: 3,
  /** Center of the vehicle body. */
  peg: 4,
  /** Where the hands hold on (sled string, handlebar, steering wheel...). */
  string: 5,
  butt: 6,
  shoulder: 7,
  lHand: 8,
  rHand: 9,
  lFoot: 10,
  rFoot: 11,
} as const;

export interface PointDef {
  pos: [number, number, number];
  friction: number;
  /** Resists sliding sideways (sled runners, ski edges, tyres). */
  runner?: boolean;
  /** Touching anything with this point is a crash (a head or a roof). */
  fatal?: boolean;
}

export type BoneKind = 'rigid' | 'mount' | 'repel' | 'spring';

export interface Bone {
  a: number;
  b: number;
  rest: number;
  kind: BoneKind;
  /** Stiffness of springs (fraction of the error fixed per iteration). */
  k: number;
}

export interface Handling {
  /** Push / pedal / throttle acceleration on the ground (units/step²). */
  pushAccel: number;
  /** Pushing stops helping above this speed (units/step). */
  pushMax: number;
  /** Fraction of speed removed per step while braking. */
  brake: number;
  /** Flip control in the air: angular acceleration and cap (rad/step). */
  flipAccel: number;
  flipMax: number;
  /** Spin kept per step after releasing the flip key. */
  flipSettle: number;
  /** Landing while spinning faster than this is a crash. */
  spinCrash: number;
  /** 1: push leans forward (frontflip). -1: throttle lifts the nose (backflip). */
  flipSign: 1 | -1;
  /** Flat spins (360s) around the vehicle's up axis with the spin key. */
  yaw: { accel: number; max: number } | null;
  /** Sideways grip of the runner points on tracks. */
  grip: number;
  /** Multiplier of the snow drag on the ground. */
  snowDrag: number;
  /** Strain at which mount bones break (higher is tougher). */
  breakStrain: number;
  /**
   * Rider balance on the ground: fraction of the roll toward the surface
   * normal corrected per step (tall riders would tip over in banked turns).
   */
  balance: number;
  /** In the air without flip input, how strongly (0..1) the pitch rate is steered toward the flight path. */
  airAlign: number;
  /** Fraction of the heading error toward the track direction steered per step. */
  steer: number;
  /** Fraction of the whole rider's sideways slip removed per step on grippy ground (carving). */
  carve: number;
  /**
   * Bobsled walls have no top for this ride: tall riders would otherwise lean
   * or climb over them.
   */
  tallWalls: boolean;
}

export interface VehicleStats {
  speed: number;
  grip: number;
  air: number;
  toughness: number;
}

export interface VehicleDef {
  id: VehicleId;
  name: string;
  blurb: string;
  points: PointDef[];
  bones: Bone[];
  /** Left/right pairs, so the bone solver can run in mirrored order. */
  mirror: Record<number, number>;
  handling: Handling;
  stats: VehicleStats;
  /** Wheel radius for rolling vehicles (visual and sound). */
  wheelRadius: number;
  /** Ride sound family. */
  sound: 'sled' | 'skis' | 'board' | 'pedal' | 'engine' | 'motor';
  /** Rider stands sideways (snowboard). */
  sideways?: boolean;
  /** Visual leg length; the knees bend when the hip is closer than this. */
  legLength: number;
}

const BASE_HANDLING: Handling = {
  pushAccel: 0.0045,
  pushMax: 0.58,
  brake: 0.035,
  flipAccel: 0.03,
  flipMax: 0.3,
  flipSettle: 0.72,
  spinCrash: 0.14,
  flipSign: 1,
  yaw: null,
  grip: 0.25,
  snowDrag: 1,
  breakStrain: 0.3,
  balance: 0,
  airAlign: 0,
  steer: 0,
  carve: 0,
  tallWalls: false,
};
/** Assists for the new rides (the sled keeps its classic physics). */
const ASSIST = { balance: 0.35, airAlign: 0.3, steer: 0.3, carve: 0.5, tallWalls: true };

/** Builds bones from point positions. */
function boneBuilder(points: PointDef[]) {
  const bones: Bone[] = [];
  const add = (a: number, b: number, kind: BoneKind, restScale = 1, k = 1) => {
    const pa = new THREE.Vector3(...points[a].pos);
    const pb = new THREE.Vector3(...points[b].pos);
    bones.push({ a, b, kind, rest: pa.distanceTo(pb) * restScale, k });
  };
  const brace = (ids: number[], kind: BoneKind = 'rigid', k = 1) => {
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) add(ids[i], ids[j], kind, 1, k);
  };
  return { bones, add, brace };
}

const STANDARD_MIRROR: Record<number, number> = {
  [P.tailL]: P.tailR,
  [P.tailR]: P.tailL,
  [P.noseL]: P.noseR,
  [P.noseR]: P.noseL,
  [P.lHand]: P.rHand,
  [P.rHand]: P.lHand,
  [P.lFoot]: P.rFoot,
  [P.rFoot]: P.lFoot,
};

const body = (b: ReturnType<typeof boneBuilder>) => {
  b.add(P.butt, P.shoulder, 'rigid');
  b.add(P.shoulder, P.lHand, 'rigid');
  b.add(P.shoulder, P.rHand, 'rigid');
  b.add(P.butt, P.lFoot, 'rigid');
  b.add(P.butt, P.rFoot, 'rigid');
};

// ------------------------------------------------------------------ sled
function sled(): VehicleDef {
  const points: PointDef[] = [
    { pos: [0, -0.5, -0.25], friction: 0, runner: true },
    { pos: [0, -0.5, 0.25], friction: 0, runner: true },
    { pos: [1.5, -0.5, -0.25], friction: 0 },
    { pos: [1.5, -0.5, 0.25], friction: 0 },
    { pos: [0, 0, 0], friction: 0.8 },
    { pos: [1.75, 0, 0], friction: 0 },
    { pos: [0.5, 0, 0], friction: 0.8 },
    { pos: [0.5, 0.55, 0], friction: 0.8 },
    { pos: [1.15, 0.5, -0.15], friction: 0.1 },
    { pos: [1.15, 0.5, 0.15], friction: 0.1 },
    { pos: [1.0, -0.35, -0.15], friction: 0 },
    { pos: [1.0, -0.35, 0.15], friction: 0 },
  ];
  const b = boneBuilder(points);
  b.brace([P.tailL, P.tailR, P.noseL, P.noseR, P.peg, P.string]);
  body(b);
  for (const s of [P.peg, P.tailL, P.tailR, P.noseL, P.noseR]) b.add(P.butt, s, 'mount');
  b.add(P.shoulder, P.peg, 'mount');
  b.add(P.shoulder, P.noseL, 'mount');
  b.add(P.shoulder, P.noseR, 'mount');
  b.add(P.lHand, P.string, 'mount');
  b.add(P.rHand, P.string, 'mount');
  b.add(P.lFoot, P.noseL, 'mount');
  b.add(P.rFoot, P.noseR, 'mount');
  b.add(P.shoulder, P.lFoot, 'repel', 0.5);
  b.add(P.shoulder, P.rFoot, 'repel', 0.5);
  return {
    id: 'sled',
    name: 'Sled',
    blurb: 'The classic. Low, stable and forgiving: lean into flips with ←/→.',
    points,
    bones: b.bones,
    mirror: STANDARD_MIRROR,
    handling: { ...BASE_HANDLING },
    stats: { speed: 3, grip: 3, air: 3, toughness: 4 },
    wheelRadius: 0,
    sound: 'sled',
    legLength: 0,
  };
}

// ------------------------------------------------------------------ skis
function skis(): VehicleDef {
  const points: PointDef[] = [
    { pos: [0, -0.5, -0.17], friction: 0, runner: true },
    { pos: [0, -0.5, 0.17], friction: 0, runner: true },
    { pos: [1.8, -0.5, -0.17], friction: 0, runner: true },
    { pos: [1.8, -0.5, 0.17], friction: 0, runner: true },
    { pos: [0.9, -0.42, 0], friction: 0 },
    { pos: [1.95, -0.38, 0], friction: 0 },
    { pos: [0.78, 0.08, 0], friction: 0.8 },
    { pos: [1.0, 0.62, 0], friction: 0.8, fatal: true },
    { pos: [1.25, 0.24, -0.34], friction: 0.1 },
    { pos: [1.25, 0.24, 0.34], friction: 0.1 },
    { pos: [0.92, -0.42, -0.17], friction: 0 },
    { pos: [0.92, -0.42, 0.17], friction: 0 },
  ];
  const b = boneBuilder(points);
  b.brace([P.tailL, P.tailR, P.noseL, P.noseR, P.peg, P.string]);
  body(b);
  for (const s of [P.peg, P.tailL, P.tailR, P.noseL, P.noseR]) b.add(P.butt, s, 'mount');
  for (const s of [P.peg, P.tailL, P.tailR, P.noseL, P.noseR]) b.add(P.shoulder, s, 'mount');
  b.add(P.lHand, P.peg, 'mount');
  b.add(P.rHand, P.peg, 'mount');
  b.add(P.lHand, P.noseL, 'mount');
  b.add(P.rHand, P.noseR, 'mount');
  for (const [f, t, n] of [
    [P.lFoot, P.tailL, P.noseL],
    [P.rFoot, P.tailR, P.noseR],
  ]) {
    b.add(f, t, 'mount');
    b.add(f, n, 'mount');
    b.add(f, P.peg, 'mount');
  }
  b.add(P.shoulder, P.lFoot, 'repel', 0.5);
  b.add(P.shoulder, P.rFoot, 'repel', 0.5);
  return {
    id: 'skis',
    name: 'Skis',
    blurb: 'Fast and sharp on the edges. Spin 360s with ↑ in the air, but you stand tall: land clean.',
    points,
    bones: b.bones,
    mirror: STANDARD_MIRROR,
    handling: { ...BASE_HANDLING, ...ASSIST, pushAccel: 0.004, pushMax: 0.64, brake: 0.045, grip: 0.32, snowDrag: 0.6, yaw: { accel: 0.035, max: 0.3 }, breakStrain: 0.42 },
    stats: { speed: 4, grip: 4, air: 3, toughness: 2 },
    wheelRadius: 0,
    sound: 'skis',
    legLength: 0.58,
  };
}

// ------------------------------------------------------------------ snowboard
function snowboard(): VehicleDef {
  const points: PointDef[] = [
    { pos: [0, -0.5, -0.16], friction: 0, runner: true },
    { pos: [0, -0.5, 0.16], friction: 0, runner: true },
    { pos: [1.5, -0.5, -0.16], friction: 0, runner: true },
    { pos: [1.5, -0.5, 0.16], friction: 0, runner: true },
    { pos: [0.75, -0.44, 0], friction: 0 },
    { pos: [1.62, -0.4, 0], friction: 0 },
    { pos: [0.75, 0.04, 0], friction: 0.8 },
    { pos: [0.8, 0.6, 0], friction: 0.8, fatal: true },
    { pos: [0.22, 0.34, 0], friction: 0.1 },
    { pos: [1.3, 0.34, 0], friction: 0.1 },
    { pos: [0.42, -0.42, 0], friction: 0 },
    { pos: [1.08, -0.42, 0], friction: 0 },
  ];
  const b = boneBuilder(points);
  b.brace([P.tailL, P.tailR, P.noseL, P.noseR, P.peg, P.string]);
  body(b);
  for (const s of [P.peg, P.tailL, P.tailR, P.noseL, P.noseR]) b.add(P.butt, s, 'mount');
  for (const s of [P.peg, P.tailL, P.tailR, P.noseL, P.noseR]) b.add(P.shoulder, s, 'mount');
  b.add(P.lHand, P.peg, 'mount');
  b.add(P.rHand, P.peg, 'mount');
  for (const s of [P.tailL, P.tailR, P.peg]) b.add(P.lFoot, s, 'mount');
  for (const s of [P.noseL, P.noseR, P.peg]) b.add(P.rFoot, s, 'mount');
  b.add(P.shoulder, P.lFoot, 'repel', 0.5);
  b.add(P.shoulder, P.rFoot, 'repel', 0.5);
  return {
    id: 'snowboard',
    name: 'Snowboard',
    blurb: 'Style king. Hold ↑ in the air for flat spins and mix them with flips for huge combos.',
    points,
    bones: b.bones,
    // The rider stands on the center line: only the board edges mirror.
    mirror: { [P.tailL]: P.tailR, [P.tailR]: P.tailL, [P.noseL]: P.noseR, [P.noseR]: P.noseL },
    handling: { ...BASE_HANDLING, ...ASSIST, pushAccel: 0.0035, pushMax: 0.56, brake: 0.05, grip: 0.3, snowDrag: 0.65, yaw: { accel: 0.042, max: 0.36 }, breakStrain: 0.45 },
    stats: { speed: 3, grip: 3, air: 5, toughness: 3 },
    wheelRadius: 0,
    sound: 'board',
    sideways: true,
    legLength: 0.56,
  };
}

// ------------------------------------------------------------------ BMX
function bike(): VehicleDef {
  const R = 0.34;
  const points: PointDef[] = [
    { pos: [0, -0.5, -0.18], friction: 0, runner: true },
    { pos: [0, -0.5, 0.18], friction: 0, runner: true },
    { pos: [1.35, -0.5, -0.18], friction: 0, runner: true },
    { pos: [1.35, -0.5, 0.18], friction: 0, runner: true },
    { pos: [0.62, -0.2, 0], friction: 0.3 },
    { pos: [1.15, 0.32, 0], friction: 0.3 },
    { pos: [0.42, 0.26, 0], friction: 0.8 },
    { pos: [0.86, 0.7, 0], friction: 0.8, fatal: true },
    { pos: [1.15, 0.33, -0.24], friction: 0.1 },
    { pos: [1.15, 0.33, 0.24], friction: 0.1 },
    { pos: [0.62, -0.2, -0.13], friction: 0 },
    { pos: [0.62, -0.2, 0.13], friction: 0 },
  ];
  const b = boneBuilder(points);
  b.brace([P.tailL, P.tailR, P.noseL, P.noseR, P.peg, P.string]);
  body(b);
  for (const s of [P.peg, P.tailL, P.tailR, P.noseL, P.noseR]) b.add(P.butt, s, 'mount');
  for (const s of [P.peg, P.string, P.noseL, P.noseR, P.tailL, P.tailR]) b.add(P.shoulder, s, 'mount');
  b.add(P.lHand, P.string, 'mount');
  b.add(P.rHand, P.string, 'mount');
  b.add(P.lHand, P.peg, 'mount');
  b.add(P.rHand, P.peg, 'mount');
  for (const [f, t, n] of [
    [P.lFoot, P.tailL, P.noseL],
    [P.rFoot, P.tailR, P.noseR],
  ]) {
    b.add(f, P.peg, 'mount');
    b.add(f, t, 'mount');
    b.add(f, n, 'mount');
  }
  b.add(P.shoulder, P.lFoot, 'repel', 0.5);
  b.add(P.shoulder, P.rFoot, 'repel', 0.5);
  return {
    id: 'bike',
    name: 'BMX',
    blurb: 'Pedal (→) for the best pick-up, brake hard (←). In the air → pulls a backflip, ← a frontflip.',
    points,
    bones: b.bones,
    mirror: STANDARD_MIRROR,
    handling: { ...BASE_HANDLING, ...ASSIST, pushAccel: 0.0065, pushMax: 0.5, brake: 0.07, flipSign: -1, flipAccel: 0.032, grip: 0.4, snowDrag: 1.8, breakStrain: 0.42 },
    stats: { speed: 2, grip: 4, air: 4, toughness: 3 },
    wheelRadius: R,
    sound: 'pedal',
    legLength: 0.6,
  };
}

// ------------------------------------------------------------------ motorbike
function moto(): VehicleDef {
  const R = 0.38;
  const L = 1.6;
  const points: PointDef[] = [
    { pos: [0, -0.5, -0.2], friction: 0, runner: true },
    { pos: [0, -0.5, 0.2], friction: 0, runner: true },
    { pos: [L, -0.5, -0.2], friction: 0, runner: true },
    { pos: [L, -0.5, 0.2], friction: 0, runner: true },
    { pos: [0.78, -0.08, 0], friction: 0.4 },
    { pos: [1.38, 0.42, 0], friction: 0.3 },
    { pos: [0.55, 0.3, 0], friction: 0.8 },
    { pos: [0.98, 0.76, 0], friction: 0.8, fatal: true },
    { pos: [1.38, 0.43, -0.3], friction: 0.1 },
    { pos: [1.38, 0.43, 0.3], friction: 0.1 },
    { pos: [0.72, -0.1, -0.2], friction: 0 },
    { pos: [0.72, -0.1, 0.2], friction: 0 },
    // 12-14: rear hub, front hub, seat (the frame the wheels hang from).
    { pos: [0, -0.5 + R, 0], friction: 0.2 },
    { pos: [L, -0.5 + R, 0], friction: 0.2 },
    { pos: [0.48, 0.12, 0], friction: 0.4 },
  ];
  const b = boneBuilder(points);
  const frame = [P.peg, P.string, 12, 13, 14];
  b.brace(frame);
  // Wheels are rigid in the physics (soft Verlet springs can fold a wheel
  // through the frame); the suspension travel is animated by the view.
  b.brace([P.tailL, P.tailR, P.noseL, P.noseR, 12, 13, P.peg]);
  for (const w of [P.tailL, P.tailR, P.noseL, P.noseR]) {
    b.add(w, P.string, 'rigid');
    b.add(w, 14, 'rigid');
  }
  body(b);
  for (const s of [P.peg, 14, 12, 13]) b.add(P.butt, s, 'mount');
  for (const s of [P.peg, P.string, 14, 13]) b.add(P.shoulder, s, 'mount');
  b.add(P.lHand, P.string, 'mount');
  b.add(P.rHand, P.string, 'mount');
  b.add(P.lHand, P.peg, 'mount');
  b.add(P.rHand, P.peg, 'mount');
  for (const f of [P.lFoot, P.rFoot]) for (const s of [P.peg, 12, 13]) b.add(f, s, 'mount');
  b.add(P.shoulder, P.lFoot, 'repel', 0.5);
  b.add(P.shoulder, P.rFoot, 'repel', 0.5);
  return {
    id: 'moto',
    name: 'Motorbike',
    blurb: 'Raw power and suspension. Throttle (→) lifts the nose in the air, brake (←) tips it forward.',
    points,
    bones: b.bones,
    mirror: STANDARD_MIRROR,
    handling: { ...BASE_HANDLING, ...ASSIST, pushAccel: 0.0095, pushMax: 0.86, brake: 0.075, flipSign: -1, flipAccel: 0.026, flipMax: 0.26, grip: 0.45, snowDrag: 1.3, breakStrain: 0.5 },
    stats: { speed: 5, grip: 4, air: 3, toughness: 4 },
    wheelRadius: R,
    sound: 'engine',
    legLength: 0.58,
  };
}

// ------------------------------------------------------------------ buggy
function buggy(): VehicleDef {
  const R = 0.34;
  const L = 1.7;
  const W = 0.5;
  const points: PointDef[] = [
    { pos: [0, -0.5, -W], friction: 0, runner: true },
    { pos: [0, -0.5, W], friction: 0, runner: true },
    { pos: [L, -0.5, -W], friction: 0, runner: true },
    { pos: [L, -0.5, W], friction: 0, runner: true },
    { pos: [0.85, -0.2, 0], friction: 0.5 },
    { pos: [1.22, 0.24, 0], friction: 0.3 },
    { pos: [0.66, -0.06, 0], friction: 0.8 },
    { pos: [0.72, 0.42, 0], friction: 0.8 },
    { pos: [1.18, 0.25, -0.17], friction: 0.1 },
    { pos: [1.18, 0.25, 0.17], friction: 0.1 },
    { pos: [1.4, -0.12, -0.15], friction: 0 },
    { pos: [1.4, -0.12, 0.15], friction: 0 },
    // 12-15: chassis corners above the wheels; 16: roll-cage roof.
    { pos: [0, -0.5 + R, -W + 0.08], friction: 0.3 },
    { pos: [0, -0.5 + R, W - 0.08], friction: 0.3 },
    { pos: [L, -0.5 + R, -W + 0.08], friction: 0.3 },
    { pos: [L, -0.5 + R, W - 0.08], friction: 0.3 },
    { pos: [0.68, 0.72, 0], friction: 0.5, fatal: true },
  ];
  const b = boneBuilder(points);
  b.brace([P.peg, P.string, 12, 13, 14, 15, 16]);
  // Rigid wheel geometry (see the motorbike); the view animates the suspension.
  b.brace([P.tailL, P.tailR, P.noseL, P.noseR, 12, 13, 14, 15, P.peg]);
  for (const w of [P.tailL, P.tailR, P.noseL, P.noseR]) {
    b.add(w, P.string, 'rigid');
    b.add(w, 16, 'rigid');
  }
  body(b);
  for (const s of [P.peg, 12, 13, 14, 15]) b.add(P.butt, s, 'mount');
  for (const s of [P.peg, 16, 12, 13]) b.add(P.shoulder, s, 'mount');
  b.add(P.lHand, P.string, 'mount');
  b.add(P.rHand, P.string, 'mount');
  for (const f of [P.lFoot, P.rFoot]) for (const s of [P.peg, 14, 15]) b.add(f, s, 'mount');
  return {
    id: 'buggy',
    name: 'Buggy',
    blurb: 'Four wheels, long-travel suspension and a roll cage. Heavy in the air, keep it off its roof.',
    points,
    bones: b.bones,
    mirror: { ...STANDARD_MIRROR, 12: 13, 13: 12, 14: 15, 15: 14 },
    handling: { ...BASE_HANDLING, ...ASSIST, pushAccel: 0.0075, pushMax: 0.76, brake: 0.08, flipSign: -1, flipAccel: 0.024, flipMax: 0.25, spinCrash: 0.12, grip: 0.5, snowDrag: 1.1, breakStrain: 1.2 },
    stats: { speed: 4, grip: 5, air: 2, toughness: 5 },
    wheelRadius: R,
    sound: 'motor',
    legLength: 0,
  };
}

export const VEHICLES: VehicleDef[] = [sled(), skis(), snowboard(), bike(), moto(), buggy()];
const BY_ID = new Map(VEHICLES.map((v) => [v.id, v]));

export function vehicleById(id: string | null | undefined): VehicleDef {
  return BY_ID.get(id as VehicleId) ?? VEHICLES[0];
}

export const SLED = VEHICLES[0];
