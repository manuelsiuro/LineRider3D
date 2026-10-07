/** Height of the snowy ground: flat play area rolling into hills far away. */
export function terrainHeight(x: number, z: number): number {
  const r = Math.hypot(x, z);
  if (r <= 160) return 0;
  const t = Math.min(1, (r - 160) / 160);
  const k = t * t * (3 - 2 * t);
  return (Math.sin(x * 0.02) * Math.cos(z * 0.025) * 8 + Math.sin(x * 0.051 + z * 0.037) * 4 + 6) * k;
}
