import * as THREE from 'three';
import { pointFrames, segmentFrame } from './frames';

/** Height of bobsled side walls. */
export const WALL_HEIGHT = 0.7;
import type { Checkpoint, Decor, DecorKind, DrawMode, Finish, Hazard, HazardKind, LineType, Ring, Segment, Star, Stroke } from './types';

const CELL = 4;

export type TrackEvent =
  | { kind: 'strokeAdded'; stroke: Stroke }
  | { kind: 'strokeRemoved'; stroke: Stroke }
  | { kind: 'strokeChanged'; stroke: Stroke }
  | { kind: 'decorAdded'; decor: Decor }
  | { kind: 'decorRemoved'; decor: Decor }
  | { kind: 'ringAdded'; ring: Ring }
  | { kind: 'ringRemoved'; ring: Ring }
  | { kind: 'starAdded'; star: Star }
  | { kind: 'starRemoved'; star: Star }
  | { kind: 'checkpointAdded'; checkpoint: Checkpoint }
  | { kind: 'checkpointRemoved'; checkpoint: Checkpoint }
  | { kind: 'hazardAdded'; hazard: Hazard }
  | { kind: 'hazardRemoved'; hazard: Hazard }
  | { kind: 'finishChanged' }
  | { kind: 'goalsChanged' }
  | { kind: 'startChanged' }
  | { kind: 'worldChanged' }
  | { kind: 'cleared' };

/** The newest track format this build reads and writes. */
export const TRACK_VERSION = 1;

/** Why a track could not be read (the message is shown to the player). */
export class TrackFormatError extends Error {}

interface SerializedTrack {
  version: typeof TRACK_VERSION;
  start: number[];
  strokes: {
    type: LineType;
    mode: DrawMode;
    points: number[];
    planeNormal: number[];
    bank: number;
    autoBank?: boolean;
    walls?: boolean;
    width: number;
  }[];
  decor: { kind: DecorKind; position: number[]; rotation: number; scale: number }[];
  rings?: { position: number[]; axis: number[]; radius: number }[];
  stars?: number[][];
  finish?: { position: number[]; axis: number[]; halfWidth: number } | null;
  checkpoints?: { position: number[]; axis: number[]; halfWidth: number }[];
  hazards?: { kind: HazardKind; position: number[]; rotation: number; scale: number }[];
  targetScore?: number;
  name?: string;
  /** Landscape, time of day and weather (Alpine by day when missing). */
  world?: { biome?: string; time?: string; weather?: string };
}

export class Track {
  strokes = new Map<number, Stroke>();
  decor = new Map<number, Decor>();
  rings = new Map<number, Ring>();
  stars = new Map<number, Star>();
  checkpoints = new Map<number, Checkpoint>();
  hazards = new Map<number, Hazard>();
  finish: Finish | null = null;
  /** Score needed for the third star. */
  targetScore = 2000;
  start = new THREE.Vector3(0, 12, 0);
  /** The world the track's author picked (null: the default). */
  world: { biome?: string; time?: string; weather?: string } | null = null;

  private nextId = 1;
  private grid = new Map<string, Segment[]>();
  private segmentsByStroke = new Map<number, Segment[]>();
  private listeners: ((e: TrackEvent) => void)[] = [];
  /** Incremented on every physics-relevant change. */
  revision = 0;

  on(fn: (e: TrackEvent) => void) {
    this.listeners.push(fn);
  }

  private emit(e: TrackEvent) {
    // Decor, goals and the world don't change the track itself (the world's ground drag is set on the simulation).
    if (e.kind !== 'decorAdded' && e.kind !== 'decorRemoved' && e.kind !== 'goalsChanged' && e.kind !== 'worldChanged') this.revision++;
    for (const l of this.listeners) l(e);
  }

  addStroke(s: Omit<Stroke, 'id'> & { id?: number }): Stroke {
    const stroke: Stroke = { ...s, id: s.id ?? this.nextId++ };
    if (stroke.autoBank) stroke.bankRefY = this.start.y;
    this.nextId = Math.max(this.nextId, stroke.id + 1);
    this.strokes.set(stroke.id, stroke);
    this.index(stroke);
    this.emit({ kind: 'strokeAdded', stroke });
    return stroke;
  }

  /** Length of the player's own strokes (puzzle ink: locked pieces are free). */
  inkUsed() {
    let total = 0;
    for (const s of this.strokes.values()) {
      if (s.locked) continue;
      for (let i = 1; i < s.points.length; i++) total += s.points[i].distanceTo(s.points[i - 1]);
    }
    return total;
  }

  removeStroke(stroke: Stroke) {
    if (!this.strokes.has(stroke.id)) return;
    this.unindex(stroke);
    this.strokes.delete(stroke.id);
    this.emit({ kind: 'strokeRemoved', stroke });
  }

  /** Call after mutating a stroke's bank/type/width. */
  updateStroke(stroke: Stroke) {
    this.unindex(stroke);
    this.index(stroke);
    this.emit({ kind: 'strokeChanged', stroke });
  }

  addDecor(d: Omit<Decor, 'id'> & { id?: number }): Decor {
    const decor: Decor = { ...d, id: d.id ?? this.nextId++ };
    this.nextId = Math.max(this.nextId, decor.id + 1);
    this.decor.set(decor.id, decor);
    this.emit({ kind: 'decorAdded', decor });
    return decor;
  }

  removeDecor(decor: Decor) {
    if (!this.decor.delete(decor.id)) return;
    this.emit({ kind: 'decorRemoved', decor });
  }

  addRing(r: Omit<Ring, 'id'> & { id?: number }): Ring {
    const ring: Ring = { ...r, id: r.id ?? this.nextId++ };
    this.nextId = Math.max(this.nextId, ring.id + 1);
    this.rings.set(ring.id, ring);
    this.emit({ kind: 'ringAdded', ring });
    return ring;
  }

  removeRing(ring: Ring) {
    if (!this.rings.delete(ring.id)) return;
    this.emit({ kind: 'ringRemoved', ring });
  }

  addStar(st: Omit<Star, 'id'> & { id?: number }): Star {
    const star: Star = { ...st, id: st.id ?? this.nextId++ };
    this.nextId = Math.max(this.nextId, star.id + 1);
    this.stars.set(star.id, star);
    this.emit({ kind: 'starAdded', star });
    return star;
  }

  removeStar(star: Star) {
    if (!this.stars.delete(star.id)) return;
    this.emit({ kind: 'starRemoved', star });
  }

  addCheckpoint(c: Omit<Checkpoint, 'id'> & { id?: number }): Checkpoint {
    const checkpoint: Checkpoint = { ...c, id: c.id ?? this.nextId++ };
    this.nextId = Math.max(this.nextId, checkpoint.id + 1);
    this.checkpoints.set(checkpoint.id, checkpoint);
    this.emit({ kind: 'checkpointAdded', checkpoint });
    return checkpoint;
  }

  removeCheckpoint(checkpoint: Checkpoint) {
    if (!this.checkpoints.delete(checkpoint.id)) return;
    this.emit({ kind: 'checkpointRemoved', checkpoint });
  }

  /** Checkpoints in a stable order (the recorded state keeps the last one's place + 1). */
  checkpointList(): Checkpoint[] {
    return [...this.checkpoints.values()].sort((a, b) => a.id - b.id);
  }

  addHazard(h: Omit<Hazard, 'id'> & { id?: number }): Hazard {
    const hazard: Hazard = { ...h, id: h.id ?? this.nextId++ };
    this.nextId = Math.max(this.nextId, hazard.id + 1);
    this.hazards.set(hazard.id, hazard);
    this.emit({ kind: 'hazardAdded', hazard });
    return hazard;
  }

  removeHazard(hazard: Hazard) {
    if (!this.hazards.delete(hazard.id)) return;
    this.emit({ kind: 'hazardRemoved', hazard });
  }

  /** Stars in a stable order (their bit in the collected mask). */
  starList(): Star[] {
    return [...this.stars.values()].sort((a, b) => a.id - b.id);
  }

  setFinish(f: Finish | null) {
    this.finish = f;
    this.emit({ kind: 'finishChanged' });
  }

  setTargetScore(v: number) {
    this.targetScore = v;
    this.emit({ kind: 'goalsChanged' });
  }

  setStart(p: THREE.Vector3) {
    this.start.copy(p);
    // Auto-banked turns depend on the start height (expected speed).
    for (const s of this.strokes.values()) {
      if (s.autoBank && s.bankRefY !== p.y) {
        s.bankRefY = p.y;
        this.updateStroke(s);
      }
    }
    this.emit({ kind: 'startChanged' });
  }

  setWorld(w: { biome?: string; time?: string; weather?: string } | null) {
    this.world = w ? { ...w } : null;
    this.emit({ kind: 'worldChanged' });
  }

  clear() {
    this.world = null;
    this.strokes.clear();
    this.decor.clear();
    this.rings.clear();
    this.stars.clear();
    this.checkpoints.clear();
    this.hazards.clear();
    this.finish = null;
    this.targetScore = 2000;
    this.grid.clear();
    this.segmentsByStroke.clear();
    this.emit({ kind: 'cleared' });
  }

  /** Collects segments from grid cells near p (deduplicated into `out`). */
  querySegments(p: THREE.Vector3, out: Set<Segment>) {
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    const cz = Math.floor(p.z / CELL);
    for (let x = cx - 1; x <= cx + 1; x++)
      for (let y = cy - 1; y <= cy + 1; y++)
        for (let z = cz - 1; z <= cz + 1; z++) {
          const list = this.grid.get(`${x},${y},${z}`);
          if (list) for (const s of list) out.add(s);
        }
  }

  /** All stroke endpoints, for snapping. */
  endpoints(): { stroke: Stroke; point: THREE.Vector3; isEnd: boolean }[] {
    const res: { stroke: Stroke; point: THREE.Vector3; isEnd: boolean }[] = [];
    for (const s of this.strokes.values()) {
      res.push({ stroke: s, point: s.points[0], isEnd: false });
      res.push({ stroke: s, point: s.points[s.points.length - 1], isEnd: true });
    }
    return res;
  }

  private index(stroke: Stroke) {
    if (stroke.type === 'scenery') {
      this.segmentsByStroke.set(stroke.id, []);
      return;
    }
    const segs: Segment[] = [];
    const pts = stroke.points;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const len = a.distanceTo(b);
      if (len < 1e-6) continue;
      const f = segmentFrame(stroke, i);
      const seg: Segment = {
        stroke,
        a,
        b,
        dir: f.tangent,
        len,
        up: f.up,
        side: f.side,
        halfWidth: stroke.width / 2,
      };
      segs.push(seg);
    }
    if (stroke.walls) segs.push(...this.wallSegments(stroke));
    for (const seg of segs) this.insert(seg, stroke.width / 2 + 1);
    this.segmentsByStroke.set(stroke.id, segs);
  }

  /** Inserts a segment into every grid cell touched by its bounding box. */
  private insert(seg: Segment, r: number) {
    const min = new THREE.Vector3().copy(seg.a).min(seg.b).subScalar(r);
    const max = new THREE.Vector3().copy(seg.a).max(seg.b).addScalar(r);
    for (let x = Math.floor(min.x / CELL); x <= Math.floor(max.x / CELL); x++)
      for (let y = Math.floor(min.y / CELL); y <= Math.floor(max.y / CELL); y++)
        for (let z = Math.floor(min.z / CELL); z <= Math.floor(max.z / CELL); z++) {
          const key = `${x},${y},${z}`;
          let list = this.grid.get(key);
          if (!list) this.grid.set(key, (list = []));
          list.push(seg);
        }
  }

  /**
   * Low walls along both edges, as collision segments whose solid side faces
   * the inside of the channel.
   */
  private wallSegments(stroke: Stroke): Segment[] {
    const frames = pointFrames(stroke);
    const pts = stroke.points;
    const hw = stroke.width / 2;
    const out: Segment[] = [];
    for (const s of [-1, 1]) {
      for (let i = 0; i < pts.length - 1; i++) {
        const fa = frames[i];
        const fb = frames[i + 1];
        const a = pts[i].clone().addScaledVector(fa.side, s * hw).addScaledVector(fa.up, WALL_HEIGHT / 2);
        const b = pts[i + 1].clone().addScaledVector(fb.side, s * hw).addScaledVector(fb.up, WALL_HEIGHT / 2);
        const len = a.distanceTo(b);
        if (len < 1e-6) continue;
        const dir = new THREE.Vector3().subVectors(b, a).normalize();
        // Normal points inward (towards the track center).
        const up = fa.side.clone().add(fb.side).multiplyScalar(-s);
        up.addScaledVector(dir, -up.dot(dir)).normalize();
        const side = new THREE.Vector3().crossVectors(dir, up).normalize();
        out.push({ stroke, a, b, dir, len, up, side, halfWidth: WALL_HEIGHT / 2, wall: true });
      }
    }
    return out;
  }

  private unindex(stroke: Stroke) {
    const segs = this.segmentsByStroke.get(stroke.id);
    if (!segs || segs.length === 0) return;
    const set = new Set(segs);
    for (const [key, list] of this.grid) {
      const filtered = list.filter((s) => !set.has(s));
      if (filtered.length === 0) this.grid.delete(key);
      else if (filtered.length !== list.length) this.grid.set(key, filtered);
    }
    this.segmentsByStroke.delete(stroke.id);
  }

  serialize(): SerializedTrack {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    return {
      version: TRACK_VERSION,
      start: this.start.toArray().map(r),
      strokes: [...this.strokes.values()].map((s) => ({
        type: s.type,
        mode: s.mode,
        points: s.points.flatMap((p) => p.toArray().map(r)),
        planeNormal: s.planeNormal.toArray().map(r),
        bank: r(s.bank),
        autoBank: s.autoBank,
        walls: s.walls,
        width: r(s.width),
      })),
      decor: [...this.decor.values()].map((d) => ({
        kind: d.kind,
        position: d.position.toArray().map(r),
        rotation: r(d.rotation),
        scale: r(d.scale),
      })),
      rings: [...this.rings.values()].map((g) => ({
        position: g.position.toArray().map(r),
        axis: g.axis.toArray().map(r),
        radius: r(g.radius),
      })),
      stars: this.starList().map((st) => st.position.toArray().map(r)),
      finish: this.finish
        ? { position: this.finish.position.toArray().map(r), axis: this.finish.axis.toArray().map(r), halfWidth: this.finish.halfWidth }
        : null,
      ...(this.checkpoints.size
        ? { checkpoints: this.checkpointList().map((c) => ({ position: c.position.toArray().map(r), axis: c.axis.toArray().map(r), halfWidth: r(c.halfWidth) })) }
        : {}),
      ...(this.hazards.size
        ? { hazards: [...this.hazards.values()].map((h) => ({ kind: h.kind, position: h.position.toArray().map(r), rotation: r(h.rotation), scale: r(h.scale) })) }
        : {}),
      targetScore: this.targetScore,
      ...(this.world ? { world: { ...this.world } } : {}),
    };
  }

  load(data: SerializedTrack) {
    this.clear();
    this.start.fromArray(data.start);
    for (const s of data.strokes) {
      const points: THREE.Vector3[] = [];
      for (let i = 0; i < s.points.length; i += 3) points.push(new THREE.Vector3().fromArray(s.points, i));
      this.addStroke({
        type: s.type,
        mode: s.mode,
        points,
        planeNormal: new THREE.Vector3().fromArray(s.planeNormal),
        bank: s.bank,
        autoBank: s.autoBank,
        walls: s.walls,
        width: s.width,
      });
    }
    for (const d of data.decor) {
      this.addDecor({
        kind: d.kind,
        position: new THREE.Vector3().fromArray(d.position),
        rotation: d.rotation,
        scale: d.scale,
      });
    }
    for (const g of data.rings ?? []) {
      this.addRing({
        position: new THREE.Vector3().fromArray(g.position),
        axis: new THREE.Vector3().fromArray(g.axis).normalize(),
        radius: g.radius,
      });
    }
    for (const p of data.stars ?? []) this.addStar({ position: new THREE.Vector3().fromArray(p) });
    if (data.finish) {
      this.setFinish({
        position: new THREE.Vector3().fromArray(data.finish.position),
        axis: new THREE.Vector3().fromArray(data.finish.axis).normalize(),
        halfWidth: data.finish.halfWidth,
      });
    }
    for (const c of data.checkpoints ?? []) {
      this.addCheckpoint({
        position: new THREE.Vector3().fromArray(c.position),
        axis: new THREE.Vector3().fromArray(c.axis).normalize(),
        halfWidth: c.halfWidth,
      });
    }
    for (const h of data.hazards ?? []) {
      this.addHazard({ kind: h.kind, position: new THREE.Vector3().fromArray(h.position), rotation: h.rotation, scale: h.scale });
    }
    this.targetScore = data.targetScore ?? 2000;
    const w = data.world;
    this.world = w && typeof w === 'object' ? { biome: String(w.biome ?? ''), time: String(w.time ?? ''), weather: String(w.weather ?? '') } : null;
    this.emit({ kind: 'startChanged' });
  }
}

export type { SerializedTrack };

const LINE_TYPES = new Set<string>(['normal', 'accel', 'ice', 'bouncy', 'scenery', 'mud', 'crumble']);
const HAZARD_KINDS = new Set<string>(['icicles', 'thorns', 'urchin', 'cactus', 'barrier', 'spikes', 'wisp', 'lava', 'crystal']);
/** Most checkpoints and hazards a track may hold. */
export const MAX_CHECKPOINTS = 24;
export const MAX_HAZARDS = 200;
/** Generous caps that keep a hostile or corrupt link from freezing the game. */
const MAX_STROKES = 4000;
const MAX_NUMBERS = 600_000;

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec = (v: unknown, n = 3): v is number[] => Array.isArray(v) && v.length === n && v.every(isNum);

/**
 * Checks untrusted track data (share links, saved slots) and returns a clean
 * copy: bad strokes and items are dropped, a newer format or a broken shape
 * throws a TrackFormatError with a message for the player.
 */
export function validateTrack(raw: unknown): SerializedTrack {
  if (!raw || typeof raw !== 'object') throw new TrackFormatError('That is not a track');
  const d = raw as Record<string, unknown>;
  const version = d.version ?? 1;
  if (!isNum(version) || version > TRACK_VERSION) throw new TrackFormatError('This track was made with a newer version of the game: reload the page to update');
  if (!Array.isArray(d.strokes)) throw new TrackFormatError('That is not a track');
  if (d.strokes.length > MAX_STROKES) throw new TrackFormatError('That track is too big to open');
  let numbers = 0;
  const strokes: SerializedTrack['strokes'] = [];
  for (const s of d.strokes as Record<string, unknown>[]) {
    if (!s || typeof s !== 'object') continue;
    const pts = s.points;
    if (!Array.isArray(pts) || pts.length < 6 || pts.length % 3 !== 0 || !pts.every(isNum)) continue;
    numbers += pts.length;
    if (numbers > MAX_NUMBERS) throw new TrackFormatError('That track is too big to open');
    strokes.push({
      type: (LINE_TYPES.has(s.type as string) ? s.type : 'normal') as LineType,
      mode: s.mode === 'path' ? 'path' : 'profile',
      points: pts as number[],
      planeNormal: isVec(s.planeNormal) ? (s.planeNormal as number[]) : [0, 0, 1],
      bank: isNum(s.bank) ? s.bank : 0,
      autoBank: s.autoBank === true ? true : undefined,
      walls: s.walls === true ? true : undefined,
      width: isNum(s.width) && s.width > 0 && s.width < 50 ? s.width : 2.4,
    });
  }
  const list = (v: unknown) => (Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === 'object') : []);
  const decor = list(d.decor)
    .filter((x) => typeof x.kind === 'string' && isVec(x.position))
    .map((x) => ({ kind: x.kind as DecorKind, position: x.position as number[], rotation: isNum(x.rotation) ? x.rotation : 0, scale: isNum(x.scale) && x.scale > 0 ? x.scale : 1 }));
  const rings = list(d.rings)
    .filter((x) => isVec(x.position) && isVec(x.axis) && isNum(x.radius) && x.radius > 0)
    .map((x) => ({ position: x.position as number[], axis: x.axis as number[], radius: x.radius as number }));
  const stars = (Array.isArray(d.stars) ? d.stars : []).filter((p) => isVec(p)) as number[][];
  const f = d.finish as Record<string, unknown> | null | undefined;
  const finish = f && typeof f === 'object' && isVec(f.position) && isVec(f.axis) && isNum(f.halfWidth) ? { position: f.position as number[], axis: f.axis as number[], halfWidth: f.halfWidth as number } : null;
  const checkpoints = list(d.checkpoints)
    .filter((x) => isVec(x.position) && isVec(x.axis) && isNum(x.halfWidth) && x.halfWidth > 0)
    .slice(0, MAX_CHECKPOINTS)
    .map((x) => ({ position: x.position as number[], axis: x.axis as number[], halfWidth: x.halfWidth as number }));
  const hazards = list(d.hazards)
    .filter((x) => HAZARD_KINDS.has(x.kind as string) && isVec(x.position))
    .slice(0, MAX_HAZARDS)
    .map((x) => ({ kind: x.kind as HazardKind, position: x.position as number[], rotation: isNum(x.rotation) ? x.rotation : 0, scale: isNum(x.scale) && x.scale > 0 && x.scale < 10 ? x.scale : 1 }));
  const w = d.world as Record<string, unknown> | undefined;
  return {
    version: TRACK_VERSION,
    start: isVec(d.start) ? (d.start as number[]) : [0, 12, 0],
    strokes,
    decor,
    rings,
    stars,
    finish,
    ...(checkpoints.length ? { checkpoints } : {}),
    ...(hazards.length ? { hazards } : {}),
    targetScore: isNum(d.targetScore) ? d.targetScore : undefined,
    name: typeof d.name === 'string' ? d.name.slice(0, 80) : undefined,
    world: w && typeof w === 'object' ? { biome: String(w.biome ?? ''), time: String(w.time ?? ''), weather: String(w.weather ?? '') } : undefined,
  };
}
