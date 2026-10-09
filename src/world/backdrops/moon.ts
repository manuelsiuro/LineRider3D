import * as THREE from 'three';
import { bakedDecor, flatMaterial, peaks, ring, scatter, type Backdrop, type BackdropCtx } from './common';

const GREYS = [0x8a8884, 0x9c9a96, 0x7a7874, 0xaaa8a4].map((c) => new THREE.Color(c));

/**
 * The Moon: grey highlands, craters big and small, a lander and a little base, glowing
 * crystals. No birds, no wind, nothing moves but the rider (and the Earth in the sky).
 */
export function moon(ctx: BackdropCtx): Backdrop {
  const { detail } = ctx;
  const group = new THREE.Group();

  // Rounded grey highlands on the horizon, and crater walls nearer in.
  const paint = (t: number, rand: () => number, out: THREE.Color) => {
    out.copy(GREYS[Math.floor(rand() * GREYS.length)]).multiplyScalar(0.85 + t * 0.25);
  };
  group.add(peaks({ count: 22, seed: 241, dist: [500, 780], height: [50, 120], radius: [90, 170], sides: 10, mesa: 0.35, paint }));
  group.add(peaks({ count: 12, seed: 243, dist: [320, 470], height: [18, 40], radius: [40, 80], sides: 10, mesa: 0.55, paint }));

  // Craters: the crater model scaled up, from pits to wide bowls.
  const dust = flatMaterial({ color: 0xc8c6c2 });
  group.add(scatter(bakedDecor('crater', false), dust, 26 * detail, 250, (rand) => {
    const [x, z] = ring(rand, 70, 420);
    const s = 4 + Math.pow(rand(), 2) * 14;
    return { x, z, s: [s, s * 0.6, s], dy: -0.2 };
  }));
  group.add(scatter(bakedDecor('crater', false, 1), dust, 60 * detail, 251, (rand) => {
    const [x, z] = ring(rand, 35, 260, 0.8);
    return { x, z, s: 0.8 + rand() * 1.6, dy: -0.05 };
  }));
  // Boulders: grey rock (snow caps read as pale dust).
  group.add(scatter(bakedDecor('rock', true, 1), flatMaterial({ color: 0x9a9894 }), 90 * detail, 252, (rand) => {
    const [x, z] = ring(rand, 30, 320);
    return { x, z, s: 0.4 + Math.pow(rand(), 2) * 2.4, dy: -0.2 };
  }));
  group.add(scatter(bakedDecor('crystal', false, 2), flatMaterial({ emissive: 0x40c8ff, emissiveIntensity: 0.4 }), 30 * detail, 253, (rand) => {
    const [x, z] = ring(rand, 40, 240, 0.8);
    return { x, z, s: 0.8 + rand() * 1.2 };
  }));

  // A small base: lander, dish, rover and a flag, together in one spot off to the side.
  const base = (seed: number, kind: 'lander' | 'dish' | 'rover' | 'moonflag', count: number, s: number) =>
    scatter(bakedDecor(kind, false), flatMaterial(), count, seed, (rand) => {
      const [x, z] = ring(rand, 120, 180);
      // Keep them in one quarter of the sky so they read as a camp.
      return x > 0 && z < 0 ? { x, z, s } : null;
    });
  group.add(base(260, 'lander', 1, 2.2), base(261, 'dish', 2, 2), base(262, 'rover', 2, 1.5), base(263, 'moonflag', 1, 1.6));

  return {
    group,
    ground: 'regolith',
    groundTint(x, z, out) {
      // Bright highland dust and darker mare plains.
      const n = Math.sin(x * 0.012 + Math.cos(z * 0.01) * 2) * 0.5 + Math.sin(x * 0.05 - z * 0.04) * 0.2;
      const k = 1 + n * 0.16;
      out.setRGB(k, k, k * 1.01);
    },
  };
}
