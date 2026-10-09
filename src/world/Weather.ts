import * as THREE from 'three';
import type { Atmosphere } from './atmosphere';
import { dotTexture, rng } from './textures';
import { terrainHeight } from './terrain';

/**
 * Falling snow, rain streaks or blowing sand in a box that follows the
 * camera focus, plus lightning strikes in storms.
 */
export class Weather {
  readonly group = new THREE.Group();
  private obj: THREE.Points | THREE.LineSegments | null = null;
  private kind: Atmosphere['precip']['kind'] = 'none';
  private vel = new Float32Array(0);
  private box = 70;
  private wind = 0;
  private lightning = false;
  private nextStrike = 6;
  private strikeT = -1;
  /** Current lightning brightness (0..1). */
  flash = 0;
  /** Called at the start of each strike with its distance (0 near .. 1 far). */
  onStrike: ((distance: number) => void) | null = null;

  set(atm: Atmosphere, detail: number) {
    this.clear();
    const p = atm.precip;
    this.kind = p.kind;
    this.wind = p.wind;
    this.lightning = atm.lightning;
    this.nextStrike = 3 + Math.random() * 5;
    this.flash = 0;
    if (p.kind === 'none') return;
    const rand = rng(3);
    if (p.kind === 'rain') {
      this.box = 40;
      const n = Math.round(2600 * p.amount * detail);
      const pos = new Float32Array(n * 6);
      this.vel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (rand() - 0.5) * this.box * 2;
        const y = rand() * this.box;
        const z = (rand() - 0.5) * this.box * 2;
        pos.set([x, y, z, x, y - 0.8, z], i * 6);
        this.vel[i] = 24 + rand() * 10;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const col = atm.night > 0.5 ? 0x8494b8 : 0xc4d0e0;
      this.obj = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.38, depthWrite: false }));
    } else {
      // Ash falls like slow, grey snow (with a few glowing embers mixed in by color).
      const snow = p.kind === 'snow' || p.kind === 'ash';
      const ash = p.kind === 'ash';
      this.box = snow ? 70 : 50;
      const n = Math.round((snow ? 3000 : 1800) * p.amount * detail);
      const pos = new Float32Array(n * 3);
      this.vel = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        pos[i * 3] = (rand() - 0.5) * this.box * 2;
        pos[i * 3 + 1] = rand() * this.box;
        pos[i * 3 + 2] = (rand() - 0.5) * this.box * 2;
        this.vel[i] = ash ? 0.6 + rand() * 1 : snow ? 1.5 + rand() * 2 : 0.3 + rand() * 1.2;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const dust = new THREE.Color(0xd8a46a).multiplyScalar(atm.night > 0.5 ? 0.25 : 1);
      this.obj = new THREE.Points(
        geo,
        new THREE.PointsMaterial(
          ash
            ? { size: 0.3, map: dotTexture(), color: new THREE.Color(0x8a8480).multiplyScalar(atm.night > 0.5 ? 0.5 : 1), transparent: true, depthWrite: false, opacity: 0.85 }
            : snow
            ? { size: 0.35, map: dotTexture(), transparent: true, depthWrite: false, opacity: 0.9 }
            : { size: 0.9, map: dotTexture(), color: dust, transparent: true, depthWrite: false, opacity: 0.4 },
        ),
      );
    }
    this.obj.frustumCulled = false;
    this.group.add(this.obj);
  }

  private clear() {
    if (!this.obj) return;
    this.group.remove(this.obj);
    this.obj.geometry.dispose();
    (this.obj.material as THREE.Material).dispose();
    this.obj = null;
  }

  update(dt: number, focus: THREE.Vector3, time: number) {
    this.updateLightning(dt);
    if (!this.obj) return;
    const attr = this.obj.geometry.attributes.position as THREE.BufferAttribute;
    const a = attr.array as Float32Array;
    const b = this.box;
    const wind = this.wind;
    const rain = this.kind === 'rain';
    const stride = rain ? 6 : 3;
    // Rain is tilted by the wind; snow wobbles; sand streams sideways.
    const wx = rain ? wind * 5 : this.kind === 'dust' ? wind * 7 : wind * 2.5;
    for (let i = 0; i < this.vel.length; i++) {
      const o = i * stride;
      const v = this.vel[i];
      let dx: number;
      let dy: number;
      let dz: number;
      if (rain) {
        dx = wx * dt;
        dy = -v * dt;
        dz = wind * 1.5 * dt;
      } else if (this.kind === 'snow' || this.kind === 'ash') {
        dx = (Math.sin(time * 0.7 + i) * 0.3 + wx) * dt;
        dy = -v * dt;
        dz = Math.cos(time * 0.5 + i * 0.3) * wind * 0.6 * dt;
      } else {
        dx = (wx + Math.sin(time * 1.3 + i) * 3) * dt;
        dy = (Math.sin(time * 0.9 + i * 0.7) * 1.2 - v * 0.3) * dt;
        dz = Math.cos(time * 0.8 + i) * 2.5 * dt;
      }
      a[o] += dx;
      a[o + 1] += dy;
      a[o + 2] += dz;
      // Wrap around the focus point.
      let sx = 0;
      let sy = 0;
      let sz = 0;
      const rx = a[o] - focus.x;
      const ry = a[o + 1] - focus.y;
      const rz = a[o + 2] - focus.z;
      if (rx < -b) sx = 2 * b;
      else if (rx > b) sx = -2 * b;
      if (ry < -b * 0.5) sy = b;
      else if (ry > b * 0.5) sy = -b;
      if (rz < -b) sz = 2 * b;
      else if (rz > b) sz = -2 * b;
      // Rain also stops at the ground.
      if (rain && sy === 0 && a[o + 1] < terrainHeight(a[o], a[o + 2]) - 0.2) sy = b * (0.6 + (i % 7) * 0.05);
      if (sx || sy || sz) {
        a[o] += sx;
        a[o + 1] += sy;
        a[o + 2] += sz;
      }
      if (rain) {
        // The tail trails behind along the fall direction.
        const len = 0.9;
        const k = len / Math.hypot(wx, v);
        a[o + 3] = a[o] - wx * k;
        a[o + 4] = a[o + 1] + v * k;
        a[o + 5] = a[o + 2] - wind * 1.5 * k * 0.3;
      }
    }
    attr.needsUpdate = true;
  }

  private updateLightning(dt: number) {
    if (!this.lightning) {
      this.flash = 0;
      return;
    }
    this.nextStrike -= dt;
    if (this.nextStrike <= 0) {
      this.nextStrike = 5 + Math.random() * 9;
      this.strikeT = 0;
      this.onStrike?.(Math.random());
    }
    if (this.strikeT >= 0) {
      this.strikeT += dt;
      const t = this.strikeT;
      // Two quick flickers then a fade.
      this.flash = t < 0.08 ? 1 : t < 0.14 ? 0.2 : t < 0.22 ? 0.85 : Math.max(0, 0.85 - (t - 0.22) * 2.2);
      if (this.flash === 0 && t > 0.3) this.strikeT = -1;
    }
  }

  dispose() {
    this.clear();
  }
}
