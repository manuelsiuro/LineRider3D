import * as THREE from 'three';
import { pointFrames, segmentFrame } from './frames';

/** Height of bobsled side walls. */
export const WALL_HEIGHT = 0.7;
import type { Decor, DecorKind, DrawMode, Finish, LineType, Ring, Segment, Star, Stroke } from './types';

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
  | { kind: 'finishChanged' }
  | { kind: 'goalsChanged' }
  | { kind: 'startChanged' }
  | { kind: 'worldChanged' }
  | { kind: 'cleared' };

interface SerializedTrack {
  version: 1;
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
      version: 1,
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
    this.targetScore = data.targetScore ?? 2000;
    const w = data.world;
    this.world = w && typeof w === 'object' ? { biome: String(w.biome ?? ''), time: String(w.time ?? ''), weather: String(w.weather ?? '') } : null;
    this.emit({ kind: 'startChanged' });
  }
}

export type { SerializedTrack };
