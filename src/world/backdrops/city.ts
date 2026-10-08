import * as THREE from 'three';
import { M } from '../models';
import { terrainHeight } from '../terrain';
import { dotTexture } from '../textures';
import { bakedDecor, blocked, flatMaterial, rng, type Backdrop, type BackdropCtx } from './common';

const RING_R = 192;
const ROAD_W = 14;
const AVENUES = [0.35, 0.35 + Math.PI / 2, 0.35 + Math.PI, 0.35 + Math.PI * 1.5];

/** Distance from (x, z) to the nearest road center line. */
function roadDistance(x: number, z: number) {
  const r = Math.hypot(x, z);
  let d = Math.abs(r - RING_R);
  if (r > RING_R) {
    const a = Math.atan2(z, x);
    for (const av of AVENUES) {
      const da = Math.atan2(Math.sin(a - av), Math.cos(a - av));
      if (Math.abs(da) < Math.PI / 2) d = Math.min(d, Math.abs(Math.sin(da)) * r);
    }
  }
  return d;
}

/** A road ribbon following the terrain along a center line. */
function roadStrip(center: THREE.Vector3[], width: number, closed: boolean): THREE.BufferGeometry {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let along = 0;
  const n = center.length;
  for (let i = 0; i < n; i++) {
    const p = center[i];
    const next = center[(i + 1) % n];
    const prev = center[(i - 1 + n) % n];
    const dir = (closed || (i > 0 && i < n - 1) ? next.clone().sub(prev) : i === 0 ? next.clone().sub(p) : p.clone().sub(prev)).setY(0).normalize();
    const side = new THREE.Vector3(-dir.z, 0, dir.x);
    if (i > 0) along += p.distanceTo(center[i - 1]);
    for (const s of [-1, 1]) {
      const x = p.x + side.x * s * width * 0.5;
      const z = p.z + side.z * s * width * 0.5;
      pos.push(x, terrainHeight(x, z) + 0.12, z);
      uv.push(s < 0 ? 0 : 1, along / 12);
    }
    if (i < n - 1 || closed) {
      const a = i * 2;
      const b = ((i + 1) % n) * 2;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

function asphaltTexture(wet: boolean) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = wet ? '#2a2c31' : '#3a3c42';
  ctx.fillRect(0, 0, 64, 128);
  const rand = rng(5);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${rand() * 0.06})`;
    ctx.fillRect(rand() * 64, rand() * 128, 1, 1);
  }
  ctx.fillStyle = 'rgba(240,240,232,0.85)';
  ctx.fillRect(3, 0, 2, 128);
  ctx.fillRect(59, 0, 2, 128);
  ctx.fillStyle = 'rgba(255,214,90,0.9)';
  ctx.fillRect(30, 0, 4, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Instanced buildings whose windows light up after dark. */
function buildingMaterial(lights: number) {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, metalness: 0.05 });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.cityLights = { value: lights };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCity; varying vec3 vCityN; varying float vCityBase;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 cw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        vCity = cw.xyz; vCityN = normal;
        vCityBase = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).y;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float cityLights; varying vec3 vCity; varying vec3 vCityN; varying float vCityBase;\nfloat cityHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }')
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        {
          float vert = 1.0 - step(0.5, abs(vCityN.y));
          float u = abs(vCityN.x) > 0.5 ? vCity.z : vCity.x;
          vec2 cell = vec2(u / 3.2, (vCity.y - vCityBase) / 3.6);
          vec2 f = fract(cell);
          float win = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.82) * vert * step(1.0, cell.y);
          float h = cityHash(floor(cell) + floor(vCity.xz / 40.0) * 7.0 + vCityN.xz * 3.0);
          float lit = step(0.5, h);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.22, 0.28), win * 0.8);
          vec3 warm = mix(vec3(1.0, 0.78, 0.48), vec3(0.75, 0.88, 1.0), step(0.85, h));
          totalEmissiveRadiance += win * lit * warm * cityLights * 1.6;
        }`,
      );
  };
  return m;
}

const PALETTE = [0xc9c2b4, 0x8f9aa8, 0xb9775a, 0xd8d2c4, 0x6f7a88, 0xa7b4c2, 0xe0d6c0, 0x5a6270].map((c) => new THREE.Color(c));

/** Cars circling the ring road with head and tail lights. */
class Traffic {
  readonly group = new THREE.Group();
  private cars: { mesh: THREE.InstancedMesh; i: number; a: number; lane: number; speed: number }[] = [];
  private lights: THREE.Points;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private one = new THREE.Vector3(1, 1, 1);
  private up = new THREE.Vector3(0, 1, 0);
  constructor(count: number, lightsOn: number, snowy: boolean) {
    const rand = rng(61);
    const per = Math.ceil(count / 6);
    for (let v = 0; v < 6; v++) {
      const mesh = new THREE.InstancedMesh(bakedDecor('car', snowy, v), flatMaterial(), per);
      mesh.castShadow = true;
      mesh.frustumCulled = false;
      this.group.add(mesh);
      for (let i = 0; i < per; i++) {
        const lane = rand() < 0.5 ? -1 : 1;
        this.cars.push({ mesh, i, a: rand() * Math.PI * 2, lane, speed: 9 + rand() * 6 });
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.cars.length * 2 * 3), 3));
    const col = new Float32Array(this.cars.length * 2 * 3);
    for (let i = 0; i < this.cars.length; i++) col.set([1, 0.95, 0.8, 1, 0.15, 0.1], i * 6);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.lights = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 2.2, map: dotTexture(), vertexColors: true, transparent: true, opacity: lightsOn, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.lights.frustumCulled = false;
    this.lights.visible = lightsOn > 0.05;
    this.group.add(this.lights);
  }
  update(dt: number) {
    const lp = this.lights.geometry.attributes.position as THREE.BufferAttribute;
    this.cars.forEach((c, k) => {
      const r = RING_R + c.lane * 3.4;
      // Right-hand traffic: each lane drives its own way.
      c.a += ((c.speed * dt) / r) * c.lane;
      const x = Math.cos(c.a) * r;
      const z = Math.sin(c.a) * r;
      const y = terrainHeight(x, z) + 0.1;
      this.p.set(x, y, z);
      const heading = c.lane > 0 ? -c.a - Math.PI / 2 : -c.a + Math.PI / 2;
      this.q.setFromAxisAngle(this.up, heading);
      this.m.compose(this.p, this.q, this.one);
      c.mesh.setMatrixAt(c.i, this.m);
      const fx = Math.cos(heading);
      const fz = -Math.sin(heading);
      lp.setXYZ(k * 2, x + fx * 1.9, y + 0.75, z + fz * 1.9);
      lp.setXYZ(k * 2 + 1, x - fx * 1.9, y + 0.78, z - fz * 1.9);
    });
    for (const g of this.group.children) if (g instanceof THREE.InstancedMesh) g.instanceMatrix.needsUpdate = true;
    lp.needsUpdate = true;
  }
}

function crane(rand: () => number): THREE.Group {
  const g = new THREE.Group();
  const yellow = M.pastelYellow;
  const h = 70 + rand() * 30;
  const mast = new THREE.Mesh(new THREE.BoxGeometry(2.2, h, 2.2), yellow);
  mast.position.y = h / 2;
  g.add(mast);
  const top = new THREE.Group();
  top.name = 'jib';
  top.position.y = h;
  const jib = new THREE.Mesh(new THREE.BoxGeometry(48, 1.4, 1.4), yellow);
  jib.position.x = 18;
  const counter = new THREE.Mesh(new THREE.BoxGeometry(14, 1.6, 2), yellow);
  counter.position.x = -10;
  const weight = new THREE.Mesh(new THREE.BoxGeometry(4, 3, 2.6), M.concreteDark);
  weight.position.set(-15, -1.6, 0);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.6), M.white);
  cab.position.set(2, -1.6, 0);
  const peak = new THREE.Mesh(new THREE.ConeGeometry(1.4, 8, 4), yellow);
  peak.position.y = 4.5;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 26, 4), M.metal);
  cable.position.set(30, -13, 0);
  const hook = new THREE.Mesh(new THREE.BoxGeometry(5, 2, 2.5), M.lifeRed);
  hook.position.set(30, -27, 0);
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), M.taillight);
  beacon.position.set(42, 1, 0);
  top.add(jib, counter, weight, cab, peak, cable, hook, beacon);
  g.add(top);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

/** Downtown: a skyline ring with lit windows, roads, traffic, cranes and neon. */
export function city(ctx: BackdropCtx): Backdrop {
  const { detail, atm, cfg } = ctx;
  const snowy = cfg.weather === 'snow';
  const group = new THREE.Group();
  const lights = Math.min(1, { dawn: 0.35, day: 0, sunset: 0.55, night: 1 }[cfg.time] + atm.overcast * 0.45);
  const rand = rng(81);

  // ------------------------------------------------ skyline
  type B = { x: number; z: number; w: number; d: number; h: number };
  const list: B[] = [];
  const free = (x: number, z: number, w: number, d: number) =>
    roadDistance(x, z) > ROAD_W * 0.5 + Math.max(w, d) * 0.6 && !blocked(x, z, Math.max(w, d) * 0.75) && list.every((b) => Math.abs(b.x - x) > (b.w + w) / 2 + 3 || Math.abs(b.z - z) > (b.d + d) / 2 + 3);
  const place = (n: number, r0: number, r1: number, w: [number, number], h: [number, number], sector?: [number, number]) => {
    for (let k = 0, tries = 0; k < n && tries < n * 40; tries++) {
      const a = sector ? sector[0] + rand() * (sector[1] - sector[0]) : rand() * Math.PI * 2;
      const r = r0 + rand() * (r1 - r0);
      const x = Math.round((Math.cos(a) * r) / 4) * 4;
      const z = Math.round((Math.sin(a) * r) / 4) * 4;
      const bw = w[0] + rand() * (w[1] - w[0]);
      const bd = w[0] + rand() * (w[1] - w[0]);
      if (!free(x, z, bw, bd)) continue;
      // Taller toward downtown.
      const hh = h[0] + Math.pow(rand(), 1.6) * (h[1] - h[0]);
      list.push({ x, z, w: bw, d: bd, h: hh });
      k++;
    }
  };
  place(Math.round(30 * detail) + 10, 380, 640, [24, 40], [120, 260], [-Math.PI * 0.75, -Math.PI * 0.25]);
  place(Math.round(160 * detail) + 30, 210, 330, [10, 24], [12, 48]);
  place(Math.round(200 * detail) + 40, 330, 720, [18, 36], [35, 150]);

  const geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const bmat = buildingMaterial(lights);
  const buildings = new THREE.InstancedMesh(geo, bmat, list.length);
  buildings.castShadow = true;
  buildings.receiveShadow = true;
  const m = new THREE.Matrix4();
  const tint = new THREE.Color();
  list.forEach((b, i) => {
    const base = terrainHeight(b.x, b.z) - 1;
    m.makeScale(b.w, b.h + 1, b.d).setPosition(b.x, base, b.z);
    buildings.setMatrixAt(i, m);
    tint.copy(PALETTE[i % PALETTE.length]);
    if (snowy) tint.lerp(new THREE.Color(0xffffff), 0.15);
    buildings.setColorAt(i, tint);
  });
  group.add(buildings);

  // Roof caps, spires and red aircraft beacons on the tall ones.
  const capGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const caps = new THREE.InstancedMesh(capGeo, snowy ? M.snow : M.concreteDark, list.length);
  const beaconPos: number[] = [];
  list.forEach((b, i) => {
    const top = terrainHeight(b.x, b.z) - 1 + b.h + 1;
    const tall = b.h > 90;
    m.makeScale(b.w * (tall ? 0.6 : 0.9), tall ? 4 : 1, b.d * (tall ? 0.6 : 0.9)).setPosition(b.x, top, b.z);
    caps.setMatrixAt(i, m);
    if (tall) beaconPos.push(b.x, top + 4 + (b.h > 160 ? 14 : 2), b.z);
  });
  group.add(caps);
  const spires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.6, 1, 6).translate(0, 0.5, 0), M.steel, list.length);
  let sp = 0;
  list.forEach((b) => {
    if (b.h <= 160) return;
    m.makeScale(1, 14, 1).setPosition(b.x, terrainHeight(b.x, b.z) + b.h + 4, b.z);
    spires.setMatrixAt(sp++, m);
  });
  spires.count = sp;
  group.add(spires);
  const beaconGeo = new THREE.BufferGeometry();
  beaconGeo.setAttribute('position', new THREE.Float32BufferAttribute(beaconPos, 3));
  const beaconMat = new THREE.PointsMaterial({ color: 0xff3020, size: 5, map: dotTexture(), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  const beacons = new THREE.Points(beaconGeo, beaconMat);
  group.add(beacons);

  // Neon billboards on some low roofs.
  const boards = [0, 1, 2].map((v) => new THREE.InstancedMesh(bakedDecor('billboard', snowy, v), flatMaterial(), 12));
  const bc = [0, 0, 0];
  list.forEach((b, i) => {
    if (b.h > 50 || i % 4) return;
    const v = i % 3;
    if (bc[v] >= 12) return;
    const top = terrainHeight(b.x, b.z) + b.h;
    // Face the plaza.
    const yaw = Math.atan2(b.x, b.z) + Math.PI;
    m.makeRotationY(yaw).scale(new THREE.Vector3(1.8, 1.8, 1.8)).setPosition(b.x, top, b.z);
    boards[v].setMatrixAt(bc[v]++, m);
  });
  boards.forEach((b, v) => {
    b.count = bc[v];
    group.add(b);
  });

  // ------------------------------------------------ roads
  const roadMat = new THREE.MeshStandardMaterial({ map: asphaltTexture(atm.wet > 0), roughness: atm.wet > 0 ? 0.3 : 0.85, metalness: atm.wet > 0 ? 0.2 : 0 });
  const ringPts = Array.from({ length: 240 }, (_, i) => {
    const a = (i / 240) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R);
  });
  const road = new THREE.Mesh(roadStrip(ringPts, ROAD_W, true), roadMat);
  road.receiveShadow = true;
  group.add(road);
  for (const av of AVENUES) {
    const pts = Array.from({ length: 60 }, (_, i) => {
      const r = RING_R + ROAD_W * 0.5 + i * 9;
      return new THREE.Vector3(Math.cos(av) * r, 0, Math.sin(av) * r);
    });
    const ave = new THREE.Mesh(roadStrip(pts, ROAD_W, false), roadMat);
    ave.receiveShadow = true;
    group.add(ave);
  }

  // Streetlights along the ring road, with glowing heads after dark.
  const lampCount = Math.round(64 * Math.max(0.5, detail));
  const lamps = new THREE.InstancedMesh(bakedDecor('streetlight', snowy), flatMaterial(), lampCount);
  lamps.castShadow = true;
  const glowPos: number[] = [];
  for (let i = 0; i < lampCount; i++) {
    const a = (i / lampCount) * Math.PI * 2;
    const r = RING_R + ROAD_W * 0.5 + 1;
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const y = terrainHeight(x, z);
    // The arm (+z in the model) points at the road.
    m.makeRotationY(Math.atan2(-x, -z)).setPosition(x, y, z);
    lamps.setMatrixAt(i, m);
    glowPos.push(x - (x / r) * 1.5, y + 5.1, z - (z / r) * 1.5);
  }
  group.add(lamps);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(glowPos, 3));
  const glow = new THREE.Points(
    glowGeo,
    new THREE.PointsMaterial({ color: 0xffd8a0, size: 4, map: dotTexture(), transparent: true, opacity: lights, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
  glow.visible = lights > 0.05;
  group.add(glow);

  // Planters and lamps around the plaza.
  const planters = new THREE.InstancedMesh(bakedDecor('planter', snowy), flatMaterial(), Math.round(40 * detail) + 8);
  planters.castShadow = true;
  for (let i = 0; i < planters.count; i++) {
    let a = 0;
    let r = 0;
    for (let k = 0; k < 20; k++) {
      a = rand() * Math.PI * 2;
      r = 120 + rand() * 50;
      if (!blocked(Math.cos(a) * r, Math.sin(a) * r, 3)) break;
    }
    m.makeRotationY(rand() * 6).setPosition(Math.cos(a) * r, terrainHeight(Math.cos(a) * r, Math.sin(a) * r), Math.sin(a) * r);
    planters.setMatrixAt(i, m);
  }
  group.add(planters);

  const traffic = new Traffic(Math.round(48 * Math.max(0.5, detail)), lights, snowy);
  group.add(traffic.group);

  const cranes = [0, 1, 2].map(() => {
    const c = crane(rand);
    let a = 0;
    let r = 0;
    for (let k = 0; k < 20; k++) {
      a = -1.2 + rand() * 2.2;
      r = 250 + rand() * 120;
      if (!blocked(Math.cos(a) * r, Math.sin(a) * r, 46)) break;
    }
    c.position.set(Math.cos(a) * r, terrainHeight(Math.cos(a) * r, Math.sin(a) * r), Math.sin(a) * r);
    c.userData.speed = (rand() - 0.5) * 0.08;
    c.userData.phase = rand() * 6;
    group.add(c);
    return c;
  });

  return {
    group,
    ground: 'concrete',
    groundTint(x, z, out) {
      const r = Math.hypot(x, z);
      // Clean plaza inside the ring road, darker lots and grime beyond.
      const n = Math.sin(x * 0.07) * Math.cos(z * 0.05) * 0.06;
      const k = (r < RING_R - 10 ? 1.05 : 0.72) + n;
      out.setRGB(k, k, k * 1.02);
    },
    update(dt, _focus, time) {
      traffic.update(dt);
      beaconMat.opacity = Math.sin(time * 3) > 0.2 ? 1 : 0.15;
      for (const c of cranes) c.getObjectByName('jib')!.rotation.y = c.userData.phase + Math.sin(time * Math.abs(c.userData.speed) + c.userData.phase) * 1.2;
    },
  };
}
