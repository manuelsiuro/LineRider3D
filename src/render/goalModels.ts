import * as THREE from 'three';
import type { Checkpoint, Finish, Star } from '../track/types';

const starMat = new THREE.MeshStandardMaterial({
  color: 0xffd34d,
  emissive: 0xffa000,
  emissiveIntensity: 0.9,
  metalness: 0.4,
  roughness: 0.25,
});

let starGeo: THREE.BufferGeometry | null = null;
function starGeometry() {
  if (starGeo) return starGeo;
  const shape = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 0.26 : 0.6;
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  starGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.05, bevelSegments: 2 });
  starGeo.center();
  return starGeo;
}

let glowTex: THREE.Texture | null = null;
function glowTexture() {
  if (glowTex) return glowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,220,120,0.9)');
  g.addColorStop(0.4, 'rgba(255,190,60,0.35)');
  g.addColorStop(1, 'rgba(255,170,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(c);
  return glowTex;
}

/** A spinning, glowing collectible star. */
export function buildStar(star: Star): THREE.Group {
  const g = new THREE.Group();
  const spin = new THREE.Group();
  spin.name = 'spin';
  const mesh = new THREE.Mesh(starGeometry(), starMat);
  mesh.castShadow = true;
  spin.add(mesh);
  g.add(spin);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
  glow.scale.setScalar(2.2);
  g.add(glow);
  g.position.copy(star.position);
  g.userData.starId = star.id;
  g.traverse((o) => (o.userData.starId = star.id));
  return g;
}

export function animateStar(obj: THREE.Object3D, time: number, phase: number, collected: boolean) {
  obj.visible = !collected;
  const spin = obj.getObjectByName('spin');
  if (spin) {
    spin.rotation.y = time * 2.2 + phase;
    spin.position.y = Math.sin(time * 2 + phase) * 0.15;
  }
}

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 4; y++) {
      ctx.fillStyle = (x + y) % 2 ? '#111' : '#fff';
      ctx.fillRect(x * 8, y * 8, 8, 8);
    }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  return t;
}

/** Finish arch: two posts and a checkered banner across the track. */
export function buildFinish(fin: Finish): THREE.Group {
  const g = new THREE.Group();
  const w = fin.halfWidth;
  const H = 4.2;
  const post = new THREE.MeshStandardMaterial({ color: 0xe8453c, roughness: 0.5 });
  const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, H + 3, 10), post);
    p.position.set(0, H / 2 - 1.5, s * w);
    p.castShadow = true;
    g.add(p);
    for (let k = 0; k < 4; k++) {
      const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 10), white);
      stripe.position.set(0, -1 + k * 1.3, s * w);
      g.add(stripe);
    }
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xff9900, emissiveIntensity: 0.6 }));
    ball.position.set(0, H + 0.15, s * w);
    g.add(ball);
  }
  const tex = checkerTexture();
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(Math.max(1, Math.round(w)), 1);
  const banner = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.9, w * 2), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
  banner.position.set(0, H - 0.6, 0);
  banner.castShadow = true;
  g.add(banner);
  // Face the riding direction: local +X is the axis.
  const axis = fin.axis.clone();
  axis.y = 0;
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  g.position.copy(fin.position);
  g.rotation.y = Math.atan2(-axis.z, axis.normalize().x);
  g.userData.finish = true;
  g.traverse((o) => (o.userData.finish = true));
  return g;
}

const cpPost = new THREE.MeshStandardMaterial({ color: 0x2f7fd8, roughness: 0.5 });
const cpWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 });

/** Checkpoint arch: blue posts and a flag banner that lights up green once passed. */
export function buildCheckpoint(cp: Checkpoint): THREE.Group {
  const g = new THREE.Group();
  const w = cp.halfWidth;
  const H = 3.6;
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.14, H + 3, 8), cpPost);
    p.position.set(0, H / 2 - 1.5, s * w);
    p.castShadow = true;
    g.add(p);
    const stripe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), cpWhite);
    stripe.position.set(0, H - 0.9, s * w);
    g.add(stripe);
  }
  const banner = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.6, w * 2),
    new THREE.MeshStandardMaterial({ color: 0x9fb3c8, emissive: 0x000000, roughness: 0.55 }),
  );
  banner.name = 'banner';
  banner.position.set(0, H - 0.35, 0);
  banner.castShadow = true;
  g.add(banner);
  const flag = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x9fb3c8, side: THREE.DoubleSide, roughness: 0.6 }),
  );
  flag.name = 'flag';
  flag.position.set(-0.36, H + 1.15, w);
  g.add(flag);
  const axis = cp.axis.clone();
  axis.y = 0;
  if (axis.lengthSq() < 1e-6) axis.set(1, 0, 0);
  g.position.copy(cp.position);
  g.rotation.y = Math.atan2(-axis.z, axis.normalize().x);
  g.userData.checkpointId = cp.id;
  g.traverse((o) => (o.userData.checkpointId = cp.id));
  return g;
}

const CP_OFF = new THREE.Color(0x9fb3c8);
const CP_ON = new THREE.Color(0x2fbf71);

/** Flutters the flag; the banner and flag turn green once the rider has passed. */
export function animateCheckpoint(obj: THREE.Object3D, time: number, passed: boolean) {
  const banner = obj.getObjectByName('banner') as THREE.Mesh | undefined;
  const flag = obj.getObjectByName('flag') as THREE.Mesh | undefined;
  for (const m of [banner, flag]) {
    if (!m) continue;
    const mat = m.material as THREE.MeshStandardMaterial;
    mat.color.copy(passed ? CP_ON : CP_OFF);
    mat.emissive.copy(passed ? CP_ON : CP_OFF).multiplyScalar(passed ? 0.45 : 0);
  }
  if (flag) flag.rotation.y = Math.sin(time * 5 + obj.id) * 0.35;
}
