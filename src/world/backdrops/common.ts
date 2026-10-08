import * as THREE from 'three';
import type { Atmosphere } from '../atmosphere';
import { dotTexture, type GroundKind } from '../textures';
import type { WorldConfig } from '../worlds';
import { bakeGeometry, buildDecor } from '../models';
import { terrainHeight } from '../terrain';
import type { DecorKind } from '../../track/types';

export interface BackdropCtx {
  cfg: WorldConfig;
  atm: Atmosphere;
  /** Density multiplier from the quality setting (0.35 .. 1). */
  detail: number;
}

/** The landscape around the play area for one biome. */
export interface Backdrop {
  group: THREE.Group;
  ground: GroundKind;
  /** Ground vertex color multiplier at (x, z). */
  groundTint?(x: number, z: number, out: THREE.Color): void;
  /** Visual-only change of the ground height, far from the play area. */
  farShape?(x: number, z: number): number;
  /** Called once the ground exists: its heights on a regular grid. */
  onGround?(heights: Float32Array, segments: number, extent: number): void;
  update?(dt: number, focus: THREE.Vector3, time: number): void;
}

/** Marks geometries / materials / textures that outlive a backdrop. */
export function shared<T extends { userData: Record<string, unknown> }>(x: T): T {
  x.userData.shared = true;
  return x;
}

/** Frees everything a backdrop created (shared resources are kept). */
export function disposeTree(root: THREE.Object3D) {
  const seen = new Set<unknown>();
  root.traverse((o) => {
    // Instanced meshes free their instance buffers on dispose.
    if ((o as THREE.InstancedMesh).isInstancedMesh) (o as THREE.InstancedMesh).dispose();
    const m = o as THREE.Mesh;
    if (m.geometry && !m.geometry.userData.shared && !seen.has(m.geometry)) {
      seen.add(m.geometry);
      m.geometry.dispose();
    }
    if (!m.material) return;
    for (const mat of [m.material].flat()) {
      if (seen.has(mat) || mat.userData.shared) continue;
      seen.add(mat);
      for (const v of Object.values(mat)) {
        if (v instanceof THREE.Texture && !v.userData.shared && !seen.has(v)) {
          seen.add(v);
          v.dispose();
        }
      }
      if (mat instanceof THREE.ShaderMaterial)
        for (const u of Object.values(mat.uniforms)) if (u.value instanceof THREE.Texture && !u.value.userData.shared) u.value.dispose();
      mat.dispose();
    }
  });
}

export function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

export const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ------------------------------------------------------------------ keep-out
const CELL = 6;
let keep: Set<number> | null = null;
const cellKey = (cx: number, cz: number) => (cx + 4096) * 8192 + (cz + 4096);

/** Marks where the track runs: scenery is never placed over it. */
export function setKeepOut(points: { x: number; z: number }[]) {
  keep = new Set();
  for (const p of points) keep.add(cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL)));
}

/** True if a disc of radius `r` at (x, z) touches the track footprint. */
export function blocked(x: number, z: number, r: number) {
  if (!keep || keep.size === 0) return false;
  const pad = r + 3;
  for (let cx = Math.floor((x - pad) / CELL); cx <= Math.floor((x + pad) / CELL); cx++)
    for (let cz = Math.floor((z - pad) / CELL); cz <= Math.floor((z + pad) / CELL); cz++) if (keep.has(cellKey(cx, cz))) return true;
  return false;
}

const baked = new Map<string, THREE.BufferGeometry>();

/** A decor model merged into one vertex-colored geometry (cached, shared). */
export function bakedDecor(kind: DecorKind, snowy: boolean, variant = 0): THREE.BufferGeometry {
  const key = `${kind}:${snowy}:${variant}`;
  let g = baked.get(key);
  if (!g) {
    g = shared(bakeGeometry(buildDecor(kind, { snowy, variant })));
    baked.set(key, g);
  }
  return g;
}

export const flatMaterial = (extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9, ...extra });

const mtx = new THREE.Matrix4();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const pos = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

export interface Placement {
  x: number;
  z: number;
  /** Uniform scale, or [x, y, z]. */
  s: number | [number, number, number];
  rot?: number;
  /** Height offset from the ground. */
  dy?: number;
}

/**
 * Instanced copies of a geometry placed by `place` (which may reject a spot by
 * returning null; gives up after many rejections).
 */
export function scatter(
  geo: THREE.BufferGeometry,
  material: THREE.Material,
  count: number,
  seed: number,
  place: (rand: () => number) => Placement | null,
  height: (x: number, z: number) => number = terrainHeight,
  shadows = true,
): THREE.InstancedMesh {
  count = Math.max(1, Math.round(count));
  const mesh = new THREE.InstancedMesh(geo, material, count);
  mesh.castShadow = shadows;
  mesh.receiveShadow = true;
  const rand = rng(seed);
  let placed = 0;
  for (let tries = 0; placed < count && tries < count * 30; tries++) {
    const p = place(rand);
    if (!p) continue;
    const size = typeof p.s === 'number' ? p.s : Math.max(p.s[0], p.s[2]);
    if (blocked(p.x, p.z, size * 1.6)) continue;
    pos.set(p.x, height(p.x, p.z) + (p.dy ?? -0.2), p.z);
    if (typeof p.s === 'number') scl.setScalar(p.s);
    else scl.set(...p.s);
    quat.setFromAxisAngle(UP, p.rot ?? rand() * Math.PI * 2);
    mtx.compose(pos, quat, scl);
    mesh.setMatrixAt(placed++, mtx);
  }
  mesh.count = placed;
  mesh.computeBoundingSphere();
  return mesh;
}

/** Random point on a ring around the play area. */
export function ring(rand: () => number, r0: number, r1: number, power = 1): [number, number, number] {
  const a = rand() * Math.PI * 2;
  const r = r0 + Math.pow(rand(), power) * (r1 - r0);
  return [Math.cos(a) * r, Math.sin(a) * r, a];
}

/**
 * Distant low-poly peaks: jittered cones with vertex colors from `paint`
 * (t = 0 at the foot .. 1 at the top).
 */
export function peaks(opts: {
  count: number;
  seed: number;
  dist: [number, number];
  height: [number, number];
  radius: [number, number];
  sides?: number;
  /** Flat-topped mesas instead of cones (top radius ratio). */
  mesa?: number;
  /** Only place peaks at angles where this is true. */
  arc?: (angle: number) => boolean;
  paint: (t: number, rand: () => number, out: THREE.Color) => void;
}): THREE.Group {
  const group = new THREE.Group();
  const rand = rng(opts.seed);
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
  const c = new THREE.Color();
  for (let i = 0; i < opts.count; i++) {
    const angle = (i / opts.count) * Math.PI * 2 + rand() * 0.1;
    const dist = opts.dist[0] + rand() * (opts.dist[1] - opts.dist[0]);
    const height = opts.height[0] + rand() * (opts.height[1] - opts.height[0]);
    const radius = opts.radius[0] + rand() * (opts.radius[1] - opts.radius[0]);
    if (opts.arc && !opts.arc(angle)) continue;
    if (blocked(Math.cos(angle) * dist, Math.sin(angle) * dist, radius)) continue;
    const geo = opts.mesa
      ? new THREE.CylinderGeometry(radius * opts.mesa, radius, height, opts.sides ?? 9, 6)
      : new THREE.ConeGeometry(radius, height, opts.sides ?? 9, 6);
    const p = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(p.count * 3);
    for (let v = 0; v < p.count; v++) {
      const y = p.getY(v);
      const t = (y + height / 2) / height;
      if (t > 0.02 && t < 0.98) {
        const n = 1 + (rand() - 0.5) * 0.25;
        p.setX(v, p.getX(v) * n);
        p.setZ(v, p.getZ(v) * n);
        p.setY(v, y + (rand() - 0.5) * height * 0.05);
      }
      opts.paint(t, rand, c);
      colors.set([c.r, c.g, c.b], v * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, material);
    m.position.set(Math.cos(angle) * dist, height / 2 - 5, Math.sin(angle) * dist);
    m.rotation.y = rand() * Math.PI;
    group.add(m);
  }
  return group;
}

/** Squashed blobs half sunk in the ground (snow drifts, dunes, bushes). */
export function mounds(
  material: THREE.Material,
  count: number,
  seed: number,
  r: [number, number],
  size: [number, number],
  tall: [number, number],
  where: (x: number, z: number) => boolean = () => true,
) {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  return scatter(
    geo,
    material,
    count,
    seed,
    (rand) => {
      const [x, z] = ring(rand, r[0], r[1]);
      if (!where(x, z)) return null;
      const w = size[0] + rand() * (size[1] - size[0]);
      return { x, z, s: [w, tall[0] + rand() * (tall[1] - tall[0]), w * (0.5 + rand() * 0.5)], dy: -0.15, rot: rand() * Math.PI };
    },
    terrainHeight,
    false,
  );
}

/** A flock of birds gliding in lazy circles. */
export class Birds {
  readonly mesh: THREE.InstancedMesh;
  private data: { r: number; h: number; speed: number; phase: number; cx: number; cz: number; flap: number }[] = [];
  constructor(count: number, seed: number, color: number, center: [number, number], radius: [number, number], height: [number, number], scale = 1) {
    // A simple "V" of two thin triangles.
    const geo = new THREE.BufferGeometry();
    const v = new Float32Array([0, 0, 0, -0.5, 0.15, 1.2, 0.35, 0, 0, 0, 0, 0, 0.35, 0, 0, -0.5, 0.15, -1.2]);
    geo.setAttribute('position', new THREE.BufferAttribute(v.map((x) => x * scale), 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide });
    this.mesh = new THREE.InstancedMesh(geo, mat, count);
    this.mesh.frustumCulled = false;
    const rand = rng(seed);
    for (let i = 0; i < count; i++) {
      this.data.push({
        r: radius[0] + rand() * (radius[1] - radius[0]),
        h: height[0] + rand() * (height[1] - height[0]),
        speed: (0.04 + rand() * 0.05) * (rand() < 0.5 ? -1 : 1),
        phase: rand() * Math.PI * 2,
        cx: center[0] + (rand() - 0.5) * 40,
        cz: center[1] + (rand() - 0.5) * 40,
        flap: rand() * 10,
      });
    }
  }
  update(time: number) {
    this.data.forEach((b, i) => {
      const a = b.phase + time * b.speed * (60 / b.r);
      pos.set(b.cx + Math.cos(a) * b.r, b.h + Math.sin(time * 0.3 + b.phase) * 3, b.cz + Math.sin(a) * b.r);
      quat.setFromAxisAngle(UP, -a + (b.speed > 0 ? Math.PI : 0));
      const f = Math.sin(time * 9 + b.flap);
      scl.set(1, 1 + f * 0.6, 1 - Math.abs(f) * 0.15);
      mtx.compose(pos, quat, scl);
      this.mesh.setMatrixAt(i, mtx);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Flying leaves / petals / fireflies drifting around the camera focus. */
export class Drifters {
  readonly points: THREE.Points;
  private vel: Float32Array;
  private readonly box: number;
  constructor(count: number, seed: number, opts: { color: number; size: number; box: number; fall: number; additive?: boolean; opacity?: number }) {
    this.box = opts.box;
    const rand = rng(seed);
    const p = new Float32Array(count * 3);
    this.vel = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      p[i * 3] = (rand() - 0.5) * opts.box * 2;
      p[i * 3 + 1] = rand() * opts.box * 0.6;
      p[i * 3 + 2] = (rand() - 0.5) * opts.box * 2;
      this.vel[i] = opts.fall * (0.6 + rand() * 0.8);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        color: opts.color,
        size: opts.size,
        map: dotTexture(),
        transparent: true,
        opacity: opts.opacity ?? 0.9,
        depthWrite: false,
        blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      }),
    );
    this.points.frustumCulled = false;
  }
  update(dt: number, focus: THREE.Vector3, time: number) {
    const attr = this.points.geometry.attributes.position as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    const b = this.box;
    for (let i = 0; i < this.vel.length; i++) {
      const o = i * 3;
      a[o] += Math.sin(time * 0.9 + i * 1.7) * 0.8 * dt;
      a[o + 1] -= this.vel[i] * dt;
      a[o + 2] += Math.cos(time * 0.7 + i) * 0.5 * dt;
      if (a[o] - focus.x < -b) a[o] += 2 * b;
      else if (a[o] - focus.x > b) a[o] -= 2 * b;
      if (a[o + 2] - focus.z < -b) a[o + 2] += 2 * b;
      else if (a[o + 2] - focus.z > b) a[o + 2] -= 2 * b;
      const ground = Math.max(focus.y - b * 0.3, terrainHeight(a[o], a[o + 2]));
      if (a[o + 1] < ground) a[o + 1] += b * 0.6;
      else if (a[o + 1] > focus.y + b * 0.6) a[o + 1] -= b * 0.6;
    }
    attr.needsUpdate = true;
  }
}
