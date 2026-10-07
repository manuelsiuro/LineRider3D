import * as THREE from 'three';
import { MOUSE, TOUCH } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Track } from '../track/Track';
import type { DecorKind, DrawMode, LineType, Stroke } from '../track/types';
import type { TrackView } from '../render/TrackView';
import { buildRibbonMesh } from '../render/ribbon';
import { History } from './History';

export type Tool = 'pencil' | 'line' | 'eraser' | 'bank' | 'decor' | 'ring' | 'start' | 'hand';

export interface EditorSettings {
  lineType: LineType;
  mode: DrawMode;
  width: number;
  /** Bank for new strokes, degrees. */
  bank: number;
  /** Descent of path strokes, percent. */
  grade: number;
  lockPlane: boolean;
  autoBank: boolean;
  decor: DecorKind;
}

const SNAP_PX = 26;
const MIN_SEG = 0.35;
const LINE_STEP = 0.5;
const ANGLE_SNAP = THREE.MathUtils.degToRad(5);

interface DrawState {
  points: THREE.Vector3[];
  /** Plane used for the whole stroke. */
  plane: THREE.Plane;
  normal: THREE.Vector3;
  start: THREE.Vector3;
  preview: THREE.Mesh | null;
}

export class Editor {
  tool: Tool = 'pencil';
  settings: EditorSettings = {
    lineType: 'normal',
    mode: 'profile',
    width: 2.4,
    bank: 0,
    grade: 15,
    lockPlane: false,
    autoBank: true,
    decor: 'pine',
  };
  readonly history = new History();
  /** Fired with a short status message (e.g. bank angle). */
  onHint?: (text: string) => void;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private draw: DrawState | null = null;
  private touches = new Set<number>();
  private lockedNormal = new THREE.Vector3(0, 0, 1);
  private grid: THREE.Group;
  private snapRing: THREE.Mesh;
  private bankDrag: { stroke: Stroke; x: number; bank0: number } | null = null;
  private erasing = false;
  private dragPointer: number | null = null;

  constructor(
    private dom: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private scene: THREE.Scene,
    private controls: OrbitControls,
    private track: Track,
    private view: TrackView,
    private ground: THREE.Object3D,
  ) {
    this.grid = this.buildGrid();
    scene.add(this.grid);
    this.snapRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.07, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb02e, depthTest: false, transparent: true }),
    );
    this.snapRing.renderOrder = 10;
    this.snapRing.visible = false;
    scene.add(this.snapRing);

    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setTool('pencil');
  }

  setTool(tool: Tool) {
    this.cancelDraw();
    this.tool = tool;
    const c = this.controls;
    if (tool === 'hand') {
      c.mouseButtons = { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
      c.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };
    } else {
      c.mouseButtons = { LEFT: null as unknown as MOUSE, MIDDLE: MOUSE.PAN, RIGHT: MOUSE.ROTATE };
      c.touches = { ONE: null as unknown as TOUCH, TWO: TOUCH.DOLLY_ROTATE };
    }
    this.dom.style.cursor = tool === 'hand' ? 'grab' : tool === 'eraser' || tool === 'bank' ? 'pointer' : 'crosshair';
    this.view.highlight(null);
  }

  // ---------------------------------------------------------------- plane

  /** Normal of the vertical drawing plane: faces the camera. */
  private profileNormal(): THREE.Vector3 {
    if (this.settings.lockPlane) return this.lockedNormal.clone();
    const n = new THREE.Vector3().subVectors(this.camera.position, this.controls.target);
    n.y = 0;
    if (n.lengthSq() < 1e-6) n.set(0, 0, 1);
    n.normalize();
    // Snap to multiples of 15° when close, so straight runs are easy.
    const a = Math.atan2(n.x, n.z);
    const step = Math.PI / 12;
    const snapped = Math.round(a / step) * step;
    const angle = Math.abs(a - snapped) < ANGLE_SNAP ? snapped : a;
    n.set(Math.sin(angle), 0, Math.cos(angle));
    this.lockedNormal.copy(n);
    return n;
  }

  private planeThrough(point: THREE.Vector3): { plane: THREE.Plane; normal: THREE.Vector3 } {
    const normal = this.settings.mode === 'profile' ? this.profileNormal() : new THREE.Vector3(0, 1, 0);
    return { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point), normal };
  }

  /** Drawing-plane grid that fades out radially. */
  private buildGrid() {
    const g = new THREE.Group();
    const geo = new THREE.PlaneGeometry(70, 70).rotateX(-Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      extensions: { derivatives: true } as never,
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying vec2 vUv;
        float line(vec2 p, float step) {
          vec2 g = abs(fract(p / step - 0.5) - 0.5) / fwidth(p / step);
          return 1.0 - min(min(g.x, g.y), 1.0);
        }
        void main(){
          float fade = 1.0 - smoothstep(8.0, 34.0, length(vUv));
          float minor = line(vUv, 1.0) * 0.35;
          float major = line(vUv, 5.0);
          float a = max(minor, major) * fade * 0.55;
          float axis = (1.0 - min(abs(vUv.x) / fwidth(vUv.x), 1.0)) * fade;
          vec3 col = mix(vec3(0.24, 0.45, 0.7), vec3(1.0, 0.55, 0.15), axis);
          a = max(a, axis * 0.8);
          if (a < 0.01) discard;
          gl_FragColor = vec4(col, a);
        }`,
    });
    const plane = new THREE.Mesh(geo, mat);
    plane.renderOrder = 2;
    g.add(plane);
    return g;
  }

  /** Called every frame to place the grid and hover feedback. */
  update(visible: boolean) {
    const drawing = this.tool === 'pencil' || this.tool === 'line' || this.tool === 'start' || this.tool === 'ring';
    this.grid.visible = visible && drawing;
    if (!this.grid.visible) {
      this.snapRing.visible = this.snapRing.visible && visible;
      return;
    }
    const origin = this.draw ? this.draw.start : this.controls.target;
    const normal = this.draw ? this.draw.normal : this.settings.mode === 'profile' ? this.profileNormal() : new THREE.Vector3(0, 1, 0);
    this.grid.position.copy(origin);
    this.grid.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  }

  // ---------------------------------------------------------------- input

  private setRay(e: PointerEvent) {
    const r = this.dom.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private toScreen(p: THREE.Vector3) {
    const v = p.clone().project(this.camera);
    const r = this.dom.getBoundingClientRect();
    return { x: ((v.x + 1) / 2) * r.width + r.left, y: ((1 - v.y) / 2) * r.height + r.top, behind: v.z > 1 };
  }

  private findSnap(e: PointerEvent): THREE.Vector3 | null {
    let best: THREE.Vector3 | null = null;
    let bestD = SNAP_PX;
    for (const ep of this.track.endpoints()) {
      if (this.draw && this.draw.points[0] === ep.point) continue;
      const s = this.toScreen(ep.point);
      if (s.behind) continue;
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      if (d < bestD) {
        bestD = d;
        best = ep.point;
      }
    }
    return best;
  }

  private pickStroke(e: PointerEvent): { stroke: Stroke; point: THREE.Vector3; normal: THREE.Vector3 } | null {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects(this.view.ribbons.children, false)[0];
    if (!hit) return null;
    const stroke = this.track.strokes.get(hit.object.userData.strokeId);
    if (!stroke) return null;
    const normal = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
    return { stroke, point: hit.point, normal };
  }

  private pickRing(e: PointerEvent) {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects(this.view.rings.children, true)[0];
    if (!hit) return null;
    return this.track.rings.get(hit.object.userData.ringId) ?? null;
  }

  private pickDecor(e: PointerEvent) {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects(this.view.decor.children, true)[0];
    if (!hit) return null;
    return this.track.decor.get(hit.object.userData.decorId) ?? null;
  }

  private onDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      this.touches.add(e.pointerId);
      if (this.touches.size > 1) {
        // Second finger: this is a camera gesture, not a stroke.
        this.cancelDraw();
        this.bankDrag = null;
        this.erasing = false;
        return;
      }
    }
    if (e.button !== 0 || this.tool === 'hand') return;
    this.dragPointer = e.pointerId;

    switch (this.tool) {
      case 'pencil':
      case 'line':
        this.beginStroke(e);
        break;
      case 'eraser':
        this.erasing = true;
        this.eraseAt(e);
        break;
      case 'bank': {
        const hit = this.pickStroke(e);
        if (hit) {
          this.bankDrag = { stroke: hit.stroke, x: e.clientX, bank0: hit.stroke.bank };
          this.controls.enabled = false;
        }
        break;
      }
      case 'decor':
        this.placeDecor(e);
        break;
      case 'ring':
        this.placeRing(e);
        break;
      case 'start':
        this.placeStart(e);
        break;
    }
  };

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && this.touches.size > 1) return;
    const active = this.dragPointer === e.pointerId;

    if (this.draw && active) {
      this.extendStroke(e);
      return;
    }
    if (this.bankDrag && active) {
      const deg = THREE.MathUtils.radToDeg(this.bankDrag.bank0) + (e.clientX - this.bankDrag.x) * 0.5;
      let snapped = Math.round(deg / 15) * 15;
      if (Math.abs(deg - snapped) > 3) snapped = deg;
      const clamped = THREE.MathUtils.clamp(snapped, -180, 180);
      this.bankDrag.stroke.bank = THREE.MathUtils.degToRad(clamped);
      this.track.updateStroke(this.bankDrag.stroke);
      this.onHint?.(`Bank ${Math.round(clamped)}°`);
      return;
    }
    if (this.erasing && active) {
      this.eraseAt(e);
      return;
    }
    // Hover feedback (mouse only).
    if (e.pointerType !== 'mouse' || e.target !== this.dom) return;
    if (this.tool === 'pencil' || this.tool === 'line') {
      const snap = this.findSnap(e);
      this.showSnap(snap);
    } else {
      this.showSnap(null);
    }
    if (this.tool === 'eraser' || this.tool === 'bank') {
      this.view.highlight(this.pickStroke(e)?.stroke.id ?? null);
    }
  };

  private onUp = (e: PointerEvent) => {
    if (e.pointerType === 'touch') this.touches.delete(e.pointerId);
    if (this.dragPointer !== e.pointerId) return;
    this.dragPointer = null;
    if (this.draw) this.finishStroke(e);
    if (this.bankDrag) {
      const { stroke, bank0 } = this.bankDrag;
      const bank1 = stroke.bank;
      if (bank1 !== bank0) {
        const id = stroke.id;
        const set = (b: number) => {
          const s = this.track.strokes.get(id);
          if (!s) return;
          s.bank = b;
          this.track.updateStroke(s);
        };
        this.history.push({ undo: () => set(bank0), redo: () => set(bank1) });
      }
      this.bankDrag = null;
      this.controls.enabled = true;
    }
    this.erasing = false;
  };

  private showSnap(p: THREE.Vector3 | null) {
    this.snapRing.visible = !!p;
    if (p) {
      this.snapRing.position.copy(p);
      this.snapRing.quaternion.copy(this.camera.quaternion);
    }
  }

  // ---------------------------------------------------------------- strokes

  private beginStroke(e: PointerEvent) {
    const snap = this.findSnap(e);
    const origin = snap ?? this.controls.target;
    const { plane, normal } = this.planeThrough(origin);
    this.setRay(e);
    let start: THREE.Vector3 | null = snap ? snap.clone() : this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!start) return;
    if (snap) start = snap; // share the exact point for a seamless joint
    this.draw = { points: [start], plane, normal, start: start.clone(), preview: null };
    this.controls.enabled = false;
    this.showSnap(snap);
  }

  /** Ray hit on the plane, at the current height for path strokes. */
  private planeHit(e: PointerEvent, from: THREE.Vector3): THREE.Vector3 | null {
    const d = this.draw!;
    this.setRay(e);
    if (this.settings.mode === 'path') {
      // Horizontal plane through the stroke's start, then apply the descent.
      const hit = this.raycaster.ray.intersectPlane(d.plane, new THREE.Vector3());
      if (!hit) return null;
      const dist = Math.hypot(hit.x - from.x, hit.z - from.z);
      hit.y = from.y - (dist * this.settings.grade) / 100;
      return hit;
    }
    return this.raycaster.ray.intersectPlane(d.plane, new THREE.Vector3());
  }

  private extendStroke(e: PointerEvent) {
    const d = this.draw!;
    if (this.tool === 'pencil') {
      const last = d.points[d.points.length - 1];
      const hit = this.planeHit(e, last);
      if (!hit) return;
      if (hit.distanceTo(last) < MIN_SEG) return;
      d.points.push(hit);
    } else {
      const hit = this.planeHit(e, d.start);
      if (!hit) return;
      d.points = this.lineThrough(d.points[0], hit);
    }
    this.showSnap(this.findSnap(e));
    this.updatePreview();
  }

  private lineThrough(a: THREE.Vector3, b: THREE.Vector3) {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / LINE_STEP));
    const pts = [a];
    for (let i = 1; i <= n; i++) pts.push(new THREE.Vector3().lerpVectors(a, b, i / n));
    return pts;
  }

  private strokeFromDraw(points: THREE.Vector3[]): Omit<Stroke, 'id'> {
    return {
      type: this.settings.lineType,
      mode: this.settings.mode,
      points,
      planeNormal: this.draw!.normal.clone(),
      bank: THREE.MathUtils.degToRad(this.settings.bank),
      autoBank: this.settings.mode === 'path' && this.settings.autoBank,
      width: this.settings.width,
    };
  }

  private updatePreview() {
    const d = this.draw!;
    if (d.preview) {
      this.scene.remove(d.preview);
      d.preview.geometry.dispose();
      d.preview = null;
    }
    if (d.points.length < 2) return;
    d.preview = buildRibbonMesh({ ...this.strokeFromDraw(d.points), id: -1 });
    this.scene.add(d.preview);
  }

  private cancelDraw() {
    if (this.draw?.preview) {
      this.scene.remove(this.draw.preview);
      this.draw.preview.geometry.dispose();
    }
    this.draw = null;
    this.controls.enabled = true;
    this.showSnap(null);
  }

  private finishStroke(e: PointerEvent) {
    const d = this.draw!;
    let pts = d.points;
    // Snap the end onto another stroke's endpoint.
    const endSnap = this.findSnap(e);
    if (endSnap && pts.length >= 2) {
      if (this.tool === 'line') pts = this.lineThrough(pts[0], endSnap);
      pts[pts.length - 1] = endSnap;
    }
    if (this.tool === 'pencil') pts = smooth(pts);
    const valid = pts.length >= 2 && pts[0].distanceTo(pts[pts.length - 1]) > 0.2;
    const data = valid ? this.strokeFromDraw(pts) : null;
    this.cancelDraw();
    if (!data) return;
    let stroke = this.track.addStroke(data);
    this.history.push({
      undo: () => this.track.removeStroke(stroke),
      redo: () => (stroke = this.track.addStroke(stroke)),
    });
  }

  // ---------------------------------------------------------------- other tools

  private eraseAt(e: PointerEvent) {
    const ring = this.pickRing(e);
    if (ring) {
      let r = ring;
      this.track.removeRing(r);
      this.history.push({ undo: () => (r = this.track.addRing(r)), redo: () => this.track.removeRing(r) });
      return;
    }
    const hit = this.pickStroke(e);
    const decor = hit ? null : this.pickDecor(e);
    if (hit) {
      let stroke = hit.stroke;
      this.track.removeStroke(stroke);
      this.history.push({ undo: () => (stroke = this.track.addStroke(stroke)), redo: () => this.track.removeStroke(stroke) });
    } else if (decor) {
      let d = decor;
      this.track.removeDecor(d);
      this.history.push({ undo: () => (d = this.track.addDecor(d)), redo: () => this.track.removeDecor(d) });
    }
  }

  private placeDecor(e: PointerEvent) {
    this.setRay(e);
    const hit = this.raycaster.intersectObject(this.ground, false)[0];
    if (!hit) return;
    let d = this.track.addDecor({
      kind: this.settings.decor,
      position: hit.point.clone(),
      rotation: Math.random() * Math.PI * 2,
      scale: 0.85 + Math.random() * 0.4,
    });
    this.history.push({ undo: () => this.track.removeDecor(d), redo: () => (d = this.track.addDecor(d)) });
  }

  /**
   * Places a boost ring: on a track it stands over the surface, facing along
   * the track; elsewhere it sits on the drawing plane.
   */
  private placeRing(e: PointerEvent) {
    const radius = 1.6;
    const hit = this.pickStroke(e);
    let position: THREE.Vector3 | null = null;
    const axis = new THREE.Vector3();
    if (hit) {
      // Direction of the nearest segment.
      const pts = hit.stroke.points;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < pts.length - 1; i++) {
        const d = pts[i].distanceToSquared(hit.point) + pts[i + 1].distanceToSquared(hit.point);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      axis.subVectors(pts[best + 1], pts[best]).normalize();
      position = hit.point.clone().addScaledVector(hit.normal, radius * 0.75);
    } else {
      this.setRay(e);
      const { plane, normal } = this.planeThrough(this.controls.target);
      position = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (this.settings.mode === 'profile') axis.crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
      else axis.set(this.camera.position.x - this.controls.target.x, 0, this.camera.position.z - this.controls.target.z).normalize().negate();
      if (axis.lengthSq() < 0.5) axis.set(1, 0, 0);
    }
    if (!position) return;
    let ring = this.track.addRing({ position, axis, radius });
    this.history.push({ undo: () => this.track.removeRing(ring), redo: () => (ring = this.track.addRing(ring)) });
  }

  private placeStart(e: PointerEvent) {
    const hit = this.pickStroke(e);
    let p: THREE.Vector3 | null = null;
    if (hit) p = hit.point.clone().addScaledVector(hit.normal, 0.9);
    else {
      this.setRay(e);
      p = this.raycaster.ray.intersectPlane(this.planeThrough(this.controls.target).plane, new THREE.Vector3());
    }
    if (!p) return;
    const before = this.track.start.clone();
    const after = p.clone();
    this.track.setStart(after);
    this.history.push({ undo: () => this.track.setStart(before), redo: () => this.track.setStart(after) });
  }
}

/** Light Laplacian smoothing that keeps both endpoints fixed. */
function smooth(pts: THREE.Vector3[]): THREE.Vector3[] {
  let cur = pts;
  for (let pass = 0; pass < 2; pass++) {
    const next = cur.map((p) => p.clone());
    for (let i = 1; i < cur.length - 1; i++) {
      next[i].copy(cur[i - 1]).add(cur[i + 1]).multiplyScalar(0.25).addScaledVector(cur[i], 0.5);
    }
    next[0] = cur[0];
    next[next.length - 1] = cur[cur.length - 1];
    cur = next;
  }
  return cur;
}
