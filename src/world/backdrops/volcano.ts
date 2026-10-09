import * as THREE from 'three';
import { M } from '../models';
import { Drifters, bakedDecor, flatMaterial, mounds, peaks, ring, scatter, type Backdrop, type BackdropCtx } from './common';

const ROCK = [0x2a2426, 0x3a3234, 0x4a4042, 0x332b2c].map((c) => new THREE.Color(c));
const ASH = new THREE.Color(0x8a8482);
const GLOW = new THREE.Color(0xff6a20);

/** The big one: a smoking cone with lava running down from its glowing crater. */
function mainVolcano(): { group: THREE.Group; smoke: THREE.Mesh[] } {
  const g = new THREE.Group();
  const h = 210;
  const cone = new THREE.Mesh(new THREE.CylinderGeometry(34, 260, h, 14, 6), new THREE.MeshStandardMaterial({ color: 0x2c2628, roughness: 0.95, flatShading: true }));
  cone.position.y = h / 2 - 8;
  g.add(cone);
  const crater = new THREE.Mesh(new THREE.CylinderGeometry(30, 30, 2, 14), M.lava);
  crater.position.y = h - 8;
  g.add(crater);
  // The crater's glow shows through the haze (sprites ignore the fog).
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g2 = c.getContext('2d')!;
  const grad = g2.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,170,80,0.95)');
  grad.addColorStop(0.35, 'rgba(255,90,30,0.45)');
  grad.addColorStop(1, 'rgba(255,60,10,0)');
  g2.fillStyle = grad;
  g2.fillRect(0, 0, 64, 64);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  glow.scale.set(150, 90, 1);
  glow.position.y = h - 4;
  g.add(glow);
  // A plume of smoke: grey puffs that rise and swell.
  const smoke: THREE.Mesh[] = [];
  const puffMat = new THREE.MeshStandardMaterial({ color: 0x8a807c, roughness: 1, transparent: true, opacity: 0.3, depthWrite: false, fog: false });
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 2), puffMat.clone());
    p.userData.phase = i / 9;
    smoke.push(p);
    g.add(p);
  }
  return { group: g, smoke };
}

/** Black volcanic badlands: ash cones, a great smoking volcano, lava pools and embers. */
export function volcano(ctx: BackdropCtx): Backdrop {
  const { detail } = ctx;
  const group = new THREE.Group();

  // Ridges of dark rock with ash on top.
  const paint = (t: number, rand: () => number, out: THREE.Color) => {
    out.copy(ROCK[Math.floor(rand() * ROCK.length)]);
    if (t > 0.8) out.lerp(ASH, (t - 0.8) * 3);
  };
  group.add(peaks({ count: 24, seed: 141, dist: [480, 760], height: [70, 150], radius: [70, 140], sides: 9, paint }));
  group.add(peaks({ count: 14, seed: 143, dist: [300, 460], height: [40, 90], radius: [30, 60], sides: 8, mesa: 0.2, paint }));

  const big = mainVolcano();
  big.group.position.set(-420, 0, -560);
  group.add(big.group);

  // Ash dunes and rubble.
  group.add(mounds(new THREE.MeshStandardMaterial({ color: 0x3a3436, roughness: 0.95, flatShading: true }), 90 * detail, 147, [180, 420], [6, 18], [1.2, 3.5]));

  // Lava pools: flat glowing ellipses on the plain (well away from the track).
  const pools = scatter(new THREE.CircleGeometry(1, 14).rotateX(-Math.PI / 2), M.lava, 26 * detail, 150, (rand) => {
    const [x, z] = ring(rand, 70, 360);
    const w = 4 + rand() * 12;
    return { x, z, s: [w, 1, w * (0.4 + rand() * 0.5)], dy: 0.06 };
  }, undefined, false);
  pools.receiveShadow = false;
  group.add(pools);

  const near = (min: number, max: number, s0: number, s1: number) => (rand: () => number) => {
    const [x, z] = ring(rand, min, max, 0.8);
    return { x, z, s: s0 + rand() * (s1 - s0) };
  };
  for (let v = 0; v < 2; v++) group.add(scatter(bakedDecor('basalt', false, v), flatMaterial(), 60 * detail, 160 + v, near(45, 340, 0.8, 2.2)));
  group.add(scatter(bakedDecor('charred', false, 1), flatMaterial(), 70 * detail, 162, near(50, 300, 0.8, 1.4)));
  group.add(scatter(bakedDecor('obsidian', false, 2), flatMaterial(), 50 * detail, 163, near(40, 260, 0.7, 1.5)));
  group.add(scatter(bakedDecor('lavarock', false), flatMaterial({ emissive: GLOW, emissiveIntensity: 0.35 }), 40 * detail, 164, near(45, 280, 0.8, 2)));
  group.add(scatter(bakedDecor('vent', false), flatMaterial(), 16 * detail, 165, near(60, 260, 1, 2)));

  // Embers drifting up around the rider.
  const embers = new Drifters(Math.round(160 * Math.max(0.4, detail)), 177, { color: 0xff8a30, size: 0.22, box: 40, fall: -1.2, additive: true, opacity: 0.9 });
  group.add(embers.points);

  return {
    group,
    ground: 'basalt',
    groundTint(x, z, out) {
      // Grey ash drifts over the black rock.
      const n = Math.sin(x * 0.025 + Math.cos(z * 0.018) * 2) * 0.5 + Math.sin(x * 0.07 - z * 0.06) * 0.25;
      const k = 1 + n * 0.25;
      out.setRGB(k, k * 0.97, k * 0.96);
    },
    update(dt, focus, time) {
      embers.update(dt, focus, time);
      // The plume: puffs rise from the crater, grow and fade, then start again.
      big.smoke.forEach((p) => {
        const t = (time * 0.025 + (p.userData.phase as number)) % 1;
        const s = 30 + t * 90;
        p.position.set(Math.sin(t * 3 + 1) * 30 + t * 120, 215 + t * 240, Math.cos(t * 2) * 20);
        // Thicker near the crater, thinning out as it climbs.
        (p.material as THREE.MeshStandardMaterial).opacity = 0.4 * (1 - t) * Math.min(1, t * 8);
        p.scale.set(s, s * 0.7, s);
        p.rotation.y = t * 2;
      });
    },
  };
}
