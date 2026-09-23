/**
 * Where the points should go (P6.4).
 *
 * A photograph is not uniformly interesting. Sixty-five thousand points spread
 * evenly across it spend most of themselves on flat sky and still cannot hold
 * the edge of a face. The importance map is the answer to "how much does this
 * pixel deserve", and 6.5 turns it into positions.
 *
 * "Interesting" is not one thing, so it is measured three ways and mixed:
 *
 * - **Edges** — the gradient of luminance. High where brightness changes
 *   quickly: outlines, horizons, the rim of a jacket. This is the term that
 *   keeps shapes readable.
 * - **Texture** — local contrast, the spread of brightness in a small window.
 *   High on grass and fabric weave, low on a smooth wall *and* low on a single
 *   clean edge. Edges and texture disagree often, which is exactly why both
 *   are here.
 * - **Depth edges** — the gradient of the depth map. High where a surface
 *   ends and another begins. These are the boundaries that read as *solid* in
 *   a point cloud; miss them and the subject smears into the background no
 *   matter how sharp the colour is.
 *
 * Each term is normalised to 0…1 on its own before mixing, so a slider means
 * the same thing for a foggy photograph and a high-contrast one.
 *
 * The three components are computed once per photo and mixed on demand: the
 * expensive part is the convolutions, the weighted sum is three multiplies per
 * pixel. That is what lets the sliders respond immediately instead of
 * re-running the whole analysis on every drag.
 */
import { boxBlur, luminance, normalise } from "./filters";

export interface ImportanceComponents {
  width: number;
  height: number;
  /** Luminance gradient, 0…1. */
  edges: Float32Array;
  /** Local RMS contrast, 0…1. */
  texture: Float32Array;
  /** Depth gradient, 0…1. */
  depthEdges: Float32Array;
}

export interface ImportanceWeights {
  edges: number;
  texture: number;
  depthEdges: number;
  /**
   * Smallest share any pixel keeps, however boring it is.
   *
   * At 0 the background would get literally no points and the cloud would have
   * holes in the sky. This is the knob that decides how much of the photo
   * survives as a backdrop rather than disappearing.
   */
  floor: number;
}

export const defaultImportanceWeights: ImportanceWeights = {
  edges: 1,
  texture: 0.55,
  depthEdges: 0.8,
  floor: 0.12,
};

/** Perceived brightness per pixel, 0…1, from an RGBA buffer. */
export function luminanceField(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) {
    out[i] = luminance(data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!);
  }
  return out;
}

/**
 * Sobel gradient magnitude.
 *
 * The 3×3 Sobel pair is a difference across the pixel — `-1 0 +1` — with the
 * rows above and below weighted in, which both smooths noise and makes the
 * operator symmetric. Taking `√(gx² + gy²)` throws the direction away and
 * keeps the strength, because for this purpose "there is an edge here" is the
 * whole question and which way it faces does not matter.
 */
export function sobelMagnitude(
  values: Float32Array,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height);
  const at = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    return values[cy * width + cx]!;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tl = at(x - 1, y - 1);
      const tc = at(x, y - 1);
      const tr = at(x + 1, y - 1);
      const ml = at(x - 1, y);
      const mr = at(x + 1, y);
      const bl = at(x - 1, y + 1);
      const bc = at(x, y + 1);
      const br = at(x + 1, y + 1);

      const gx = tr + 2 * mr + br - (tl + 2 * ml + bl);
      const gy = bl + 2 * bc + br - (tl + 2 * tc + tr);

      out[y * width + x] = Math.sqrt(gx * gx + gy * gy);
    }
  }

  return out;
}

/**
 * Local RMS contrast: the standard deviation of brightness in a small window.
 *
 * Computed as `√(E[L²] − E[L]²)` — the mean of the squares minus the square of
 * the mean — which is the same identity that lets you compute a variance in
 * one pass. Both expectations are box blurs, so a filter we already have gives
 * us a statistic at the cost of two blurs and a subtract, instead of a second
 * pass over every window.
 *
 * Floating-point subtraction of two close numbers can land slightly below
 * zero, and `Math.sqrt` of that is NaN, which would spread through everything
 * downstream silently. Hence the clamp.
 */
export function localContrast(
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const squares = new Float32Array(values.length);
  for (let i = 0; i < values.length; i++) squares[i] = values[i]! * values[i]!;

  const mean = boxBlur(values, width, height, radius);
  const meanOfSquares = boxBlur(squares, width, height, radius);

  const out = new Float32Array(values.length);
  for (let i = 0; i < out.length; i++) {
    const variance = meanOfSquares[i]! - mean[i]! * mean[i]!;
    out[i] = Math.sqrt(Math.max(0, variance));
  }
  return out;
}

export interface ComponentInput {
  width: number;
  height: number;
  /** RGBA bytes of the working image. */
  pixels: Uint8ClampedArray;
  /** One depth value per pixel, 0 near to 1 far. */
  depth: Float32Array;
}

/**
 * The expensive half: three convolutions over the whole image, once per photo.
 *
 * Each result is blurred a little before being normalised. A Sobel edge is one
 * pixel wide, and 6.5 places points no closer than a couple of pixels apart —
 * so an unblurred edge is a target the sampler keeps missing. Spreading it
 * into a band a few pixels wide is what turns "there is an edge here" into
 * "put points around here".
 */
export function importanceComponents({
  width,
  height,
  pixels,
  depth,
}: ComponentInput): ImportanceComponents {
  if (depth.length !== width * height) {
    throw new RangeError(
      `depth has ${depth.length} values, expected ${width * height}`,
    );
  }

  const spread = Math.max(1, Math.round(Math.min(width, height) / 256));
  const luma = luminanceField(pixels, width, height);

  return {
    width,
    height,
    edges: normalise(boxBlur(sobelMagnitude(luma, width, height), width, height, spread)),
    texture: normalise(
      boxBlur(localContrast(luma, width, height, spread * 2), width, height, spread),
    ),
    depthEdges: normalise(
      boxBlur(sobelMagnitude(depth, width, height), width, height, spread),
    ),
  };
}

/**
 * The cheap half: fold the three components into one 0…1 map.
 *
 * The weights are divided by their own sum, so turning every slider up gives
 * the same map as leaving them all at one. Without that, the sliders would
 * double as a master gain and the floor would stop meaning anything.
 */
export function mixImportance(
  components: ImportanceComponents,
  weights: ImportanceWeights,
): Float32Array {
  const total = weights.edges + weights.texture + weights.depthEdges;
  const out = new Float32Array(components.edges.length);

  if (total <= 0) return out.fill(1);

  const floor = Math.min(1, Math.max(0, weights.floor));

  for (let i = 0; i < out.length; i++) {
    const mixed =
      (weights.edges * components.edges[i]! +
        weights.texture * components.texture[i]! +
        weights.depthEdges * components.depthEdges[i]!) /
      total;

    out[i] = floor + (1 - floor) * Math.min(1, Math.max(0, mixed));
  }

  return out;
}
