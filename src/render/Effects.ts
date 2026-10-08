import * as THREE from 'three';
import { P } from '../physics/Rider';
import { terrainHeight } from '../world/terrain';
import type { SurfaceId } from '../world/worlds';

/** Particle colors kicked up from each ground (two tones mixed at random). */
const DUST: Record<SurfaceId, [THREE.Color, THREE.Color]> = {
  snow: [new THREE.Color(1, 1, 1), new THREE.Color(0.94, 0.97, 1)],
  sand: [new THREE.Color(0.95, 0.8, 0.56), new THREE.Color(0.82, 0.64, 0.42)],
  grass: [new THREE.Color(0.42, 0.31, 0.2), new THREE.Color(0.36, 0.56, 0.24)],
  asphalt: [new THREE.Color(0.62, 0.62, 0.64), new THREE.Color(0.45, 0.45, 0.48)],
};
const SPARK = new THREE.Color(2.2, 1.3, 0.45);

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
  private color = new Float32Array(MAX * 3).fill(1);
  private next = 0;
  private wasCrashed = false;
  private lastFrame = -1;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(this.color, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { scale: { value: 400 }, light: { value: 1 } },
      vertexShader: `
        attribute float size; attribute float alpha; attribute vec3 color; varying float vAlpha; varying vec3 vColor; uniform float scale;
        void main() {
          vAlpha = alpha;
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vAlpha; varying vec3 vColor; uniform float light;
        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;
          // Bright sparks keep their glow in the dark.
          float l = max(light, step(1.5, vColor.r));
          gl_FragColor = vec4(vColor * vec3(0.97, 0.99, 1.0) * l, vAlpha * smoothstep(0.5, 0.15, d));
        }`,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  private surface: SurfaceId = 'snow';

  /** Ground the particles come from, and how dark the world is (0..1). */
  setSurface(surface: SurfaceId, night: number) {
    this.surface = surface;
    (this.points.material as THREE.ShaderMaterial).uniforms.light.value = 1 - night * 0.65;
  }

  private dust() {
    const [a, b] = DUST[this.surface];
    return Math.random() < 0.5 ? a : b;
  }

  setViewportHeight(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = h * 0.5;
  }

  private emit(p: THREE.Vector3, v: THREE.Vector3, size: number, life: number, color?: THREE.Color) {
    const i = this.next;
    this.color[i * 3] = color ? color.r : 1;
    this.color[i * 3 + 1] = color ? color.g : 1;
    this.color[i * 3 + 2] = color ? color.b : 1;
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
      this.emit(at, v, 0.25 + Math.random() * 0.35, 0.6 + Math.random() * 0.8, this.dust());
    }
  }

  /** Golden sparkles, e.g. when a star is collected. */
  sparkle(at: THREE.Vector3, count = 40) {
    const v = new THREE.Vector3();
    const gold = new THREE.Color(1.6, 1.25, 0.4);
    for (let k = 0; k < count; k++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 4);
      this.emit(at, v, 0.12 + Math.random() * 0.15, 0.5 + Math.random() * 0.6, gold);
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
          this.emit(p, v, 0.25 + Math.random() * 0.3, 0.5 + Math.random() * 0.6, this.dust());
          // Sparks when metal scrapes the road.
          if (this.surface === 'asphalt' && i === P.shoulder && Math.random() < 0.5) {
            v.multiplyScalar(1.4);
            this.emit(p, v, 0.07 + Math.random() * 0.06, 0.25 + Math.random() * 0.25, SPARK);
          }
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
    geo.attributes.color.needsUpdate = true;
  }
}
