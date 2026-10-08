import * as THREE from 'three';
import { M } from '../models';
import { terrainHeight } from '../terrain';
import { Birds, bakedDecor, flatMaterial, mounds, peaks, rng, scatter, smooth, type Backdrop, type BackdropCtx } from './common';
import { Water } from './water';

/** The shore runs along z = SHORE; the sea fills everything beyond. */
const SHORE = -215;
const SEA_LEVEL = -0.6;

const seaMask = (z: number) => smooth(SHORE + 15, SHORE - 75, z);
/** The beach slopes gently under the sea (visual only). */
const farShape = (x: number, z: number) => {
  const s = seaMask(z);
  return s <= 0 ? 0 : -(terrainHeight(x, z) + 4) * s;
};
const vh = (x: number, z: number) => terrainHeight(x, z) + farShape(x, z);

function lighthouse(): { group: THREE.Group; beam: THREE.Mesh } {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(new THREE.CylinderGeometry(9, 12, 6, 9), M.rock));
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const r0 = 3.4 - (i / bands) * 1.2;
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r0 - 0.2, r0, 4, 14), i % 2 ? M.lifeRed : M.white);
    seg.position.y = 3 + i * 4 + 2;
    g.add(seg);
  }
  const top = 3 + bands * 4;
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(2.8, 2.8, 0.4, 14), M.metal);
  deck.position.y = top + 0.2;
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 10), M.headlight);
  lamp.position.y = top + 1.6;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.9, 1.8, 10), M.lifeRed);
  roof.position.y = top + 3.7;
  g.add(deck, lamp, roof);
  for (const o of g.children) (o as THREE.Mesh).castShadow = true;
  // Sweeping light beam (visible from dusk to dawn).
  const beamGeo = new THREE.ConeGeometry(9, 130, 16, 1, true).translate(0, -65, 0).rotateZ(Math.PI / 2);
  const beam = new THREE.Mesh(
    beamGeo,
    new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }),
  );
  beam.position.y = top + 1.6;
  g.add(beam);
  return { group: g, beam };
}

function sailboat(color: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(7, 1.2, 2.4), M.white);
  hull.position.y = 0.4;
  const keel = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.3, 2.45), color);
  keel.position.y = 0.95;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 9, 6), M.woodDark);
  mast.position.set(0.5, 5.5, 0);
  const sailShape = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(3.6, 0), new THREE.Vector2(0, 7.5)]);
  const sail = new THREE.Mesh(new THREE.ShapeGeometry(sailShape), new THREE.MeshStandardMaterial({ color: 0xfaf6ee, side: THREE.DoubleSide }));
  sail.position.set(0.6, 1.6, 0);
  const jib = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(-2.6, 0), new THREE.Vector2(0, 6.4)])), sail.material);
  jib.position.set(0.4, 1.6, 0.05);
  g.add(hull, keel, mast, sail, jib);
  return g;
}

/** Golden sand, palms and huts on a turquoise bay with islands and a lighthouse. */
export function beach(ctx: BackdropCtx): Backdrop {
  const { detail, atm, cfg } = ctx;
  const group = new THREE.Group();
  const snowy = cfg.weather === 'snow';

  // Green hills inland only (the sea side stays open to the horizon).
  group.add(
    peaks({
      count: 26,
      seed: 31,
      dist: [430, 700],
      height: [50, 130],
      radius: [100, 180],
      sides: 8,
      arc: (a) => Math.sin(a) > 0.05,
      paint: (t, rand, out) => {
        if (t > 0.75 + rand() * 0.15) out.setHex(0x8a8a78);
        else out.setHex(rand() < 0.5 ? 0x5f8f3e : 0x4c7a34);
      },
    }),
  );

  // Islands out at sea.
  const islands = new THREE.Group();
  const isl: [number, number, number, number][] = [
    [-260, -620, 70, 34],
    [180, -760, 110, 52],
    [520, -560, 50, 26],
  ];
  const rand = rng(91);
  for (const [x, z, r, h] of isl) {
    const p = peaks({
      count: 1,
      seed: Math.floor(x + 1000),
      dist: [0, 0],
      height: [h, h],
      radius: [r, r],
      sides: 9,
      paint: (t, _r, out) => out.setHex(t < 0.12 ? 0xe2c890 : t > 0.7 ? 0x6a7a5a : 0x3f8a3e),
    });
    p.position.set(x, SEA_LEVEL - 2, z);
    islands.add(p);
  }
  group.add(islands);

  // The sea, reaching the horizon.
  const seaGeo = new THREE.PlaneGeometry(3400, 1800, 1, 1).rotateX(-Math.PI / 2).translate(0, 0, -1100);
  const water = new Water(seaGeo, atm, {
    level: SEA_LEVEL,
    deep: atm.overcast > 0.5 ? 0x24485a : 0x0f5f88,
    shallow: atm.overcast > 0.5 ? 0x4a8a8a : 0x3fd0c8,
    waves: cfg.weather === 'storm' ? 1.8 : 1,
  });
  group.add(water.mesh);

  const lh = lighthouse();
  lh.group.position.set(-330, vh(-330, SHORE - 40) + 1, SHORE - 40);
  group.add(lh.group);
  const beamMat = lh.beam.material as THREE.MeshBasicMaterial;
  beamMat.opacity = 0.03 + atm.night * 0.14 + atm.overcast * 0.05;

  const boats = new THREE.Group();
  [M.lifeRed, M.teal, M.gold, M.pastelBlue].forEach((m, i) => {
    const b = sailboat(m);
    b.position.set(-200 + i * 170 + rand() * 60, SEA_LEVEL, -360 - rand() * 220);
    b.rotation.y = rand() * Math.PI * 2;
    b.userData.phase = rand() * 10;
    boats.add(b);
  });
  group.add(boats);

  // Palms along the beach and in groves inland.
  const onLand = (x: number, z: number) => z > SHORE + 12 && Math.hypot(x, z) > 58;
  for (let v = 0; v < 3; v++) {
    group.add(
      scatter(bakedDecor('palm', snowy, v), flatMaterial(), 130 * detail, 200 + v, (r) => {
        const beachRow = r() < 0.45;
        const x = (r() - 0.5) * 900;
        const z = beachRow ? SHORE + 14 + r() * 40 : -150 + r() * 560;
        if (!onLand(x, z)) return null;
        const s = 1.1 + r() * 0.8;
        return { x, z, s };
      }, vh),
    );
  }
  // Beach huts and lifeguard towers in a row above the water line.
  for (let v = 0; v < 4; v++) {
    group.add(
      scatter(bakedDecor('hut', snowy, v), flatMaterial(), 4, 220 + v, (r) => {
        const x = -280 + r() * 560;
        if (Math.abs(x) < 70) return null;
        return { x, z: SHORE + 22 + r() * 6, s: 1.2, rot: Math.PI + (r() - 0.5) * 0.2, dy: 0 };
      }, vh),
    );
  }
  group.add(
    scatter(bakedDecor('lifeguard', snowy), flatMaterial(), 3, 230, (r) => ({ x: -240 + r() * 480, z: SHORE + 6, s: 1.3, rot: Math.PI, dy: 0 }), vh),
  );
  for (let v = 0; v < 3; v++) {
    group.add(
      scatter(bakedDecor('umbrella', snowy, v), flatMaterial(), 26 * detail, 240 + v, (r) => {
        const x = (r() - 0.5) * 640;
        return { x, z: SHORE + 2 + r() * 30, s: 1 + r() * 0.3, dy: 0 };
      }, vh),
    );
  }
  group.add(
    scatter(bakedDecor('rock', false), flatMaterial(), 40 * detail, 250, (r) => {
      const x = (r() - 0.5) * 800;
      return { x, z: SHORE - 10 + r() * 28, s: 1 + r() * 3, dy: -0.4 };
    }, vh),
  );

  // Dunes with grass behind the beach.
  const duneMat = new THREE.MeshStandardMaterial({ color: snowy ? 0xf2f5fa : 0xe4cc96, roughness: 0.95, flatShading: true });
  group.add(mounds(duneMat, 120 * detail, 33, [200, 440], [5, 14], [1, 3.5], (_x, z) => z > SHORE + 30));

  const gulls = new Birds(16, 12, 0xf4f4f4, [0, SHORE - 30], [40, 140], [18, 40], 0.9);
  group.add(gulls.mesh);

  return {
    group,
    ground: 'sand',
    groundTint(x, z, out) {
      const s = seaMask(z);
      const n = Math.sin(x * 0.05) * Math.cos(z * 0.04);
      // Darker wet sand near the water, a little grass inland.
      const wet = smooth(SHORE + 18, SHORE - 6, z);
      const k = 1 - wet * 0.3 - s * 0.2 + n * 0.04;
      out.setRGB(k, k * 0.98, k * 0.95);
      const inland = smooth(120, 260, z) * (0.5 + n * 0.5);
      if (inland > 0) out.lerp(GRASS, inland * 0.6);
    },
    farShape,
    onGround: (h, seg, ext) => water.setHeights(h, seg, ext),
    update(_dt, _focus, time) {
      water.update(time);
      gulls.update(time);
      lh.beam.rotation.y = time * 0.6;
      boats.children.forEach((b) => {
        const p = b.userData.phase as number;
        b.position.y = SEA_LEVEL + Math.sin(time * 1.1 + p) * 0.25;
        b.rotation.z = Math.sin(time * 0.9 + p) * 0.05;
      });
    },
  };
}

const GRASS = new THREE.Color().setRGB(0.75, 0.95, 0.55);
