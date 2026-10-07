import * as THREE from 'three';
import { pointFrames } from '../track/frames';
import { LINE_COLORS, type LineType, type Stroke } from '../track/types';

const THICKNESS = 0.18;

const TEX = 128;

function makeTexture(type: LineType): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = TEX;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(LINE_COLORS[type]);
  // Subtle vertical gradient across the width gives the ribbon a rounded look.
  const grad = ctx.createLinearGradient(0, 0, TEX, 0);
  const dark = base.clone().multiplyScalar(0.78).getStyle();
  grad.addColorStop(0, dark);
  grad.addColorStop(0.5, base.getStyle());
  grad.addColorStop(1, dark);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, TEX, TEX);
  // Frosty speckles.
  let seed = 11;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.04 + rand() * 0.1})`;
    ctx.fillRect(rand() * TEX, rand() * TEX, 1 + rand() * 2, 1 + rand() * 2);
  }
  // Bright edges so the ribbon reads well from far away.
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillRect(0, 0, 8, TEX);
  ctx.fillRect(TEX - 8, 0, 8, TEX);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(8, 0, 3, TEX);
  ctx.fillRect(TEX - 11, 0, 3, TEX);
  if (type === 'accel') {
    // Chevrons pointing along the drawing direction (+v, which is canvas up
    // because textures are flipped vertically).
    ctx.strokeStyle = 'rgba(255,236,190,0.95)';
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(32, 88);
    ctx.lineTo(64, 36);
    ctx.lineTo(96, 88);
    ctx.stroke();
  } else if (type === 'normal') {
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(20, 0, TEX - 40, 6);
  } else if (type === 'ice') {
    // Cracks in clear ice.
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 1.5;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      let x = 14 + rand() * 100;
      let y = rand() * TEX;
      ctx.moveTo(x, y);
      for (let j = 0; j < 4; j++) {
        x += (rand() - 0.5) * 40;
        y += (rand() - 0.3) * 30;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else if (type === 'bouncy') {
    // Springy zigzag.
    ctx.strokeStyle = 'rgba(255,240,250,0.9)';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(104, 32);
    ctx.lineTo(24, 64);
    ctx.lineTo(104, 96);
    ctx.lineTo(24, 128);
    ctx.stroke();
  } else {
    // Garland of little lights for scenery.
    const colors = ['#ffd84a', '#ff6b6b', '#ffffff', '#7fe0ff'];
    for (let i = 0; i < 4; i++) {
      ctx.fillStyle = colors[i];
      ctx.beginPath();
      ctx.arc(28 + i * 24, 20 + (i % 2) * 60, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

const textures = new Map<LineType, THREE.CanvasTexture>();
const topMaterials = new Map<LineType, THREE.MeshPhysicalMaterial>();

export function topMaterial(type: LineType) {
  let m = topMaterials.get(type);
  if (!m) {
    let tex = textures.get(type);
    if (!tex) textures.set(type, (tex = makeTexture(type)));
    // Glossy, icy finish.
    m = new THREE.MeshPhysicalMaterial({
      map: tex,
      roughness: type === 'ice' ? 0.05 : type === 'bouncy' ? 0.6 : 0.45,
      metalness: 0,
      clearcoat: type === 'scenery' || type === 'bouncy' ? 0 : 0.9,
      clearcoatRoughness: type === 'ice' ? 0.02 : 0.25,
      transparent: type === 'scenery' || type === 'ice',
      opacity: type === 'scenery' ? 0.8 : type === 'ice' ? 0.82 : 1,
      emissive: type === 'scenery' ? new THREE.Color(0x1d5a2e) : new THREE.Color(0x000000),
      emissiveIntensity: 0.4,
    });
    topMaterials.set(type, m);
  }
  return m;
}

/** Underside / sides: neutral so the solid top face is always obvious. */
export const underMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa5b4, roughness: 0.75 });

/**
 * Builds the ribbon mesh of a stroke: a thin slab whose top face is the
 * collision surface.
 */
export function buildRibbonGeometry(stroke: Stroke): THREE.BufferGeometry {
  const pts = stroke.points;
  const frames = pointFrames(stroke);
  const hw = stroke.width / 2;
  const n = pts.length;

  // 4 corners per cross-section: top-left, top-right, bottom-right, bottom-left.
  const positions: number[] = [];
  const uvs: number[] = [];
  const indicesTop: number[] = [];
  const indicesOther: number[] = [];
  let v = 0;
  const vtx = (p: THREE.Vector3, u: number, vv: number) => {
    positions.push(p.x, p.y, p.z);
    uvs.push(u, vv);
    return v++;
  };

  let along = 0;
  // Separate vertex rings per face so each face gets crisp normals.
  const ringTop: [number, number][] = [];
  const ringBottom: [number, number][] = [];
  const ringLeft: [number, number][] = [];
  const ringRight: [number, number][] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    if (i > 0) along += pts[i].distanceTo(pts[i - 1]);
    const f = frames[i];
    const p = pts[i];
    const vv = along / stroke.width;
    const TL = tmp.copy(p).addScaledVector(f.side, -hw).clone();
    const TR = tmp.copy(p).addScaledVector(f.side, hw).clone();
    const BR = TR.clone().addScaledVector(f.up, -THICKNESS);
    const BL = TL.clone().addScaledVector(f.up, -THICKNESS);
    ringTop.push([vtx(TL, 0, vv), vtx(TR, 1, vv)]);
    ringBottom.push([vtx(BL, 0, vv), vtx(BR, 1, vv)]);
    ringLeft.push([vtx(TL, 0, vv), vtx(BL, 0.1, vv)]);
    ringRight.push([vtx(TR, 0, vv), vtx(BR, 0.1, vv)]);
  }
  for (let i = 0; i < n - 1; i++) {
    const [a, b] = ringTop[i];
    const [c, d] = ringTop[i + 1];
    indicesTop.push(a, b, c, b, d, c);
    {
      const [a2, b2] = ringBottom[i];
      const [c2, d2] = ringBottom[i + 1];
      indicesOther.push(a2, c2, b2, b2, c2, d2);
    }
    {
      const [a2, b2] = ringLeft[i];
      const [c2, d2] = ringLeft[i + 1];
      indicesOther.push(a2, c2, b2, b2, c2, d2);
    }
    {
      const [a2, b2] = ringRight[i];
      const [c2, d2] = ringRight[i + 1];
      indicesOther.push(a2, b2, c2, b2, d2, c2);
    }
  }
  // End caps.
  for (const i of [0, n - 1]) {
    const [t0, t1] = ringTop[i];
    const [b0, b1] = ringBottom[i];
    if (i === 0) indicesOther.push(t0, b0, t1, t1, b0, b1);
    else indicesOther.push(t0, t1, b0, t1, b1, b0);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex([...indicesTop, ...indicesOther]);
  geo.addGroup(0, indicesTop.length, 0);
  geo.addGroup(indicesTop.length, indicesOther.length, 1);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export function buildRibbonMesh(stroke: Stroke): THREE.Mesh {
  const mesh = new THREE.Mesh(buildRibbonGeometry(stroke), [topMaterial(stroke.type), underMaterial]);
  mesh.castShadow = stroke.type !== 'scenery';
  mesh.receiveShadow = true;
  mesh.userData.strokeId = stroke.id;
  return mesh;
}
