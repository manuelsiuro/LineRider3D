import * as THREE from 'three';
import { M } from '../models';
import { terrainHeight } from '../terrain';
import { Birds, bakedDecor, blocked, flatMaterial, mounds, peaks, ring, rng, scatter, type Backdrop, type BackdropCtx } from './common';

const STRATA = [0xa85a36, 0xc8744a, 0xe0a070, 0xb86848, 0xd88a5a, 0x9a4e30].map((c) => new THREE.Color(c));

/** A modern wind turbine; its rotor is the child named 'rotor'. */
function turbine(): THREE.Group {
  const g = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 1.4, 48, 10), M.white);
  tower.position.y = 24;
  const nacelle = new THREE.Mesh(new THREE.BoxGeometry(4, 2, 2), M.white);
  nacelle.position.set(0.8, 48.5, 0);
  const rotor = new THREE.Group();
  rotor.name = 'rotor';
  rotor.position.set(3, 48.5, 0);
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.9, 10, 8), M.white);
  rotor.add(hub);
  for (let i = 0; i < 3; i++) {
    const holder = new THREE.Group();
    holder.rotation.x = (i / 3) * Math.PI * 2;
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.25, 20, 1.3).translate(0, 10.5, 0), M.white);
    blade.rotation.y = 0.25;
    holder.add(blade);
    rotor.add(holder);
  }
  g.add(tower, nacelle, rotor);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Rolling tumbleweeds blown across the flats around the focus. */
class Tumbleweeds {
  readonly mesh: THREE.InstancedMesh;
  private items: { x: number; z: number; spin: number; speed: number; hop: number; size: number }[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private p = new THREE.Vector3();
  constructor(count: number, private wind: number) {
    this.mesh = new THREE.InstancedMesh(bakedDecor('tumbleweed', false), flatMaterial(), count);
    this.mesh.castShadow = true;
    this.mesh.frustumCulled = false;
    const rand = rng(57);
    for (let i = 0; i < count; i++)
      this.items.push({ x: (rand() - 0.5) * 120, z: (rand() - 0.5) * 120, spin: rand() * 6, speed: 0.6 + rand() * 0.8, hop: rand() * 10, size: 0.7 + rand() * 0.8 });
  }
  update(dt: number, focus: THREE.Vector3, time: number) {
    const v = 2 + this.wind * 3;
    this.items.forEach((t, i) => {
      t.x += v * t.speed * dt;
      t.z += Math.sin(time * 0.4 + t.hop) * 0.6 * dt;
      t.spin += (v * t.speed * dt) / (0.55 * t.size);
      // Wrap within 60 m of the focus.
      if (t.x - focus.x > 60) t.x -= 120;
      else if (t.x - focus.x < -60) t.x += 120;
      if (t.z - focus.z > 60) t.z -= 120;
      else if (t.z - focus.z < -60) t.z += 120;
      const bounce = Math.abs(Math.sin(time * 2.2 * t.speed + t.hop)) * 0.6 * t.size;
      this.p.set(t.x, terrainHeight(t.x, t.z) + bounce - 0.1, t.z);
      this.q.setFromEuler(this.e.set(0, 0, -t.spin));
      this.s.setScalar(t.size);
      this.m.compose(this.p, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** Red rock country: banded mesas and buttes, dunes, cactus flats and turbines. */
export function desert(ctx: BackdropCtx): Backdrop {
  const { detail, cfg } = ctx;
  const snowy = cfg.weather === 'snow';
  const group = new THREE.Group();

  const strata = (t: number, rand: () => number, out: THREE.Color) => {
    const band = Math.floor(t * 7 + (rand() - 0.5) * 0.35);
    out.copy(STRATA[((band % STRATA.length) + STRATA.length) % STRATA.length]);
    if (t > 0.97 && snowy) out.setHex(0xf2f2f2);
  };
  // Wide mesas on the horizon, slender buttes in front of them.
  group.add(peaks({ count: 26, seed: 41, dist: [470, 760], height: [50, 120], radius: [60, 130], sides: 8, mesa: 0.82, paint: strata }));
  group.add(peaks({ count: 12, seed: 43, dist: [300, 460], height: [60, 110], radius: [14, 30], sides: 7, mesa: 0.75, paint: strata }));

  // Dunes.
  const duneMat = new THREE.MeshStandardMaterial({ color: snowy ? 0xf0f2f6 : 0xe0a46c, roughness: 0.95, flatShading: true });
  group.add(mounds(duneMat, 110 * detail, 47, [200, 460], [8, 22], [1.5, 4]));

  const flats = (min: number, max: number) => (rand: () => number) => {
    const [x, z] = ring(rand, min, max, 0.8);
    return { x, z, s: 0.9 + rand() * 0.7 };
  };
  for (let v = 0; v < 3; v++) group.add(scatter(bakedDecor('cactus', snowy, v), flatMaterial(), 70 * detail, 300 + v, flats(55, 380)));
  group.add(scatter(bakedDecor('barrel', snowy), flatMaterial(), 90 * detail, 310, flats(45, 300)));
  group.add(scatter(bakedDecor('mesa', snowy), flatMaterial(), 50 * detail, 311, (rand) => {
    const [x, z] = ring(rand, 90, 420);
    return { x, z, s: 1.2 + rand() * 2.4, dy: -0.3 };
  }));
  group.add(scatter(bakedDecor('rock', false), flatMaterial({ color: 0xd88a60 }), 90 * detail, 312, (rand) => {
    const [x, z] = ring(rand, 40, 300);
    return { x, z, s: 0.5 + rand() * 1.4, dy: -0.25 };
  }));
  group.add(scatter(bakedDecor('skull', snowy), flatMaterial(), 14 * detail, 313, flats(60, 200)));

  // Wind farm on a ridge.
  const turbines = new THREE.Group();
  const rand = rng(77);
  for (let i = 0; i < 9; i++) {
    const a = 0.9 + i * 0.09 + rand() * 0.03;
    const r = 330 + rand() * 60;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    if (blocked(x, z, 22)) continue;
    const t = turbine();
    t.position.set(x, terrainHeight(x, z) - 0.5, z);
    t.rotation.y = -0.6;
    t.userData.speed = 0.8 + rand() * 0.4;
    turbines.add(t);
  }
  group.add(turbines);
  const windpumps = scatter(bakedDecor('windmill', snowy), flatMaterial(), 5, 320, (r) => {
    const [x, z] = ring(r, 110, 250);
    return { x, z, s: 1.2, dy: 0 };
  });
  group.add(windpumps);

  const weeds = cfg.weather === 'snow' ? null : new Tumbleweeds(Math.round(14 * Math.max(0.5, detail)), ctx.atm.precip.wind);
  if (weeds) group.add(weeds.mesh);

  const vultures = new Birds(6, 21, 0x1e1a18, [40, 80], [90, 180], [60, 90], 1.8);
  group.add(vultures.mesh);

  return {
    group,
    ground: 'redsand',
    groundTint(x, z, out) {
      // Pale sand drifts and darker baked clay pans.
      const n = Math.sin(x * 0.03 + Math.cos(z * 0.02) * 2) * 0.5 + Math.sin(x * 0.09 - z * 0.07) * 0.25;
      const k = 1 + n * 0.12;
      out.setRGB(k, k * (1 + n * 0.04), k * (1 + n * 0.08));
    },
    update(dt, focus, time) {
      weeds?.update(dt, focus, time);
      vultures.update(time);
      for (const t of turbines.children) t.getObjectByName('rotor')!.rotation.x = time * (t.userData.speed as number);
    },
  };
}
