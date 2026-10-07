import * as THREE from 'three';

const N = 48;

/**
 * Glowing ribbon trailing behind the sled at speed. Each frame pushes the
 * sled's position; older samples fade out.
 */
export class Trail {
  private mesh: THREE.Mesh;
  private samples: { p: THREE.Vector3; side: THREE.Vector3 }[] = [];
  private positions = new Float32Array(N * 2 * 3);
  private alphas = new Float32Array(N * 2);

  constructor(scene: THREE.Scene) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    const index: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    geo.setIndex(index);
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(vec3(0.75, 0.9, 1.0) * vA, vA); }`,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  reset() {
    this.samples.length = 0;
    this.alphas.fill(0);
    this.mesh.geometry.attributes.alpha.needsUpdate = true;
  }

  /** `speed` in units/second controls the trail's intensity. */
  push(p: THREE.Vector3, side: THREE.Vector3, speed: number) {
    const last = this.samples[0];
    if (last && last.p.distanceToSquared(p) < 0.01) return;
    if (last && last.p.distanceToSquared(p) > 25) this.samples.length = 0; // teleport (seek)
    this.samples.unshift({ p: p.clone(), side: side.clone() });
    if (this.samples.length > N) this.samples.pop();
    const intensity = THREE.MathUtils.clamp((speed - 12) / 18, 0, 1) * 0.55;
    for (let i = 0; i < N; i++) {
      const s = this.samples[Math.min(i, this.samples.length - 1)];
      const t = i / (N - 1);
      const w = 0.28 * (1 - t);
      for (let k = 0; k < 2; k++) {
        const o = (i * 2 + k) * 3;
        const sign = k === 0 ? -1 : 1;
        this.positions[o] = s.p.x + s.side.x * w * sign;
        this.positions[o + 1] = s.p.y + s.side.y * w * sign;
        this.positions[o + 2] = s.p.z + s.side.z * w * sign;
        this.alphas[i * 2 + k] = i < this.samples.length ? intensity * (1 - t) * (1 - t) : 0;
      }
    }
    const geo = this.mesh.geometry;
    geo.attributes.position.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;
  }
}
