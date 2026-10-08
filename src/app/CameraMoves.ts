import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { Track } from '../track/Track';

interface Tween {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  t: number;
  duration: number;
  done?: () => void;
}

/** Scripted camera moves outside the ride camera: fly-tos, the title orbit, dev shots. */
export class CameraMoves {
  private tween: Tween | null = null;
  /** Wardrobe and garage preview: the title camera moves in close on Bosh. */
  closeUp = false;
  /** Dev screenshots: a fixed title camera [position, target]. */
  devView: [THREE.Vector3, THREE.Vector3] | null = null;

  constructor(private camera: THREE.PerspectiveCamera, private controls: OrbitControls) {}

  get flying() {
    return this.tween !== null;
  }

  flyTo(pos: THREE.Vector3, target: THREE.Vector3, duration = 1.4, done?: () => void) {
    this.tween = { fromPos: this.camera.position.clone(), fromTarget: this.controls.target.clone(), toPos: pos, toTarget: target, t: 0, duration, done };
  }

  /** Advances a fly-to (ease in-out cubic). */
  updateTween(dt: number) {
    const tw = this.tween;
    if (!tw) return;
    tw.t = Math.min(1, tw.t + dt / tw.duration);
    const k = tw.t < 0.5 ? 4 * tw.t ** 3 : 1 - (-2 * tw.t + 2) ** 3 / 2;
    this.camera.position.lerpVectors(tw.fromPos, tw.toPos, k);
    this.controls.target.lerpVectors(tw.fromTarget, tw.toTarget, k);
    if (tw.t >= 1) {
      this.tween = null;
      tw.done?.();
    }
  }

  /** A pleasant 3/4 view of the start flag. */
  startView(track: Track) {
    const target = track.start.clone().add(new THREE.Vector3(8, -4, 0));
    const pos = target.clone().add(new THREE.Vector3(-8, 8, 28));
    if (innerWidth < innerHeight) pos.add(new THREE.Vector3(-6, 6, 18));
    return { pos, target };
  }

  /** Flies to the start view of a freshly loaded track. */
  showStart(track: Track, duration = 1.4) {
    const v = this.startView(track);
    this.flyTo(v.pos, v.target, duration);
  }

  /** Keeps the current viewing angle but centers on the rider. */
  focus(center: THREE.Vector3) {
    const offset = this.camera.position.clone().sub(this.controls.target);
    offset.setLength(THREE.MathUtils.clamp(offset.length(), 8, 30));
    this.controls.target.copy(center);
    this.camera.position.copy(center).add(offset);
  }

  /** Slow cinematic orbit around the rider behind the title screen (or the dev view). */
  attract(time: number, dt: number, center: THREE.Vector3) {
    if (this.devView) {
      this.camera.position.copy(this.devView[0]);
      this.camera.lookAt(this.devView[1]);
      this.controls.target.copy(this.devView[1]);
      return;
    }
    const close = this.closeUp;
    const k = 1 - Math.exp(-dt * (close ? 3 : 2));
    const focus = close ? center.clone().add(new THREE.Vector3(0, -0.7, 0)) : center;
    this.controls.target.lerp(focus, k);
    const a = time * 0.12;
    const dist = close ? 5.8 : 16;
    const desired = center.clone().add(new THREE.Vector3(Math.sin(a) * dist, (close ? 0.6 : 5) + Math.sin(time * 0.3) * (close ? 0.2 : 2), Math.cos(a) * dist));
    this.camera.position.lerp(desired, k);
    this.camera.lookAt(this.controls.target);
  }
}
