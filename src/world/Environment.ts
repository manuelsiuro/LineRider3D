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

export class Environment {
  readonly sun: THREE.DirectionalLight;
  private snow: THREE.Points;
  private snowVel: Float32Array;
  private readonly snowBox = 70;

  constructor(scene: THREE.Scene, private lowPower: boolean) {
    scene.background = new THREE.Color(FOG);
    scene.fog = new THREE.Fog(FOG, 80, 420);

    scene.add(this.buildSky());

    const hemi = new THREE.HemisphereLight(0xdfefff, 0xb8c6d8, 1.6);
    scene.add(hemi);

    this.sun = new THREE.DirectionalLight(0xfff3e0, 2.2);
    this.sun.position.set(-40, 70, 50);
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

    const flakes = lowPower ? 1200 : 3000;
    this.snowVel = new Float32Array(flakes);
    this.snow = this.buildSnowfall(flakes);
    scene.add(this.snow);
  }

  private buildSky() {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vPos;
        void main(){ float h = normalize(vPos).y; gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.5, h)), 1.0); }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1;
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
    const ground = new THREE.Mesh(geo, M.snow);
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
    this.sun.position.copy(focus).add(new THREE.Vector3(-40, 70, 50));
  }
}
