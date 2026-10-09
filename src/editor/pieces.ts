import * as THREE from 'three';

/**
 * Ready-made track pieces for the Build tool. Each one is drawn turtle-style from the end
 * of the track (its position and direction), as arcs and straights, so it always joins
 * the previous line without a kink. Profile pieces live on the drawing plane; path pieces
 * wind over the ground and keep descending.
 */
export type ProfilePiece = 'straight' | 'slope' | 'drop' | 'dip' | 'bump' | 'kicker' | 'gap' | 'loop' | 'finish';
export type PathPiece = 'straight' | 'left45' | 'right45' | 'left90' | 'right90' | 'sbend';
export type PieceSize = 'S' | 'M' | 'L';

export const PROFILE_PIECES: { id: ProfilePiece; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'slope', label: 'Slope' },
  { id: 'drop', label: 'Drop' },
  { id: 'dip', label: 'Dip' },
  { id: 'bump', label: 'Bump' },
  { id: 'kicker', label: 'Kicker' },
  { id: 'gap', label: 'Gap jump' },
  { id: 'loop', label: 'Loop' },
  { id: 'finish', label: 'Finish' },
];

export const PATH_PIECES: { id: PathPiece; label: string }[] = [
  { id: 'straight', label: 'Straight' },
  { id: 'left45', label: 'Left 45°' },
  { id: 'right45', label: 'Right 45°' },
  { id: 'left90', label: 'Left 90°' },
  { id: 'right90', label: 'Right 90°' },
  { id: 'sbend', label: 'S-bend' },
];

const SCALE: Record<PieceSize, number> = { S: 0.7, M: 1, L: 1.4 };
const STEP = 0.5;
const deg = THREE.MathUtils.degToRad;

export interface PieceResult {
  /** One or more lines (a gap jump is three: ramp, pit floor, landing). */
  strokes: THREE.Vector3[][];
  /** Where the next piece starts, and its direction. */
  end: THREE.Vector3;
  tangent: THREE.Vector3;
  /** The finish piece also places the finish gate. */
  finish?: { position: THREE.Vector3; axis: THREE.Vector3 };
}

/** The drawing plane a profile piece is laid on: `u` runs along it, `normal` out of it. */
export interface ProfileFrame {
  origin: THREE.Vector3;
  u: THREE.Vector3;
  normal: THREE.Vector3;
  /** Starting direction in the plane, radians (0: level, negative: downhill). */
  heading: number;
  /** Ribbon width (the loop steps aside by about this much). */
  width: number;
}

/** 2D turtle on the plane (x along `u`, y up, z out of the plane). */
class Turtle {
  x = 0;
  y = 0;
  z = 0;
  pts: { x: number; y: number; z: number }[] = [{ x: 0, y: 0, z: 0 }];
  constructor(public h: number) {}

  straight(len: number) {
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let i = 0; i < n; i++) this.step(len / n, 0, 0);
  }

  /** Turns by `turn` radians (positive: up) along a circle of `radius`; `drift` steps out of the plane. */
  arc(turn: number, radius: number, drift = 0) {
    const len = Math.abs(turn) * radius;
    if (len < 1e-6) return;
    const n = Math.max(2, Math.ceil(len / STEP));
    for (let i = 0; i < n; i++) this.step(len / n, turn / n, drift / n);
  }

  /** Turns to an absolute heading. */
  arcTo(heading: number, radius: number) {
    this.arc(heading - this.h, radius);
  }

  private step(ds: number, dh: number, dz: number) {
    const mid = this.h + dh / 2;
    this.x += Math.cos(mid) * ds;
    this.y += Math.sin(mid) * ds;
    this.z += dz;
    this.h += dh;
    this.pts.push({ x: this.x, y: this.y, z: this.z });
  }

  /** Starts a new line here (the last point of the old one is kept as its end). */
  cut() {
    const done = this.pts;
    this.pts = [{ x: this.x, y: this.y, z: this.z }];
    return done;
  }
}

/** A profile piece from the end of the track. */
export function profilePiece(kind: ProfilePiece, size: PieceSize, f: ProfileFrame): PieceResult {
  const s = SCALE[size];
  const t = new Turtle(f.heading);
  const lines: (typeof t.pts)[] = [];
  let finishAt: { x: number; y: number } | null = null;
  switch (kind) {
    case 'straight':
      t.straight(10 * s);
      break;
    case 'slope':
      t.arcTo(deg(-20), 10 * s);
      t.straight(12 * s);
      break;
    case 'drop':
      t.arcTo(deg(-45), 7 * s);
      t.straight(9 * s);
      t.arcTo(deg(-15), 9 * s);
      break;
    case 'dip':
      t.arcTo(deg(-30), 8 * s);
      t.straight(5 * s);
      t.arcTo(deg(20), 12 * s);
      t.straight(2 * s);
      t.arcTo(0, 10 * s);
      break;
    case 'bump':
      t.arcTo(deg(15), 10 * s);
      t.straight(2 * s);
      t.arcTo(deg(-25), 12 * s);
      t.straight(4 * s);
      t.arcTo(deg(-10), 8 * s);
      break;
    case 'kicker':
      t.arcTo(deg(-5), 8 * s);
      t.arcTo(deg(28), 7 * s);
      t.straight(1.5 * s);
      break;
    case 'gap': {
      // Launch ramp, an empty gap, then a long landing slope a little lower down.
      t.arcTo(deg(-5), 8 * s);
      t.arcTo(deg(22), 7 * s);
      t.straight(1.5 * s);
      lines.push(t.cut());
      // The landing follows the measured flight off this lip (about the same for every
      // ride), closing in on it so riders touch down smoothly, then a long run-out.
      const lip = { x: t.x, y: t.y };
      // A pit floor well under the flight: room for a hazard in the gap.
      const pit: typeof t.pts = [];
      for (let dx = 1.5; dx <= 8.5 + 1e-6; dx += 0.5) pit.push({ x: lip.x + dx, y: lip.y - 2.8, z: t.z });
      lines.push(pit);
      const flight = (dx: number) => -0.0266 * dx * dx + 0.35 * dx + 0.7;
      const gapAt = (dx: number) => 1.6 - (dx - 10) / 16;
      t.pts = [];
      for (let dx = 10; dx <= 26 + 1e-6; dx += 0.5) t.pts.push({ x: lip.x + dx, y: lip.y + flight(dx) - gapAt(dx), z: t.z });
      const lastPt = t.pts[t.pts.length - 1];
      t.x = lastPt.x;
      t.y = lastPt.y;
      t.h = Math.atan(-0.0532 * 26 + 0.35 + 1 / 16);
      t.arcTo(deg(-12), 45 * s);
      break;
    }
    case 'loop': {
      // A teardrop (wide bottom, tight top), like a coaster loop: it pulls far fewer g's
      // at the bottom than a circle that's fast enough at the top. It steps one width
      // aside on the way round, so the way out doesn't cut the way in.
      const wide = 7 * s;
      const tight = 2.6 * s;
      const side = -(f.width + 0.6);
      const total = Math.PI * wide + Math.PI * tight;
      t.arcTo(0, 10 * s);
      t.straight(3 * s);
      t.arc(Math.PI / 2, wide, (side * (Math.PI / 2) * wide) / total);
      t.arc(Math.PI, tight, (side * Math.PI * tight) / total);
      t.arc(Math.PI / 2, wide, (side * (Math.PI / 2) * wide) / total);
      t.straight(4 * s);
      break;
    }
    case 'finish':
      // A wide pull-out: fast rides land here off a slope.
      t.arcTo(0, 24 * s);
      t.straight(12 * s);
      finishAt = { x: t.x - 4 * s, y: t.y };
      break;
  }
  lines.push(t.pts);
  const up = new THREE.Vector3(0, 1, 0);
  const world = (p: { x: number; y: number; z: number }) =>
    f.origin.clone().addScaledVector(f.u, p.x).addScaledVector(up, p.y).addScaledVector(f.normal, p.z);
  const strokes = lines.map((l) => l.map(world));
  const last = strokes[strokes.length - 1];
  const tangent = f.u.clone().multiplyScalar(Math.cos(t.h)).addScaledVector(up, Math.sin(t.h)).normalize();
  const res: PieceResult = { strokes, end: last[last.length - 1].clone(), tangent };
  if (finishAt) res.finish = { position: world({ ...finishAt, z: t.z }).add(new THREE.Vector3(0, 1.2, 0)), axis: f.u.clone().multiplyScalar(Math.cos(t.h)).normalize() };
  return res;
}

/** A path piece from the end of the track: it turns over the ground, descending `grade` percent. */
export function pathPiece(kind: PathPiece, size: PieceSize, origin: THREE.Vector3, dir: THREE.Vector3, grade: number): PieceResult {
  const s = SCALE[size];
  let h = Math.atan2(dir.z, dir.x);
  const p = origin.clone();
  const pts = [p.clone()];
  const drop = grade / 100;
  const step = (ds: number, dh: number) => {
    const mid = h + dh / 2;
    p.x += Math.cos(mid) * ds;
    p.z += Math.sin(mid) * ds;
    p.y -= ds * drop;
    h += dh;
    pts.push(p.clone());
  };
  const straight = (len: number) => {
    const n = Math.max(1, Math.ceil(len / STEP));
    for (let i = 0; i < n; i++) step(len / n, 0);
  };
  // Positive turns go left (seen from above, toward -Z when heading +X).
  const turn = (a: number, r: number) => {
    const len = Math.abs(a) * r;
    const n = Math.max(2, Math.ceil(len / STEP));
    for (let i = 0; i < n; i++) step(len / n, -a / n);
  };
  switch (kind) {
    case 'straight':
      straight(12 * s);
      break;
    case 'left45':
      turn(deg(45), 18 * s);
      straight(3 * s);
      break;
    case 'right45':
      turn(deg(-45), 18 * s);
      straight(3 * s);
      break;
    case 'left90':
      turn(deg(90), 16 * s);
      straight(3 * s);
      break;
    case 'right90':
      turn(deg(-90), 16 * s);
      straight(3 * s);
      break;
    case 'sbend':
      turn(deg(35), 16 * s);
      straight(4 * s);
      turn(deg(-35), 16 * s);
      straight(2 * s);
      break;
  }
  const tangent = new THREE.Vector3(Math.cos(h), -drop, Math.sin(h)).normalize();
  return { strokes: [pts], end: p.clone(), tangent };
}

/** Heading of a direction on a profile plane (0: level along `u`). */
export function headingOn(dir: THREE.Vector3 | null, u: THREE.Vector3) {
  if (!dir) return 0;
  const along = dir.dot(u);
  if (along < 0.1) return 0;
  return Math.atan2(dir.y, along);
}
