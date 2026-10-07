import * as THREE from 'three';
import type { Track } from '../track/Track';
import type { Decor } from '../track/types';
import { buildDecor, M } from '../world/models';
import { buildRibbonMesh } from './ribbon';

/** Keeps Three.js objects in sync with the track data. */
export class TrackView {
  readonly ribbons = new THREE.Group();
  readonly decor = new THREE.Group();
  readonly startMarker: THREE.Group;
  private ribbonById = new Map<number, THREE.Mesh>();
  private decorById = new Map<number, THREE.Object3D>();

  constructor(scene: THREE.Scene, private track: Track) {
    scene.add(this.ribbons, this.decor);
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
        case 'startChanged':
          this.startMarker.position.copy(track.start);
          break;
        case 'cleared':
          for (const id of [...this.ribbonById.keys()]) this.removeRibbon(id);
          for (const id of [...this.decorById.keys()]) this.removeDecor(id);
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
  }

  private removeRibbon(id: number) {
    const mesh = this.ribbonById.get(id);
    if (!mesh) return;
    mesh.geometry.dispose();
    this.ribbons.remove(mesh);
    this.ribbonById.delete(id);
  }

  private addDecor(d: Decor) {
    const obj = buildDecor(d.kind);
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
