import * as THREE from 'three';
import type { Atmosphere } from '../atmosphere';

/**
 * Stylised animated water: wave normals, sky reflection with fresnel, a sun
 * (or moon) glitter path, and foam / turquoise shallows near the shore (read
 * from a height texture of the ground).
 */
export class Water {
  readonly mesh: THREE.Mesh;
  private uniforms: Record<string, THREE.IUniform>;

  constructor(
    geo: THREE.BufferGeometry,
    atm: Atmosphere,
    opts: { level: number; deep: number; shallow: number; waves?: number; foam?: number },
  ) {
    const sunDir = atm.sunOffset.clone().normalize();
    this.uniforms = THREE.UniformsUtils.merge([
      THREE.UniformsLib.fog,
      {
        time: { value: 0 },
        deep: { value: new THREE.Color(opts.deep) },
        shallow: { value: new THREE.Color(opts.shallow) },
        skyTop: { value: atm.skyMid.clone() },
        skyHorizon: { value: atm.skyHorizon.clone() },
        sunDir: { value: sunDir },
        sunColor: { value: atm.sunGlow.clone().multiplyScalar(atm.sunDisc * (atm.night > 0.5 ? 0.6 : 1)) },
        light: { value: Math.max(0.12, 1 - atm.night * 0.75) * (1 - atm.overcast * 0.35) },
        level: { value: opts.level },
        waves: { value: opts.waves ?? 1 },
        foamAmt: { value: opts.foam ?? 1 },
        heights: { value: null },
        extent: { value: 1400 },
        texel: { value: 1 / 141 },
      },
    ]);
    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      fog: true,
      vertexShader: `#include <fog_pars_vertex>
        varying vec3 vWorld;
        void main(){
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: `#include <fog_pars_fragment>
        uniform float time; uniform vec3 deep; uniform vec3 shallow; uniform vec3 skyTop; uniform vec3 skyHorizon;
        uniform vec3 sunDir; uniform vec3 sunColor; uniform float light; uniform float level; uniform float waves; uniform float foamAmt;
        uniform sampler2D heights; uniform float extent; uniform float texel;
        varying vec3 vWorld;
        float groundAt(vec2 p){
          vec2 uv = (p + extent * 0.5) / extent;
          if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return -40.0;
          uv = uv * (1.0 - texel) + texel * 0.5;
          return texture2D(heights, uv).r * 40.0 - 30.0;
        }
        vec2 waveGrad(vec2 p){
          vec2 g = vec2(0.0);
          g += vec2(0.8, 0.6) * cos(dot(p, vec2(0.8, 0.6)) * 0.35 + time * 1.3) * 0.35;
          g += vec2(-0.5, 0.9) * cos(dot(p, vec2(-0.5, 0.9)) * 0.6 + time * 1.7) * 0.22;
          g += vec2(0.95, -0.3) * cos(dot(p, vec2(0.95, -0.3)) * 1.4 + time * 2.3) * 0.12;
          g += vec2(0.2, 1.0) * cos(dot(p, vec2(0.2, 1.0)) * 3.1 + time * 3.1) * 0.06;
          return g * waves;
        }
        void main(){
          vec2 g = waveGrad(vWorld.xz);
          vec3 n = normalize(vec3(-g.x * 0.25, 1.0, -g.y * 0.25));
          vec3 v = normalize(cameraPosition - vWorld);
          float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
          float depth = level - groundAt(vWorld.xz);
          vec3 body = mix(shallow, deep, smoothstep(0.0, 3.5, depth) * 0.85) * light;
          vec3 sky = mix(skyHorizon, skyTop, clamp(reflect(-v, n).y * 2.0, 0.0, 1.0));
          vec3 col = mix(body, sky * mix(vec3(1.0), deep * 2.2 + 0.35, 0.5), 0.08 + fres * 0.42);
          vec3 h = normalize(sunDir + v);
          col += sunColor * pow(max(dot(n, h), 0.0), 320.0) * 2.5;
          // Foam: breaking waves along the shore, plus wave crests.
          float stripes = sin(depth * 6.0 - time * 2.2 + sin(vWorld.x * 0.08) * 2.0) * 0.5 + 0.5;
          float foam = (1.0 - smoothstep(0.0, 0.7, depth)) * (0.55 + 0.45 * stripes);
          foam += smoothstep(0.55, 0.62, g.x * 0.6 + g.y * 0.6) * 0.15;
          col = mix(col, vec3(0.95, 0.97, 1.0) * max(light, 0.25), clamp(foam * foamAmt, 0.0, 0.9));
          gl_FragColor = vec4(col, 1.0);
          #ifdef USE_FOG
            // Thinner haze over water so the sea reads to the horizon.
            float fogFactor = smoothstep(fogNear, fogFar * 1.8, vFogDepth);
            gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor * 0.85);
          #endif
        }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.position.y = opts.level;
    this.mesh.receiveShadow = false;
  }

  /** Ground heights on the ground grid (for shallows and foam). */
  setHeights(heights: Float32Array, segments: number, extent: number) {
    const n = segments + 1;
    const data = new Uint8Array(n * n * 4);
    for (let i = 0; i < n * n; i++) {
      const v = Math.max(0, Math.min(255, ((heights[i] + 30) / 40) * 255));
      data[i * 4] = v;
      data[i * 4 + 3] = 255;
    }
    const tex = new THREE.DataTexture(data, n, n);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    this.uniforms.heights.value?.dispose();
    this.uniforms.heights.value = tex;
    this.uniforms.extent.value = extent;
    this.uniforms.texel.value = 1 / n;
  }

  update(time: number) {
    this.uniforms.time.value = time;
  }
}
