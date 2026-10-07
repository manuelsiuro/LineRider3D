import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export type CameraMode = 'follow' | 'chase' | 'side';

export const CAMERA_LABELS: Record<CameraMode, string> = {
  follow: '🎥 Follow',
  chase: '🏂 Chase',
  side: '📐 Side',
};

/**
 * Camera behaviour while the rider moves. In "follow" mode the user can still
 * orbit freely; the orbit target simply tracks the rider.
 */
export class CameraRig {
  mode: CameraMode = 'follow';
  private smoothed = new THREE.Vector3();
  private heading = new THREE.Vector3(1, 0, 0);
  private shakeAmount = 0;
  private shakeOffset = new THREE.Vector3();
  readonly baseFov: number;

  constructor(private camera: THREE.PerspectiveCamera, private controls: OrbitControls) {
    this.baseFov = camera.fov;
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
    const target = this.baseFov + THREE.MathUtils.clamp((speedPerSecond - 10) * 0.45, 0, 14);
    const fov = THREE.MathUtils.lerp(this.camera.fov, target, 1 - Math.exp(-dt * 3));
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }

  snapTo(target: THREE.Vector3) {
    this.smoothed.copy(target);
  }

  update(dt: number, target: THREE.Vector3, velocity: THREE.Vector3, stepsPerSecond: number) {
    this.settle(dt, velocity.length() * stepsPerSecond);
    const k = 1 - Math.exp(-dt * 6);
    const prev = this.smoothed.clone();
    this.smoothed.lerp(target, k);

    const flat = new THREE.Vector3(velocity.x, 0, velocity.z);
    if (flat.lengthSq() > 1e-5) this.heading.lerp(flat.normalize(), 1 - Math.exp(-dt * 2.5)).normalize();

    switch (this.mode) {
      case 'follow': {
        const delta = this.smoothed.clone().sub(prev);
        this.camera.position.add(delta);
        this.controls.target.add(delta);
        break;
      }
      case 'chase': {
        const desired = this.smoothed.clone().addScaledVector(this.heading, -7).add(new THREE.Vector3(0, 3, 0));
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
