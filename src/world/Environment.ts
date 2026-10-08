import * as THREE from 'three';
import { resolveAtmosphere, type Atmosphere } from './atmosphere';
import { alpine } from './backdrops/alpine';
import { beach } from './backdrops/beach';
import { city } from './backdrops/city';
import { disposeTree, rng, setKeepOut, type Backdrop, type BackdropCtx } from './backdrops/common';
import { desert } from './backdrops/desert';
import { forest } from './backdrops/forest';
import { halloween } from './backdrops/halloween';
import { terrainHeight } from './terrain';
import { groundTextures } from './textures';
import { Weather } from './Weather';
import { DEFAULT_WORLD, normalizeWorld, sameWorld, type BiomeId, type WorldConfig } from './worlds';

const BACKDROPS: Record<BiomeId, (ctx: BackdropCtx) => Backdrop> = { alpine, forest, beach, desert, city, halloween };

export type Detail = 'low' | 'medium' | 'high';
const DETAIL: Record<Detail, number> = { low: 0.35, medium: 0.6, high: 1 };

const GROUND_SIZE = 1400;
const GROUND_SEGMENTS = 140;

/**
 * The world around the track: sky, sun, fog, ground, landscape and weather.
 * Everything but the sky dome and lights is rebuilt when the world changes.
 */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  /** The ground mesh (kept across worlds: the editor raycasts it). */
  readonly ground: THREE.Mesh;
  readonly weather = new Weather();
  config: WorldConfig = { ...DEFAULT_WORLD };
  atm: Atmosphere = resolveAtmosphere(DEFAULT_WORLD);
  private sky: THREE.Mesh;
  private skyUniforms: Record<string, THREE.IUniform>;
  private envScene = new THREE.Scene();
  private clouds: THREE.Group;
  private cloudMat: THREE.MeshStandardMaterial;
  private backdrop: Backdrop | null = null;
  private detail: Detail;
  private sunOffset = new THREE.Vector3();
  private hemiBase = 1;
  private skyBase = { top: new THREE.Color(), mid: new THREE.Color(), horizon: new THREE.Color() };
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;

  constructor(
    private scene: THREE.Scene,
    private renderer: THREE.WebGLRenderer,
    lowPower: boolean,
  ) {
    this.detail = lowPower ? 'medium' : 'high';
    this.pmrem = new THREE.PMREMGenerator(renderer);
    scene.fog = new THREE.Fog(0xffffff, 110, 520);
    scene.background = new THREE.Color();

    this.sky = this.buildSky();
    this.skyUniforms = (this.sky.material as THREE.ShaderMaterial).uniforms;
    scene.add(this.sky);
    // The environment map is baked from the same sky.
    this.envScene.add(new THREE.Mesh(this.sky.geometry, this.sky.material));

    this.hemi = new THREE.HemisphereLight(0xc4dcff, 0xd8c2c0, 1.05);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight(0xffd8a8, 2.7);
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

    this.ground = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    scene.add(this.ground);

    this.cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      emissive: 0xc8d8ec,
      emissiveIntensity: 0.35,
      flatShading: true,
      roughness: 1,
      fog: false,
      transparent: true,
      opacity: 0.95,
    });
    this.clouds = this.buildClouds();
    scene.add(this.clouds);
    scene.add(this.weather.group);

    // The landscape is built by the first setWorld (with the track's footprint).
    this.apply(false);
  }

  private footprintSig = '';
  private weatherFocus = new THREE.Vector3();

  /**
   * Switches to another world; returns false if nothing changed. `footprint`
   * (points along the track) keeps scenery off the track.
   */
  setWorld(w: Partial<WorldConfig>, footprint?: { x: number; z: number }[], force = false): boolean {
    const cfg = normalizeWorld(w);
    let moved = false;
    if (footprint) {
      let sx = 0;
      for (const p of footprint) sx += p.x * 1.3 + p.z * 0.7;
      const sig = `${footprint.length}:${sx.toFixed(1)}`;
      moved = sig !== this.footprintSig;
      if (moved) {
        this.footprintSig = sig;
        setKeepOut(footprint);
      }
    }
    if (!force && !moved && sameWorld(cfg, this.config)) return false;
    this.config = cfg;
    this.apply(true);
    return true;
  }

  /** Landscape density and particle counts, used from the next world switch (never mid-ride). */
  setDetail(d: Detail) {
    this.detail = d;
  }

  /** Shadow quality: 0 = off, otherwise the shadow map size. */
  setShadows(size: number) {
    this.sun.castShadow = size > 0;
    if (size > 0 && this.sun.shadow.mapSize.x !== size) {
      this.sun.shadow.mapSize.set(size, size);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null;
    }
  }

  private apply(rebuild: boolean) {
    const atm = (this.atm = resolveAtmosphere(this.config));
    const scene = this.scene;
    const fog = scene.fog as THREE.Fog;
    fog.color.copy(atm.fog);
    fog.near = atm.fogNear;
    fog.far = atm.fogFar;
    (scene.background as THREE.Color).copy(atm.fog);
    this.renderer.toneMappingExposure = atm.exposure;

    const u = this.skyUniforms;
    this.skyBase.top.copy(atm.skyTop);
    this.skyBase.mid.copy(atm.skyMid);
    this.skyBase.horizon.copy(atm.skyHorizon);
    u.top.value.copy(atm.skyTop);
    u.mid.value.copy(atm.skyMid);
    u.horizon.value.copy(atm.skyHorizon);
    u.fogCol.value.copy(atm.fog);
    u.sunDir.value.copy(atm.sunOffset).normalize();
    u.sunGlow.value.copy(atm.sunGlow);
    u.sunDisc.value = atm.sunDisc;
    u.moonCol.value.copy(atm.moon);
    u.moonSize.value = atm.moonSize;
    u.night.value = atm.night;
    u.overcast.value = atm.overcast;

    this.hemi.color.copy(atm.hemiSky);
    this.hemi.groundColor.copy(atm.hemiGround);
    this.hemi.intensity = this.hemiBase = atm.hemiIntensity;
    this.sun.color.copy(atm.sunColor);
    this.sun.intensity = atm.sunIntensity;
    this.sunOffset.copy(atm.sunOffset).setLength(95);

    // Clouds: white puffs by day, heavy grey decks when overcast.
    this.cloudMat.color.copy(atm.cloudColor).lerp(new THREE.Color(0xffffff), Math.max(0, 1 - atm.overcast * 1.1 - atm.night * 0.8));
    this.cloudMat.emissive.copy(atm.cloudColor);
    this.cloudMat.emissiveIntensity = 0.35 * (1 - atm.overcast * 0.5);
    this.cloudMat.opacity = 0.95;
    this.clouds.children.forEach((cl, i) => {
      // Fewer clouds on clear nights, a low deck under storms.
      cl.visible = (atm.overcast > 0.3 || i % (atm.night > 0.5 ? 3 : 1) === 0) && atm.fogFar > 200;
      const s = 1 + atm.overcast * 1.4;
      cl.scale.set(s, 1 + atm.overcast * 0.8, s);
      cl.position.y = cl.userData.baseY * (1 - atm.overcast * 0.45);
    });

    if (rebuild) {
      this.buildBackdrop();
      this.weather.set(atm, DETAIL[this.detail]);
    }
    this.bake();
  }

  private buildBackdrop() {
    if (this.backdrop) {
      this.scene.remove(this.backdrop.group);
      disposeTree(this.backdrop.group);
    }
    const ctx: BackdropCtx = { cfg: this.config, atm: this.atm, detail: DETAIL[this.detail] };
    this.backdrop = BACKDROPS[this.config.biome](ctx);
    this.scene.add(this.backdrop.group);
    this.buildGround(this.backdrop);
  }

  /** Visual ground height (physics only knows `terrainHeight`). */
  groundHeight(x: number, z: number) {
    return terrainHeight(x, z) + (this.backdrop?.farShape?.(x, z) ?? 0);
  }

  private buildGround(b: Backdrop) {
    const geo = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, GROUND_SEGMENTS, GROUND_SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const heights = new Float32Array(pos.count);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const h = this.groundHeight(x, z);
      pos.setY(i, h);
      heights[i] = h;
      c.setRGB(1, 1, 1);
      b.groundTint?.(x, z, c);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    this.ground.geometry.dispose();
    this.ground.geometry = geo;

    const kind = this.config.weather === 'snow' && b.ground !== 'snow' ? 'snow' : b.ground;
    const t = groundTextures(kind);
    for (const tex of [t.map, t.normal]) {
      if (!tex) continue;
      tex.userData.shared = true;
      tex.repeat.set(180, 180);
    }
    const wet = kind === 'snow' ? 0 : this.atm.wet;
    const old = this.ground.material as THREE.Material;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(t.color).multiplyScalar(1 - wet * 0.28),
      roughness: t.roughness - wet * 0.55,
      metalness: wet * 0.05,
      map: t.map,
      normalMap: t.normal,
      normalScale: new THREE.Vector2(t.normalScale, t.normalScale),
      vertexColors: true,
    });
    this.ground.material = material;
    old.dispose();
    b.onGround?.(heights, GROUND_SEGMENTS, GROUND_SIZE);
  }

  /** Bakes the sky into an environment map for soft reflections. */
  private bake() {
    const target = this.pmrem.fromScene(this.envScene, 0.02);
    this.scene.environment = target.texture;
    this.scene.environmentIntensity = this.atm.envIntensity;
    this.envTarget?.dispose();
    this.envTarget = target;
  }

  private buildSky() {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color() },
        mid: { value: new THREE.Color() },
        horizon: { value: new THREE.Color() },
        fogCol: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) },
        sunGlow: { value: new THREE.Color() },
        sunDisc: { value: 1 },
        moonCol: { value: new THREE.Color(0.92, 0.94, 1.0) },
        moonSize: { value: 1 },
        night: { value: 0 },
        overcast: { value: 0 },
        time: { value: 0 },
      },
      vertexShader: `varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 horizon; uniform vec3 fogCol; uniform vec3 sunDir; uniform vec3 sunGlow; uniform vec3 moonCol; uniform float moonSize;
        uniform float sunDisc; uniform float night; uniform float overcast; uniform float time; varying vec3 vPos;
        float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        void main(){
          vec3 d = normalize(vPos);
          float s = max(dot(d, sunDir), 0.0);
          // Horizon glows warmer toward the sun.
          vec3 hor = mix(horizon, sunGlow * vec3(1.0, 0.9, 0.89), pow(s, 3.0) * 0.6 * sunDisc * (1.0 - night * 0.8));
          vec3 col = mix(hor, mid, smoothstep(0.0, 0.18, d.y));
          col = mix(col, top, smoothstep(0.15, 0.7, d.y));
          col = mix(fogCol, col, smoothstep(-0.08, 0.02, d.y));
          if (night > 0.0) {
            // Stars, twinkling, fading toward the horizon and under clouds.
            vec3 g = d * 260.0;
            vec3 cell = floor(g);
            float h = hash(cell);
            float round = smoothstep(0.42, 0.05, length(fract(g) - 0.5));
            float star = step(0.9965, h) * round * (0.6 + 0.4 * sin(time * 2.0 + h * 400.0)) * 1.6;
            col += vec3(0.9, 0.95, 1.0) * star * smoothstep(0.05, 0.35, d.y) * night * (1.0 - overcast);
            // Moon: crisp disc with soft maria and a pale halo.
            float m = smoothstep(1.0 - 0.00065 * moonSize, 1.0 - 0.00045 * moonSize, s);
            float maria = 0.85 + 0.15 * sin(d.x * 900.0) * sin(d.z * 800.0);
            col = mix(col, moonCol * maria * 1.3, m * sunDisc);
            col += moonCol * pow(s, 900.0 / moonSize) * 0.35 * (moonSize - 1.0) * sunDisc;
            col += sunGlow * pow(s, 200.0) * 0.25 * sunDisc * night;
          } else {
            // Sun disc, halo and wide glow.
            col += sunGlow * (pow(s, 1400.0) * 3.0 + pow(s, 60.0) * 0.35 + pow(s, 8.0) * 0.16) * sunDisc;
          }
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    const sky = new THREE.Mesh(geo, mat);
    sky.renderOrder = -1;
    sky.frustumCulled = false;
    return sky;
  }

  /** Puffy low-poly clouds drifting high above. */
  private buildClouds() {
    const group = new THREE.Group();
    const rand = rng(77);
    for (let i = 0; i < 16; i++) {
      const cloud = new THREE.Group();
      const puffs = 4 + Math.floor(rand() * 4);
      for (let k = 0; k < puffs; k++) {
        const r = 8 + rand() * 10;
        const puff = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), this.cloudMat);
        puff.position.set((k - puffs / 2) * 11 + rand() * 6, rand() * 6 - Math.abs(k - puffs / 2) * 2, rand() * 10 - 5);
        puff.scale.y = 0.6;
        cloud.add(puff);
      }
      const angle = rand() * Math.PI * 2;
      const dist = 250 + rand() * 350;
      cloud.position.set(Math.cos(angle) * dist, 110 + rand() * 90, Math.sin(angle) * dist);
      cloud.userData.baseY = cloud.position.y;
      cloud.rotation.y = rand() * Math.PI;
      group.add(cloud);
    }
    return group;
  }

  /** Keeps weather and the shadow camera centered on what the player looks at. */
  update(dt: number, focus: THREE.Vector3, time: number, eye: THREE.Vector3 = focus) {
    // Precipitation surrounds the camera, between it and what it looks at.
    this.weatherFocus.lerpVectors(eye, focus, 0.35);
    this.weather.update(dt, this.weatherFocus, time);
    this.backdrop?.update?.(dt, focus, time);
    this.sun.target.position.copy(focus);
    this.sun.position.copy(focus).add(this.sunOffset);
    this.clouds.rotation.y = time * 0.004;
    this.skyUniforms.time.value = time;
    // Lightning lights up the sky and the landscape.
    const f = this.weather.flash;
    if (f > 0 || this.hemi.intensity !== this.hemiBase) {
      this.hemi.intensity = this.hemiBase + f * 2.2;
      const u = this.skyUniforms;
      u.top.value.copy(this.skyBase.top).lerp(WHITE, f * 0.35);
      u.mid.value.copy(this.skyBase.mid).lerp(WHITE, f * 0.45);
      u.horizon.value.copy(this.skyBase.horizon).lerp(WHITE, f * 0.4);
    }
  }
}

const WHITE = new THREE.Color(0xdfe6ff);
