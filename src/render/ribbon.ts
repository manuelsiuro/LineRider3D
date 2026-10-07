import * as THREE from 'three';
import { pointFrames } from '../track/frames';
import { LINE_COLORS, type LineType, type Stroke } from '../track/types';

const THICKNESS = 0.18;

function makeTexture(type: LineType): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const base = new THREE.Color(LINE_COLORS[type]);
  ctx.fillStyle = `#${base.getHexString()}`;
  ctx.fillRect(0, 0, 64, 64);
  // Bright edges so the ribbon reads well from far away.
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(0, 0, 5, 64);
  ctx.fillRect(59, 0, 5, 64);
  if (type === 'accel') {
    // Chevrons pointing along the drawing direction (+v).
    ctx.strokeStyle = 'rgba(255,240,200,0.9)';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(14, 18);
    ctx.lineTo(32, 46);
    ctx.lineTo(50, 18);
    ctx.stroke();
  } else if (type === 'normal') {
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(10, 0, 44, 6);
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 0; i < 4; i++) ctx.fillRect(12 + i * 11, 8 + (i % 2) * 24, 6, 6);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

const textures = new Map<LineType, THREE.CanvasTexture>();
const topMaterials = new Map<LineType, THREE.MeshStandardMaterial>();

export function topMaterial(type: LineType) {
  let m = topMaterials.get(type);
  if (!m) {
    let tex = textures.get(type);
    if (!tex) textures.set(type, (tex = makeTexture(type)));
    m = new THREE.MeshStandardMaterial({
      map: tex,
      roughness: type === 'normal' ? 0.35 : 0.6,
      metalness: 0.05,
      transparent: type === 'scenery',
      opacity: type === 'scenery' ? 0.75 : 1,
    });
    topMaterials.set(type, m);
  }
  return m;
}

/** Underside / sides: neutral so the solid top face is always obvious. */
export const underMaterial = new THREE.MeshStandardMaterial({ color: 0x8a96a6, roughness: 0.8 });

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
