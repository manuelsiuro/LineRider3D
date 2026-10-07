import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { terrainHeight } from '../world/terrain';

export type CameraMode = 'cinematic' | 'chase' | 'side' | 'follow';

export const CAMERA_LABELS: Record<CameraMode, string> = {
  cinematic: 'Cinema',
  chase: 'Chase',
  side: 'Side',
  follow: 'Free',
};

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
    this.punchAmount = Math.max(this.punchAmount, degrees);
  }

  shake(amount: number) {
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

  /** Applies shake after the controls have positioned the camera. */
  applyShake(dt: number) {
    if (this.shakeAmount < 0.002) return;
    this.shakeOffset.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(this.shakeAmount);
    this.camera.position.add(this.shakeOffset);
    this.shakeAmount *= Math.exp(-dt * 6);
  }
}
