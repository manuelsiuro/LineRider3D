import * as THREE from 'three';
import { buildDecor, bakeGeometry, M } from '../models';
import { terrainHeight } from '../terrain';
import { Birds, Drifters, bakedDecor, blocked, flatMaterial, peaks, ring, rng, scatter, shared, smooth, type Backdrop, type BackdropCtx, type Placement } from './common';
import { Water } from './water';

const POND = new THREE.Vector2(-260, 280);
const POND_R = 70;
const POND_LEVEL = -0.8;

const hillDark = new THREE.Color(0x24182e);
const hillMoss = new THREE.Color(0x34402e);
const hillRock = new THREE.Color(0x4a4452);
const MUD = new THREE.Color().setRGB(0.7, 0.6, 0.55);

/** Only the glowing carved faces of a jack-o'-lantern, for an unlit overlay. */
let faceGeo: THREE.BufferGeometry | null = null;
function pumpkinFaces() {
  if (faceGeo) return faceGeo;
  const g = buildDecor('pumpkin', { variant: 1 });
  const drop: THREE.Object3D[] = [];
  g.traverse((o) => {
    if (o instanceof THREE.Mesh && o.material !== M.jackGlow) drop.push(o);
  });
  for (const o of drop) o.removeFromParent();
  // Pushed out a hair so the faces never z-fight the shell.
  g.scale.setScalar(1.03);
  return (faceGeo = shared(bakeGeometry(g)));
}

/** A haunted manor on a far hill: towers, a crooked roof and lit windows. */
function manor(windows: THREE.MeshStandardMaterial) {
  const g = new THREE.Group();
  const wall = new THREE.MeshStandardMaterial({ color: 0x1e1826, roughness: 0.95, flatShading: true });
  const roof = new THREE.MeshStandardMaterial({ color: 0x120e18, roughness: 0.9, flatShading: true });
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: THREE.Material = wall) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    b.position.set(x, y, z);
    g.add(b);
    return b;
  };
  const spire = (r: number, h: number, x: number, y: number, z: number, lean = 0) => {
    const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), roof);
    c.position.set(x, y + h / 2, z);
    c.rotation.z = lean;
    g.add(c);
  };
  box(40, 22, 22, 0, 11, 0);
  spire(24, 16, 0, 22, 0, 0.04);
  box(12, 40, 12, -22, 20, 2);
  spire(9, 22, -22, 40, 2, -0.08);
  box(9, 30, 9, 21, 15, -3);
  spire(7, 16, 21, 30, -3, 0.12);
  box(5, 14, 5, 6, 30, 4);
  spire(4, 10, 6, 37, 4);
  // Windows: a grid on each face, some dark.
  const rand = rng(77);
  const win = new THREE.BoxGeometry(1.6, 2.6, 0.4);
  const lit: [number, number, number][] = [];
  for (let row = 0; row < 3; row++) for (let col = -3; col <= 3; col++) if (rand() < 0.55) lit.push([col * 5, 5 + row * 6, 11.2]);
  for (let row = 0; row < 5; row++) if (rand() < 0.7) lit.push([-22, 8 + row * 6.5, 8.2]);
  for (let row = 0; row < 3; row++) if (rand() < 0.7) lit.push([21, 8 + row * 7, 1.7]);
  const panes = new THREE.InstancedMesh(win, windows, lit.length);
  lit.forEach(([x, y, z], i) => panes.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, y, z)));
  g.add(panes);
  // The front door, lit from inside.
  box(4, 7, 0.4, 0, 3.5, 11.2, windows);
  return g;
}

/** Haunted Hollow: purple hills, a manor on the ridge, graves, dead trees, pumpkins, bats and wisps. */
export function halloween(ctx: BackdropCtx): Backdrop {
  const { detail, cfg, atm } = ctx;
  const snowy = cfg.weather === 'snow';
  const group = new THREE.Group();
  const night = atm.night > 0.5;

  // Jagged dark hills.
  group.add(
    peaks({
      count: 34,
      seed: 31,
      dist: [360, 620],
      height: [50, 140],
      radius: [90, 180],
      sides: 5,
      paint: (t, rand, out) => {
        if (t > 0.78 + rand() * 0.1) out.copy(hillRock);
        else out.copy(hillDark).lerp(hillMoss, rand() * 0.4 + (t < 0.2 ? 0.35 : 0));
      },
    }),
  );

  // The manor stands under the moon, on its own hill.
  const windows = new THREE.MeshStandardMaterial({ color: 0xffb04a, emissive: 0xff8a20, emissiveIntensity: night ? 2.2 : 0.6 });
  const dir = new THREE.Vector2(atm.sunOffset.x, atm.sunOffset.z).normalize();
  const site = dir.clone().multiplyScalar(330);
  if (!blocked(site.x, site.y, 60)) {
    const house = manor(windows);
    house.position.set(site.x, terrainHeight(site.x, site.y) + 18, site.y);
    house.lookAt(0, house.position.y, 0);
    group.add(house);
    const hill = new THREE.Mesh(new THREE.ConeGeometry(70, 36, 7), new THREE.MeshStandardMaterial({ color: hillDark, roughness: 0.95, flatShading: true }));
    hill.position.set(site.x, terrainHeight(site.x, site.y) + 2, site.y);
    group.add(hill);
  }

  const pondMask = (x: number, z: number) => 1 - smooth(POND_R * 0.55, POND_R, Math.hypot(x - POND.x, z - POND.y));
  const dry = (x: number, z: number) => pondMask(x, z) <= 0;

  // Dead woods, thicker further out.
  for (let v = 0; v < 3; v++)
    group.add(
      scatter(bakedDecor('deadtree', snowy, v), flatMaterial(), 220 * detail, 300 + v, (rand) => {
        const [x, z] = ring(rand, 55, 420, 0.7);
        if (!dry(x, z)) return null;
        const sc = 1.1 + rand() * 1.4;
        return { x, z, s: [sc, sc * (0.9 + rand() * 0.4), sc] };
      }),
    );

  // Graveyards: rows of stones in a few clusters.
  const graveRand = rng(410);
  const plots = Array.from({ length: 7 }, () => ring(graveRand, 45, 200));
  const inPlot = (rand: () => number): Placement | null => {
    const [px, pz] = plots[Math.floor(rand() * plots.length)];
    const x = px + Math.round((rand() - 0.5) * 8) * 3;
    const z = pz + Math.round((rand() - 0.5) * 6) * 3.4;
    return dry(x, z) ? { x, z, s: 0.9 + rand() * 0.4, rot: Math.PI / 2 + (rand() - 0.5) * 0.3, dy: -0.1 } : null;
  };
  for (let v = 0; v < 3; v++) group.add(scatter(bakedDecor('tombstone', snowy, v), flatMaterial(), 70 * detail, 420 + v, inPlot));
  group.add(
    scatter(bakedDecor('crypt', snowy), flatMaterial(), 6 * detail + 2, 430, (rand) => {
      const [x, z] = ring(rand, 90, 260);
      return dry(x, z) ? { x, z, s: 1 + rand() * 0.4, dy: -0.1 } : null;
    }),
  );
  group.add(
    scatter(bakedDecor('rock', snowy), flatMaterial(), 70 * detail, 440, (rand) => {
      const [x, z] = ring(rand, 40, 300);
      return dry(x, z) ? { x, z, s: 0.5 + rand() * 1.4, dy: -0.25 } : null;
    }),
  );
  group.add(
    scatter(bakedDecor('scarecrow', snowy), flatMaterial(), 10 * detail + 2, 450, (rand) => {
      const [x, z] = ring(rand, 50, 220);
      return dry(x, z) ? { x, z, s: 1 + rand() * 0.3, dy: -0.1 } : null;
    }),
  );

  // Pumpkin patches, whose faces glow after dark.
  const patchRand = rng(460);
  const patches = Array.from({ length: 6 }, () => ring(patchRand, 35, 160));
  const inPatch = (rand: () => number): Placement | null => {
    const [px, pz] = patches[Math.floor(rand() * patches.length)];
    const x = px + (rand() - 0.5) * 22;
    const z = pz + (rand() - 0.5) * 22;
    return dry(x, z) ? { x, z, s: 0.9 + rand() * 0.8, rot: (rand() - 0.5) * 1.2, dy: -0.12 } : null;
  };
  const pumpkins = 120 * detail;
  group.add(scatter(bakedDecor('pumpkin', snowy, 1), flatMaterial(), pumpkins, 470, inPatch));
  const faces = scatter(
    pumpkinFaces(),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffa030).multiplyScalar(night ? 2.2 : 1), vertexColors: false, toneMapped: false }),
    pumpkins,
    470,
    inPatch,
    terrainHeight,
    false,
  );
  faces.visible = atm.night > 0.2 || atm.overcast > 0.5;
  group.add(faces);

  // A murky pond.
  const water = new Water(new THREE.CircleGeometry(POND_R + 10, 40).rotateX(-Math.PI / 2), atm, {
    level: POND_LEVEL,
    deep: 0x16241e,
    shallow: 0x3a5a3a,
    waves: 0.2,
    foam: 0.15,
  });
  water.mesh.position.set(POND.x, POND_LEVEL, POND.y);
  group.add(water.mesh);

  // Bats circling the manor and the track.
  const bats = new Birds(Math.round(40 * detail) + 8, 13, 0x120a18, [0, 0], [40, 180], [18, 55], 0.8);
  group.add(bats.mesh);

  // Will-o'-wisps (or drifting leaves by day).
  const wet = cfg.weather === 'rain' || cfg.weather === 'storm';
  const wisps = wet
    ? null
    : new Drifters(Math.round((night ? 160 : 120) * detail), 21, night
      ? { color: 0x9aff7a, size: 0.45, box: 40, fall: 0.03, additive: true, opacity: 0.85 }
      : { color: 0xd8701a, size: 0.25, box: 40, fall: 0.7 });
  if (wisps) group.add(wisps.points);

  return {
    group,
    ground: snowy ? 'snow' : 'grave',
    groundTint(x, z, out) {
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.041) * 0.5 + Math.sin(x * 0.13 + z * 0.08) * 0.25;
      const k = 0.85 + n * 0.15;
      out.setRGB(k * (1 + n * 0.06), k * 0.96, k * (1.04 - n * 0.06));
      const shore = 1 - smooth(POND_R, POND_R + 20, Math.hypot(x - POND.x, z - POND.y));
      if (shore > 0) out.lerp(MUD, shore * 0.8);
    },
    farShape(x, z) {
      const m = pondMask(x, z);
      if (m <= 0) return 0;
      return -(terrainHeight(x, z) + 3.5) * m;
    },
    onGround: (h, seg, ext) => water.setHeights(h, seg, ext),
    update(dt, focus, time) {
      water.update(time);
      bats.update(time * 1.8);
      wisps?.update(dt, focus, time);
      // Candle-lit windows flicker.
      if (night) windows.emissiveIntensity = 2 + Math.sin(time * 7.3) * 0.25 + Math.sin(time * 13.1) * 0.15;
    },
  };
}
