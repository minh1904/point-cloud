/**
 * Packing particle positions into two 8-bit PNGs, and reading them back (P3.3).
 *
 * A PNG channel holds 8 bits — 256 levels. Spread over a field three world
 * units wide that is a step of 0.0118 units, which is exactly the spacing of
 * the 256² grid: every particle would snap onto a lattice. That is survivable
 * while the particles *are* a lattice, but P6.5 places them by importance
 * sampling, dense on the subject and sparse on the background, at arbitrary
 * coordinates. Rounding those back onto a lattice would throw away the one
 * thing that makes the result look good.
 *
 * So one value is split across two files: the high byte in `position_h.png`
 * and the low byte in `position_l.png`, giving 16 bits and 65,536 levels — a
 * step of 0.000046 units, some 250× finer than the grid spacing.
 *
 * The obvious alternative is a float texture, and it is the right answer once
 * the data is generated in the browser (P6.8 does exactly that). It is the
 * wrong answer for data shipped as files: floats are four bytes per channel
 * and do not compress, and above all they are not a PNG. The whole ~600 KB
 * budget for 65k particles rests on PNG's compression. Splitting hi/lo is not
 * a clever trick — it is the price of getting numbers through an image file.
 */

/** Axis-aligned range the normalised values are mapped back onto (P3.4). */
export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** Largest value 16 bits can hold — the divisor, not 65536. See `decode`. */
export const MAX_16_BIT = 65535;

/**
 * Smallest and largest coordinate on each axis.
 *
 * Storing these per bundle is what makes the format compact *and* precise: all
 * 65,536 levels are spent on the range the data actually occupies instead of
 * on empty space around it. An axis with no extent at all (every particle on
 * the same plane) would divide by zero on decode, so it is widened by a hair.
 */
export function computeBounds(positions: Float32Array): Bounds {
  if (positions.length === 0 || positions.length % 3 !== 0) {
    throw new RangeError(`positions must be a non-empty multiple of 3, got ${positions.length}`);
  }

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];

  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    const value = positions[i]!;
    if (value < min[axis]!) min[axis] = value;
    if (value > max[axis]!) max[axis] = value;
  }

  for (let axis = 0; axis < 3; axis++) {
    if (max[axis]! - min[axis]! < Number.EPSILON) {
      min[axis] -= 0.5;
      max[axis] += 0.5;
    }
  }

  return { min, max };
}

/** Normalise to 0…1 within `bounds`, clamping anything that falls outside. */
function normalise(value: number, min: number, max: number): number {
  const t = (value - min) / (max - min);
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Quantise world positions to 16 bits and split them across two RGB buffers.
 *
 * Returns raw bytes ready to become the RGB channels of two PNGs: channel 0 is
 * x, 1 is y, 2 is z. Alpha is not written at all — the PNGs are 24-bit RGB, so
 * there is no alpha channel for an encoder to premultiply and corrupt.
 */
export function encodePositions(
  positions: Float32Array,
  bounds: Bounds,
): { high: Uint8Array; low: Uint8Array } {
  if (positions.length % 3 !== 0) {
    throw new RangeError(`positions must be a multiple of 3, got ${positions.length}`);
  }

  const high = new Uint8Array(positions.length);
  const low = new Uint8Array(positions.length);

  for (let i = 0; i < positions.length; i++) {
    const axis = i % 3;
    const t = normalise(positions[i]!, bounds.min[axis]!, bounds.max[axis]!);

    // Round rather than truncate: truncation biases every coordinate toward
    // the low end by half a step, which over 65,536 particles is a visible
    // shift of the whole cloud.
    const quantised = Math.round(t * MAX_16_BIT);

    high[i] = quantised >> 8;
    low[i] = quantised & 0xff;
  }

  return { high, low };
}

/**
 * Rebuild world positions from the two byte buffers — the CPU mirror of the
 * decode in `points.vert.glsl`. Keeping the two in step is what P3.5 tests.
 */
export function decodePositions(
  high: Uint8Array,
  low: Uint8Array,
  bounds: Bounds,
): Float32Array {
  if (high.length !== low.length) {
    throw new RangeError(`high and low must be the same length, got ${high.length} and ${low.length}`);
  }

  const positions = new Float32Array(high.length);

  for (let i = 0; i < high.length; i++) {
    const axis = i % 3;
    positions[i] = decode(high[i]!, low[i]!, bounds.min[axis]!, bounds.max[axis]!);
  }

  return positions;
}

/**
 * One coordinate, from two bytes back to a world value.
 *
 * The divisor is **65535, not 65536**. The original UntilLabs shader writes
 * `/ 65536.0` (by way of `uTextureSize - 1.` and `/ uParticleCount`, which only
 * agree because that texture happens to be 256²), and the difference is small —
 * about 15 parts per million — but it is a systematic squeeze of the whole
 * cloud toward `min`, and it silently breaks the moment the texture is not
 * 256². Two bytes span 0…65535 inclusive, so 65535 is the value that must map
 * to 1.0. See `docs/research/01-untillabs-method.md` §2.3.
 */
export function decode(high: number, low: number, min: number, max: number): number {
  const quantised = high * 256 + low;
  return min + (quantised / MAX_16_BIT) * (max - min);
}

/** Worst-case error this encoding can introduce on an axis of the given span. */
export function quantisationStep(min: number, max: number): number {
  return (max - min) / MAX_16_BIT;
}
