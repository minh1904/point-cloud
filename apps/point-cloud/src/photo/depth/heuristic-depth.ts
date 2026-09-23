/**
 * Depth from painter's cues — the fast path, and the fallback (P6.2).
 *
 * This is not depth estimation. It is two rules of thumb that painters have
 * used since the Renaissance, and it is here for three honest reasons:
 *
 * 1. It runs in a few milliseconds, so the rest of the pipeline has a depth
 *    map to work with the instant a photo lands, while the real model is still
 *    downloading.
 * 2. It needs no network, no WebGPU and no 27 MB of weights, so the app still
 *    works when any of those is missing.
 * 3. It is the same code `scripts/build-sample-bundle.ts` has used since P3 to
 *    fake the sample bundle's depth. Sharing it means one implementation to be
 *    wrong in, not two.
 *
 * The two cues:
 *
 * - **Atmospheric perspective.** Air scatters light, so distant things are
 *   lighter and less saturated than near ones. `luma * (1 - saturation)` is
 *   high for hazy sky and low for a dark saturated jacket in the foreground.
 * - **The ground plane.** For a camera looking across a scene from roughly
 *   eye height, the bottom of the frame is at your feet and the top is at the
 *   horizon, so the row index alone carries distance.
 *
 * Both fail in obvious ways — a white shirt reads as far away, a photo shot
 * downward has no ground plane at all — which is exactly why 6.3 exists. What
 * saves the result either way is shallow relief (6.7): at 3% of the cloud's
 * width, a wrong depth is a small wrong depth.
 */
import { boxBlur, normalise } from "../filters";
import type { DepthMap } from "./depth-map";

/** Weight of the haze cue against the ground-plane cue. */
const HAZE_WEIGHT = 0.55;

export interface HeuristicInput {
  width: number;
  height: number;
  /** Interleaved bytes, `channels` per pixel, row 0 at the top. */
  data: Uint8Array | Uint8ClampedArray;
  /** 4 for a canvas buffer, 3 for a decoded RGB PNG. */
  channels?: number;
}

export function heuristicDepth({
  width,
  height,
  data,
  channels = 4,
}: HeuristicInput): DepthMap {
  const count = width * height;
  if (data.length < count * channels) {
    throw new RangeError(
      `expected ${count * channels} bytes for ${width}x${height}, got ${data.length}`,
    );
  }

  const raw = new Float32Array(count);

  for (let y = 0; y < height; y++) {
    // Row 0 is the top of the photo, so this runs 0 at the horizon to 1 at
    // the viewer's feet — and "far" is its complement.
    const far = 1 - (y + 0.5) / height;

    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * channels;
      const r = data[p]! / 255;
      const g = data[p + 1]! / 255;
      const b = data[p + 2]! / 255;

      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const saturation = max === 0 ? 0 : (max - min) / max;

      raw[y * width + x] = HAZE_WEIGHT * (luma * (1 - saturation)) + (1 - HAZE_WEIGHT) * far;
    }
  }

  // Per-pixel colour is a noisy distance estimate — a single dark leaf against
  // the sky would become a spike of relief. Blurring first is what turns this
  // from per-pixel colour into a sense of where the surfaces are.
  const radius = Math.max(1, Math.round(Math.min(width, height) / 128));

  return {
    width,
    height,
    data: normalise(boxBlur(raw, width, height, radius, 2)),
    kind: "heuristic",
  };
}
