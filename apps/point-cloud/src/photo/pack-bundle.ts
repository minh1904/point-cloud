/**
 * Packing a cloud into the textures the renderer already reads (P6.8).
 *
 * This is the seam the whole project was built around. `ParticleField` has
 * taken its data from textures since P3.3 and has never known where they came
 * from; produce the same three maps here and a photograph dropped into the
 * browser renders through the identical shader, with every P4 and P5 effect
 * already applied. No branch, no second code path, no "uploaded mode".
 *
 * ## Why 16-bit hi/lo again, and not floats
 *
 * The roadmap's own plan said float textures once the data is generated
 * in-app — no PNG to squeeze through, so no reason to split a value across two
 * bytes. Reusing the P3 encoder turned out to be the better trade anyway:
 *
 * - The shader stays byte-for-byte the same. A float path would need a second
 *   decode, and two decodes are two things to keep in agreement.
 * - `encodePositions` is already covered by the P3.5 tests, and they now test
 *   this path too.
 * - Export (P8.1) writes PNGs. Holding the bytes already encoded means the
 *   export is a file write rather than a conversion.
 * - Half the memory: two byte textures instead of one float texture.
 *
 * The precision argument that made floats tempting does not survive contact
 * with the numbers. Over a three-unit field, 16 bits is a step of 0.000046
 * world units — about a thousandth of the spacing between neighbouring points.
 *
 * ## Density rides in the alpha channel
 *
 * The crowding from 6.6 needs to reach the vertex shader, and a fourth texture
 * plus a fourth uniform is a lot of machinery for one byte per point. The
 * colour map has an alpha channel doing nothing, and alpha is **not** part of
 * the sRGB transfer function — the GPU decodes RGB through the curve and
 * passes A through untouched — so a number stored there arrives as the number.
 *
 * It also degrades correctly. A bundle loaded from `color.png` with no alpha
 * reads back 1.0 everywhere, which means "as dense as it gets", which means
 * the point size is left alone. Every bundle written before 6.6 existed keeps
 * rendering exactly as it did.
 */
import type { BundleMetadata } from "@/bundle/metadata";
import { computeBounds, encodePositions } from "@/bundle/position-codec";

import type { PointCloud } from "./lift";

export interface PackedBundle {
  metadata: BundleMetadata;
  /** RGBA bytes: colour in RGB, crowding in A. */
  color: Uint8Array;
  /** RGBA bytes: the high byte of each coordinate in RGB, A unused. */
  positionHigh: Uint8Array;
  positionLow: Uint8Array;
}

export interface PackOptions {
  /** Side of the square data texture. `size²` points are packed. */
  size: number;
  /** Recorded in the metadata so the UI can say where the depth came from. */
  depthKind: string;
  relief: number;
  aspect: number;
}

/**
 * Number of points a texture of this side holds. The cloud must be built to
 * this count exactly: the renderer draws one vertex per texel, so a short
 * cloud would leave texels holding whatever the buffer was initialised with.
 */
export function pointsForSize(size: number): number {
  return size * size;
}

export function packCloud(cloud: PointCloud, options: PackOptions): PackedBundle {
  const count = pointsForSize(options.size);
  if (cloud.count !== count) {
    throw new RangeError(
      `a ${options.size}² texture needs exactly ${count} points, got ${cloud.count}`,
    );
  }

  const bounds = computeBounds(cloud.positions);
  const { high, low } = encodePositions(cloud.positions, bounds);

  const color = new Uint8Array(count * 4);
  const positionHigh = new Uint8Array(count * 4);
  const positionLow = new Uint8Array(count * 4);

  for (let i = 0; i < count; i++) {
    color[i * 4] = cloud.colors[i * 3]!;
    color[i * 4 + 1] = cloud.colors[i * 3 + 1]!;
    color[i * 4 + 2] = cloud.colors[i * 3 + 2]!;
    color[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, cloud.density[i]!)) * 255);

    positionHigh[i * 4] = high[i * 3]!;
    positionHigh[i * 4 + 1] = high[i * 3 + 1]!;
    positionHigh[i * 4 + 2] = high[i * 3 + 2]!;
    positionHigh[i * 4 + 3] = 255;

    positionLow[i * 4] = low[i * 3]!;
    positionLow[i * 4 + 1] = low[i * 3 + 1]!;
    positionLow[i * 4 + 2] = low[i * 3 + 2]!;
    positionLow[i * 4 + 3] = 255;
  }

  return {
    metadata: {
      version: 1,
      width: options.size,
      height: options.size,
      particleCount: count,
      precision: 16,
      bounds,
      depth: { kind: options.depthKind, relief: options.relief },
      source: { image: "upload", aspect: options.aspect },
    },
    color,
    positionHigh,
    positionLow,
  };
}
