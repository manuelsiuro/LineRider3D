import * as THREE from 'three';
import { segmentFrame } from './frames';
import type { Decor, DecorKind, DrawMode, LineType, Segment, Stroke } from './types';

const CELL = 4;

export type TrackEvent =
  | { kind: 'strokeAdded'; stroke: Stroke }
  | { kind: 'strokeRemoved'; stroke: Stroke }
  | { kind: 'strokeChanged'; stroke: Stroke }
  | { kind: 'decorAdded'; decor: Decor }
  | { kind: 'decorRemoved'; decor: Decor }
  | { kind: 'startChanged' }
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
    width: number;
  }[];
  decor: { kind: DecorKind; position: number[]; rotation: number; scale: number }[];
}

export class Track {
  strokes = new Map<number, Stroke>();
  decor = new Map<number, Decor>();
  start = new THREE.Vector3(0, 12, 0);

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
    if (e.kind !== 'decorAdded' && e.kind !== 'decorRemoved') this.revision++;
    for (const l of this.listeners) l(e);
  }

  addStroke(s: Omit<Stroke, 'id'> & { id?: number }): Stroke {
    const stroke: Stroke = { ...s, id: s.id ?? this.nextId++ };
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

  setStart(p: THREE.Vector3) {
    this.start.copy(p);
    this.emit({ kind: 'startChanged' });
  }

  clear() {
    this.strokes.clear();
    this.decor.clear();
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
      // Insert into every cell touched by the segment's bounding box.
      const r = stroke.width / 2 + 1;
      const min = new THREE.Vector3().copy(a).min(b).subScalar(r);
      const max = new THREE.Vector3().copy(a).max(b).addScalar(r);
      for (let x = Math.floor(min.x / CELL); x <= Math.floor(max.x / CELL); x++)
        for (let y = Math.floor(min.y / CELL); y <= Math.floor(max.y / CELL); y++)
          for (let z = Math.floor(min.z / CELL); z <= Math.floor(max.z / CELL); z++) {
            const key = `${x},${y},${z}`;
            let list = this.grid.get(key);
            if (!list) this.grid.set(key, (list = []));
            list.push(seg);
          }
    }
    this.segmentsByStroke.set(stroke.id, segs);
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
        width: r(s.width),
      })),
      decor: [...this.decor.values()].map((d) => ({
        kind: d.kind,
        position: d.position.toArray().map(r),
        rotation: r(d.rotation),
        scale: r(d.scale),
      })),
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
    this.emit({ kind: 'startChanged' });
  }
}

export type { SerializedTrack };
