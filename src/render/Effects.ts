import * as THREE from 'three';
import { P } from '../physics/Rider';
import { terrainHeight } from '../world/terrain';

const MAX = 1500;
const GRAVITY = -6;

/**
 * Snow particles: spray from the sled runners while riding and a burst when
 * Bosh crashes or plows into the snow.
 */
export class Effects {
  private points: THREE.Points;
  private pos = new Float32Array(MAX * 3);
  private vel = new Float32Array(MAX * 3);
  private life = new Float32Array(MAX);
  private maxLife = new Float32Array(MAX);
  private size = new Float32Array(MAX);
  private alpha = new Float32Array(MAX);
  private next = 0;
  private wasCrashed = false;
  private lastFrame = -1;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 400 } },
      vertexShader: `
        attribute float size; attribute float alpha; varying float vAlpha; uniform float scale;
        void main() {
          vAlpha = alpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          gl_FragColor = vec4(vec3(0.97, 0.99, 1.0), vAlpha * smoothstep(0.5, 0.15, d));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  setViewportHeight(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = h * 0.5;
  }

  private emit(p: THREE.Vector3, v: THREE.Vector3, size: number, life: number) {
    const i = this.next;
    this.next = (this.next + 1) % MAX;
    this.pos.set([p.x, p.y, p.z], i * 3);
    this.vel.set([v.x, v.y, v.z], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.size[i] = size;
  }

  private burst(at: THREE.Vector3, count: number, speed: number) {
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()));
      this.emit(at, v, 0.25 + Math.random() * 0.35, 0.6 + Math.random() * 0.8);
    }
  }

  /**
   * Spawns particles (returns true on the frame Bosh crashes) from the rider state of the current frame. `stepVel` is
   * the per-step velocity of the rider; `stepsPerSecond` converts it.
   */
  fromRider(frame: number, pts: THREE.Vector3[], contact: boolean[], crashed: boolean, stepVel: THREE.Vector3, stepsPerSecond: number): boolean {
    if (frame === this.lastFrame) return false;
    const advanced = frame > this.lastFrame;
    this.lastFrame = frame;
    if (!advanced) {
      // Scrubbed backwards or restarted: no effects for this jump.
      this.wasCrashed = crashed;
      return false;
    }
    const vel = stepVel.clone().multiplyScalar(stepsPerSecond);
    const speed = vel.length();

    const justCrashed = crashed && !this.wasCrashed;
    if (justCrashed) this.burst(pts[P.butt], 70, 5 + speed * 0.2);
    this.wasCrashed = crashed;

    const v = new THREE.Vector3();
    for (const i of [P.tailL, P.tailR, P.noseL, P.noseR, P.butt, P.shoulder]) {
      if (!contact[i]) continue;
      const p = pts[i];
      const onSnow = p.y - terrainHeight(p.x, p.z) < 0.05;
      if (onSnow) {
        // Plowing through powder.
        if (speed < 1) continue;
        const n = Math.min(6, Math.ceil(speed / 4));
        for (let k = 0; k < n; k++) {
          v.copy(vel).multiplyScalar(0.25 + Math.random() * 0.2);
          v.y = 1.5 + Math.random() * 2.5 + speed * 0.1;
          v.x += (Math.random() - 0.5) * 3;
          v.z += (Math.random() - 0.5) * 3;
          this.emit(p, v, 0.25 + Math.random() * 0.3, 0.5 + Math.random() * 0.6);
        }
      } else if (i <= P.noseR && speed > 6 && Math.random() < 0.6) {
        // Fine ice spray from the runners on a track.
        v.copy(vel).multiplyScalar(-0.08);
        v.x += (Math.random() - 0.5) * 1.5;
        v.y += Math.random() * 1.5;
        v.z += (Math.random() - 0.5) * 1.5;
        this.emit(p, v, 0.12 + Math.random() * 0.12, 0.3 + Math.random() * 0.3);
      }
    }
    return justCrashed;
  }

  reset() {
    this.life.fill(0);
    this.lastFrame = -1;
    this.wasCrashed = false;
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o + 1] += GRAVITY * dt;
      const drag = Math.exp(-dt * 2.5);
      this.vel[o] *= drag;
      this.vel[o + 2] *= drag;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const g = terrainHeight(this.pos[o], this.pos[o + 2]);
      if (this.pos[o + 1] < g) {
        this.pos[o + 1] = g;
        this.vel[o] = this.vel[o + 1] = this.vel[o + 2] = 0;
      }
      const t = this.life[i] / this.maxLife[i];
      this.alpha[i] = Math.min(1, t * 2) * 0.9;
      this.size[i] *= 1 + dt * 0.6;
    }
    const geo = this.points.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  }
}
