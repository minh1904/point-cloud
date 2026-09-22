/**
 * Positions for `count` points spread uniformly through a solid sphere.
 *
 * Picking a random direction and a random radius r ∈ [0, R] is NOT uniform:
 * a shell at radius r has area ∝ r², so small radii would be overcrowded.
 * The volume inside radius r grows with r³, so sampling u ∈ [0, 1] and taking
 * r = R · ∛u gives every unit of volume the same chance. The direction comes
 * from θ uniform in [0, 2π) and cos φ uniform in [-1, 1] (uniform on the
 * sphere's surface; uniform φ would bunch points at the poles).
 *
 * Returns a flat [x0, y0, z0, x1, y1, z1, …] buffer, the layout a
 * BufferAttribute with itemSize 3 expects.
 */
export function createSphereField(
  count: number,
  radius: number,
  random: () => number = Math.random,
): Float32Array {
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    const r = radius * Math.cbrt(random());

    const sinPhi = Math.sin(phi);
    positions[i * 3 + 0] = r * sinPhi * Math.cos(theta);
    positions[i * 3 + 1] = r * sinPhi * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }

  return positions;
}

/**
 * One size multiplier per point, uniform in [min, max]. Identical dots read as
 * a grid; a spread of sizes reads as depth and texture.
 */
export function createScales(
  count: number,
  min = 0.5,
  max = 1,
  random: () => number = Math.random,
): Float32Array {
  const scales = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    scales[i] = min + (max - min) * random();
  }
  return scales;
}
