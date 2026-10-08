import * as THREE from 'three';
import { M } from '../models';
import { bakedDecor, flatMaterial, mounds, peaks, ring, scatter, type Backdrop, type BackdropCtx } from './common';

const rockColor = new THREE.Color(0x6e7c8c);
const snowColor = new THREE.Color(0xf6f9ff);

/** Tiny sparkles on the snow that twinkle around the camera focus. */
function glints(count: number) {
  const positions = new Float32Array(count * 3);
  const phase = new Float32Array(count);
  let seed = 13;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
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
    uniforms: { time: { value: 0 }, focus: { value: new THREE.Vector3() }, strength: { value: 1 } },
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
      uniform float strength; varying float vA;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float star = max(0.0, 1.0 - abs(c.x) * 12.0) + max(0.0, 1.0 - abs(c.y) * 12.0);
        star *= 1.0 - length(c) * 2.0;
        gl_FragColor = vec4(1.0, 1.0, 1.0, clamp(star, 0.0, 1.0) * vA * strength);
      }`,
  });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  return points;
}

/** The original winter landscape: snowy peaks, pine forest, drifts and glints. */
export function alpine(ctx: BackdropCtx): Backdrop {
  const group = new THREE.Group();
  group.add(
    peaks({
      count: 38,
      seed: 7,
      dist: [480, 740],
      height: [90, 260],
      radius: [70, 160],
      paint: (t, rand, out) => {
        // Per-peak snow line is approximated per vertex.
        out.copy(t > 0.3 + (rand() - 0.5) * 0.3 ? snowColor : rockColor);
      },
    }),
  );

  const forest = scatter(bakedDecor('pine', true), flatMaterial(), 900 * ctx.detail, 42, (rand) => {
    const [x, z, angle] = ring(rand, 70, 370, 0.7);
    const r = Math.hypot(x, z);
    // Clusters: skip some sectors for clearings.
    if (Math.sin(angle * 5 + r * 0.03) > 0.55) return null;
    const sc = 1.2 + rand() * 1.6;
    return { x, z, s: [sc, sc * (0.85 + rand() * 0.4), sc] };
  });
  group.add(forest);
  group.add(mounds(M.snow, 160 * ctx.detail, 21, [12, 162], [1.5, 5.5], [0.25, 0.85]));

  const sparkle = glints(Math.round(700 * ctx.detail));
  const sm = sparkle.material as THREE.ShaderMaterial;
  // Fewer sparkles in the dark or under clouds.
  sm.uniforms.strength.value = (1 - ctx.atm.night * 0.6) * (1 - ctx.atm.overcast * 0.7);
  group.add(sparkle);

  return {
    group,
    ground: 'snow',
    update(_dt, focus, time) {
      sm.uniforms.time.value = time;
      sm.uniforms.focus.value.copy(focus);
    },
  };
}
