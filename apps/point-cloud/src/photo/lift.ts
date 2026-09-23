/**
 * From pixels to a cloud in space (P6.7).
 *
 * The sampler gives positions on a photograph — flat, in pixel coordinates.
 * This is the step that makes them three-dimensional, and it is deliberately
 * the least ambitious step in the phase: **2.5D**, a surface with relief, not
 * a reconstruction. Every point keeps the x and y it was sampled at and gains
 * a z from the depth map.
 *
 * ## Why so shallow
 *
 * Monocular depth is *relative*. It knows the hiker is in front of the
 * mountain; it has no idea whether that is by two metres or two hundred, and
 * it is confidently wrong at thin structures, reflections and sky. Give that
 * map a deep relief and every error becomes a spike through the picture.
 *
 * At a few percent of the cloud's width — the research note measures the
 * UntilLabs scene at about 0.6%, and 3% still reads as a photograph here —
 * the errors are smaller than the point spacing, while the parallax when the
 * camera moves is still plainly visible. Shallow relief is not a compromise
 * forced by a weak model; it is what makes an imperfect model usable.
 *
 * Paired with the 16° telephoto from P5.6 it is also what makes the result
 * look photographic: a long lens flattens perspective, so a flat-ish subject
 * looks compressed rather than flat.
 */
import { pixelOffset } from "./decode-image";

export interface LiftOptions {
  /** Interleaved x, y in pixel coordinates — the sampler's output. */
  points: Float32Array;
  /** One crowding value per point, from 6.6. Carried through untouched. */
  density: Float32Array;
  width: number;
  height: number;
  /** One depth value per pixel, 0 near to 1 far. */
  depth: Float32Array;
  /** RGBA bytes of the working image. */
  pixels: Uint8ClampedArray;
  /** World width the cloud spans. Height follows the photo's aspect. */
  fieldWidth: number;
  /** World depth between the nearest and farthest point. */
  relief: number;
}

export interface PointCloud {
  count: number;
  /** x, y, z per point, in world units. */
  positions: Float32Array;
  /** r, g, b per point, sRGB bytes straight from the photo. */
  colors: Uint8ClampedArray;
  /** One crowding value per point, 0 sparse to 1 dense. */
  density: Float32Array;
}

/**
 * Depth between pixels, bilinearly.
 *
 * The sampled positions are sub-pixel, and depth is a smooth quantity — a
 * surface does not step. Reading the nearest pixel instead would quantise
 * every z onto the pixel lattice, which at 3% relief means visible terracing
 * exactly where the relief is gentlest.
 */
function sampleDepth(
  depth: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const px = Math.min(width - 1, Math.max(0, x - 0.5));
  const py = Math.min(height - 1, Math.max(0, y - 0.5));
  const x0 = Math.floor(px);
  const y0 = Math.floor(py);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = px - x0;
  const fy = py - y0;

  const top = depth[y0 * width + x0]! * (1 - fx) + depth[y0 * width + x1]! * fx;
  const bottom = depth[y1 * width + x0]! * (1 - fx) + depth[y1 * width + x1]! * fx;
  return top * (1 - fy) + bottom * fy;
}

/**
 * Turn sampled pixel positions into a world-space point cloud.
 *
 * Colour is read from the **nearest** pixel rather than interpolated, which is
 * the opposite choice to depth and for a good reason: interpolating across a
 * silhouette mixes the subject with the background and rings every outline
 * with points in a colour that appears nowhere in the photograph.
 */
export function liftToCloud({
  points,
  density,
  width,
  height,
  depth,
  pixels,
  fieldWidth,
  relief,
}: LiftOptions): PointCloud {
  const count = points.length / 2;
  if (density.length !== count) {
    throw new RangeError(`density has ${density.length} values for ${count} points`);
  }
  if (depth.length !== width * height) {
    throw new RangeError(`depth has ${depth.length} values, expected ${width * height}`);
  }

  const fieldHeight = (fieldWidth * height) / width;
  const positions = new Float32Array(count * 3);
  const colors = new Uint8ClampedArray(count * 3);

  for (let i = 0; i < count; i++) {
    const x = points[i * 2]!;
    const y = points[i * 2 + 1]!;

    // Pixel row 0 is the top of the photo and +y is up in the world, so the
    // vertical axis is flipped. Getting this wrong renders the scene upside
    // down, which is obvious — unlike getting the *depth* sign wrong.
    positions[i * 3] = (x / width - 0.5) * fieldWidth;
    positions[i * 3 + 1] = (0.5 - y / height) * fieldHeight;
    positions[i * 3 + 2] = (0.5 - sampleDepth(depth, width, height, x, y)) * relief;

    const p = pixelOffset(
      Math.min(width - 1, Math.max(0, Math.floor(x))),
      Math.min(height - 1, Math.max(0, Math.floor(y))),
      width,
    );
    colors[i * 3] = pixels[p]!;
    colors[i * 3 + 1] = pixels[p + 1]!;
    colors[i * 3 + 2] = pixels[p + 2]!;
  }

  return { count, positions, colors, density: Float32Array.from(density) };
}
