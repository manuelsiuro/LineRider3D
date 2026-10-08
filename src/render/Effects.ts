import * as THREE from 'three';
import { P } from '../physics/Rider';
import { terrainHeight } from '../world/terrain';
import { fxStyle, type FxStyle } from './fxStyles';
import { DEFAULT_WORLD } from '../world/worlds';

const SPARK = new THREE.Color(2.2, 1.3, 0.45);

const MAX = 1500;
const GRAVITY = -6;

/**
 * Ground and track particles in the style of the world: powder, dirt and
 * leaves, sand, red dust or grit kicked up by the ride, spray and landing
 * puffs on the track, sparks, and sparkles when a star is collected.
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
  private grav = new Float32Array(MAX);
  private drag = new Float32Array(MAX);
  private style: FxStyle = fxStyle(DEFAULT_WORLD, 0);
  private airFrames = 0;
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

  /** The world's particle style, and how dark it is (0..1). */
  setStyle(style: FxStyle, night: number) {
    this.style = style;
    (this.points.material as THREE.ShaderMaterial).uniforms.light.value = 1 - night * 0.65;
  }

  private pick([a, b]: [THREE.Color, THREE.Color]) {
    return Math.random() < 0.5 ? a : b;
  }

  /** Ground color, now and then a fleck (leaf, shell). */
  private dust() {
    const s = this.style;
    return s.bits && Math.random() < 0.3 ? this.pick(s.bits) : this.pick(s.ground);
  }

  setViewportHeight(h: number) {
    (this.points.material as THREE.ShaderMaterial).uniforms.scale.value = h * 0.5;
  }

  private emit(p: THREE.Vector3, v: THREE.Vector3, size: number, life: number, color?: THREE.Color, gravity = GRAVITY, drag = 2.5) {
    const i = this.next;
    this.grav[i] = gravity;
    this.drag[i] = drag;
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

  /** Ground particles in the world's style (dust behavior included). */
  private puff(at: THREE.Vector3, v: THREE.Vector3, size: number, life: number) {
    const f = this.style.puff;
    this.emit(at, v, size * f.size, life * f.life, this.dust(), f.gravity, f.drag);
  }

  private spark(at: THREE.Vector3, v: THREE.Vector3) {
    this.emit(at, v, 0.08 + Math.random() * 0.08, 0.3 + Math.random() * 0.3, SPARK, -9, 1.5);
  }

  private burst(at: THREE.Vector3, count: number, speed: number) {
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      v.set(Math.random() - 0.5, Math.random() * 0.9 + 0.2, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.4 + Math.random()) * this.style.puff.rise);
      this.puff(at, v, 0.25 + Math.random() * 0.35, 0.6 + Math.random() * 0.8);
    }
    if (this.style.sparks)
      for (let k = 0; k < 24; k++) {
        v.set(Math.random() - 0.5, Math.random() * 0.8 + 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.8 + Math.random()));
        this.spark(at, v);
      }
  }

  /** A soft ring of spray where the ride touches down on the track. */
  private landing(at: THREE.Vector3, impact: number) {
    const v = new THREE.Vector3();
    const n = Math.min(30, Math.round(8 + impact * 3));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      v.set(Math.cos(a) * (1.5 + impact * 0.4), 0.6 + Math.random() * 1.2, Math.sin(a) * (1.5 + impact * 0.4));
      this.emit(at, v, 0.18 + Math.random() * 0.22, 0.4 + Math.random() * 0.4, this.pick(this.style.spray), GRAVITY, 3);
    }
    if (this.style.sparks && impact > 6) for (let k = 0; k < 10; k++) this.spark(at, v.set((Math.random() - 0.5) * 6, 1 + Math.random() * 2, (Math.random() - 0.5) * 6));
  }

  /** Golden sparkles, e.g. when a star is collected. */
  sparkle(at: THREE.Vector3, count = 40) {
    const v = new THREE.Vector3();
    for (let k = 0; k < count; k++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(2 + Math.random() * 4);
      this.emit(at, v, 0.12 + Math.random() * 0.15, 0.5 + Math.random() * 0.6, this.pick(this.style.sparkle), GRAVITY * 0.5, 2.5);
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
    // Touchdown on the track after a real jump.
    const grounded = contact.some((c) => c);
    if (grounded && this.airFrames > 10 && !crashed) {
      const at = pts.find((_, i) => contact[i] && i <= P.noseR) ?? pts[P.butt];
      if (at.y - terrainHeight(at.x, at.z) > 0.05) this.landing(at, Math.abs(vel.y));
    }
    this.airFrames = grounded ? 0 : this.airFrames + 1;
    for (const i of [P.tailL, P.tailR, P.noseL, P.noseR, P.butt, P.shoulder]) {
      if (!contact[i]) continue;
      const p = pts[i];
      const onSnow = p.y - terrainHeight(p.x, p.z) < 0.05;
      if (onSnow) {
        // Plowing through the ground.
        if (speed < 1) continue;
        const n = Math.min(6, Math.ceil(speed / 4));
        for (let k = 0; k < n; k++) {
          v.copy(vel).multiplyScalar(0.25 + Math.random() * 0.2);
          v.y = (1.5 + Math.random() * 2.5 + speed * 0.1) * this.style.puff.rise;
          v.x += (Math.random() - 0.5) * 3;
          v.z += (Math.random() - 0.5) * 3;
          this.puff(p, v, 0.25 + Math.random() * 0.3, 0.5 + Math.random() * 0.6);
          // Sparks when metal scrapes the road.
          if (this.style.sparks && i === P.shoulder && Math.random() < 0.5) this.spark(p, v.multiplyScalar(1.4));
        }
      } else if (i <= P.noseR && speed > 6 && Math.random() < 0.6) {
        // Fine spray from the runners or tyres on a track (ice, sawdust, sand, grit, rain water).
        v.copy(vel).multiplyScalar(-0.08);
        v.x += (Math.random() - 0.5) * 1.5;
        v.y += Math.random() * 1.5;
        v.z += (Math.random() - 0.5) * 1.5;
        this.emit(p, v, 0.12 + Math.random() * 0.12, 0.3 + Math.random() * 0.3, this.pick(this.style.spray));
      }
    }
    return justCrashed;
  }

  reset() {
    this.life.fill(0);
    this.lastFrame = -1;
    this.wasCrashed = false;
    this.airFrames = 0;
  }

  update(dt: number) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) {
        this.alpha[i] = 0;
        continue;
      }
      this.life[i] -= dt;
      const o = i * 3;
      this.vel[o + 1] += this.grav[i] * dt;
      const drag = Math.exp(-dt * this.drag[i]);
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
