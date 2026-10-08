import * as THREE from 'three';
import type { Track } from '../track/Track';
import type { Stroke } from '../track/types';
import type { TrackView } from '../render/TrackView';
import type { History } from './History';

const SELECTED = 0xffa340;

type StrokeData = Omit<Stroke, 'id'>;

const cloneStroke = (s: Stroke | StrokeData): StrokeData => ({
  type: s.type,
  mode: s.mode,
  points: s.points.map((p) => p.clone()),
  planeNormal: s.planeNormal.clone(),
  bank: s.bank,
  autoBank: s.autoBank,
  bankRefY: s.bankRefY,
  walls: s.walls,
  width: s.width,
});

/**
 * The Select tool: pick strokes (click, shift-click, or drag a box), then
 * move them by dragging, copy and paste, mirror, smooth or delete. Every
 * change is one undo step.
 */
export class Selection {
  readonly ids = new Set<number>();
  private clipboard: StrokeData[] = [];
  private pastes = 0;
  private box: { x: number; y: number; el: HTMLElement } | null = null;
  private drag: { plane: THREE.Plane; from: THREE.Vector3; before: Map<number, THREE.Vector3[]> } | null = null;
  private raycaster = new THREE.Raycaster();
  /** Selection size changed (the panel shows the actions). */
  onChange?: (count: number) => void;

  constructor(
    private dom: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private track: Track,
    private view: TrackView,
    private history: History,
  ) {
    // Strokes removed elsewhere (undo, eraser) leave the selection.
    track.on((e) => {
      if (e.kind === 'strokeRemoved' && this.ids.delete(e.stroke.id)) this.changed();
      if (e.kind === 'cleared' && this.ids.size) {
        this.ids.clear();
        this.changed();
      }
      // A rebuilt ribbon loses its tint: put it back.
      if ((e.kind === 'strokeChanged' || e.kind === 'strokeAdded') && this.ids.has(e.stroke.id)) this.paint();
    });
  }

  get active() {
    return this.box !== null || this.drag !== null;
  }

  private strokes() {
    return [...this.ids].map((id) => this.track.strokes.get(id)).filter((s): s is Stroke => !!s);
  }

  private paint() {
    this.view.highlightSet(this.ids, SELECTED);
  }

  private changed() {
    this.paint();
    this.onChange?.(this.ids.size);
  }

  set(ids: Iterable<number>) {
    this.ids.clear();
    for (const id of ids) this.ids.add(id);
    this.changed();
  }

  clear() {
    if (!this.ids.size) return;
    this.set([]);
  }

  private ray(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray;
  }

  /** Pointer down with the Select tool; `hit` is the stroke under the pointer, if any. */
  down(e: PointerEvent, hit: { stroke: Stroke; point: THREE.Vector3 } | null) {
    if (hit && !e.shiftKey) {
      if (!this.ids.has(hit.stroke.id)) this.set([hit.stroke.id]);
      // Drag the selection on a plane facing the camera through the grabbed point.
      const normal = this.camera.getWorldDirection(new THREE.Vector3()).negate();
      const before = new Map(this.strokes().map((s) => [s.id, s.points.map((p) => p.clone())] as const));
      this.drag = { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, hit.point), from: hit.point.clone(), before };
      return true;
    }
    if (hit && e.shiftKey) {
      if (this.ids.has(hit.stroke.id)) this.ids.delete(hit.stroke.id);
      else this.ids.add(hit.stroke.id);
      this.changed();
      return false;
    }
    if (!e.shiftKey) this.clear();
    const el = document.createElement('div');
    el.className = 'select-box';
    document.body.append(el);
    this.box = { x: e.clientX, y: e.clientY, el };
    this.move(e);
    return true;
  }

  move(e: PointerEvent) {
    if (this.box) {
      const { x, y, el } = this.box;
      Object.assign(el.style, {
        left: `${Math.min(x, e.clientX)}px`,
        top: `${Math.min(y, e.clientY)}px`,
        width: `${Math.abs(e.clientX - x)}px`,
        height: `${Math.abs(e.clientY - y)}px`,
      });
      return;
    }
    if (!this.drag) return;
    const to = this.ray(e).intersectPlane(this.drag.plane, new THREE.Vector3());
    if (!to) return;
    const delta = to.sub(this.drag.from);
    for (const [id, pts] of this.drag.before) {
      const s = this.track.strokes.get(id);
      if (!s) continue;
      s.points = pts.map((p) => p.clone().add(delta));
      this.track.updateStroke(s);
    }
  }

  up(e: PointerEvent) {
    if (this.box) {
      const r = this.dom.getBoundingClientRect();
      const x0 = Math.min(this.box.x, e.clientX);
      const x1 = Math.max(this.box.x, e.clientX);
      const y0 = Math.min(this.box.y, e.clientY);
      const y1 = Math.max(this.box.y, e.clientY);
      this.box.el.remove();
      this.box = null;
      if (x1 - x0 < 4 && y1 - y0 < 4) return;
      const v = new THREE.Vector3();
      for (const s of this.track.strokes.values()) {
        if (s.locked) continue;
        const inside = s.points.some((p) => {
          v.copy(p).project(this.camera);
          const sx = r.left + ((v.x + 1) / 2) * r.width;
          const sy = r.top + ((1 - v.y) / 2) * r.height;
          return v.z < 1 && sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1;
        });
        if (inside) this.ids.add(s.id);
      }
      this.changed();
      return;
    }
    if (!this.drag) return;
    const before = this.drag.before;
    this.drag = null;
    const after = new Map([...before.keys()].map((id) => [id, this.track.strokes.get(id)?.points.map((p) => p.clone()) ?? []] as const));
    const moved = [...before].some(([id, pts]) => pts[0] && after.get(id)?.[0] && !pts[0].equals(after.get(id)![0]));
    if (moved) this.history.push({ undo: () => this.setPoints(before), redo: () => this.setPoints(after) });
  }

  private setPoints(points: Map<number, THREE.Vector3[]>) {
    for (const [id, pts] of points) {
      const s = this.track.strokes.get(id);
      if (!s) continue;
      s.points = pts.map((p) => p.clone());
      this.track.updateStroke(s);
    }
  }

  /** Applies a change to every selected stroke's points as one undo step. */
  private edit(fn: (s: Stroke) => THREE.Vector3[]) {
    const strokes = this.strokes();
    if (!strokes.length) return;
    const before = new Map(strokes.map((s) => [s.id, s.points.map((p) => p.clone())] as const));
    const after = new Map(strokes.map((s) => [s.id, fn(s)] as const));
    this.setPoints(after);
    this.history.push({ undo: () => this.setPoints(before), redo: () => this.setPoints(after) });
  }

  /** Flips the selection left-right on screen (lines are reversed so floors stay floors). */
  mirror() {
    const strokes = this.strokes();
    if (!strokes.length) return;
    const box = new THREE.Box3();
    for (const s of strokes) for (const p of s.points) box.expandByPoint(p);
    const center = box.getCenter(new THREE.Vector3());
    // Mirror across the vertical plane facing the camera's right.
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    right.y = 0;
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    const flip = (p: THREE.Vector3) => p.clone().addScaledVector(right, -2 * p.clone().sub(center).dot(right));
    this.edit((s) => s.points.map(flip).reverse());
  }

  /** Rounds off kinks (endpoints stay put so joints hold). */
  smooth() {
    this.edit((s) => {
      let cur = s.points.map((p) => p.clone());
      for (let pass = 0; pass < 3; pass++) {
        const next = cur.map((p) => p.clone());
        for (let i = 1; i < cur.length - 1; i++) next[i].copy(cur[i - 1]).add(cur[i + 1]).multiplyScalar(0.25).addScaledVector(cur[i], 0.5);
        cur = next;
      }
      return cur;
    });
  }

  remove() {
    const strokes = this.strokes();
    if (!strokes.length) return;
    let data = strokes.map((s) => ({ ...s }));
    for (const s of strokes) this.track.removeStroke(s);
    this.history.push({
      undo: () => {
        data = data.map((s) => this.track.addStroke(s));
        this.set(data.map((s) => s.id));
      },
      redo: () => data.forEach((s) => this.track.removeStroke(s)),
    });
  }

  copy() {
    this.clipboard = this.strokes().map(cloneStroke);
    this.pastes = 0;
    return this.clipboard.length;
  }

  /** Pastes the copied strokes a little to the right (further each time), selected. */
  paste() {
    if (!this.clipboard.length) return 0;
    this.pastes++;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    right.y = 0;
    right.normalize();
    const offset = right.multiplyScalar(4 * this.pastes).add(new THREE.Vector3(0, -2 * this.pastes, 0));
    let added = this.clipboard.map((d) => {
      const c = cloneStroke(d);
      c.points.forEach((p) => p.add(offset));
      return this.track.addStroke(c);
    });
    this.set(added.map((s) => s.id));
    this.history.push({
      undo: () => added.forEach((s) => this.track.removeStroke(s)),
      redo: () => {
        added = added.map((s) => this.track.addStroke(s));
        this.set(added.map((s) => s.id));
      },
    });
    return added.length;
  }

  hasClipboard() {
    return this.clipboard.length > 0;
  }
}
