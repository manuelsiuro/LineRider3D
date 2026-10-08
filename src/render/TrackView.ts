import * as THREE from 'three';
import type { Track } from '../track/Track';
import type { Decor, Ring, Star } from '../track/types';
import { animateStar, buildFinish, buildStar } from './goalModels';
import { animateRing, buildRing } from './ringModel';
import { buildDecor, decorFor, M } from '../world/models';
import { DEFAULT_WORLD, biomeById, isSnowy, type WorldConfig } from '../world/worlds';
import { buildRibbonMesh } from './ribbon';
import { buildSupports, supportMaterial } from './supports';

/** Keeps Three.js objects in sync with the track data. */
export class TrackView {
  readonly ribbons = new THREE.Group();
  readonly decor = new THREE.Group();
  readonly rings = new THREE.Group();
  readonly stars = new THREE.Group();
  readonly goals = new THREE.Group();
  private starById = new Map<number, THREE.Object3D>();
  /** Decorative wooden scaffolding under tracks. */
  readonly supports = new THREE.Group();
  readonly startMarker: THREE.Group;
  private ribbonById = new Map<number, THREE.Mesh>();
  private supportById = new Map<number, THREE.Mesh>();
  private decorById = new Map<number, THREE.Object3D>();
  private ringById = new Map<number, THREE.Object3D>();
  private world: WorldConfig = { ...DEFAULT_WORLD };

  constructor(scene: THREE.Scene, private track: Track) {
    scene.add(this.ribbons, this.decor, this.supports, this.rings, this.stars, this.goals);
    this.startMarker = this.buildStartMarker();
    scene.add(this.startMarker);

    track.on((e) => {
      switch (e.kind) {
        case 'strokeAdded':
        case 'strokeChanged':
          this.removeRibbon(e.stroke.id);
          this.addRibbon(e.stroke.id);
          break;
        case 'strokeRemoved':
          this.removeRibbon(e.stroke.id);
          break;
        case 'decorAdded':
          this.addDecor(e.decor);
          break;
        case 'decorRemoved':
          this.removeDecor(e.decor.id);
          break;
        case 'ringAdded':
          this.addRing(e.ring);
          break;
        case 'ringRemoved':
          this.removeRing(e.ring.id);
          break;
        case 'starAdded':
          this.addStar(e.star);
          break;
        case 'starRemoved':
          this.removeStar(e.star.id);
          break;
        case 'finishChanged':
          this.rebuildFinish();
          break;
        case 'startChanged':
          this.startMarker.position.copy(track.start);
          break;
        case 'cleared':
          for (const id of [...this.ribbonById.keys()]) this.removeRibbon(id);
          for (const id of [...this.decorById.keys()]) this.removeDecor(id);
          for (const id of [...this.ringById.keys()]) this.removeRing(id);
          for (const id of [...this.starById.keys()]) this.removeStar(id);
          this.rebuildFinish();
          break;
      }
    });
  }

  private addRibbon(id: number) {
    const stroke = this.track.strokes.get(id);
    if (!stroke || stroke.points.length < 2) return;
    const mesh = buildRibbonMesh(stroke);
    this.ribbonById.set(id, mesh);
    this.ribbons.add(mesh);
    const geo = buildSupports(stroke);
    if (geo) {
      const sup = new THREE.Mesh(geo, supportMaterial);
      sup.castShadow = true;
      sup.receiveShadow = true;
      this.supportById.set(id, sup);
      this.supports.add(sup);
    }
  }

  private removeRibbon(id: number) {
    const sup = this.supportById.get(id);
    if (sup) {
      sup.geometry.dispose();
      this.supports.remove(sup);
      this.supportById.delete(id);
    }
    const mesh = this.ribbonById.get(id);
    if (!mesh) return;
    mesh.geometry.dispose();
    // Highlight clones belong to this ribbon only.
    if (mesh.userData.highlighted) for (const m of mesh.material as THREE.Material[]) m.dispose();
    this.ribbons.remove(mesh);
    this.ribbonById.delete(id);
  }

  /** Restyles decor (and track skin) for a world: a pine becomes a palm on the beach. */
  setWorld(w: WorldConfig) {
    this.world = w;
    for (const id of [...this.decorById.keys()]) {
      const d = this.track.decor.get(id);
      this.removeDecor(id);
      if (d) this.addDecor(d);
    }
  }

  private addDecor(d: Decor) {
    const biome = biomeById(this.world.biome);
    const obj = buildDecor(decorFor(d.kind, biome.id, d.id, biome.decor), { snowy: isSnowy(this.world), variant: d.id });
    obj.position.copy(d.position);
    obj.rotation.y = d.rotation;
    obj.scale.setScalar(d.scale);
    obj.userData.decorId = d.id;
    obj.traverse((o) => (o.userData.decorId = d.id));
    this.decorById.set(d.id, obj);
    this.decor.add(obj);
  }

  private removeDecor(id: number) {
    const obj = this.decorById.get(id);
    if (!obj) return;
    this.decor.remove(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.decorById.delete(id);
  }

  private addRing(r: Ring) {
    const obj = buildRing(r);
    this.ringById.set(r.id, obj);
    this.rings.add(obj);
  }

  private removeRing(id: number) {
    const obj = this.ringById.get(id);
    if (!obj) return;
    this.rings.remove(obj);
    obj.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    this.ringById.delete(id);
  }

  private addStar(st: Star) {
    const obj = buildStar(st);
    this.starById.set(st.id, obj);
    this.stars.add(obj);
  }

  private removeStar(id: number) {
    const obj = this.starById.get(id);
    if (!obj) return;
    this.stars.remove(obj);
    this.starById.delete(id);
    // The glow sprite's material is per star (geometry, star material and glow texture are shared).
    obj.traverse((o) => {
      if (o instanceof THREE.Sprite) o.material.dispose();
    });
  }

  private rebuildFinish() {
    for (const c of [...this.goals.children]) {
      this.goals.remove(c);
      // Everything in a finish gate is built for it alone.
      c.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat() as THREE.MeshStandardMaterial[]) {
          m.map?.dispose();
          m.dispose();
        }
      });
    }
    if (this.track.finish) this.goals.add(buildFinish(this.track.finish));
  }

  /** Per-frame animation of interactive props; `collected` is the star bit mask. */
  update(time: number, rider: THREE.Vector3, collected = 0) {
    for (const obj of this.ringById.values()) animateRing(obj, time, obj.position.distanceTo(rider));
    this.track.starList().forEach((st, k) => {
      const obj = this.starById.get(st.id);
      if (obj) animateStar(obj, time, k * 1.3, Math.floor(collected / 2 ** k) % 2 === 1);
    });
  }

  /** Highlights a ribbon (eraser / bank hover). */
  highlight(strokeId: number | null) {
    for (const [id, mesh] of this.ribbonById) {
      const on = id === strokeId;
      if (mesh.userData.highlighted === on) continue;
      mesh.userData.highlighted = on;
      const mats = mesh.material as THREE.MeshStandardMaterial[];
      if (on) {
        mesh.material = mats.map((m) => {
          const c = m.clone();
          c.emissive = new THREE.Color(0xffffff);
          c.emissiveIntensity = 0.35;
          return c;
        });
        mesh.userData.originalMaterials = mats;
      } else if (mesh.userData.originalMaterials) {
        for (const m of mats) m.dispose();
        mesh.material = mesh.userData.originalMaterials;
      }
    }
  }

  private buildStartMarker() {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 6), M.white);
    pole.position.set(-0.6, 0.6, 0);
    const cloth = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.55),
      new THREE.MeshStandardMaterial({ color: 0x2fbf71, side: THREE.DoubleSide, emissive: 0x115533, emissiveIntensity: 0.4 }),
    );
    cloth.position.set(-0.13, 1.4, 0);
    g.add(pole, cloth);
    g.position.copy(this.track.start);
    return g;
  }
}
