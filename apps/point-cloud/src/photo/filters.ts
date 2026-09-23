/**
 * Small image filters shared by the depth heuristic (6.2) and the importance
 * map (6.4). Everything here works on a `Float32Array` laid out row by row,
 * one value per pixel — the shape every stage of P6 passes around.
 */

/** Read with the edge pixel repeated outside the image. */
function clampIndex(value: number, limit: number): number {
  return value < 0 ? 0 : value >= limit ? limit - 1 : value;
}

/**
 * Box blur, separable.
 *
 * A box blur of radius r averages a (2r+1)² square, which is (2r+1)² reads per
 * pixel. But averaging a square is the same as averaging each row and then
 * averaging the results down each column, and that is 2(2r+1) reads instead —
 * at r = 4 the difference is 81 reads against 18. This works because the box
 * kernel is *separable*: the 2D kernel is the outer product of two 1D ones.
 *
 * Repeating the pass is worth knowing about for its own sake. A box blur is a
 * crude filter with a boxy impulse response; run it three times and the result
 * is very close to a Gaussian, by the same central limit theorem that makes
 * sums of dice rolls look like a bell curve. Three cheap passes beat one
 * expensive Gaussian.
 */
export function boxBlur(
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes = 1,
): Float32Array {
  if (values.length !== width * height) {
    throw new RangeError(`expected ${width * height} values, got ${values.length}`);
  }
  if (radius < 1 || passes < 1) return Float32Array.from(values);

  const source = Float32Array.from(values);
  const scratch = new Float32Array(source.length);
  const window = radius * 2 + 1;

  for (let pass = 0; pass < passes; pass++) {
    // Horizontal, into scratch.
    for (let y = 0; y < height; y++) {
      const row = y * width;
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) {
          sum += source[row + clampIndex(x + d, width)]!;
        }
        scratch[row + x] = sum / window;
      }
    }

    // Vertical, back into source.
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let d = -radius; d <= radius; d++) {
          sum += scratch[clampIndex(y + d, height) * width + x]!;
        }
        source[y * width + x] = sum / window;
      }
    }
  }

  return source;
}

/**
 * Stretch values so the lowest becomes 0 and the highest 1.
 *
 * Every map in P6 is consumed as "0 to 1", and every producer of one has its
 * own natural range: a depth model returns arbitrary inverse-depth units, a
 * gradient magnitude depends on how contrasty the photo is. Normalising at the
 * boundary means the sliders downstream mean the same thing for every photo.
 *
 * A flat input has no range to stretch, so it collapses to 0.5 rather than
 * dividing by zero and returning NaN for every pixel.
 */
export function normalise(values: Float32Array): Float32Array {
  let min = Infinity;
  let max = -Infinity;

  for (const value of values) {
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const span = max - min;
  const out = new Float32Array(values.length);
  if (!(span > 0)) return out.fill(0.5);

  for (let i = 0; i < values.length; i++) out[i] = (values[i]! - min) / span;
  return out;
}

/**
 * Perceived brightness of an sRGB pixel, 0 to 1.
 *
 * The weights are Rec. 709's: green counts for almost three quarters because
 * the eye has far more green-sensitive cones than blue-sensitive ones. Using
 * the plain average instead would make a saturated blue and a saturated green
 * equally bright, and every edge between them would vanish from the gradient.
 *
 * These are sRGB bytes, not linear light — see `decode-image.ts`. That is the
 * right input here: the importance map is about what a *viewer* notices, and
 * sRGB is already the encoding built around that.
 */
export function luminance(r: number, g: number, b: number): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}
