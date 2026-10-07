import * as THREE from 'three';
import { P } from '../physics/vehicles';
import { terrainHeight } from '../world/terrain';

/** Segments kept per lane (oldest are overwritten). */
const MAX = 900;

/**
 * Grooves left in the snow by runners, skis and tyres: two lanes (left and
 * right contacts), each a strip of quads written into a ring buffer.
 */
export class SnowTracks {
  private mesh: THREE.Mesh;
  private positions = new Float32Array(MAX * 2 * 4 * 3);
  private uvs = new Float32Array(MAX * 2 * 4 * 2);
  private next = 0;
  private last: (THREE.Vector3 | null)[] = [null, null];
  private lastFrame = -1;
  private tmp = new THREE.Vector3();
  private side = new THREE.Vector3();
  /** Groove half width (runners are thin, tyres wide). */
  width = 0.08;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(this.uvs, 2));
    const index = new Uint32Array(MAX * 2 * 6);
    for (let q = 0; q < MAX * 2; q++) {
      const v = q * 4;
      index.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], q * 6);
    }
    geo.setIndex(new THREE.BufferAttribute(index, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      fog: true,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      vertexShader: `#include <fog_pars_vertex>
        varying vec2 vUv;
        void main(){
          vUv = uv;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `#include <fog_pars_fragment>
        varying vec2 vUv;
        void main(){
          // Soft groove: darker blue in the middle, fading at the edges.
          float e = 1.0 - pow(abs(vUv.x * 2.0 - 1.0), 2.0);
          gl_FragColor = vec4(0.34, 0.45, 0.64, 0.55 * e);
          #include <fog_fragment>
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
  }

  reset() {
    this.positions.fill(0);
    this.mesh.geometry.attributes.position.needsUpdate = true;
    this.last = [null, null];
    this.lastFrame = -1;
  }

  /** Adds groove segments for contacts touching the snow (once per sim frame). */
  update(frame: number, pts: THREE.Vector3[], contact: boolean[], crashed: boolean) {
    if (frame === this.lastFrame) return;
    if (frame < this.lastFrame) this.last = [null, null];
    this.lastFrame = frame;
    const lanes = [P.tailL, P.tailR];
    this.side.subVectors(pts[P.tailR], pts[P.tailL]).setY(0);
    if (this.side.lengthSq() < 1e-6) this.side.set(0, 0, 1);
    this.side.normalize();
    let changed = false;
    lanes.forEach((i, lane) => {
      const p = pts[i];
      const ground = terrainHeight(p.x, p.z);
      const onSnow = contact[i] && p.y - ground < 0.08 && !crashed;
      const prev = this.last[lane];
      if (!onSnow) {
        this.last[lane] = null;
        return;
      }
      const cur = this.tmp.set(p.x, ground + 0.02, p.z);
      if (prev && prev.distanceToSquared(cur) > 0.09 && prev.distanceToSquared(cur) < 16) {
        this.writeQuad(prev, cur);
        changed = true;
      }
      if (!prev || prev.distanceToSquared(cur) > 0.09) this.last[lane] = cur.clone();
    });
    if (changed) this.mesh.geometry.attributes.position.needsUpdate = true;
  }

  private writeQuad(a: THREE.Vector3, b: THREE.Vector3) {
    const q = this.next;
    this.next = (this.next + 1) % (MAX * 2);
    const w = this.width;
    const s = this.side;
    const verts = [
      [a.x - s.x * w, a.y, a.z - s.z * w, 0],
      [a.x + s.x * w, a.y, a.z + s.z * w, 1],
      [b.x - s.x * w, b.y, b.z - s.z * w, 0],
      [b.x + s.x * w, b.y, b.z + s.z * w, 1],
    ];
    verts.forEach(([x, y, z, u], k) => {
      const o = (q * 4 + k) * 3;
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.uvs[(q * 4 + k) * 2] = u;
    });
    this.mesh.geometry.attributes.uv.needsUpdate = true;
  }
}
