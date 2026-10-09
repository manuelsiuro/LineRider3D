import * as THREE from 'three';
import type { DrawMode, Stroke } from '../track/types';

const UP = new THREE.Vector3(0, 1, 0);
/** How far a layer step moves the plane, and how close another line's plane has to be to snap onto it. */
const LAYER_STEP = 1;
const LAYER_SNAP = 0.6;

/**
 * Where new lines go: a visible plane through an anchor point. It only moves when the
 * player moves it (a finished line, a layer step, a turn, "set plane" from a line), never
 * with the camera, so orbiting to look around can't send the next line somewhere else.
 */
export class WorkPlane {
  /** The anchor: profile planes pass through it, path planes sit at its height. */
  readonly point = new THREE.Vector3(0, 12, 0);
  /** Profile planes: the horizontal normal, pointing at the side the plane is drawn from. */
  readonly normal = new THREE.Vector3(0, 0, 1);
  /** Direction the last line left the anchor in (null: nothing to continue). */
  tangent: THREE.Vector3 | null = null;
  readonly grid: THREE.Mesh;
  /** Pen-tip marker on the anchor, with an arrow for the continuation. */
  readonly tip: THREE.Group;
  private arrow: THREE.Mesh;

  constructor(scene: THREE.Scene) {
    this.grid = buildGrid();
    this.tip = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb02e, depthTest: false, transparent: true, opacity: 0.95 });
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), mat);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.56, 32), new THREE.MeshBasicMaterial({ color: 0xffb02e, depthTest: false, transparent: true, opacity: 0.6, side: THREE.DoubleSide }));
    halo.name = 'halo';
    this.arrow = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 12).rotateZ(-Math.PI / 2).translate(1.0, 0, 0), mat);
    for (const m of [dot, halo, this.arrow]) m.renderOrder = 11;
    this.tip.add(dot, halo, this.arrow);
    scene.add(this.grid, this.tip);
  }

  /** The plane new lines in `mode` are drawn on, through `through` (the anchor by default). */
  plane(mode: DrawMode, through: THREE.Vector3 = this.point) {
    const normal = mode === 'profile' ? this.normal.clone() : UP.clone();
    return { plane: new THREE.Plane().setFromNormalAndCoplanarPoint(normal, through), normal };
  }

  /** In-plane axes: `u` runs left to right as seen from the normal's side, `v` up (path planes: `v` runs away). */
  axes(mode: DrawMode) {
    const u = new THREE.Vector3().crossVectors(UP, this.normal).normalize();
    const v = mode === 'profile' ? UP.clone() : this.normal.clone().negate();
    return { u, v };
  }

  /** Moves the anchor (the plane keeps its turn). */
  moveTo(p: THREE.Vector3, tangent: THREE.Vector3 | null = null) {
    this.point.copy(p);
    this.tangent = tangent ? tangent.clone().normalize() : null;
  }

  /** Takes a horizontal normal (profile planes face the camera side). */
  setNormal(n: THREE.Vector3) {
    const h = new THREE.Vector3(n.x, 0, n.z);
    if (h.lengthSq() < 1e-6) return;
    this.normal.copy(h.normalize());
  }

  /** Turns the plane around the anchor's vertical axis, landing on 15° steps. */
  turn(deg: number) {
    const a = Math.atan2(this.normal.x, this.normal.z) + THREE.MathUtils.degToRad(deg);
    const step = Math.PI / 12;
    const snapped = Math.round(a / step) * step;
    this.normal.set(Math.sin(snapped), 0, Math.cos(snapped));
    this.tangent = null;
  }

  /** Heading of the plane in degrees (0: facing +Z). */
  get heading() {
    const d = Math.round(THREE.MathUtils.radToDeg(Math.atan2(this.normal.x, this.normal.z)));
    return ((d % 360) + 360) % 360;
  }

  /**
   * One layer nearer (+1) or further (-1): along the normal for profile planes, up or down
   * for path planes. Lands on another line's plane when one is about a step away.
   */
  shift(dir: 1 | -1, mode: DrawMode, strokes: Iterable<Stroke>) {
    const axis = mode === 'profile' ? this.normal : UP;
    let move = dir * LAYER_STEP;
    for (const s of strokes) {
      if (s.mode !== mode || !s.points.length) continue;
      if (mode === 'profile' && Math.abs(s.planeNormal.dot(this.normal)) < 0.99) continue;
      const d = s.points[0].clone().sub(this.point).dot(axis);
      if (Math.sign(d) === dir && Math.abs(d) > 0.05 && Math.abs(d - dir * LAYER_STEP) < LAYER_SNAP && Math.abs(d) < Math.abs(move) + LAYER_SNAP) move = d;
    }
    this.point.addScaledVector(axis, move);
    this.tangent = null;
  }

  /** How far the anchor is from the plane of the world origin, along the layer axis (for the panel readout). */
  depth(mode: DrawMode) {
    return mode === 'profile' ? this.point.dot(this.normal) : this.point.y;
  }

  /** Places the grid (on the stroke being drawn, if any) and the pen tip. */
  update(show: boolean, mode: DrawMode, time: number, drawing: { start: THREE.Vector3; normal: THREE.Vector3 } | null, camera: THREE.Camera, ready: boolean) {
    this.grid.visible = show;
    this.tip.visible = show && !drawing;
    if (!show) return;
    const origin = drawing ? drawing.start : this.point;
    const normal = drawing ? drawing.normal : mode === 'profile' ? this.normal : UP;
    this.grid.position.copy(origin);
    this.grid.quaternion.setFromUnitVectors(UP, normal);
    if (!this.tip.visible) return;
    // Constant size on screen.
    const dist = camera.position.distanceTo(this.point);
    const scale = THREE.MathUtils.clamp(dist / 26, 0.5, 4);
    this.tip.position.copy(this.point);
    this.tip.scale.setScalar(scale);
    const halo = this.tip.getObjectByName('halo')!;
    halo.quaternion.copy(camera.quaternion);
    // Pulses when the next press would carry on from here.
    const pulse = ready ? 1 + 0.25 * Math.sin(time * 6) : 1;
    halo.scale.setScalar(pulse);
    this.arrow.visible = !!this.tangent;
    if (this.tangent) this.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), this.tangent);
  }
}

/** Drawing-plane grid that fades out radially. */
function buildGrid() {
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
        float minor = line(vUv, 1.0) * 0.45;
        float major = line(vUv, 5.0);
        float a = max(minor, major) * fade * 0.8;
        float axis = (1.0 - min(abs(vUv.x) / fwidth(vUv.x), 1.0)) * fade;
        vec3 col = mix(vec3(0.13, 0.36, 0.66), vec3(1.0, 0.55, 0.15), axis);
        a = max(a, axis * 0.8);
        // A faint sheet so the plane reads even on snow.
        a = max(a, fade * 0.07);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col, a);
      }`,
  });
  const plane = new THREE.Mesh(geo, mat);
  plane.renderOrder = 2;
  return plane;
}
