import * as THREE from 'three';
import { MOUSE, TOUCH } from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Track } from '../track/Track';
import type { DecorKind, DrawMode, Finish, HazardKind, LineType, Stroke } from '../track/types';
import { HAZARDS } from '../physics/hazards';
import type { TrackView } from '../render/TrackView';
import { buildRibbonMesh } from '../render/ribbon';
import { History } from './History';
import { Selection } from './Selection';
import { WorkPlane } from './WorkPlane';
import { Gestures } from './Gestures';
import { METERS, TOUCH as TOUCH_DEVICE } from '../ui/dom';
import { headingOn, pathPiece, profilePiece, type PathPiece, type PieceResult, type PieceSize, type ProfilePiece } from './pieces';

type ScreenPoint = { clientX: number; clientY: number };

export type Tool = 'pencil' | 'line' | 'curve' | 'build' | 'select' | 'eraser' | 'bank' | 'decor' | 'item' | 'start';
/** Draw: the camera squares up to the drawing plane (pan and zoom only). 3D: free orbit. */
export type EditView = 'draw' | 'orbit';
export type ItemKind = 'ring' | 'star' | 'finish' | 'checkpoint' | 'hazard';

export interface EditorSettings {
  lineType: LineType;
  mode: DrawMode;
  width: number;
  /** Bank for new strokes, degrees. */
  bank: number;
  /** Descent of path strokes, percent. */
  grade: number;
  autoBank: boolean;
  decor: DecorKind;
  item: ItemKind;
  /** The hazard the Items tool places. */
  hazard: HazardKind;
  /** Line and Curve: 15° steps (Shift draws freely). */
  angleSnap: boolean;
  /** Line, Curve and placed points land on the 1-unit grid. */
  gridSnap: boolean;
  /** Pencil steadiness, 0–100. */
  smooth: number;
  piece: ProfilePiece;
  pathPiece: PathPiece;
  pieceSize: PieceSize;
}

export interface EditorPrefs {
  view: EditView;
  angleSnap: boolean;
  gridSnap: boolean;
  smooth: number;
  pieceSize: PieceSize;
}

type Endpoint = { stroke: Stroke; point: THREE.Vector3; isEnd: boolean };

/** Endpoint snapping reach: a fingertip needs more than a mouse. */
const SNAP_PX = TOUCH_DEVICE ? 44 : 26;
const ANGLE_SNAP = THREE.MathUtils.degToRad(5);
const MIN_SEG = 0.35;
const LINE_STEP = 0.5;
/** Holding still on a line this long makes its plane the drawing plane. */
const LONG_PRESS_MS = 450;
/** Drawing near this fraction of the screen edge pans the Draw view along. */
const EDGE = 0.1;
/** The Draw view looks at the plane from slightly above. */
const PITCH = THREE.MathUtils.degToRad(6);
const UP = new THREE.Vector3(0, 1, 0);

interface DrawState {
  points: THREE.Vector3[];
  /** Plane used for the whole stroke. */
  plane: THREE.Plane;
  normal: THREE.Vector3;
  start: THREE.Vector3;
  preview: THREE.Mesh | null;
  /** Carrying on from a line's end: the way it left (the start eases into it). */
  tangent: THREE.Vector3 | null;
  /** Pencil: the lazy pen point the line follows. */
  lazy: THREE.Vector3;
}

/** Build tool: the next piece, see-through. */
const GHOST = new THREE.MeshBasicMaterial({ color: 0xffb02e, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide });

/** Puzzle limits: a fixed amount of ink, and only some tools and line types. */
export interface EditRules {
  /** Ink available (world units of track). */
  ink: number;
  tools: Tool[];
  types: LineType[];
}

export class Editor {
  tool: Tool = 'pencil';
  /** Off while playing built-in levels. */
  enabled = true;
  /** Puzzle limits (null: free editing). */
  rules: EditRules | null = null;
  /** Ink already used by finished strokes (kept up to date while rules apply). */
  private inkSpent = 0;
  private savedSettings: EditorSettings | null = null;
  settings: EditorSettings = {
    lineType: 'normal',
    mode: 'profile',
    width: 2.4,
    bank: 0,
    grade: 15,
    autoBank: true,
    decor: 'pine',
    item: 'star',
    hazard: 'icicles',
    angleSnap: true,
    gridSnap: false,
    smooth: TOUCH_DEVICE ? 60 : 40,
    piece: 'slope',
    pathPiece: 'straight',
    pieceSize: 'M',
  };
  readonly history = new History();
  /** The Select tool's strokes and clipboard. */
  readonly selection: Selection;
  /** Last pointer position over the canvas (for "test from here"). */
  private lastPointer: PointerEvent | null = null;

  /** Goal score of the track (third star). */
  get targetScore() {
    return this.track.targetScore;
  }
  set targetScore(v: number) {
    this.track.setTargetScore(v);
  }
  /** Fired with a short status message (e.g. bank angle). */
  onHint?: (text: string) => void;
  /** A line is being drawn (on) or done (off): touch layouts tuck the panel away meanwhile. */
  onStroke?: (on: boolean) => void;
  /** Length and slope of the Line or Curve being drawn, by the pointer (null: hide). */
  onMeasure?: (text: string | null, x: number, y: number) => void;

  /** Settings changed from the editor itself (the panel redraws). */
  onChange?: () => void;
  /** The Draw / 3D view changed. */
  onView?: (view: EditView) => void;
  /** Flies the camera (the app's scripted camera moves). */
  fly?: (pos: THREE.Vector3, target: THREE.Vector3, duration: number) => void;
  editView: EditView = 'draw';
  /** Where new lines go. */
  readonly work: WorkPlane;

  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private draw: DrawState | null = null;
  private drawT0 = 0;
  /** Last move of the drawing pointer (the Draw view pans along near the edges). */
  private dragEvent: PointerEvent | null = null;
  private gestures: Gestures;
  /** Extra fingers that landed while a stroke was well under way (a resting palm). */
  private ignored = new Set<number>();
  /** A press on a line that may become a long-press ("draw on this line's plane"). */
  private press: { x: number; y: number; timer: number } | null = null;
  /** Camera bindings applied last ('off' when the editor isn't in use). */
  private bound = '';
  private time = 0;
  /** A Curve waiting for its bend. */
  private bend: { a: THREE.Vector3; b: THREE.Vector3; c: THREE.Vector3; normal: THREE.Vector3; tangent: THREE.Vector3 | null; preview: THREE.Mesh | null } | null = null;
  private bendDrag = false;
  private handle: THREE.Mesh;
  /** Dashed guide: the end lines up with another line's end. */
  private guide: THREE.Line;
  private ghost = new THREE.Group();
  private ghostKey = '';
  private snapRing: THREE.Mesh;
  private bankDrag: { stroke: Stroke; x: number; bank0: number } | null = null;
  private erasing = false;
  private dragPointer: number | null = null;
  /**
   * Touch: a tap-to-place or erase waits until it is clearly one finger (lifted, or
   * dragged for the eraser), so a pinch that starts with it changes nothing.
   */
  private pendingTap: PointerEvent | null = null;

  constructor(
    private dom: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private scene: THREE.Scene,
    private controls: OrbitControls,
    private track: Track,
    private view: TrackView,
    private ground: THREE.Object3D,
  ) {
    this.selection = new Selection(dom, camera, track, view, this.history);
    this.work = new WorkPlane(scene);
    this.gestures = new Gestures(dom, camera, controls, {
      canOrbit: () => this.editView === 'orbit',
      undo: () => {
        if (!this.history.canUndo) return;
        this.history.undo();
        this.onHint?.('↶ Undo');
      },
      redo: () => {
        if (!this.history.canRedo) return;
        this.history.redo();
        this.onHint?.('↷ Redo');
      },
      fit: () => this.fit(),
    });
    this.snapRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.45, 0.07, 8, 24),
      new THREE.MeshBasicMaterial({ color: 0xffb02e, depthTest: false, transparent: true }),
    );
    this.snapRing.renderOrder = 10;
    this.snapRing.visible = false;
    scene.add(this.snapRing);
    this.handle = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }));
    this.handle.add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffb02e, depthTest: false, transparent: true, opacity: 0.45 })));
    this.handle.renderOrder = 12;
    this.handle.visible = false;
    this.guide = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xff8a1e, dashSize: 0.5, gapSize: 0.35, depthTest: false, transparent: true }));
    this.guide.renderOrder = 12;
    this.guide.visible = false;
    scene.add(this.handle, this.guide, this.ghost);

    track.on((e) => {
      if (this.rules && (e.kind === 'strokeAdded' || e.kind === 'strokeRemoved' || e.kind === 'cleared')) this.inkSpent = track.inkUsed();
    });
    dom.addEventListener('pointerdown', this.onDown);
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);
    window.addEventListener('pointercancel', this.onUp);
    dom.addEventListener('contextmenu', (e) => e.preventDefault());
    this.setTool('pencil');
  }

  /** Puzzle mode on (side view, locked plane, limited ink) or off (null). */
  setRules(rules: EditRules | null) {
    // The player's own drawing settings come back after a puzzle.
    if (rules && !this.rules) this.savedSettings = { ...this.settings };
    if (!rules && this.savedSettings) {
      Object.assign(this.settings, this.savedSettings);
      this.savedSettings = null;
    }
    this.rules = rules;
    this.inkSpent = this.track.inkUsed();
    if (!rules) return;
    this.settings.mode = 'profile';
    this.settings.bank = 0;
    this.settings.width = 2.4;
    this.work.setNormal(new THREE.Vector3(0, 0, 1));
    this.editView = 'draw';
    this.onView?.('draw');
    if (!rules.types.includes(this.settings.lineType)) this.settings.lineType = rules.types[0];
    if (!rules.tools.includes(this.tool)) this.setTool(rules.tools[0]);
  }

  /** Ink left, counting the stroke being drawn (Infinity without rules). */
  inkLeft() {
    if (!this.rules) return Infinity;
    return Math.max(0, this.rules.ink - this.inkSpent - (this.draw ? pathLength(this.draw.points) : 0));
  }

  allows(tool: Tool) {
    return !this.rules || this.rules.tools.includes(tool);
  }

  setTool(tool: Tool) {
    if (!this.allows(tool)) return;
    this.cancelDraw();
    this.commitBend();
    if (tool !== 'select') this.selection.clear();
    this.tool = tool;
    this.dom.style.cursor = tool === 'eraser' || tool === 'bank' ? 'pointer' : tool === 'select' ? 'default' : 'crosshair';
    if (tool !== 'select') this.view.highlight(null);
  }

  // ---------------------------------------------------------------- camera

  /**
   * Mouse: the left button is the tool's, the right one orbits (3D) or pans (Draw),
   * the middle one pans and the wheel zooms toward the pointer. Touch is handled by
   * the gestures while editing; elsewhere two fingers orbit and zoom the ride camera.
   */
  private bindCamera(active: boolean) {
    const key = active ? this.editView : 'off';
    if (key === this.bound) return;
    this.bound = key;
    const c = this.controls;
    c.enableRotate = key !== 'draw';
    c.zoomToCursor = active;
    c.mouseButtons = { LEFT: null as unknown as MOUSE, MIDDLE: MOUSE.PAN, RIGHT: key === 'draw' ? MOUSE.PAN : MOUSE.ROTATE };
    c.touches = { ONE: null as unknown as TOUCH, TWO: active ? (null as unknown as TOUCH) : TOUCH.DOLLY_ROTATE };
    if (!active) this.gestures.reset();
  }

  /** The player's drawing preferences, kept between visits. */
  prefs(): EditorPrefs {
    const s = this.settings;
    return { view: this.editView, angleSnap: s.angleSnap, gridSnap: s.gridSnap, smooth: s.smooth, pieceSize: s.pieceSize };
  }

  applyPrefs(p: Partial<EditorPrefs>) {
    const s = this.settings;
    if (p.view === 'draw' || p.view === 'orbit') this.editView = p.view;
    if (typeof p.angleSnap === 'boolean') s.angleSnap = p.angleSnap;
    if (typeof p.gridSnap === 'boolean') s.gridSnap = p.gridSnap;
    if (typeof p.smooth === 'number') s.smooth = THREE.MathUtils.clamp(p.smooth, 0, 100);
    if (p.pieceSize === 'S' || p.pieceSize === 'M' || p.pieceSize === 'L') s.pieceSize = p.pieceSize;
    this.onView?.(this.editView);
  }

  /** Where the pen tip is on screen (the editor tour points at it). */
  tipOnScreen() {
    const s = this.toScreen(this.work.point);
    return s.behind ? null : { x: s.x, y: s.y };
  }

  /** Hands the camera to someone else (photo mode sets its own bindings right after). */
  release() {
    this.bindCamera(false);
  }

  /** The editor's bindings come back on the next frame. */
  rebind() {
    this.bound = '';
  }

  setView(view: EditView, duration = 0.7) {
    this.cancelDraw();
    this.editView = view;
    if (view === 'draw') {
      const c = this.drawCamera();
      this.fly?.(c.pos, c.target, duration);
    } else {
      // A gentle turn and tilt so the depth shows.
      const target = this.controls.target.clone();
      const sph = new THREE.Spherical().setFromVector3(this.camera.position.clone().sub(target));
      sph.theta += 0.55;
      sph.phi = THREE.MathUtils.clamp(sph.phi - 0.3, 0.5, 1.25);
      this.fly?.(target.clone().add(new THREE.Vector3().setFromSpherical(sph)), target, duration);
    }
    this.onView?.(view);
  }

  toggleView() {
    this.setView(this.editView === 'draw' ? 'orbit' : 'draw');
  }

  /** Draw-view camera square to the plane, around `target` (moved onto the plane). */
  private drawCamera(target: THREE.Vector3 = this.controls.target, dist?: number, whole = false) {
    const mode = this.settings.mode;
    const t = this.work.plane(mode).plane.projectPoint(target, new THREE.Vector3());
    // A camera that wandered off (a run) comes back to the drawing; Fit may look far and wide.
    if (!whole && t.distanceTo(this.work.point) > 80) t.copy(this.work.point);
    const d = THREE.MathUtils.clamp(dist ?? this.camera.position.distanceTo(this.controls.target), 10, whole ? 380 : 120);
    const pos =
      mode === 'profile'
        ? t.clone().addScaledVector(this.work.normal, d * Math.cos(PITCH)).addScaledVector(UP, d * Math.sin(PITCH))
        : t.clone().addScaledVector(UP, d).addScaledVector(this.work.normal, d * 0.02);
    return { pos, target: t };
  }

  /** Back to the Draw view framing after something else moved the camera (a run). */
  reframe(duration = 0.6) {
    if (this.editView !== 'draw') return;
    const c = this.drawCamera();
    this.fly?.(c.pos, c.target, duration);
  }

  /** Opening a track: the plane goes to the start flag, the camera to a view of it. */
  showStart(duration = 1.4) {
    this.resetPlane();
    const portrait = innerWidth < innerHeight;
    if (this.editView === 'draw') {
      const { u } = this.work.axes(this.settings.mode);
      const target = this.work.point.clone().addScaledVector(u, portrait ? 4 : 8).add(new THREE.Vector3(0, -4, 0));
      const c = this.drawCamera(target, portrait ? 46 : 30);
      this.fly?.(c.pos, c.target, duration);
      return;
    }
    const target = this.track.start.clone().add(new THREE.Vector3(8, -4, 0));
    const pos = target.clone().add(new THREE.Vector3(-8, 8, 28));
    if (portrait) pos.add(new THREE.Vector3(-6, 6, 18));
    this.fly?.(pos, target, duration);
  }

  /** The glowing tip in view, a little ahead of it: where the next line goes. */
  showTip(duration = 1.4) {
    const portrait = innerWidth < innerHeight;
    const { u } = this.work.axes(this.settings.mode);
    const target = this.work.point.clone().addScaledVector(u, portrait ? 2 : 6);
    const c = this.drawCamera(target, portrait ? 46 : 32);
    this.fly?.(c.pos, c.target, duration);
  }

  /** Whole track in view (the Draw view keeps facing the plane). */
  fit(duration = 0.8) {
    const box = new THREE.Box3().expandByPoint(this.track.start);
    for (const s of this.track.strokes.values()) for (const p of s.points) box.expandByPoint(p);
    for (const st of this.track.stars.values()) box.expandByPoint(st.position);
    if (this.track.finish) box.expandByPoint(this.track.finish.position);
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const half = THREE.MathUtils.degToRad(this.camera.fov) / 2;
    const fit = (sphere.radius + 4) / Math.sin(half) / Math.min(1, this.camera.aspect);
    const dist = THREE.MathUtils.clamp(fit, 14, 380);
    if (this.editView === 'draw') {
      const c = this.drawCamera(sphere.center, dist, true);
      this.fly?.(c.pos, c.target, duration);
      return;
    }
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.fly?.(sphere.center.clone().addScaledVector(dir, dist), sphere.center.clone(), duration);
  }

  /** One-finger orbit (the on-screen orbit puck), in pixels. */
  orbitBy(dx: number, dy: number) {
    if (this.editView !== 'orbit') return;
    this.gestures.orbit(-dx * 0.008, -dy * 0.008);
  }

  // ---------------------------------------------------------------- plane

  /** Puzzles keep their plane: lines go where the puzzle is. */
  get planeLocked() {
    return !!this.rules;
  }

  private planeThrough(point: THREE.Vector3) {
    return this.work.plane(this.settings.mode, point);
  }

  /** The plane goes back to the start flag, facing like the nearest line there. */
  resetPlane() {
    const start = this.track.start;
    let best: Stroke | null = null;
    let bestD = Infinity;
    for (const s of this.track.strokes.values()) {
      if (s.mode !== 'profile') continue;
      for (const p of s.points) {
        const d = p.distanceToSquared(start);
        if (d < bestD) {
          bestD = d;
          best = s;
        }
      }
    }
    this.work.setNormal(this.rules || !best ? new THREE.Vector3(0, 0, 1) : best.planeNormal);
    this.work.moveTo(start);
    this.onChange?.();
  }

  /** Turns the plane by `deg` around the anchor (the Draw view turns with it). */
  turnPlane(deg: number) {
    if (this.planeLocked || this.settings.mode !== 'profile') return;
    this.cancelDraw();
    this.work.turn(deg);
    if (this.editView === 'draw') {
      const c = this.drawCamera(this.work.point);
      this.fly?.(c.pos, c.target, 0.5);
    }
    this.onHint?.(`Plane turned to ${this.work.heading}°`);
    this.onChange?.();
  }

  /** Moves the plane one layer nearer (+1) or further (-1); path planes go up or down. */
  shiftPlane(dir: 1 | -1) {
    if (this.planeLocked) return;
    this.cancelDraw();
    const before = this.work.point.clone();
    this.work.shift(dir, this.settings.mode, this.track.strokes.values());
    const moved = this.work.point.clone().sub(before);
    if (this.editView === 'draw') {
      const c = this.drawCamera(this.controls.target.clone().add(moved));
      this.fly?.(c.pos, c.target, 0.35);
    }
    this.onChange?.();
  }

  /** Long-press on a line: draw on its plane, from the end nearest the press. */
  private planeFromStroke(stroke: Stroke, at: THREE.Vector3) {
    if (this.planeLocked) return;
    const pts = stroke.points;
    const atEnd = pts[pts.length - 1].distanceToSquared(at) <= pts[0].distanceToSquared(at);
    const end = atEnd ? pts[pts.length - 1] : pts[0];
    const tangent = atEnd ? end.clone().sub(pts[pts.length - 2]) : null;
    this.settings.mode = stroke.mode;
    if (stroke.mode === 'profile') this.work.setNormal(stroke.planeNormal);
    this.work.moveTo(end, tangent);
    if (this.editView === 'draw') {
      const c = this.drawCamera(end);
      this.fly?.(c.pos, c.target, 0.6);
    }
    navigator.vibrate?.(15);
    this.onHint?.("Drawing on this line's plane");
    this.onChange?.();
  }

  /** Called every frame: camera bindings, the plane, the pen tip and hover feedback. */
  update(visible: boolean, dt = 0) {
    this.time += dt;
    const active = visible && this.enabled;
    this.bindCamera(active);
    const drawing = active && (this.tool === 'pencil' || this.tool === 'line' || this.tool === 'curve' || this.tool === 'build' || this.tool === 'start' || this.tool === 'item');
    const lining = this.tool === 'pencil' || this.tool === 'line' || this.tool === 'curve';
    this.work.update(drawing, this.settings.mode, this.time, this.draw, this.camera, lining && !!this.work.tangent);
    this.updateGhost(active && this.tool === 'build');
    this.ghost.visible = active;
    if (this.bend) this.handle.visible = active;
    this.view.setFocusPlane(active && this.editView === 'draw' && this.settings.mode === 'profile' ? this.work.plane('profile').plane : null);
    if (!active) this.snapRing.visible = false;
    if (this.draw && this.dragEvent && this.editView === 'draw' && dt > 0) this.followPen(dt);
  }

  /** Drawing near a screen edge in the Draw view pans that way, so long lines fit. */
  private followPen(dt: number) {
    const e = this.dragEvent!;
    const r = this.dom.getBoundingClientRect();
    const push = (f: number) => (f < EDGE ? -(EDGE - f) / EDGE : f > 1 - EDGE ? (f - 1 + EDGE) / EDGE : 0);
    const px = push((e.clientX - r.left) / r.width);
    const py = -push((e.clientY - r.top) / r.height);
    if (!px && !py) return;
    const speed = this.camera.position.distanceTo(this.controls.target) * 0.7 * dt;
    const d = new THREE.Vector3()
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0), px * speed)
      .addScaledVector(new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1), py * speed);
    this.camera.position.add(d);
    this.controls.target.add(d);
    this.camera.updateMatrixWorld();
    this.extendStroke(e);
  }

  // ---------------------------------------------------------------- input

  private setRay(e: ScreenPoint) {
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
    return this.findEnd(e)?.point ?? null;
  }

  /** The line end under the pointer, if one is close enough to snap to. */
  private findEnd(e: PointerEvent): Endpoint | null {
    let best: Endpoint | null = null;
    let bestD = SNAP_PX;
    for (const ep of this.track.endpoints()) {
      if (this.draw && this.draw.points[0] === ep.point) continue;
      const s = this.toScreen(ep.point);
      if (s.behind) continue;
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      // Ends win ties with starts: lines carry on from ends.
      if (d < bestD || (best && !best.isEnd && ep.isEnd && Math.abs(d - bestD) < 4)) {
        bestD = d;
        best = ep;
      }
    }
    return best;
  }

  private pickStroke(e: ScreenPoint): { stroke: Stroke; point: THREE.Vector3; normal: THREE.Vector3 } | null {
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

  private pickStar(e: PointerEvent) {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects(this.view.stars.children, true)[0];
    if (!hit) return null;
    return this.track.stars.get(hit.object.userData.starId) ?? null;
  }

  private pickCheckpoint(e: PointerEvent) {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects(this.view.checkpoints.children, true)[0];
    return hit ? (this.track.checkpoints.get(hit.object.userData.checkpointId) ?? null) : null;
  }

  private pickHazard(e: PointerEvent) {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects(this.view.hazards.children, true)[0];
    return hit ? (this.track.hazards.get(hit.object.userData.hazardId) ?? null) : null;
  }

  private pickFinish(e: PointerEvent) {
    this.setRay(e);
    return this.raycaster.intersectObjects(this.view.goals.children, true).length > 0;
  }

  private pickDecor(e: PointerEvent) {
    this.setRay(e);
    const hit = this.raycaster.intersectObjects(this.view.decor.children, true)[0];
    if (!hit) return null;
    return this.track.decor.get(hit.object.userData.decorId) ?? null;
  }

  private onDown = (e: PointerEvent) => {
    if (!this.enabled) return;
    if (e.pointerType === 'touch') {
      // A finger landing while a stroke is well under way is a resting palm: ignore it.
      if (this.draw && this.gestures.count === 1 && performance.now() - this.drawT0 > 250 && this.draw.points.length > 3) {
        this.ignored.add(e.pointerId);
        return;
      }
      this.gestures.down(e);
      if (this.gestures.count > 1) {
        // Second finger: this is a camera gesture, not a stroke.
        this.cancelDraw();
        this.cancelPress();
        this.bankDrag = null;
        this.erasing = false;
        this.pendingTap = null;
        this.dragPointer = null;
        if (this.selection.active) this.selection.cancel();
        this.controls.enabled = true;
        return;
      }
    }
    if (e.button !== 0) return;
    this.dragPointer = e.pointerId;
    if (e.pointerType === 'touch' && (this.tool === 'eraser' || this.tool === 'decor' || this.tool === 'item' || this.tool === 'start')) {
      this.pendingTap = e;
      return;
    }
    this.act(e);
  };

  /** What a press does with the current tool. */
  private act(e: PointerEvent) {
    // A curve waiting for its bend: grab the handle, or anything else lays it down.
    if (this.bend) {
      if (this.nearHandle(e)) {
        this.bendDrag = true;
        this.controls.enabled = false;
        return;
      }
      this.commitBend();
    }
    switch (this.tool) {
      case 'pencil':
      case 'line':
      case 'curve': {
        // Holding still on a line takes its plane instead of drawing.
        const hit = this.planeLocked ? null : this.pickStroke(e);
        this.beginStroke(e);
        if (hit) this.armLongPress(e, hit.stroke, hit.point);
        break;
      }
      case 'build': {
        this.setRay(e);
        if (this.raycaster.intersectObjects(this.ghost.children, false).length) {
          this.addPiece();
          break;
        }
        // Tap a line's end to build on from there.
        const ep = this.findEnd(e);
        if (ep?.isEnd) {
          if (ep.stroke.mode === 'profile') this.work.setNormal(ep.stroke.planeNormal);
          this.settings.mode = ep.stroke.mode;
          this.work.moveTo(ep.point, this.endTangent(ep, this.work.normal) ?? null);
          this.onHint?.('Building on from this end');
          this.onChange?.();
          break;
        }
        const hit = this.planeLocked ? null : this.pickStroke(e);
        if (hit) this.armLongPress(e, hit.stroke, hit.point);
        break;
      }
      case 'select': {
        const hit = this.pickStroke(e);
        if (this.selection.down(e, hit && !hit.stroke.locked ? hit : null)) this.controls.enabled = false;
        break;
      }
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
      case 'item':
        if (this.settings.item === 'ring') this.placeRing(e);
        else if (this.settings.item === 'star') this.placeStar(e);
        else if (this.settings.item === 'checkpoint') this.placeCheckpoint(e);
        else if (this.settings.item === 'hazard') this.placeHazard(e);
        else this.placeFinish(e);
        break;
      case 'start':
        this.placeStart(e);
        break;
    }
  }

  /** Holding still on a line for a moment draws on its plane from there. */
  private armLongPress(e: PointerEvent, stroke: Stroke, at: THREE.Vector3) {
    this.press = {
      x: e.clientX,
      y: e.clientY,
      timer: window.setTimeout(() => {
        this.press = null;
        this.cancelDraw();
        this.dragPointer = null;
        this.planeFromStroke(stroke, at);
      }, LONG_PRESS_MS),
    };
  }

  private cancelPress() {
    if (this.press) clearTimeout(this.press.timer);
    this.press = null;
  }

  private onMove = (e: PointerEvent) => {
    if (e.pointerType === 'touch') {
      if (this.ignored.has(e.pointerId)) return;
      this.gestures.move(e);
      if (this.gestures.active) return;
    }
    const active = this.dragPointer === e.pointerId;
    if (e.target === this.dom) this.lastPointer = e;
    if (this.press && active && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 8) this.cancelPress();
    const tap = this.pendingTap;
    if (tap && active && Math.hypot(e.clientX - tap.clientX, e.clientY - tap.clientY) > 8) {
      // A drag: the eraser starts sweeping, a placing tool lets it go.
      this.pendingTap = null;
      if (this.tool === 'eraser') this.act(tap);
    }
    if (active && this.selection.active) {
      this.selection.move(e);
      return;
    }
    if (active && this.bendDrag) {
      this.dragBend(e);
      return;
    }

    if (this.draw && active) {
      this.dragEvent = e;
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
    this.dom.style.cursor = this.nearHandle(e) ? 'grab' : this.tool === 'eraser' || this.tool === 'bank' ? 'pointer' : this.tool === 'select' ? 'default' : 'crosshair';
    if (this.tool === 'pencil' || this.tool === 'line' || this.tool === 'curve' || this.tool === 'build') {
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
    if (e.pointerType === 'touch') {
      if (this.ignored.delete(e.pointerId)) return;
      this.gestures.up(e);
    }
    if (this.dragPointer !== e.pointerId) return;
    this.dragPointer = null;
    this.dragEvent = null;
    this.cancelPress();
    if (this.pendingTap) {
      const tap = this.pendingTap;
      this.pendingTap = null;
      if (e.type === 'pointerup') this.act(tap);
    }
    if (this.selection.active) {
      this.selection.up(e);
      this.controls.enabled = true;
    }
    if (this.bendDrag) {
      this.bendDrag = false;
      this.controls.enabled = true;
    }
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

  /** The way a line leaves an endpoint, when that point ends it (lines carry on from ends). */
  private endTangent(ep: Endpoint | null, normal: THREE.Vector3) {
    if (!ep?.isEnd) return null;
    const pts = ep.stroke.points;
    const t = pts[pts.length - 1].clone().sub(pts[pts.length - 2]);
    // Onto the plane being drawn on.
    if (this.settings.mode === 'profile') t.addScaledVector(normal, -t.dot(normal));
    return t.lengthSq() > 1e-8 ? t.normalize() : null;
  }

  private beginStroke(e: PointerEvent) {
    const ep = this.findEnd(e);
    const snap = ep?.point ?? null;
    const origin = snap ?? this.work.point;
    const { plane, normal } = this.planeThrough(origin);
    this.setRay(e);
    let start = snap ?? this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!start) return;
    if (!snap && this.settings.gridSnap && this.tool !== 'pencil') start = this.gridPoint(start, this.work.point);
    this.draw = { points: [start], plane, normal, start: start.clone(), preview: null, tangent: this.endTangent(ep, normal), lazy: start.clone() };
    this.drawT0 = performance.now();
    this.onStroke?.(true);
    this.controls.enabled = false;
    this.showSnap(snap);
  }

  /** Where the pointer meets the stroke's plane (path strokes: before the descent). */
  private planeHit(e: ScreenPoint): THREE.Vector3 | null {
    this.setRay(e);
    return this.raycaster.ray.intersectPlane(this.draw!.plane, new THREE.Vector3());
  }

  /** Path strokes keep descending: the height drops with the distance covered from `from`. */
  private descend(p: THREE.Vector3, from: THREE.Vector3) {
    if (this.settings.mode !== 'path') return p;
    p.y = from.y - (Math.hypot(p.x - from.x, p.z - from.z) * this.settings.grade) / 100;
    return p;
  }

  /** World units per screen pixel around the camera's pivot. */
  private pxToWorld(px: number) {
    const dist = this.camera.position.distanceTo(this.controls.target);
    return (px * 2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.max(1, this.dom.clientHeight);
  }

  /** Plane axes for snapping: `u` along, `v` up (path: away), through the stroke's plane. */
  private snapAxes() {
    const { u, v } = this.work.axes(this.settings.mode);
    return { u, v };
  }

  /** Rounds a point on the plane to the 1-unit grid around `origin`. */
  private gridPoint(p: THREE.Vector3, origin: THREE.Vector3) {
    const { u, v } = this.snapAxes();
    const d = p.clone().sub(origin);
    const du = Math.round(d.dot(u));
    const dv = Math.round(d.dot(v));
    const rest = d.clone().addScaledVector(u, -d.dot(u)).addScaledVector(v, -d.dot(v));
    return origin.clone().addScaledVector(u, du).addScaledVector(v, dv).add(rest);
  }

  /**
   * Line, Curve and Build ends: 15° angle steps (Shift: free), the 1-unit grid, or lined up
   * level or plumb with another line's end (a dashed guide shows it).
   */
  private shapeEnd(from: THREE.Vector3, hit: THREE.Vector3, e: PointerEvent) {
    this.showGuide(null);
    if (this.settings.gridSnap) return this.gridPoint(hit, from);
    const { u, v } = this.snapAxes();
    const d = hit.clone().sub(from);
    const du = d.dot(u);
    const dv = d.dot(v);
    const len = Math.hypot(du, dv);
    if (this.settings.angleSnap && !e.shiftKey && len > 0.3) {
      const a = Math.atan2(dv, du);
      const step = Math.PI / 12;
      const snapped = Math.round(a / step) * step;
      if (Math.abs(a - snapped) < ANGLE_SNAP) return from.clone().addScaledVector(u, Math.cos(snapped) * len).addScaledVector(v, Math.sin(snapped) * len);
    }
    // Level or plumb with another end on this plane.
    const tol = this.pxToWorld(TOUCH_DEVICE ? 12 : 7);
    const w = new THREE.Vector3().crossVectors(u, v);
    for (const ep of this.track.endpoints()) {
      const o = ep.point.clone().sub(from);
      if (Math.abs(o.dot(w)) > 0.5 || o.lengthSq() < 0.01) continue;
      if (Math.abs(o.dot(v) - dv) < tol) {
        const p = from.clone().addScaledVector(u, du).addScaledVector(v, o.dot(v));
        this.showGuide([ep.point, p]);
        return p;
      }
      if (Math.abs(o.dot(u) - du) < tol) {
        const p = from.clone().addScaledVector(u, o.dot(u)).addScaledVector(v, dv);
        this.showGuide([ep.point, p]);
        return p;
      }
    }
    return hit;
  }

  private showGuide(seg: [THREE.Vector3, THREE.Vector3] | null) {
    this.guide.visible = !!seg;
    if (!seg) return;
    this.guide.geometry.setFromPoints(seg);
    this.guide.computeLineDistances();
  }

  /** Length and slope next to the pointer while a Line or Curve is drawn. */
  private measure(from: THREE.Vector3, to: THREE.Vector3, e: ScreenPoint) {
    const d = to.clone().sub(from);
    const flat = this.settings.mode === 'profile' ? Math.abs(d.dot(this.work.axes('profile').u)) : Math.hypot(d.x, d.z);
    const slope = Math.round(THREE.MathUtils.radToDeg(Math.atan2(d.y, flat)));
    this.onMeasure?.(`${(d.length() * METERS).toFixed(1)} m · ${slope > 0 ? '+' : ''}${slope}°`, e.clientX, e.clientY);
  }

  /** Pencil steadiness: the line trails the finger by this much (0 at Smooth 0). */
  private lazyRadius() {
    return this.pxToWorld(this.settings.smooth * 0.4);
  }

  private extendStroke(e: PointerEvent) {
    const d = this.draw!;
    // Puzzles: the stroke stops where the ink runs out.
    const budget = this.rules ? this.rules.ink - this.inkSpent : Infinity;
    const raw = this.planeHit(e);
    if (!raw) return;
    if (this.tool === 'pencil') {
      // A lazy pen: the line follows a point pulled along behind the finger, which irons out wobbles.
      const off = raw.clone().sub(d.lazy);
      const len = off.length();
      const r = this.lazyRadius();
      if (len > r) d.lazy.addScaledVector(off, (len - r) / len);
      const last = d.points[d.points.length - 1];
      const hit = this.descend(d.lazy.clone(), last);
      if (hit.distanceTo(last) < MIN_SEG) return;
      const room = budget - pathLength(d.points);
      if (room < MIN_SEG) {
        this.outOfInk();
        return;
      }
      if (hit.distanceTo(last) > room) hit.sub(last).setLength(room).add(last);
      d.points.push(hit);
    } else {
      const from = d.points[0];
      const hit = this.descend(this.shapeEnd(from, raw, e), from);
      if (hit.distanceTo(from) > budget) {
        hit.sub(from).setLength(Math.max(0, budget)).add(from);
        this.outOfInk();
      }
      d.points = this.lineThrough(from, hit);
      this.measure(from, hit, e);
    }
    this.showSnap(this.findSnap(e));
    this.updatePreview();
  }

  private inkHinted = 0;
  private outOfInk() {
    const now = performance.now();
    if (now - this.inkHinted > 1500) this.onHint?.('Out of ink! Erase a line to get some back.');
    this.inkHinted = now;
  }

  private lineThrough(a: THREE.Vector3, b: THREE.Vector3) {
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / LINE_STEP));
    const pts = [a];
    for (let i = 1; i <= n; i++) pts.push(new THREE.Vector3().lerpVectors(a, b, i / n));
    return pts;
  }

  private strokeFromDraw(points: THREE.Vector3[], normal = this.draw!.normal): Omit<Stroke, 'id'> {
    return {
      type: this.settings.lineType,
      mode: this.settings.mode,
      points,
      planeNormal: normal.clone(),
      bank: THREE.MathUtils.degToRad(this.settings.bank),
      autoBank: this.settings.mode === 'path' && this.settings.autoBank,
      bankRefY: this.track.start.y,
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
    if (this.draw) this.onStroke?.(false);
    if (this.draw?.preview) {
      this.scene.remove(this.draw.preview);
      this.draw.preview.geometry.dispose();
    }
    this.draw = null;
    this.dragEvent = null;
    this.controls.enabled = true;
    this.showSnap(null);
    this.showGuide(null);
    this.onMeasure?.(null, 0, 0);
  }

  private finishStroke(e: PointerEvent) {
    const d = this.draw!;
    let pts = d.points;
    // Snap the end onto another stroke's endpoint.
    const endSnap = this.findSnap(e);
    if (endSnap && pts.length >= 2) {
      let snapped = this.tool === 'pencil' ? pts.slice() : this.lineThrough(pts[0], endSnap);
      snapped[snapped.length - 1] = endSnap;
      // Puzzles: a snap can't stretch the line past the ink left.
      if (this.rules && pathLength(snapped) > this.rules.ink - this.inkSpent + 0.05) snapped = pts;
      pts = snapped;
    }
    if (this.tool === 'pencil') {
      if (d.tangent) pts = blendStart(pts, d.tangent);
      pts = smooth(pts, Math.round(this.settings.smooth / 25));
    }
    const valid = pts.length >= 2 && pts[0].distanceTo(pts[pts.length - 1]) > 0.2;
    const normal = d.normal;
    const tangent = d.tangent;
    this.cancelDraw();
    if (!valid) return;
    // Curve: the line waits for a bend before it's laid down.
    if (this.tool === 'curve') {
      this.startBend(pts[0], pts[pts.length - 1], normal, tangent);
      return;
    }
    this.lay([pts], normal);
  }

  /**
   * Adds lines as one undo step and carries the plane's anchor on to the last one's end
   * (undo puts it back).
   */
  private lay(lines: THREE.Vector3[][], normal: THREE.Vector3, extra?: Partial<Omit<Stroke, 'id'>>, finish?: Finish | null) {
    const before = { point: this.work.point.clone(), tangent: this.work.tangent?.clone() ?? null };
    const last = lines[lines.length - 1];
    const end = last[last.length - 1];
    const after = { point: end.clone(), tangent: end.clone().sub(last[last.length - 2]) };
    const finish0 = this.track.finish;
    let strokes = lines.map((pts) => this.track.addStroke({ ...this.strokeFromDraw(pts, normal), ...extra }));
    if (finish) this.track.setFinish(finish);
    this.history.push({
      undo: () => {
        strokes.forEach((s) => this.track.removeStroke(s));
        if (finish) this.track.setFinish(finish0);
        this.work.moveTo(before.point, before.tangent);
        this.onChange?.();
      },
      redo: () => {
        strokes = strokes.map((s) => this.track.addStroke(s));
        if (finish) this.track.setFinish(finish);
        this.work.moveTo(after.point, after.tangent);
        this.onChange?.();
      },
    });
    this.work.moveTo(after.point, after.tangent);
  }

  // ---------------------------------------------------------------- curve

  /** A drawn Curve, waiting for its bend: drag the handle, then tap elsewhere or Done. */
  private startBend(a: THREE.Vector3, b: THREE.Vector3, normal: THREE.Vector3, tangent: THREE.Vector3 | null) {
    const c = tangent ? a.clone().addScaledVector(tangent, a.distanceTo(b) / 2) : a.clone().lerp(b, 0.5);
    this.bend = { a, b, c, normal, tangent, preview: null };
    this.bendPreview();
    this.onChange?.();
  }

  /** The track has lines but no finish gate (the editor offers to add one). */
  get needsFinish() {
    return !this.rules && !this.track.finish && this.track.strokes.size > 0;
  }

  get bending() {
    return this.bend !== null;
  }

  private bendPoints() {
    const { a, b, c } = this.bend!;
    const n = Math.max(2, Math.ceil((a.distanceTo(c) + c.distanceTo(b)) / LINE_STEP));
    const pts = [a];
    for (let i = 1; i < n; i++) {
      const t = i / n;
      pts.push(new THREE.Vector3().addScaledVector(a, (1 - t) * (1 - t)).addScaledVector(c, 2 * (1 - t) * t).addScaledVector(b, t * t));
    }
    pts.push(b);
    return pts;
  }

  private bendPreview() {
    const bd = this.bend!;
    if (bd.preview) {
      this.scene.remove(bd.preview);
      bd.preview.geometry.dispose();
    }
    bd.preview = buildRibbonMesh({ ...this.strokeFromDraw(this.bendPoints(), bd.normal), id: -1 });
    this.scene.add(bd.preview);
    this.handle.visible = true;
    this.handle.position.copy(bd.c);
    this.handle.scale.setScalar(THREE.MathUtils.clamp(this.camera.position.distanceTo(bd.c) / 26, 0.5, 4));
  }

  private nearHandle(e: ScreenPoint) {
    if (!this.bend) return false;
    const s = this.toScreen(this.bend.c);
    return Math.hypot(s.x - e.clientX, s.y - e.clientY) < (TOUCH_DEVICE ? 44 : 22);
  }

  private dragBend(e: PointerEvent) {
    const bd = this.bend!;
    this.setRay(e);
    const plane = this.planeThrough(bd.a).plane;
    const hit = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return;
    if (bd.tangent) {
      // Keeps the joint smooth: the handle slides along the line it carries on from.
      const t = Math.max(0.3, hit.clone().sub(bd.a).dot(bd.tangent));
      bd.c.copy(bd.a).addScaledVector(bd.tangent, t);
    } else bd.c.copy(hit);
    if (this.settings.mode === 'path') bd.c.y = (bd.a.y + bd.b.y) / 2;
    this.bendPreview();
  }

  /** Lays the bent line down. */
  commitBend() {
    const bd = this.bend;
    if (!bd) return;
    const pts = this.bendPoints();
    this.dropBend();
    this.lay([pts], bd.normal);
    this.onChange?.();
  }

  cancelBend() {
    if (!this.bend) return;
    this.dropBend();
    this.onChange?.();
  }

  private dropBend() {
    const bd = this.bend;
    if (bd?.preview) {
      this.scene.remove(bd.preview);
      bd.preview.geometry.dispose();
    }
    this.bend = null;
    this.bendDrag = false;
    this.handle.visible = false;
  }

  // ---------------------------------------------------------------- build

  /** The selected piece, laid from the end of the track (or the start flag). */
  private nextPiece(): PieceResult | null {
    const s = this.settings;
    const origin = this.work.point.clone();
    // From the start flag the first piece drops in just under it.
    const fromStart = !this.work.tangent && origin.distanceToSquared(this.track.start) < 1e-4;
    if (fromStart) origin.y -= 1.2;
    const { u } = this.work.axes('profile');
    if (s.mode === 'profile') {
      const heading = fromStart ? THREE.MathUtils.degToRad(-15) : headingOn(this.work.tangent, u);
      return profilePiece(s.piece, s.pieceSize, { origin, u, normal: this.work.normal, heading, width: s.width });
    }
    const dir = this.work.tangent ? new THREE.Vector3(this.work.tangent.x, 0, this.work.tangent.z) : u.clone();
    if (dir.lengthSq() < 0.01) dir.copy(u);
    return pathPiece(s.pathPiece, s.pieceSize, origin, dir.normalize(), s.grade);
  }

  /** Path pieces are bobsled runs: walls hold every ride in (no auto-bank). */
  private pieceExtra(): Partial<Omit<Stroke, 'id'>> {
    if (this.settings.mode === 'profile') return { bank: 0 };
    return { bank: 0, autoBank: false, walls: true, width: Math.max(this.settings.width, 3.5) };
  }

  /** Lays the next piece (Build tool: Add, Enter, or a tap on the ghost). */
  addPiece() {
    const r = this.nextPiece();
    if (!r) return;
    const normal = this.settings.mode === 'profile' ? this.work.normal.clone() : UP.clone();
    const finish = r.finish ? { position: r.finish.position, axis: r.finish.axis, halfWidth: Math.max(this.settings.width / 2 + 0.9, 2) } : null;
    this.lay(r.strokes, normal, this.pieceExtra(), finish);
    this.work.moveTo(r.end, r.tangent);
    if (this.settings.mode === 'profile' && this.settings.piece === 'loop') this.onHint?.('Loops need speed, and a ride that stays seated: skis, boards, bikes or the buggy');
    // Keep the end of the track in view.
    const s = r.end.clone().project(this.camera);
    if (Math.abs(s.x) > 0.6 || Math.abs(s.y) > 0.6 || s.z > 1) {
      const target = this.controls.target.clone().lerp(r.end, 0.7);
      const pos = this.camera.position.clone().add(target.clone().sub(this.controls.target));
      this.fly?.(pos, target, 0.5);
    }
    this.onChange?.();
  }

  /** Rebuilds the see-through ghost of the next piece when anything it depends on changes. */
  private updateGhost(show: boolean) {
    const s = this.settings;
    const t = this.work.tangent;
    const key = show
      ? [s.mode, s.piece, s.pathPiece, s.pieceSize, s.width, s.grade, s.lineType, this.work.point.toArray(), t?.toArray(), this.work.normal.toArray(), this.track.start.toArray()].join('|')
      : '';
    if (key === this.ghostKey) return;
    this.ghostKey = key;
    for (const m of [...this.ghost.children] as THREE.Mesh[]) {
      this.ghost.remove(m);
      m.geometry.dispose();
    }
    if (!show) return;
    const r = this.nextPiece();
    if (!r) return;
    const normal = s.mode === 'profile' ? this.work.normal : UP;
    for (const pts of r.strokes) {
      const mesh = buildRibbonMesh({ ...this.strokeFromDraw(pts, normal), ...this.pieceExtra(), id: -1 });
      mesh.material = (mesh.material as THREE.Material[]).map(() => GHOST);
      this.ghost.add(mesh);
    }
  }

  // ---------------------------------------------------------------- other tools

  private eraseAt(e: PointerEvent) {
    if (this.rules) {
      // Puzzles: only the player's own lines can go (the ink comes back).
      const hit = this.pickStroke(e);
      if (!hit || hit.stroke.locked) return;
      let stroke = hit.stroke;
      this.track.removeStroke(stroke);
      this.history.push({ undo: () => (stroke = this.track.addStroke(stroke)), redo: () => this.track.removeStroke(stroke) });
      return;
    }
    const star = this.pickStar(e);
    if (star) {
      let st = star;
      this.track.removeStar(st);
      this.history.push({ undo: () => (st = this.track.addStar(st)), redo: () => this.track.removeStar(st) });
      return;
    }
    if (this.track.finish && this.pickFinish(e)) {
      const before = this.track.finish;
      this.track.setFinish(null);
      this.history.push({ undo: () => this.track.setFinish(before), redo: () => this.track.setFinish(null) });
      return;
    }
    const ring = this.pickRing(e);
    if (ring) {
      let r = ring;
      this.track.removeRing(r);
      this.history.push({ undo: () => (r = this.track.addRing(r)), redo: () => this.track.removeRing(r) });
      return;
    }
    const cp = this.pickCheckpoint(e);
    if (cp) {
      let c = cp;
      this.track.removeCheckpoint(c);
      this.history.push({ undo: () => (c = this.track.addCheckpoint(c)), redo: () => this.track.removeCheckpoint(c) });
      return;
    }
    const hz = this.pickHazard(e);
    if (hz) {
      let h = hz;
      this.track.removeHazard(h);
      this.history.push({ undo: () => (h = this.track.addHazard(h)), redo: () => this.track.removeHazard(h) });
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
      const { plane, normal } = this.planeThrough(this.work.point);
      position = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
      if (this.settings.mode === 'profile') axis.crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize();
      else axis.set(this.controls.target.x - this.camera.position.x, 0, this.controls.target.z - this.camera.position.z).normalize();
      if (axis.lengthSq() < 0.5) axis.set(1, 0, 0);
    }
    if (!position) return;
    let ring = this.track.addRing({ position, axis, radius });
    this.history.push({ undo: () => this.track.removeRing(ring), redo: () => (ring = this.track.addRing(ring)) });
  }

  /** Hit on a track (with its direction) or on the drawing plane. */
  private placementHit(e: PointerEvent): { point: THREE.Vector3; normal: THREE.Vector3; dir: THREE.Vector3; width: number } | null {
    const hit = this.pickStroke(e);
    if (hit) {
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
      const dir = new THREE.Vector3().subVectors(pts[best + 1], pts[best]).normalize();
      return { point: hit.point.clone(), normal: hit.normal, dir, width: hit.stroke.width };
    }
    this.setRay(e);
    const { plane, normal } = this.planeThrough(this.work.point);
    const point = this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
    if (!point) return null;
    const dir =
      this.settings.mode === 'profile'
        ? new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), normal).normalize()
        : new THREE.Vector3(this.controls.target.x - this.camera.position.x, 0, this.controls.target.z - this.camera.position.z).normalize();
    return { point, normal: new THREE.Vector3(0, 1, 0), dir, width: 2.4 };
  }

  private placeStar(e: PointerEvent) {
    const hit = this.placementHit(e);
    if (!hit) return;
    const onTrack = !!this.pickStroke(e);
    const position = onTrack ? hit.point.addScaledVector(hit.normal, 1.1) : hit.point;
    let star = this.track.addStar({ position });
    this.history.push({ undo: () => this.track.removeStar(star), redo: () => (star = this.track.addStar(star)) });
  }

  /** A checkpoint gate across the track (as wide as the finish gate). */
  private placeCheckpoint(e: PointerEvent) {
    const hit = this.placementHit(e);
    if (!hit) return;
    let cp = this.track.addCheckpoint({ position: hit.point, axis: hit.dir, halfWidth: Math.max(hit.width / 2 + 0.9, 2) });
    this.history.push({ undo: () => this.track.removeCheckpoint(cp), redo: () => (cp = this.track.addCheckpoint(cp)) });
  }

  /** A hazard on the track, facing along it (icicles hang over it, out of reach of a rider on the surface). */
  private placeHazard(e: PointerEvent) {
    const hit = this.placementHit(e);
    if (!hit) return;
    const kind = this.settings.hazard;
    const position = hit.point.clone();
    if (HAZARDS[kind].hangs) position.addScaledVector(hit.normal, 3.6);
    const rotation = Math.atan2(-hit.dir.z, hit.dir.x);
    let h = this.track.addHazard({ kind, position, rotation, scale: 1 });
    this.history.push({ undo: () => this.track.removeHazard(h), redo: () => (h = this.track.addHazard(h)) });
  }

  /** One finish gate per track: placing it again moves it. */
  private placeFinish(e: PointerEvent) {
    const hit = this.placementHit(e);
    if (!hit) return;
    const before = this.track.finish;
    const after = { position: hit.point, axis: hit.dir, halfWidth: Math.max(hit.width / 2 + 0.9, 2) };
    this.track.setFinish(after);
    this.history.push({ undo: () => this.track.setFinish(before), redo: () => this.track.setFinish(after) });
  }

  /** Where a start flag would go under the pointer: on a track, or on the drawing plane. */
  private startPoint(e: ScreenPoint): THREE.Vector3 | null {
    const hit = this.pickStroke(e);
    if (hit) return hit.point.clone().addScaledVector(hit.normal, 0.9);
    this.setRay(e);
    return this.raycaster.ray.intersectPlane(this.planeThrough(this.work.point).plane, new THREE.Vector3());
  }

  /** The start point under the last pointer position (for "test from here"); on touch, under the screen centre. */
  cursorPoint(): THREE.Vector3 | null {
    if (TOUCH_DEVICE) {
      const r = this.dom.getBoundingClientRect();
      return this.startPoint({ clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 });
    }
    return this.lastPointer ? this.startPoint(this.lastPointer) : null;
  }

  private placeStart(e: PointerEvent) {
    const p = this.startPoint(e);
    if (!p) return;
    const before = this.track.start.clone();
    const after = p.clone();
    this.track.setStart(after);
    this.history.push({ undo: () => this.track.setStart(before), redo: () => this.track.setStart(after) });
  }
}

/** Light Laplacian smoothing that keeps both endpoints fixed. */
function smooth(pts: THREE.Vector3[], passes = 2): THREE.Vector3[] {
  let cur = pts;
  for (let pass = 0; pass < passes; pass++) {
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

/** Carrying on from a line: the first stretch eases onto the way that line left, so the joint has no kink. */
function blendStart(pts: THREE.Vector3[], tangent: THREE.Vector3, reach = 2.5): THREE.Vector3[] {
  const out = pts.map((p) => p.clone());
  out[0] = pts[0];
  let s = 0;
  for (let i = 1; i < pts.length; i++) {
    s += pts[i].distanceTo(pts[i - 1]);
    if (s >= reach) break;
    const w = 1 - s / reach;
    out[i].lerp(pts[0].clone().addScaledVector(tangent, s), w);
  }
  return out;
}

function pathLength(points: THREE.Vector3[]) {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += points[i].distanceTo(points[i - 1]);
  return n;
}
