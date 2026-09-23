/**
 * Turning the pipeline's intermediate maps into something a person can look at.
 *
 * Every stage of P6 produces a `Float32Array` of one value per pixel, and every
 * one of them is invisible until it is painted. These previews are not
 * decoration: a depth map that comes back inside out, or an importance map
 * that lights up the sky instead of the subject, is obvious in a thumbnail and
 * nearly impossible to spot in a finished cloud.
 */
import { decode } from "@/bundle/position-codec";

import type { RgbaBytes } from "./decode-image";
import type { PackedBundle } from "./pack-bundle";

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

/**
 * Paint the packed cloud back into a picture (P7.6).
 *
 * This is the only preview that reads the *output* rather than an input, and
 * it earns its place by being the one that shows what the sampler actually
 * did: where the points went, how evenly they are spaced, and whether the
 * subject got the budget the importance map promised it. The colour comes
 * from each point, so it doubles as a check that 6.7 read the right pixel.
 *
 * Deliberately no depth, no lens, no motion — those are the canvas's job. Flat
 * x and y, straight from the encoded positions, decoded exactly the way the
 * vertex shader does it.
 */
export function pointsPreview(bundle: PackedBundle, longSide = 512): PreviewImage {
  const { bounds, particleCount } = bundle.metadata;
  const spanX = bounds.max[0] - bounds.min[0];
  const spanY = bounds.max[1] - bounds.min[1];

  const width = spanX >= spanY ? longSide : Math.max(1, Math.round((longSide * spanX) / spanY));
  const height = spanX >= spanY ? Math.max(1, Math.round((longSide * spanY) / spanX)) : longSide;

  const data = new Uint8ClampedArray(width * height * 4) as RgbaBytes;
  // Opaque black behind the points, so the gaps read as gaps rather than as
  // whatever the canvas had before.
  for (let i = 3; i < data.length; i += 4) data[i] = 255;

  for (let i = 0; i < particleCount; i++) {
    const x = decode(
      bundle.positionHigh[i * 4]!,
      bundle.positionLow[i * 4]!,
      bounds.min[0],
      bounds.max[0],
    );
    const y = decode(
      bundle.positionHigh[i * 4 + 1]!,
      bundle.positionLow[i * 4 + 1]!,
      bounds.min[1],
      bounds.max[1],
    );

    const px = Math.min(width - 1, Math.max(0, Math.round(((x - bounds.min[0]) / spanX) * (width - 1))));
    // World +y is up and image row 0 is the top, so the vertical axis flips
    // back here exactly as it flipped in `liftToCloud`.
    const py = Math.min(
      height - 1,
      Math.max(0, Math.round((1 - (y - bounds.min[1]) / spanY) * (height - 1))),
    );

    const out = (py * width + px) * 4;
    data[out] = bundle.color[i * 4]!;
    data[out + 1] = bundle.color[i * 4 + 1]!;
    data[out + 2] = bundle.color[i * 4 + 2]!;
  }

  return { width, height, data };
}
