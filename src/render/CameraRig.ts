import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { terrainHeight } from '../world/terrain';

export type CameraMode = 'cinematic' | 'chase' | 'side' | 'follow' | 'director';

export const CAMERA_LABELS: Record<CameraMode, string> = {
  cinematic: 'Cinema',
  chase: 'Chase',
  side: 'Side',
  follow: 'Free',
  director: 'Replay',
};

type Shot = 'trackside' | 'low' | 'side' | 'aerial' | 'orbit';

/**
 * Camera behaviour while the rider moves. In "follow" mode the user can still
 * orbit freely; the orbit target simply tracks the rider.
 */
export class CameraRig {
  mode: CameraMode = 'cinematic';
  /** Extra distance in the air, eased (shows the whole jump). */
  private airPull = 0;
  /** Player preference: multiplies the chase distances. */
  distanceScale = 1;
  /** Accessibility: no shake or zoom punches. */
  reducedMotion = false;
  /** Replay director state. */
  private shot: Shot = 'low';
  private shotTime = 0;
  private shotPos = new THREE.Vector3();
  private wasAirborne = false;
  private orbitAngle = 0;
  private smoothed = new THREE.Vector3();
  private heading = new THREE.Vector3(1, 0, 0);
  private shakeAmount = 0;
  /** Momentary zoom-in, in degrees of FOV. */
  private punchAmount = 0;
  private shakeOffset = new THREE.Vector3();
  readonly baseFov: number;

  constructor(private camera: THREE.PerspectiveCamera, private controls: OrbitControls) {
    this.baseFov = camera.fov;
  }

  /** Quick zoom-in that eases back (big landings, wipeouts). */
  punch(degrees: number) {
    if (this.reducedMotion) return;
    this.punchAmount = Math.max(this.punchAmount, degrees);
  }

  shake(amount: number) {
    if (this.reducedMotion) return;
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /** Removes the shake offset so it never accumulates into the real position. */
  private clearShake() {
    this.camera.position.sub(this.shakeOffset);
    this.shakeOffset.set(0, 0, 0);
  }

  /** Eases the field of view toward the base value (speed widens it). */
  settle(dt: number, speedPerSecond = 0) {
    this.clearShake();
    if (this.mode === 'director' && this.shot === 'trackside') return;
    this.punchAmount *= Math.exp(-dt * 2.2);
    const target = this.baseFov + THREE.MathUtils.clamp((speedPerSecond - 10) * 0.45, 0, 14) - this.punchAmount;
    const fov = THREE.MathUtils.lerp(this.camera.fov, target, 1 - Math.exp(-dt * (this.punchAmount > 1 ? 9 : 3)));
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  snapTo(target: THREE.Vector3) {
    this.smoothed.copy(target);
  }

  update(dt: number, target: THREE.Vector3, velocity: THREE.Vector3, stepsPerSecond: number, airborne = false) {
    const speed = velocity.length() * stepsPerSecond;
    this.settle(dt, speed);
    this.airPull += ((airborne ? 1 : 0) - this.airPull) * (1 - Math.exp(-dt * (airborne ? 1.2 : 2.5)));
    const k = 1 - Math.exp(-dt * 6);
    const prev = this.smoothed.clone();
    this.smoothed.lerp(target, k);

    const flat = new THREE.Vector3(velocity.x, 0, velocity.z);
    if (flat.lengthSq() > 1e-5) this.heading.lerp(flat.normalize(), 1 - Math.exp(-dt * 2.5)).normalize();

    switch (this.mode) {
      case 'director':
        this.direct(dt, speed, airborne);
        break;
      case 'cinematic': {
        // 3/4 chase: behind and a little to the side, pulling back with speed
        // and in the air, looking ahead of the rider.
        const dist = (6 + THREE.MathUtils.clamp(speed * 0.09, 0, 4.5) + this.airPull * 3) * this.distanceScale;
        const side = new THREE.Vector3(-this.heading.z, 0, this.heading.x);
        const desired = this.smoothed
          .clone()
          .addScaledVector(this.heading, -dist)
          .addScaledVector(side, -dist * 0.42)
          .add(new THREE.Vector3(0, 1.6 + dist * 0.22 + this.airPull * 1.5, 0));
        // Never dip under the snow.
        desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 1.2);
        this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3.2));
        const look = this.smoothed.clone().addScaledVector(this.heading, 1.5 + Math.min(speed * 0.06, 3));
        this.controls.target.lerp(look, 1 - Math.exp(-dt * 8));
        break;
      }
      case 'follow': {
        const delta = this.smoothed.clone().sub(prev);
        this.camera.position.add(delta);
        this.controls.target.add(delta);
        break;
      }
      case 'chase': {
        const desired = this.smoothed.clone().addScaledVector(this.heading, -7 * this.distanceScale).add(new THREE.Vector3(0, 3, 0));
        this.camera.position.lerp(desired, 1 - Math.exp(-dt * 4));
        this.controls.target.copy(this.smoothed).addScaledVector(this.heading, 3);
        break;
      }
      case 'side': {
        const side = new THREE.Vector3(-this.heading.z, 0, this.heading.x);
        const desired = this.smoothed.clone().addScaledVector(side, -16).add(new THREE.Vector3(0, 2, 0));
        this.camera.position.lerp(desired, 1 - Math.exp(-dt * 3));
        this.controls.target.copy(this.smoothed);
        break;
      }
    }
    this.camera.lookAt(this.controls.target);
  }

  /** Starts the replay director on a fresh shot. */
  startDirector() {
    this.shotTime = 0;
    this.wasAirborne = false;
  }

  /**
   * TV-style replay direction: cuts between trackside, low chase, side,
   * aerial and orbit shots every few seconds, and to a wide side shot when
   * the rider takes off.
   */
  private direct(dt: number, speed: number, airborne: boolean) {
    this.shotTime -= dt;
    const takeoff = airborne && !this.wasAirborne;
    this.wasAirborne = airborne;
    const side = new THREE.Vector3(-this.heading.z, 0, this.heading.x);
    let cut = false;
    if (this.shotTime <= 0 || (takeoff && this.shot !== 'side' && this.shot !== 'trackside')) {
      const options: Shot[] = takeoff ? ['side', 'trackside'] : ['trackside', 'low', 'side', 'aerial', 'orbit'];
      const pool = options.filter((s) => s !== this.shot);
      this.shot = pool[Math.floor(Math.random() * pool.length)];
      this.shotTime = 2.6 + Math.random() * 2;
      cut = true;
      if (this.shot === 'trackside') {
        // A fixed camera beside the line, ahead of the rider.
        const ahead = THREE.MathUtils.clamp(speed * 0.9, 8, 26);
        this.shotPos
          .copy(this.smoothed)
          .addScaledVector(this.heading, ahead)
          .addScaledVector(side, (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 3))
          .add(new THREE.Vector3(0, 0.8 + Math.random() * 2, 0));
      }
      this.orbitAngle = Math.random() * Math.PI * 2;
    }
    const desired = new THREE.Vector3();
    switch (this.shot) {
      case 'trackside':
        desired.copy(this.shotPos);
        break;
      case 'low':
        desired.copy(this.smoothed).addScaledVector(this.heading, -4.5).addScaledVector(side, 1.2).add(new THREE.Vector3(0, 0.7, 0));
        break;
      case 'side':
        desired.copy(this.smoothed).addScaledVector(side, -11 - speed * 0.12).add(new THREE.Vector3(0, 1.5, 0));
        break;
      case 'aerial':
        desired.copy(this.smoothed).addScaledVector(this.heading, -7).add(new THREE.Vector3(0, 13, 0));
        break;
      case 'orbit':
        this.orbitAngle += dt * 0.45;
        desired.copy(this.smoothed).add(new THREE.Vector3(Math.cos(this.orbitAngle) * 7, 2.2, Math.sin(this.orbitAngle) * 7));
        break;
    }
    desired.y = Math.max(desired.y, terrainHeight(desired.x, desired.z) + 0.6);
    if (cut) this.camera.position.copy(desired);
    else this.camera.position.lerp(desired, 1 - Math.exp(-dt * (this.shot === 'trackside' ? 20 : 4)));
    // Trackside cameras zoom in as the rider gets further away.
    if (this.shot === 'trackside') {
      const d = this.camera.position.distanceTo(this.smoothed);
      const fov = THREE.MathUtils.clamp(2 * Math.atan(3.2 / d) * THREE.MathUtils.RAD2DEG, 18, this.baseFov);
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.controls.target.copy(this.smoothed);
  }

  /** Applies shake after the controls have positioned the camera. */
  applyShake(dt: number) {
    if (this.shakeAmount < 0.002) return;
    this.shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shakeAmount);
    this.camera.position.add(this.shakeOffset);
    this.shakeAmount *= Math.exp(-dt * 6);
  }
}
