/**
 * Turning the pipeline's intermediate maps into something a person can look at.
 *
 * Every stage of P6 produces a `Float32Array` of one value per pixel, and every
 * one of them is invisible until it is painted. These previews are not
 * decoration: a depth map that comes back inside out, or an importance map
 * that lights up the sky instead of the subject, is obvious in a thumbnail and
 * nearly impossible to spot in a finished cloud.
 */
import type { RgbaBytes } from "./decode-image";

export interface PreviewImage {
  width: number;
  height: number;
  data: RgbaBytes;
}

/** Paint 0…1 values as black-to-white. Near is dark, far is light. */
export function greyPreview(
  values: Float32Array,
  width: number,
  height: number,
): PreviewImage {
  const data = new Uint8ClampedArray(width * height * 4) as RgbaBytes;

  for (let i = 0; i < values.length; i++) {
    const level = Math.round(Math.min(1, Math.max(0, values[i]!)) * 255);
    data[i * 4] = level;
    data[i * 4 + 1] = level;
    data[i * 4 + 2] = level;
    data[i * 4 + 3] = 255;
  }

  return { width, height, data };
}

/**
 * Paint 0…1 values as a heat ramp: black → blue → red → yellow → white.
 *
 * Greyscale is the wrong tool for an importance map. The eye reads lightness
 * poorly in the middle of the range — a 0.45 and a 0.55 look identical — but
 * reads *hue* changes sharply, which is the whole reason weather maps and
 * thermal cameras are coloured. Where the map is deciding between "some
 * detail" and "a lot of detail" is exactly the range that has to be legible.
 */
export function heatPreview(
  values: Float32Array,
  width: number,
  height: number,
): PreviewImage {
  const data = new Uint8ClampedArray(width * height * 4) as RgbaBytes;

  for (let i = 0; i < values.length; i++) {
    const t = Math.min(1, Math.max(0, values[i]!));

    // Three overlapping ramps offset along t. Cheap, monotonic in lightness,
    // and it never doubles back on a colour the way a rainbow does.
    data[i * 4] = Math.round(255 * Math.min(1, Math.max(0, t * 3 - 0.4)));
    data[i * 4 + 1] = Math.round(255 * Math.min(1, Math.max(0, t * 2.2 - 0.9)));
    data[i * 4 + 2] = Math.round(
      255 * Math.min(1, Math.max(0, t * 2.6 - 1.6) + Math.max(0, 0.9 - t * 3.2)),
    );
    data[i * 4 + 3] = 255;
  }

  return { width, height, data };
}
