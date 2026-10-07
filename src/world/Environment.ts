import * as THREE from 'three';
import { bakeGeometry, buildDecor, M } from './models';
import { terrainHeight } from './terrain';

/** Deterministic pseudo random generator so the landscape is stable. */
function rng(seed: number) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

const SKY_TOP = new THREE.Color(0x6fa8dc);
const SKY_HORIZON = new THREE.Color(0xe6f0fa);
const FOG = 0xdde9f5;
const SUN_OFFSET = new THREE.Vector3(-40, 70, 50);

/** Smooth value noise in [0,1], tileable over `period`. */
function valueNoise(size: number, period: number, seed: number): Float32Array {
  const rand = rng(seed);
  const grid = Array.from({ length: period * period }, () => rand());
  const at = (x: number, y: number) => grid[((y % period) + period) % period * period + (((x % period) + period) % period)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const ix = Math.floor(fx);
      const iy = Math.floor(fy);
      const tx = fx - ix;
      const ty = fy - iy;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const a = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const b = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      out[y * size + x] = a + (b - a) * sy;
    }
  return out;
}

/** Normal map of soft wind-blown snow ripples. */
function snowNormalMap(): THREE.DataTexture {
  const size = 256;
  const n1 = valueNoise(size, 8, 5);
  const n2 = valueNoise(size, 32, 9);
  const h = (x: number, y: number) => {
    const i = ((y + size) % size) * size + ((x + size) % size);
    return n1[i] * 0.8 + n2[i] * 0.35;
  };
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 3;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 3;
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * size + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const tex = new THREE.DataTexture(data, size, size);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.needsUpdate = true;
  return tex;
}

export class Environment {
  readonly sun: THREE.DirectionalLight;
  private snow: THREE.Points;
  private snowVel: Float32Array;
  private readonly snowBox = 70;
  private clouds: THREE.Group;
  private glints: THREE.Points;

  constructor(scene: THREE.Scene, private lowPower: boolean) {
    scene.background = new THREE.Color(FOG);
    scene.fog = new THREE.Fog(FOG, 110, 520);

    scene.add(this.buildSky());

    const hemi = new THREE.HemisphereLight(0xdcecff, 0xa9bcd6, 1.15);
    scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
    this.sun.position.copy(SUN_OFFSET);
    this.sun.castShadow = true;
    const size = lowPower ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const c = this.sun.shadow.camera;
    c.left = c.bottom = -45;
    c.right = c.top = 45;
    c.near = 1;
    c.far = 220;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun, this.sun.target);

    scene.add(this.buildGround());
    scene.add(this.buildMountains());
    scene.add(this.buildForest());
    scene.add(this.buildMounds());
    this.clouds = this.buildClouds();
    scene.add(this.clouds);
    this.glints = this.buildGlints();
    scene.add(this.glints);

    const flakes = lowPower ? 1200 : 3000;
    this.snowVel = new Float32Array(flakes);
    this.snow = this.buildSnowfall(flakes);
    scene.add(this.snow);
  }

  /** Bakes the sky into an environment map for soft reflections. */
  bakeEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
    const envScene = new THREE.Scene();
    envScene.add(this.buildSky());
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.4;
    pmrem.dispose();
  }

  private buildSky() {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: SKY_TOP },
        horizon: { value: SKY_HORIZON },
        sunDir: { value: SUN_OFFSET.clone().normalize() },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 sunDir; varying vec3 vPos;
        void main(){
          vec3 d = normalize(vPos);
          vec3 col = mix(horizon, top, smoothstep(0.0, 0.5, d.y));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0, 0.93, 0.8) * (pow(s, 900.0) * 1.5 + pow(s, 40.0) * 0.25 + pow(s, 6.0) * 0.08);
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    return sky;
  }

  /** Flat play area that rolls into gentle hills further away. */
  private buildGround() {
    const geo = new THREE.PlaneGeometry(1400, 1400, 140, 140);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)));
    }
    geo.computeVertexNormals();
    const normalMap = snowNormalMap();
    normalMap.repeat.set(180, 180);
    const material = new THREE.MeshStandardMaterial({
      color: 0xf3f7fd,
      roughness: 0.92,
      normalMap,
      normalScale: new THREE.Vector2(0.55, 0.55),
    });
    const ground = new THREE.Mesh(geo, material);
    ground.receiveShadow = true;
    ground.name = 'ground';
    return ground;
  }

  private buildMountains() {
    const group = new THREE.Group();
    const rand = rng(7);
    const rockColor = new THREE.Color(0x6e7c8c);
    const snowColor = new THREE.Color(0xf6f9ff);
    for (let i = 0; i < 38; i++) {
      const angle = (i / 38) * Math.PI * 2 + rand() * 0.1;
      const dist = 480 + rand() * 260;
      const height = 90 + rand() * 170;
      const radius = 70 + rand() * 90;
      const geo = new THREE.ConeGeometry(radius, height, 9, 6);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const colors = new Float32Array(pos.count * 3);
      const snowLine = 0.15 + rand() * 0.25;
      for (let v = 0; v < pos.count; v++) {
        const y = pos.getY(v);
        const t = (y + height / 2) / height;
        if (t > 0.02 && t < 0.98) {
          const n = 1 + (rand() - 0.5) * 0.25;
          pos.setX(v, pos.getX(v) * n);
          pos.setZ(v, pos.getZ(v) * n);
          pos.setY(v, y + (rand() - 0.5) * height * 0.05);
        }
        const c = t > snowLine + (rand() - 0.5) * 0.12 ? snowColor : rockColor;
        colors.set([c.r, c.g, c.b], v * 3);
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }));
      m.position.set(Math.cos(angle) * dist, height / 2 - 5, Math.sin(angle) * dist);
      m.rotation.y = rand() * Math.PI;
      group.add(m);
    }
    return group;
  }

  /** Instanced background forest around the play area. */
  private buildForest() {
    const geo = bakeGeometry(buildDecor('pine'));
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 });
    const count = this.lowPower ? 450 : 900;
    const forest = new THREE.InstancedMesh(geo, material, count);
    forest.castShadow = true;
    forest.receiveShadow = true;
    const rand = rng(42);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    let placed = 0;
    while (placed < count) {
      const angle = rand() * Math.PI * 2;
      const r = 70 + Math.pow(rand(), 0.7) * 300;
      // Clusters: skip some sectors for clearings.
      if (Math.sin(angle * 5 + r * 0.03) > 0.55) continue;
      p.set(Math.cos(angle) * r, 0, Math.sin(angle) * r);
      p.y = terrainHeight(p.x, p.z) - 0.2;
      const sc = 1.2 + rand() * 1.6;
      s.set(sc, sc * (0.85 + rand() * 0.4), sc);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      m.compose(p, q, s);
      forest.setMatrixAt(placed++, m);
    }
    return forest;
  }

  /** Soft snow drifts scattered around the play area. */
  private buildMounds() {
    const geo = new THREE.IcosahedronGeometry(1, 2);
    const count = this.lowPower ? 80 : 160;
    const mounds = new THREE.InstancedMesh(geo, M.snow, count);
    mounds.receiveShadow = true;
    const rand = rng(21);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (let i = 0; i < count; i++) {
      const angle = rand() * Math.PI * 2;
      const r = 12 + rand() * 150;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const w = 1.5 + rand() * 4;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI);
      m.compose(new THREE.Vector3(x, terrainHeight(x, z) - 0.15, z), q, new THREE.Vector3(w, 0.25 + rand() * 0.6, w * (0.5 + rand() * 0.5)));
      mounds.setMatrixAt(i, m);
    }
    return mounds;
  }

  /** Puffy low-poly clouds drifting high above. */
  private buildClouds() {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xc8d8ec,
      emissiveIntensity: 0.35,
      flatShading: true,
      roughness: 1,
      fog: false,
      transparent: true,
      opacity: 0.95,
    });
    const rand = rng(77);
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const puffs = 4 + Math.floor(rand() * 4);
      for (let k = 0; k < puffs; k++) {
        const r = 8 + rand() * 10;
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), material);
        puff.position.set((k - puffs / 2) * 11 + rand() * 6, rand() * 6 - (Math.abs(k - puffs / 2) * 2), rand() * 10 - 5);
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      const angle = rand() * Math.PI * 2;
      const dist = 250 + rand() * 350;
      cloud.position.set(Math.cos(angle) * dist, 110 + rand() * 90, Math.sin(angle) * dist);
      cloud.rotation.y = rand() * Math.PI;
      group.add(cloud);
    }
    return group;
  }

  /** Tiny sparkles on the snow that twinkle around the camera focus. */
  private buildGlints() {
    const count = this.lowPower ? 300 : 700;
    const positions = new Float32Array(count * 3);
    const phase = new Float32Array(count);
    const rand = rng(13);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * 80;
      positions[i * 3 + 2] = (rand() - 0.5) * 80;
      phase[i] = rand() * 100;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, focus: { value: new THREE.Vector3() } },
      vertexShader: `
        attribute float phase; uniform float time; uniform vec3 focus; varying float vA;
        void main() {
          // Wrap the sparkle field around the focus point.
          vec3 p = position;
          p.xz = focus.xz + mod(p.xz - focus.xz + 40.0, 80.0) - 40.0;
          p.y = 0.03;
          float t = sin(time * 2.0 + phase) * 0.5 + 0.5;
          vA = pow(t, 12.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = 40.0 * vA / -mv.z;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float star = max(0.0, 1.0 - abs(c.x) * 12.0) + max(0.0, 1.0 - abs(c.y) * 12.0);
          star *= 1.0 - length(c) * 2.0;
          gl_FragColor = vec4(1.0, 1.0, 1.0, clamp(star, 0.0, 1.0) * vA);
        }`,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    return points;
  }

  private buildSnowfall(count: number) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 32;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.5, 'rgba(255,255,255,0.7)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 32, 32);
    const tex = new THREE.CanvasTexture(canvas);

    const positions = new Float32Array(count * 3);
    const rand = rng(3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (rand() - 0.5) * this.snowBox * 2;
      positions[i * 3 + 1] = rand() * this.snowBox;
      positions[i * 3 + 2] = (rand() - 0.5) * this.snowBox * 2;
      this.snowVel[i] = 1.5 + rand() * 2;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.35, map: tex, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    points.frustumCulled = false;
    return points;
  }

  /** Keeps snow and the shadow camera centered on what the player looks at. */
  update(dt: number, focus: THREE.Vector3, time: number) {
    const pos = this.snow.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const b = this.snowBox;
    for (let i = 0; i < this.snowVel.length; i++) {
      const o = i * 3;
      arr[o] += Math.sin(time * 0.7 + i) * 0.3 * dt;
      arr[o + 1] -= this.snowVel[i] * dt;
      // Wrap around the focus point.
      const dx = arr[o] - focus.x;
      const dy = arr[o + 1] - focus.y;
      const dz = arr[o + 2] - focus.z;
      if (dx < -b) arr[o] += 2 * b;
      else if (dx > b) arr[o] -= 2 * b;
      if (dy < -b * 0.5) arr[o + 1] += b;
      else if (dy > b * 0.5) arr[o + 1] -= b;
      if (dz < -b) arr[o + 2] += 2 * b;
      else if (dz > b) arr[o + 2] -= 2 * b;
    }
    pos.needsUpdate = true;

    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(SUN_OFFSET);
    this.clouds.rotation.y = time * 0.004;
    const gm = this.glints.material as THREE.ShaderMaterial;
    gm.uniforms.time.value = time;
    gm.uniforms.focus.value.copy(focus);
  }
}
