import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/** A tap: every finger lifted this soon, without moving further than this. */
const TAP_MS = 300;
const TAP_PX = 12;
/** A quick pinch-in (this fast, this much) fits the track in view. */
const FLICK_MS = 280;
const FLICK_RATIO = 0.55;

export interface GestureHooks {
  /** Two-finger twist orbits (the 3D view only). */
  canOrbit(): boolean;
  undo(): void;
  redo(): void;
  fit(): void;
}

interface Finger {
  x: number;
  y: number;
  x0: number;
  y0: number;
}

/**
 * Editor camera on touch, Procreate style: one finger belongs to the tool; two fingers
 * pan, pinch-zoom and (in 3D) twist to orbit; a two-finger tap undoes, three redoes.
 */
export class Gestures {
  private fingers = new Map<number, Finger>();
  /** The current multi-finger gesture. */
  private session: { t0: number; most: number; moved: boolean; spread0: number; spreadMin: number } | null = null;
  private raycaster = new THREE.Raycaster();

  constructor(
    private dom: HTMLElement,
    private camera: THREE.PerspectiveCamera,
    private controls: OrbitControls,
    private hooks: GestureHooks,
  ) {}

  get count() {
    return this.fingers.size;
  }

  /** True while two or more fingers drive the camera. */
  get active() {
    return this.session !== null;
  }

  down(e: PointerEvent) {
    this.fingers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY });
    if (this.fingers.size < 2) return;
    const s = this.session;
    if (!s) this.session = { t0: performance.now(), most: this.fingers.size, moved: false, spread0: this.spread(), spreadMin: Infinity };
    else s.most = Math.max(s.most, this.fingers.size);
  }

  move(e: PointerEvent) {
    const f = this.fingers.get(e.pointerId);
    if (!f) return;
    const s = this.session;
    if (!s || this.fingers.size < 2) {
      f.x = e.clientX;
      f.y = e.clientY;
      return;
    }
    const before = { c: this.centroid(), spread: this.spread(), angle: this.angle() };
    f.x = e.clientX;
    f.y = e.clientY;
    if (Math.hypot(f.x - f.x0, f.y - f.y0) > TAP_PX) s.moved = true;
    const after = { c: this.centroid(), spread: this.spread(), angle: this.angle() };
    s.spreadMin = Math.min(s.spreadMin, after.spread);
    // Twist first (around the pivot), then zoom and pan around the fingers.
    if (this.hooks.canOrbit()) {
      let d = after.angle - before.angle;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      if (Math.abs(d) < 0.3) this.orbit(-d, 0);
    }
    if (before.spread > 1 && after.spread > 1) this.zoomAt(after.c, before.spread / after.spread);
    this.panScreen(before.c, after.c);
  }

  up(e: PointerEvent) {
    if (!this.fingers.delete(e.pointerId)) return;
    const s = this.session;
    if (!s || this.fingers.size > 0) return;
    this.session = null;
    if (e.type !== 'pointerup') return;
    const ms = performance.now() - s.t0;
    if (!s.moved && ms < TAP_MS) {
      if (s.most === 2) this.hooks.undo();
      else if (s.most >= 3) this.hooks.redo();
    } else if (s.most === 2 && ms < FLICK_MS && s.spreadMin < s.spread0 * FLICK_RATIO) {
      this.hooks.fit();
    }
  }

  /** Forgets every finger (the editor was switched off mid-gesture). */
  reset() {
    this.fingers.clear();
    this.session = null;
  }

  /** Orbits around the pivot: `dTheta` around the vertical, `dPhi` tilts. */
  orbit(dTheta: number, dPhi: number) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    const sph = new THREE.Spherical().setFromVector3(offset);
    sph.theta += dTheta;
    sph.phi = THREE.MathUtils.clamp(sph.phi + dPhi, 0.08, Math.PI - 0.08);
    offset.setFromSpherical(sph);
    this.camera.position.copy(this.controls.target).add(offset);
    this.camera.lookAt(this.controls.target);
  }

  private centroid() {
    let x = 0;
    let y = 0;
    for (const f of this.fingers.values()) {
      x += f.x;
      y += f.y;
    }
    const n = this.fingers.size;
    return { x: x / n, y: y / n };
  }

  /** Distance between the first two fingers. */
  private spread() {
    const [a, b] = [...this.fingers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }

  private angle() {
    const [a, b] = [...this.fingers.values()];
    return a && b ? Math.atan2(b.y - a.y, b.x - a.x) : 0;
  }

  /** The world point under a screen point, on the plane through the pivot facing the camera. */
  private worldAt(x: number, y: number) {
    const r = this.dom.getBoundingClientRect();
    const ndc = new THREE.Vector2(((x - r.left) / r.width) * 2 - 1, -((y - r.top) / r.height) * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(ndc, this.camera);
    const n = this.camera.getWorldDirection(new THREE.Vector3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, this.controls.target);
    return this.raycaster.ray.intersectPlane(plane, new THREE.Vector3());
  }

  /** Drags the world so the point under `from` ends up under `to`. */
  private panScreen(from: { x: number; y: number }, to: { x: number; y: number }) {
    const a = this.worldAt(from.x, from.y);
    const b = this.worldAt(to.x, to.y);
    if (!a || !b) return;
    const d = a.sub(b);
    this.camera.position.add(d);
    this.controls.target.add(d);
  }

  /** Zooms by `ratio` (below 1: closer), keeping the point under the fingers in place. */
  private zoomAt(at: { x: number; y: number }, ratio: number) {
    const before = this.worldAt(at.x, at.y);
    const offset = this.camera.position.clone().sub(this.controls.target);
    const len = THREE.MathUtils.clamp(offset.length() * ratio, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(len));
    const after = this.worldAt(at.x, at.y);
    if (!before || !after) return;
    const d = before.sub(after);
    this.camera.position.add(d);
    this.controls.target.add(d);
  }
}
