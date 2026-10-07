import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DecorKind } from '../track/types';

/** Low-poly procedural models for the snowy landscape. */

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });

export const M = {
  snow: mat(0xf4f8ff, { roughness: 0.95 }),
  pine: mat(0x2c5e3f),
  pineDark: mat(0x234d33),
  bark: mat(0x6b4630),
  wood: mat(0x9a6a43),
  woodDark: mat(0x6e4529),
  coal: mat(0x1d1d22),
  carrot: mat(0xf07a24),
  red: mat(0xd33a35),
  rock: mat(0x7c8590),
  metal: mat(0x3c434c, { metalness: 0.4, roughness: 0.5 }),
  glow: new THREE.MeshStandardMaterial({ color: 0xffd98a, emissive: 0xffb84a, emissiveIntensity: 1.6 }),
  gold: mat(0xf2c94c, { metalness: 0.3, roughness: 0.4 }),
  teal: mat(0x2aa6a0),
  white: mat(0xffffff),
};

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function pine(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), M.bark, 0, 0.6, 0));
  const tiers = [
    { y: 1.0, r: 1.6, h: 2.0 },
    { y: 2.1, r: 1.25, h: 1.8 },
    { y: 3.1, r: 0.9, h: 1.6 },
  ];
  for (const t of tiers) {
    g.add(mesh(new THREE.ConeGeometry(t.r, t.h, 7), M.pine, 0, t.y + t.h / 2, 0));
    const cap = mesh(new THREE.ConeGeometry(t.r * 0.62, t.h * 0.42, 7), M.snow, 0, t.y + t.h * 0.8, 0);
    g.add(cap);
  }
  return g;
}

function snowman(): THREE.Group {
  const g = new THREE.Group();
  const s = (r: number, y: number) => mesh(new THREE.IcosahedronGeometry(r, 1), M.snow, 0, y, 0);
  g.add(s(0.75, 0.65), s(0.55, 1.65), s(0.4, 2.4));
  // Face.
  g.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), M.coal, 0.34, 2.5, 0.13));
  g.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), M.coal, 0.34, 2.5, -0.13));
  const nose = mesh(new THREE.ConeGeometry(0.06, 0.4, 6), M.carrot, 0.55, 2.4, 0);
  nose.rotation.z = -Math.PI / 2;
  g.add(nose);
  for (const y of [1.5, 1.75, 1.95]) g.add(mesh(new THREE.SphereGeometry(0.05, 6, 4), M.coal, 0.52, y, 0));
  // Hat.
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.05, 12), M.coal, 0, 2.72, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.45, 12), M.coal, 0, 2.95, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.08, 12), M.red, 0, 2.8, 0));
  // Scarf.
  g.add(mesh(new THREE.TorusGeometry(0.38, 0.08, 6, 12).rotateX(Math.PI / 2), M.red, 0, 2.08, 0));
  g.add(mesh(new THREE.BoxGeometry(0.14, 0.5, 0.05), M.red, 0.3, 1.85, 0.2));
  // Stick arms.
  for (const side of [-1, 1]) {
    const arm = mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.1, 5), M.bark, 0, 1.9, side * 0.85);
    arm.rotation.x = side * -1.0;
    g.add(arm);
  }
  return g;
}

function cabin(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(5, 3, 4), M.wood, 0, 1.5, 0));
  // Log lines.
  for (let y = 0.3; y < 3; y += 0.5) g.add(mesh(new THREE.BoxGeometry(5.1, 0.08, 4.1), M.woodDark, 0, y, 0));
  // Roof planes.
  for (const side of [-1, 1]) {
    const roof = mesh(new THREE.BoxGeometry(5.8, 0.25, 3.0), M.woodDark, 0, 3.75, side * 1.05);
    roof.rotation.x = side * 0.6;
    g.add(roof);
    const snow = mesh(new THREE.BoxGeometry(5.9, 0.22, 3.0), M.snow, 0, 3.95, side * 1.15);
    snow.rotation.x = side * 0.6;
    g.add(snow);
  }
  // Gables.
  const gable = new THREE.Shape([new THREE.Vector2(-2, 0), new THREE.Vector2(2, 0), new THREE.Vector2(0, 1.5)]);
  for (const side of [-1, 1]) {
    const geo = new THREE.ExtrudeGeometry(gable, { depth: 0.1, bevelEnabled: false });
    const m = mesh(geo, M.wood, side * 2.45, 3, 0);
    m.rotation.y = Math.PI / 2;
    g.add(m);
  }
  g.add(mesh(new THREE.BoxGeometry(0.7, 1.6, 0.6), M.rock, 1.5, 4.4, -0.8));
  g.add(mesh(new THREE.BoxGeometry(0.8, 0.15, 0.7), M.snow, 1.5, 5.25, -0.8));
  // Door and glowing windows.
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.8, 0.1), M.woodDark, 0, 0.9, 2.02));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), M.glow, -1.6, 1.7, 2.02));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), M.glow, 1.6, 1.7, 2.02));
  return g;
}

function rock(): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.8 + 0.4 * Math.abs(Math.sin(i * 12.9898) * 0.5);
    pos.setXYZ(i, pos.getX(i) * k * 1.3, pos.getY(i) * k * 0.75, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, M.rock, 0, 0.4, 0));
  const cap = mesh(new THREE.DodecahedronGeometry(0.75, 0), M.snow, 0, 0.75, 0);
  cap.scale.set(1.3, 0.35, 1);
  g.add(cap);
  return g;
}

function lamp(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), M.metal, 0, 1.6, 0));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), M.glow, 0, 3.4, 0));
  g.add(mesh(new THREE.ConeGeometry(0.38, 0.3, 4).rotateY(Math.PI / 4), M.metal, 0, 3.8, 0));
  g.add(mesh(new THREE.ConeGeometry(0.3, 0.14, 4).rotateY(Math.PI / 4), M.snow, 0, 3.98, 0));
  return g;
}

function flag(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), M.white, 0, 2, 0));
  const cloth = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.6, -0.5), new THREE.Vector2(0, -1)]);
  const m = mesh(new THREE.ShapeGeometry(cloth), new THREE.MeshStandardMaterial({ color: 0xd33a35, side: THREE.DoubleSide }), 0, 3.95, 0);
  g.add(m);
  return g;
}

function gift(): THREE.Group {
  const g = new THREE.Group();
  const colors = [M.red, M.teal, M.gold];
  const sizes: [number, number, number, number][] = [
    [0, 0, 0, 0.9],
    [0.9, 0, 0.3, 0.6],
    [0.2, 0.9, 0.1, 0.5],
  ];
  sizes.forEach(([x, y, z, s], i) => {
    const box = mesh(new THREE.BoxGeometry(s, s, s), colors[i], x, y + s / 2, z);
    box.rotation.y = i * 0.5;
    g.add(box);
    const r1 = mesh(new THREE.BoxGeometry(s * 1.02, s * 1.02, s * 0.15), M.white, x, y + s / 2, z);
    r1.rotation.y = i * 0.5;
    g.add(r1);
    const r2 = mesh(new THREE.BoxGeometry(s * 0.15, s * 1.02, s * 1.02), M.white, x, y + s / 2, z);
    r2.rotation.y = i * 0.5;
    g.add(r2);
  });
  return g;
}

const BUILDERS: Record<DecorKind, () => THREE.Group> = { pine, snowman, cabin, rock, lamp, flag, gift };

export const DECOR_LABELS: Record<DecorKind, string> = {
  pine: '🌲 Pine',
  snowman: '⛄ Snowman',
  cabin: '🏠 Cabin',
  rock: '🪨 Rock',
  lamp: '🏮 Lamp',
  flag: '🚩 Flag',
  gift: '🎁 Gifts',
};

export function buildDecor(kind: DecorKind): THREE.Group {
  return BUILDERS[kind]();
}

/**
 * Bakes a decor model into a single vertex-colored geometry, for cheap
 * instancing of the background forest.
 */
export function bakeGeometry(group: THREE.Group): THREE.BufferGeometry {
  group.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    g = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const c = (o.material as THREE.MeshStandardMaterial).color;
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  });
  return mergeGeometries(geos)!;
}
