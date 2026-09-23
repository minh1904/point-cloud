/**
 * The geometry a data-driven particle field is drawn from (P3.1).
 *
 * Up to P2 every particle was handed its position: the CPU computed 60,000
 * coordinates and uploaded them as the `position` attribute. From P3 the data
 * lives in textures instead (loaded from PNGs in P3.2-3.4, generated from a
 * photo in P6), and a particle is no longer *given* its place — it is given an
 * *address* and looks the place up itself.
 *
 * So the geometry carries almost nothing:
 *
 * - `positions` is all zeros. three.js still requires a `position` attribute —
 *   it takes the vertex count from `geometry.attributes.position.count` — but
 *   the vertex shader ignores its value. Because the real positions only exist
 *   on the GPU, the bounding sphere three.js derives from this attribute has
 *   radius 0, and the object must be drawn with `frustumCulled = false` or it
 *   disappears as soon as the camera looks away from the origin.
 * - `particleUv` is the address: where in the data texture this particle's
 *   texel sits.
 * - `index` is the identity: 0 … count-1, the particle's place in the queue.
 *   It becomes a noise seed in P4.2 and the reveal order in P5.5.
 */

/** Particles are stored in a square texture, so the count is always a square. */
export const DEFAULT_TEXTURE_SIZE = 256;

export interface ParticleGrid {
  /** Side of the square data texture, in texels. */
  size: number;
  /** One particle per texel: `size * size`. */
  count: number;
  /** `count * 3` zeros — a placeholder so three.js knows how many vertices. */
  positions: Float32Array;
  /** `count * 2` texel-centre coordinates in (0, 1). */
  particleUv: Float32Array;
  /** `count` identities, `0 … count - 1`. */
  index: Float32Array;
}

/**
 * Lays `size * size` particles out over a square texture, row by row: particle
 * `i` owns the texel at column `i % size`, row `floor(i / size)`.
 *
 * The `+ 0.5` is the part worth remembering. UV coordinates run 0 → 1 across
 * the whole texture, so texel `x` covers `[x / size, (x + 1) / size)`. Using
 * `x / size` aims at the *boundary* between two texels, where a rounding error
 * of one ulp — or any filtering — picks up the neighbour's data. `(x + 0.5) /
 * size` aims at the texel's centre, half a texel away from either edge, which
 * no rounding can cross.
 */
export function createParticleGrid(size: number = DEFAULT_TEXTURE_SIZE): ParticleGrid {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`texture size must be a positive integer, got ${size}`);
  }

  const count = size * size;
  const particleUv = new Float32Array(count * 2);
  const index = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = i % size;
    const y = Math.floor(i / size);

    particleUv[i * 2 + 0] = (x + 0.5) / size;
    particleUv[i * 2 + 1] = (y + 0.5) / size;
    index[i] = i;
  }

  return {
    size,
    count,
    positions: new Float32Array(count * 3),
    particleUv,
    index,
  };
}
