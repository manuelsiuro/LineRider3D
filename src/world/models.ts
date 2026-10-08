import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DecorKind } from '../track/types';
import type { BiomeId } from './worlds';

/** Low-poly procedural models for every world's landscape. */

const mat = (color: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, ...extra });
  // Shared by every model: never disposed with a landscape.
  m.userData.shared = true;
  return m;
};

const glowMat = (color: number, emissive: number, intensity = 1.6) => mat(color, { emissive, emissiveIntensity: intensity, flatShading: false });

export const M = {
  snow: mat(0xf4f8ff, { roughness: 0.95 }),
  pine: mat(0x2c5e3f),
  pineDark: mat(0x234d33),
  bark: mat(0x6b4630),
  wood: mat(0x9a6a43),
  woodDark: mat(0x6e4529),
  woodLight: mat(0xc99a64),
  coal: mat(0x1d1d22),
  carrot: mat(0xf07a24),
  red: mat(0xd33a35),
  rock: mat(0x7c8590),
  metal: mat(0x3c434c, { metalness: 0.4, roughness: 0.5 }),
  steel: mat(0x9aa3ad, { metalness: 0.5, roughness: 0.45 }),
  glow: glowMat(0xffd98a, 0xffb84a),
  gold: mat(0xf2c94c, { metalness: 0.3, roughness: 0.4 }),
  teal: mat(0x2aa6a0),
  white: mat(0xffffff),
  // Forest
  leaf: mat(0x4f8a3a),
  leafDark: mat(0x3b6f2e),
  leafLight: mat(0x8fb34a),
  moss: mat(0x6a9a3a),
  birch: mat(0xeeeadc),
  shroom: mat(0xd8382e),
  stem: mat(0xf2ead8),
  // Beach
  palmTrunk: mat(0xa98256),
  palmLeaf: mat(0x3f9a4a),
  coconut: mat(0x5a3a22),
  sand: mat(0xe9d3a0),
  canvas: mat(0xf5f0e6),
  pastelBlue: mat(0x7fc6e8),
  pastelPink: mat(0xf4a7b9),
  pastelYellow: mat(0xf7d774),
  pastelMint: mat(0x9ee0c0),
  lifeRed: mat(0xe04a3a),
  // Desert
  cactus: mat(0x4f8c4a),
  cactusDark: mat(0x3d7139),
  flower: mat(0xf06aa8),
  sandstone: mat(0xc8744a),
  sandstoneDark: mat(0xa85a36),
  sandstoneLight: mat(0xe0a070),
  bone: mat(0xeee6d2),
  twig: mat(0x9c7a4a),
  rust: mat(0x9a4e2e, { metalness: 0.3, roughness: 0.7 }),
  // City
  concrete: mat(0xb8b8bc),
  concreteDark: mat(0x8c8e96),
  glass: mat(0x5a7898, { metalness: 0.6, roughness: 0.2 }),
  window: glowMat(0xffe7b0, 0xffc870, 0.9),
  neonPink: glowMat(0xff4fa8, 0xff2a90, 2.2),
  neonCyan: glowMat(0x4ff0ff, 0x20d8ff, 2.2),
  orange: mat(0xff7a1a),
  tire: mat(0x1d1f24, { roughness: 0.95 }),
  headlight: glowMat(0xfff6d8, 0xfff1c0, 1.4),
  taillight: glowMat(0xff4a3a, 0xff2010, 1.4),
};

/** Paint jobs for cars, huts and buildings (picked by variant). */
const CAR_PAINT = [mat(0xd8323c), mat(0x2f6fd0), mat(0xf2c94c), mat(0xf0f0f0), mat(0x2a2d33), mat(0x3aa15a)];
const HUT_PAINT = [M.pastelBlue, M.pastelPink, M.pastelYellow, M.pastelMint];
const TOWER_PAINT = [mat(0xc9c2b4), mat(0x8f9aa8), mat(0xb9775a), mat(0xd8d2c4), mat(0x6f7a88)];

export interface DecorOptions {
  /** Snow caps on trees, roofs and rocks. */
  snowy?: boolean;
  /** Color variant (cars, huts, buildings). */
  variant?: number;
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A cylinder between two points. */
function stick(g: THREE.Group, a: [number, number, number], b: [number, number, number], r: number, material: THREE.Material, r2 = r, sides = 6) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const d = vb.clone().sub(va);
  const m = mesh(new THREE.CylinderGeometry(r2, r, d.length(), sides), material);
  m.position.copy(va).add(vb).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  g.add(m);
  return m;
}

/** Lumpy low-poly blob. */
function blob(r: number, material: THREE.Material, x: number, y: number, z: number, sy = 1, seed = 1) {
  const geo = new THREE.IcosahedronGeometry(r, 0);
  const p = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const k = 0.85 + 0.3 * Math.abs(Math.sin(i * 12.9898 + seed * 78.233));
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * sy, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return mesh(geo, material, x, y, z);
}

// ------------------------------------------------------------------ alpine

function pine(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.18, 0.25, 1.2, 6), M.bark, 0, 0.6, 0));
  const tiers = [
    { y: 1.0, r: 1.6, h: 2.0 },
    { y: 2.1, r: 1.25, h: 1.8 },
    { y: 3.1, r: 0.9, h: 1.6 },
  ];
  for (const t of tiers) {
    g.add(mesh(new THREE.ConeGeometry(t.r, t.h, 7), o.snowy === false ? (t.y > 2 ? M.pine : M.pineDark) : M.pine, 0, t.y + t.h / 2, 0));
    if (o.snowy !== false) g.add(mesh(new THREE.ConeGeometry(t.r * 0.62, t.h * 0.42, 7), M.snow, 0, t.y + t.h * 0.8, 0));
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

function cabin(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(5, 3, 4), M.wood, 0, 1.5, 0));
  // Log lines.
  for (let y = 0.3; y < 3; y += 0.5) g.add(mesh(new THREE.BoxGeometry(5.1, 0.08, 4.1), M.woodDark, 0, y, 0));
  // Roof planes.
  for (const side of [-1, 1]) {
    const roof = mesh(new THREE.BoxGeometry(5.8, 0.25, 3.0), M.woodDark, 0, 3.75, side * 1.05);
    roof.rotation.x = side * 0.6;
    g.add(roof);
    if (o.snowy !== false) {
      const snow = mesh(new THREE.BoxGeometry(5.9, 0.22, 3.0), M.snow, 0, 3.95, side * 1.15);
      snow.rotation.x = side * 0.6;
      g.add(snow);
    }
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
  if (o.snowy !== false) g.add(mesh(new THREE.BoxGeometry(0.8, 0.15, 0.7), M.snow, 1.5, 5.25, -0.8));
  // Door and glowing windows.
  g.add(mesh(new THREE.BoxGeometry(0.9, 1.8, 0.1), M.woodDark, 0, 0.9, 2.02));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), M.glow, -1.6, 1.7, 2.02));
  g.add(mesh(new THREE.BoxGeometry(0.9, 0.8, 0.1), M.glow, 1.6, 1.7, 2.02));
  return g;
}

function rock(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const geo = new THREE.DodecahedronGeometry(1, 0);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.8 + 0.4 * Math.abs(Math.sin(i * 12.9898) * 0.5);
    pos.setXYZ(i, pos.getX(i) * k * 1.3, pos.getY(i) * k * 0.75, pos.getZ(i) * k);
  }
  geo.computeVertexNormals();
  g.add(mesh(geo, M.rock, 0, 0.4, 0));
  if (o.snowy !== false) {
    const cap = mesh(new THREE.DodecahedronGeometry(0.75, 0), M.snow, 0, 0.75, 0);
    cap.scale.set(1.3, 0.35, 1);
    g.add(cap);
  } else {
    const moss = mesh(new THREE.DodecahedronGeometry(0.6, 0), M.moss, 0.1, 0.72, 0.1);
    moss.scale.set(1.2, 0.22, 0.9);
    g.add(moss);
  }
  return g;
}

function lamp(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.1, 3.2, 6), M.metal, 0, 1.6, 0));
  g.add(mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), M.glow, 0, 3.4, 0));
  g.add(mesh(new THREE.ConeGeometry(0.38, 0.3, 4).rotateY(Math.PI / 4), M.metal, 0, 3.8, 0));
  if (o.snowy !== false) g.add(mesh(new THREE.ConeGeometry(0.3, 0.14, 4).rotateY(Math.PI / 4), M.snow, 0, 3.98, 0));
  return g;
}

function flag(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 4, 6), M.white, 0, 2, 0));
  const cloth = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.6, -0.5), new THREE.Vector2(0, -1)]);
  g.add(mesh(new THREE.ShapeGeometry(cloth), flagCloth, 0, 3.95, 0));
  return g;
}
const flagCloth = mat(0xd33a35, { side: THREE.DoubleSide, flatShading: false });

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

// ------------------------------------------------------------------ forest

function oak(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.28, 0.42, 2.4, 7), M.bark, 0, 1.2, 0));
  stick(g, [0, 1.9, 0], [0.9, 2.9, 0.3], 0.16, M.bark, 0.1);
  stick(g, [0, 2.0, 0], [-0.8, 3.0, -0.4], 0.16, M.bark, 0.1);
  const v = o.variant ?? 0;
  const leaves = [M.leaf, M.leafDark, M.leafLight][v % 3];
  const puffs: [number, number, number, number][] = [
    [0, 3.6, 0, 1.7],
    [1.1, 3.2, 0.5, 1.2],
    [-1.0, 3.3, -0.5, 1.25],
    [0.3, 4.4, -0.3, 1.1],
    [-0.4, 3.1, 1.0, 1.0],
  ];
  puffs.forEach(([x, y, z, r], i) => {
    g.add(blob(r, i % 2 ? M.leafDark : leaves, x, y, z, 0.85, i + v));
    if (o.snowy && y > 3.3) g.add(blob(r * 0.7, M.snow, x, y + r * 0.55, z, 0.35, i));
  });
  return g;
}

function birch(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.18, 4.2, 7), M.birch, 0, 2.1, 0));
  // Dark bark marks.
  for (let i = 0; i < 6; i++) {
    const m = mesh(new THREE.BoxGeometry(0.2, 0.06, 0.12), M.coal, 0.06 * Math.cos(i * 2.4), 0.6 + i * 0.6, 0.06 * Math.sin(i * 2.4));
    m.rotation.y = i * 2.4;
    g.add(m);
  }
  const crown = blob(1.05, M.leafLight, 0, 4.2, 0, 1.6, 3 + (o.variant ?? 0));
  g.add(crown);
  g.add(blob(0.7, M.leaf, 0.35, 3.4, 0.25, 1.3, 4));
  if (o.snowy) g.add(blob(0.7, M.snow, 0, 5.25, 0, 0.4, 5));
  return g;
}

function bush(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  g.add(blob(0.75, M.leafDark, 0, 0.5, 0, 0.8, 1));
  g.add(blob(0.6, M.leaf, 0.6, 0.45, 0.3, 0.8, 2));
  g.add(blob(0.55, M.leaf, -0.5, 0.4, -0.3, 0.8, 3));
  if (o.snowy) g.add(blob(0.6, M.snow, 0, 0.95, 0, 0.35, 4));
  else for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.07, 5, 4), M.red, Math.cos(i * 1.3) * 0.7, 0.6 + (i % 2) * 0.2, Math.sin(i * 1.3) * 0.6));
  return g;
}

function log(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const l = mesh(new THREE.CylinderGeometry(0.42, 0.45, 4, 9), M.bark, 0, 0.4, 0);
  l.rotation.z = Math.PI / 2;
  g.add(l);
  for (const s of [-1, 1]) {
    const end = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.04, 9), M.woodLight, s * 2.0, 0.4, 0);
    end.rotation.z = Math.PI / 2;
    g.add(end);
  }
  const top = mesh(new THREE.BoxGeometry(2.2, 0.12, 0.5), o.snowy ? M.snow : M.moss, -0.4, 0.84, 0);
  g.add(top);
  stick(g, [0.8, 0.6, 0.2], [1.1, 1.3, 0.5], 0.06, M.bark, 0.04);
  return g;
}

function mushroom(): THREE.Group {
  const g = new THREE.Group();
  const shrooms: [number, number, number, number][] = [
    [0, 0, 0, 1],
    [0.55, 0, 0.3, 0.65],
    [-0.35, 0, 0.45, 0.5],
  ];
  for (const [x, , z, s] of shrooms) {
    g.add(mesh(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.7 * s, 7), M.stem, x, 0.35 * s, z));
    const cap = mesh(new THREE.SphereGeometry(0.42 * s, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2), M.shroom, x, 0.62 * s, z);
    cap.scale.y = 0.75;
    g.add(cap);
    for (let i = 0; i < 4; i++) {
      const a = i * 1.6 + x;
      g.add(mesh(new THREE.SphereGeometry(0.06 * s, 5, 3), M.white, x + Math.cos(a) * 0.24 * s, 0.82 * s, z + Math.sin(a) * 0.24 * s));
    }
  }
  return g;
}

function sign(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.2, 6), M.woodDark, 0, 1.1, 0));
  const arrow = new THREE.Shape([
    new THREE.Vector2(-0.8, -0.25),
    new THREE.Vector2(0.5, -0.25),
    new THREE.Vector2(0.85, 0),
    new THREE.Vector2(0.5, 0.25),
    new THREE.Vector2(-0.8, 0.25),
  ]);
  const board = mesh(new THREE.ExtrudeGeometry(arrow, { depth: 0.08, bevelEnabled: false }), M.woodLight, 0.3, 1.8, -0.04);
  g.add(board);
  const board2 = mesh(new THREE.ExtrudeGeometry(arrow, { depth: 0.08, bevelEnabled: false }), M.wood, -0.3, 1.3, -0.04);
  board2.rotation.y = Math.PI;
  g.add(board2);
  return g;
}

// ------------------------------------------------------------------ beach

function palm(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const lean = 0.35 + ((o.variant ?? 0) % 3) * 0.12;
  let p: [number, number, number] = [0, 0, 0];
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const t = (i + 1) / segs;
    const next: [number, number, number] = [Math.pow(t, 2) * lean * 3, t * 5.2, 0];
    stick(g, p, next, 0.24 - i * 0.022, i % 2 ? M.palmTrunk : M.woodLight, 0.22 - i * 0.022, 7);
    p = next;
  }
  // Fronds: leaves arching up and out, then drooping.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + (i % 2) * 0.2;
    const leaf = new THREE.Group();
    leaf.position.set(...p);
    leaf.rotation.set(0, a, 0);
    leaf.rotateZ(-0.9 - (i % 2) * 0.3);
    const inner = mesh(new THREE.CylinderGeometry(0.42, 0.3, 1.7, 4), M.palmLeaf, 0, 0.85, 0);
    inner.scale.x = 0.12;
    leaf.add(inner);
    const tip = new THREE.Group();
    tip.position.y = 1.7;
    tip.rotation.z = -0.8;
    const outer = mesh(new THREE.ConeGeometry(0.42, 2.1, 4), M.palmLeaf, 0, 1.05, 0);
    outer.scale.x = 0.12;
    tip.add(outer);
    leaf.add(tip);
    g.add(leaf);
  }
  for (let i = 0; i < 3; i++) g.add(mesh(new THREE.SphereGeometry(0.17, 6, 5), M.coconut, p[0] + Math.cos(i * 2.1) * 0.25, p[1] - 0.25, Math.sin(i * 2.1) * 0.25));
  if (o.snowy) g.add(blob(0.5, M.snow, p[0], p[1] + 0.2, 0, 0.4, 2));
  return g;
}

function umbrella(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const tilt = new THREE.Group();
  tilt.rotation.z = 0.18;
  g.add(tilt);
  tilt.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), M.white, 0, 1.3, 0));
  const colors = [[M.lifeRed, M.white], [M.pastelBlue, M.white], [M.pastelYellow, M.orange]][(o.variant ?? 0) % 3];
  for (let i = 0; i < 8; i++) {
    tilt.add(mesh(new THREE.ConeGeometry(1.5, 0.55, 2, 1, false, (i / 8) * Math.PI * 2, Math.PI / 4), colors[i % 2], 0, 2.5, 0));
  }
  // Towel.
  const towel = mesh(new THREE.BoxGeometry(1.8, 0.03, 0.9), colors[0], 1.2, 0.02, 0.4);
  towel.rotation.y = 0.3;
  g.add(towel);
  return g;
}
function surfboard(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const paints = [M.pastelBlue, M.lifeRed, M.pastelYellow, M.teal];
  for (let i = 0; i < 2; i++) {
    const b = mesh(new THREE.SphereGeometry(1, 12, 6), paints[((o.variant ?? 0) + i) % 4], i * 0.7, 1.0, i * 0.2);
    b.scale.set(0.32, 1.2, 0.06);
    b.rotation.z = -0.12 + i * 0.22;
    g.add(b);
    const stripe = mesh(new THREE.BoxGeometry(0.05, 2.1, 0.13), M.white, i * 0.7, 1.0, i * 0.2);
    stripe.rotation.z = b.rotation.z;
    g.add(stripe);
  }
  return g;
}

function hut(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const paint = HUT_PAINT[(o.variant ?? 0) % HUT_PAINT.length];
  for (const [x, z] of [[-1.3, -1.1], [1.3, -1.1], [-1.3, 1.1], [1.3, 1.1]]) g.add(mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), M.woodDark, x, 0.35, z));
  g.add(mesh(new THREE.BoxGeometry(3.4, 0.15, 3.0), M.woodLight, 0, 0.75, 0.2));
  g.add(mesh(new THREE.BoxGeometry(2.8, 2.2, 2.4), paint, 0, 1.9, 0));
  // Vertical boards.
  for (let x = -1.2; x <= 1.21; x += 0.4) g.add(mesh(new THREE.BoxGeometry(0.05, 2.2, 2.44), M.white, x, 1.9, 0));
  for (const side of [-1, 1]) {
    const roof = mesh(new THREE.BoxGeometry(3.2, 0.14, 1.8), M.lifeRed, 0, 3.3, side * 0.68);
    roof.rotation.x = side * 0.6;
    g.add(roof);
    if (o.snowy) {
      const s = mesh(new THREE.BoxGeometry(3.25, 0.12, 1.8), M.snow, 0, 3.42, side * 0.74);
      s.rotation.x = side * 0.6;
      g.add(s);
    }
  }
  const gable = new THREE.Shape([new THREE.Vector2(-1.2, 0), new THREE.Vector2(1.2, 0), new THREE.Vector2(0, 0.85)]);
  for (const side of [-1, 1]) {
    const m = mesh(new THREE.ExtrudeGeometry(gable, { depth: 0.08, bevelEnabled: false }), paint, side * 1.4, 3.0, 0);
    m.rotation.y = Math.PI / 2;
    g.add(m);
  }
  g.add(mesh(new THREE.BoxGeometry(0.8, 1.5, 0.08), M.white, 0, 1.6, 1.22));
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.5, 0.08), M.glow, 0.95, 2.1, 1.22));
  return g;
}

function lifeguard(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) stick(g, [x * 1.3, 0, z * 1.3], [x, 3, z], 0.08, M.woodLight);
  stick(g, [-1.17, 0.9, -1.17], [1.17, 0.9, 1.17], 0.05, M.woodLight);
  stick(g, [1.17, 0.9, -1.17], [-1.17, 0.9, 1.17], 0.05, M.woodLight);
  g.add(mesh(new THREE.BoxGeometry(2.4, 0.15, 2.4), M.woodLight, 0, 3.05, 0));
  g.add(mesh(new THREE.BoxGeometry(1.8, 1.4, 1.8), M.white, 0, 3.8, -0.1));
  g.add(mesh(new THREE.BoxGeometry(1.82, 0.35, 1.82), M.lifeRed, 0, 4.0, -0.1));
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.6, 0.06), M.glass, 0, 3.95, 0.82));
  g.add(mesh(new THREE.ConeGeometry(1.7, 0.7, 4).rotateY(Math.PI / 4), M.lifeRed, 0, 4.85, -0.1));
  // Ladder.
  stick(g, [-0.35, 0, 2.2], [-0.35, 3.05, 1.2], 0.04, M.woodDark);
  stick(g, [0.35, 0, 2.2], [0.35, 3.05, 1.2], 0.04, M.woodDark);
  for (let i = 1; i < 6; i++) stick(g, [-0.35, i * 0.5, 2.2 - i * 0.165], [0.35, i * 0.5, 2.2 - i * 0.165], 0.03, M.woodDark);
  // Flag.
  stick(g, [0.8, 5, -0.9], [0.8, 6.3, -0.9], 0.03, M.white);
  const cloth = mesh(new THREE.BoxGeometry(0.02, 0.4, 0.6), M.lifeRed, 0.8, 6.1, -0.6);
  g.add(cloth);
  return g;
}

function deckchair(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const fabric = [M.pastelBlue, M.lifeRed, M.pastelMint][(o.variant ?? 0) % 3];
  for (const z of [-0.35, 0.35]) {
    stick(g, [-0.6, 0, z], [0.5, 1.05, z], 0.035, M.woodLight);
    stick(g, [0.5, 0, z], [-0.3, 0.55, z], 0.035, M.woodLight);
  }
  const seat = mesh(new THREE.BoxGeometry(1.25, 0.03, 0.66), fabric, -0.05, 0.62, 0);
  seat.rotation.z = 0.75;
  g.add(seat);
  stick(g, [-0.6, 0.28, -0.4], [-0.6, 0.28, 0.4], 0.03, M.woodLight);
  return g;
}

// ------------------------------------------------------------------ desert

function cactus(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const h = 3.2 + ((o.variant ?? 0) % 3) * 0.6;
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, h, 8), M.cactus, 0, h / 2, 0));
  g.add(mesh(new THREE.SphereGeometry(0.32, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.cactus, 0, h, 0));
  const arm = (side: number, y: number, len: number) => {
    stick(g, [0, y, 0], [side * 0.8, y, 0], 0.2, M.cactusDark, 0.2, 8);
    g.add(mesh(new THREE.SphereGeometry(0.2, 8, 5), M.cactusDark, side * 0.8, y, 0));
    stick(g, [side * 0.8, y, 0], [side * 0.8, y + len, 0], 0.2, M.cactusDark, 0.18, 8);
    g.add(mesh(new THREE.SphereGeometry(0.18, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.cactusDark, side * 0.8, y + len, 0));
  };
  arm(1, h * 0.42, 1.2);
  arm(-1, h * 0.58, 0.9);
  g.add(mesh(new THREE.SphereGeometry(0.12, 6, 4), M.flower, 0.1, h + 0.25, 0.05));
  if (o.snowy) g.add(mesh(new THREE.SphereGeometry(0.34, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.snow, 0, h + 0.05, 0));
  return g;
}

function barrel(): THREE.Group {
  const g = new THREE.Group();
  const b = mesh(new THREE.SphereGeometry(0.55, 10, 7), M.cactus, 0, 0.45, 0);
  b.scale.y = 0.85;
  g.add(b);
  const b2 = mesh(new THREE.SphereGeometry(0.35, 10, 6), M.cactusDark, 0.7, 0.28, 0.3);
  b2.scale.y = 0.85;
  g.add(b2);
  for (let i = 0; i < 5; i++) g.add(mesh(new THREE.SphereGeometry(0.08, 5, 4), i % 2 ? M.pastelYellow : M.flower, Math.cos(i * 1.25) * 0.18, 0.92, Math.sin(i * 1.25) * 0.18));
  g.add(blob(0.35, M.sandstone, -0.6, 0.15, -0.3, 0.6, 3));
  return g;
}

function mesa(): THREE.Group {
  const g = new THREE.Group();
  const layers = [M.sandstoneDark, M.sandstone, M.sandstoneLight, M.sandstone];
  let y = 0;
  layers.forEach((m, i) => {
    const h = 0.6 + (i % 2) * 0.3;
    const r = 1.9 - i * 0.22;
    const l = mesh(new THREE.CylinderGeometry(r * 0.95, r, h, 7), m, Math.sin(i) * 0.15, y + h / 2, 0);
    l.rotation.y = i * 0.6;
    g.add(l);
    y += h;
  });
  g.add(blob(0.6, M.sandstoneDark, 1.9, 0.3, 0.8, 0.7, 4));
  g.add(blob(0.4, M.sandstone, -1.7, 0.2, -0.9, 0.7, 5));
  return g;
}

function tumbleweed(): THREE.Group {
  const g = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const t = mesh(new THREE.TorusGeometry(0.55 - (i % 3) * 0.08, 0.025, 4, 10), M.twig, 0, 0.55, 0);
    t.rotation.set(i * 0.7, i * 1.3, i * 0.4);
    g.add(t);
  }
  return g;
}

function skull(): THREE.Group {
  const g = new THREE.Group();
  const head = mesh(new THREE.BoxGeometry(0.5, 0.4, 0.4), M.bone, 0, 0.22, 0);
  g.add(head);
  const snout = mesh(new THREE.BoxGeometry(0.5, 0.26, 0.28), M.bone, 0.4, 0.15, 0);
  snout.rotation.z = -0.2;
  g.add(snout);
  for (const s of [-1, 1]) {
    stick(g, [0, 0.35, s * 0.18], [-0.1, 0.5, s * 0.6], 0.06, M.bone, 0.03);
    stick(g, [-0.1, 0.5, s * 0.6], [0.1, 0.75, s * 0.75], 0.03, M.bone, 0.01);
    g.add(mesh(new THREE.SphereGeometry(0.06, 5, 4), M.coal, 0.22, 0.3, s * 0.13));
  }
  g.add(blob(0.3, M.sandstone, -0.6, 0.1, 0.4, 0.6, 7));
  return g;
}

function windmill(): THREE.Group {
  const g = new THREE.Group();
  const h = 7;
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) stick(g, [x, 0, z], [x * 0.2, h, z * 0.2], 0.06, M.steel);
  for (let k = 1; k < 4; k++) {
    const y = (k / 4) * h;
    const r = 1 - (k / 4) * 0.8;
    for (const [a, b] of [[[-r, -r], [r, -r]], [[r, -r], [r, r]], [[r, r], [-r, r]], [[-r, r], [-r, -r]]]) stick(g, [a[0], y, a[1]], [b[0], y, b[1]], 0.035, M.steel);
  }
  g.add(mesh(new THREE.BoxGeometry(0.5, 0.3, 0.3), M.metal, 0, h + 0.1, 0));
  const fan = new THREE.Group();
  fan.position.set(0.35, h + 0.1, 0);
  for (let i = 0; i < 12; i++) {
    const blade = mesh(new THREE.BoxGeometry(0.03, 1.3, 0.22), M.steel, 0, 0.75, 0);
    const holder = new THREE.Group();
    holder.rotation.x = (i / 12) * Math.PI * 2;
    blade.rotation.y = 0.4;
    holder.add(blade);
    fan.add(holder);
  }
  fan.name = 'fan';
  g.add(fan);
  stick(g, [0, h + 0.1, 0], [-1.8, h + 0.1, 0], 0.04, M.metal);
  g.add(mesh(new THREE.BoxGeometry(0.05, 0.7, 0.9), M.rust, -1.8, h + 0.1, 0));
  // Water trough.
  g.add(mesh(new THREE.CylinderGeometry(1, 1, 0.5, 12), M.rust, 2.2, 0.25, 0.4));
  g.add(mesh(new THREE.CylinderGeometry(0.92, 0.92, 0.02, 12), M.glass, 2.2, 0.46, 0.4));
  return g;
}

// ------------------------------------------------------------------ city

function tower(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const v = o.variant ?? 0;
  const paint = TOWER_PAINT[v % TOWER_PAINT.length];
  const floors = 3 + (v % 3);
  const fh = 2.4;
  const w = 5;
  const d = 4.4;
  g.add(mesh(new THREE.BoxGeometry(w, floors * fh, d), paint, 0, (floors * fh) / 2, 0));
  // Ground floor shop window and awning.
  g.add(mesh(new THREE.BoxGeometry(w * 0.7, 1.4, 0.06), M.window, 0, 0.9, d / 2 + 0.02));
  const awning = mesh(new THREE.BoxGeometry(w * 0.8, 0.08, 1), [M.lifeRed, M.teal, M.orange][v % 3], 0, 1.85, d / 2 + 0.45);
  awning.rotation.x = 0.25;
  g.add(awning);
  // Window grid.
  for (let f = 1; f < floors; f++)
    for (let i = 0; i < 3; i++) {
      const lit = (i + f * 2 + v) % 3 !== 0;
      for (const side of [-1, 1]) {
        g.add(mesh(new THREE.BoxGeometry(0.9, 1.1, 0.06), lit ? M.window : M.glass, -1.5 + i * 1.5, f * fh + 1.2, side * (d / 2 + 0.02)));
      }
      g.add(mesh(new THREE.BoxGeometry(0.06, 1.1, 0.9), (i + f) % 2 ? M.window : M.glass, w / 2 + 0.02, f * fh + 1.2, -1.3 + i * 1.3));
    }
  // Roof: parapet, AC unit and a water tank.
  const top = floors * fh;
  g.add(mesh(new THREE.BoxGeometry(w + 0.2, 0.3, d + 0.2), M.concreteDark, 0, top + 0.15, 0));
  g.add(mesh(new THREE.BoxGeometry(1.2, 0.7, 1), M.steel, -1.2, top + 0.5, -0.8));
  g.add(mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.1, 10), M.woodDark, 1.4, top + 1.3, 0.9));
  for (const [x, z] of [[0.95, 0.5], [1.85, 0.5], [0.95, 1.3], [1.85, 1.3]]) stick(g, [x, top, z], [x, top + 0.75, z], 0.04, M.metal);
  g.add(mesh(new THREE.ConeGeometry(0.7, 0.4, 10), M.woodDark, 1.4, top + 2.05, 0.9));
  if (o.snowy) g.add(mesh(new THREE.BoxGeometry(w, 0.15, d), M.snow, 0, top + 0.08, 0));
  return g;
}

function streetlight(): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.14, 5, 7), M.metal, 0, 2.5, 0));
  stick(g, [0, 4.9, 0], [0, 5.3, 0.5], 0.06, M.metal);
  stick(g, [0, 5.3, 0.5], [0, 5.3, 1.4], 0.06, M.metal);
  g.add(mesh(new THREE.BoxGeometry(0.35, 0.12, 0.7), M.metal, 0, 5.25, 1.5));
  g.add(mesh(new THREE.BoxGeometry(0.28, 0.05, 0.6), M.headlight, 0, 5.17, 1.5));
  g.add(mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.3, 7), M.metal, 0, 0.15, 0));
  return g;
}

function cone(): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z, s] of [[0, 0, 1], [0.9, 0.4, 0.85]] as const) {
    g.add(mesh(new THREE.BoxGeometry(0.62 * s, 0.06, 0.62 * s), M.orange, x, 0.03, z));
    g.add(mesh(new THREE.ConeGeometry(0.24 * s, 0.85 * s, 10), M.orange, x, 0.06 + 0.42 * s, z));
    g.add(mesh(new THREE.CylinderGeometry(0.135 * s, 0.17 * s, 0.14 * s, 10), M.white, x, 0.06 + 0.42 * s, z));
  }
  return g;
}

function billboard(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  for (const x of [-1.6, 1.6]) g.add(mesh(new THREE.BoxGeometry(0.2, 4, 0.2), M.metal, x, 2, 0));
  g.add(mesh(new THREE.BoxGeometry(5, 2.6, 0.2), M.metal, 0, 5, 0));
  const neon = (o.variant ?? 0) % 2 ? M.neonCyan : M.neonPink;
  g.add(mesh(new THREE.BoxGeometry(4.6, 2.2, 0.06), [M.pastelYellow, M.teal, M.lifeRed][(o.variant ?? 0) % 3], 0, 5, 0.12));
  // Neon frame and a big glowing logo stripe.
  for (const y of [3.75, 6.25]) g.add(mesh(new THREE.BoxGeometry(5, 0.1, 0.1), neon, 0, y, 0.15));
  for (const x of [-2.5, 2.5]) g.add(mesh(new THREE.BoxGeometry(0.1, 2.6, 0.1), neon, x, 5, 0.15));
  g.add(mesh(new THREE.BoxGeometry(2.8, 0.45, 0.08), M.white, -0.4, 5.3, 0.17));
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.3, 0.08), neon, 0.6, 4.6, 0.17));
  g.add(mesh(new THREE.BoxGeometry(5.2, 0.12, 0.6), M.metal, 0, 3.7, 0.3));
  return g;
}

function car(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  const paint = CAR_PAINT[(o.variant ?? 0) % CAR_PAINT.length];
  g.add(mesh(new THREE.BoxGeometry(3.6, 0.7, 1.7), paint, 0, 0.65, 0));
  const cab = mesh(new THREE.BoxGeometry(2, 0.65, 1.55), paint, -0.2, 1.3, 0);
  g.add(cab);
  g.add(mesh(new THREE.BoxGeometry(1.7, 0.5, 1.58), M.glass, -0.2, 1.3, 0));
  for (const [x, z] of [[-1.15, -0.8], [1.15, -0.8], [-1.15, 0.8], [1.15, 0.8]]) {
    const w = mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 12), M.tire, x, 0.36, z);
    w.rotation.x = Math.PI / 2;
    g.add(w);
  }
  for (const z of [-0.55, 0.55]) {
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.18, 0.35), M.headlight, 1.81, 0.75, z));
    g.add(mesh(new THREE.BoxGeometry(0.05, 0.16, 0.35), M.taillight, -1.81, 0.78, z));
  }
  if (o.snowy) g.add(mesh(new THREE.BoxGeometry(1.9, 0.1, 1.5), M.snow, -0.2, 1.68, 0));
  return g;
}

function planter(o: DecorOptions): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(1.6, 0.7, 1.6), M.concrete, 0, 0.35, 0));
  g.add(mesh(new THREE.BoxGeometry(1.4, 0.05, 1.4), M.coconut, 0, 0.71, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.8, 6), M.bark, 0, 1.6, 0));
  g.add(blob(0.95, M.leaf, 0, 2.9, 0, 1.05, 2 + (o.variant ?? 0)));
  g.add(blob(0.6, M.leafDark, 0.4, 2.5, 0.3, 1, 3));
  if (o.snowy) g.add(blob(0.7, M.snow, 0, 3.55, 0, 0.35, 4));
  return g;
}

const BUILDERS: Record<DecorKind, (o: DecorOptions) => THREE.Group> = {
  pine,
  snowman,
  cabin,
  rock,
  lamp,
  flag,
  gift,
  oak,
  birch,
  bush,
  log,
  mushroom,
  sign,
  palm,
  umbrella,
  surfboard,
  hut,
  lifeguard,
  deckchair,
  cactus,
  barrel,
  mesa,
  tumbleweed,
  skull,
  windmill,
  tower,
  streetlight,
  cone,
  billboard,
  car,
  planter,
};

export const DECOR_LABELS: Record<DecorKind, string> = {
  pine: '🌲 Pine',
  snowman: '⛄ Snowman',
  cabin: '🏠 Cabin',
  rock: '🪨 Rock',
  lamp: '🏮 Lamp',
  flag: '🚩 Flag',
  gift: '🎁 Gifts',
  oak: '🌳 Oak',
  birch: '🌿 Birch',
  bush: '🌱 Bush',
  log: '🪵 Log',
  mushroom: '🍄 Mushrooms',
  sign: '🪧 Signpost',
  palm: '🌴 Palm',
  umbrella: '⛱️ Parasol',
  surfboard: '🏄 Surfboards',
  hut: '🛖 Beach hut',
  lifeguard: '🛟 Lifeguard',
  deckchair: '🪑 Deckchair',
  cactus: '🌵 Cactus',
  barrel: '🟢 Barrel cactus',
  mesa: '🏜️ Mesa rock',
  tumbleweed: '🌾 Tumbleweed',
  skull: '💀 Skull',
  windmill: '🌀 Windpump',
  tower: '🏢 Building',
  streetlight: '💡 Streetlight',
  cone: '🚧 Cones',
  billboard: '🪧 Billboard',
  car: '🚗 Car',
  planter: '🌳 Planter',
};

export const isDecorKind = (k: unknown): k is DecorKind => typeof k === 'string' && k in BUILDERS;

export function buildDecor(kind: DecorKind, o: DecorOptions = {}): THREE.Group {
  return (BUILDERS[kind] ?? rock)(o);
}

// ------------------------------------------------------------------ restyling

type Role = 'tree' | 'small' | 'building' | 'rock' | 'light' | 'flag';

const ROLE: Record<DecorKind, Role> = {
  pine: 'tree',
  oak: 'tree',
  birch: 'tree',
  palm: 'tree',
  cactus: 'tree',
  planter: 'tree',
  snowman: 'small',
  gift: 'small',
  bush: 'small',
  mushroom: 'small',
  umbrella: 'small',
  surfboard: 'small',
  deckchair: 'small',
  barrel: 'small',
  tumbleweed: 'small',
  skull: 'small',
  cone: 'small',
  cabin: 'building',
  hut: 'building',
  lifeguard: 'building',
  windmill: 'building',
  tower: 'building',
  billboard: 'building',
  rock: 'rock',
  log: 'rock',
  mesa: 'rock',
  car: 'rock',
  lamp: 'light',
  streetlight: 'light',
  flag: 'flag',
  sign: 'flag',
};

const NATIVE: Record<BiomeId, Record<Role, DecorKind[]>> = {
  alpine: { tree: ['pine'], small: ['snowman', 'gift'], building: ['cabin'], rock: ['rock'], light: ['lamp'], flag: ['flag'] },
  forest: { tree: ['oak', 'pine', 'birch', 'oak'], small: ['bush', 'mushroom', 'bush'], building: ['cabin'], rock: ['rock', 'log'], light: ['lamp'], flag: ['sign', 'flag'] },
  beach: { tree: ['palm'], small: ['umbrella', 'deckchair', 'surfboard'], building: ['hut', 'lifeguard', 'hut'], rock: ['rock'], light: ['lamp'], flag: ['flag'] },
  desert: { tree: ['cactus', 'cactus', 'barrel'], small: ['barrel', 'tumbleweed', 'skull'], building: ['windmill'], rock: ['mesa', 'rock'], light: ['lamp'], flag: ['flag'] },
  city: { tree: ['planter'], small: ['cone'], building: ['tower', 'tower', 'billboard'], rock: ['car'], light: ['streetlight'], flag: ['flag'] },
};

/**
 * What a decor item looks like in a world: items native to the world stay,
 * others turn into the local equivalent (a pine becomes a palm on the beach).
 */
export function decorFor(kind: DecorKind, biome: BiomeId, id: number, natives: DecorKind[]): DecorKind {
  if (natives.includes(kind)) return kind;
  const list = NATIVE[biome][ROLE[kind] ?? 'rock'];
  return list[id % list.length];
}

/**
 * Bakes a decor model into a single vertex-colored geometry, for cheap
 * instancing of the background scenery.
 */
export function bakeGeometry(group: THREE.Group): THREE.BufferGeometry {
  group.updateMatrixWorld(true);
  const geos: THREE.BufferGeometry[] = [];
  group.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    let g = (o.geometry as THREE.BufferGeometry).clone().applyMatrix4(o.matrixWorld);
    g = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    const m = o.material as THREE.MeshStandardMaterial;
    // Glowing parts keep some of their light in the baked color.
    const c = m.color.clone();
    if (m.emissiveIntensity > 0 && m.emissive.getHex() !== 0) c.lerp(m.emissive, 0.5).multiplyScalar(1.4);
    const n = g.attributes.position.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geos.push(g);
  });
  const merged = mergeGeometries(geos)!;
  for (const g of geos) g.dispose();
  // The model's meshes are throwaway: free their geometries.
  group.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
  return merged;
}
