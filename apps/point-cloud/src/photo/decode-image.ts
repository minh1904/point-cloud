/**
 * Getting a dropped file into a pixel buffer we can measure (P6.1).
 *
 * Three browser APIs do the work, and each is here for a reason:
 *
 * - `createImageBitmap` decodes JPEG/PNG/WebP off the main thread and hands
 *   back a GPU-friendly bitmap. The old trick — `new Image()` plus an `onload`
 *   — decodes on the main thread and stalls the render loop for as long as a
 *   12-megapixel JPEG takes.
 * - `OffscreenCanvas` is a canvas with no DOM node. Nothing here needs to be
 *   on screen, and a canvas that is not in the document cannot be affected by
 *   CSS, devicePixelRatio or a stylesheet that decides to scale images.
 * - `getImageData` reads the bytes back. This is the step everything else in
 *   P6 depends on, and the step with the trap — see below.
 *
 * ## The colour space of `getImageData`
 *
 * The bytes that come back are **sRGB-encoded**, not linear light. A pixel
 * that reads 128 is not half as bright as one that reads 255; it is about 22%
 * as bright, because the encoding spends more of its 256 steps on the dark end
 * where the eye is more sensitive.
 *
 * That matters twice in P6. Luminance for the importance map (6.4) is a
 * measure of *perceived* brightness, so sRGB bytes are exactly right and
 * converting them to linear would make the map wrong. Colour handed to the
 * renderer is the opposite case: the GPU blends in linear light, which is why
 * `color.png` is uploaded with `SRGBColorSpace` and decoded on the way in.
 * Both work as long as it is written down which one you are holding. This
 * function always returns sRGB bytes.
 */

/** Long side of the working image. Big enough to sample 65k points from. */
export const WORKING_LONG_SIDE = 1024;

/**
 * The buffer type `ImageData` accepts. TypeScript 5.7 made typed arrays
 * generic over their buffer, and a plain `Uint8ClampedArray` could be backed
 * by a `SharedArrayBuffer`, which `new ImageData(...)` will not take.
 */
export type RgbaBytes = Uint8ClampedArray<ArrayBuffer>;

export interface PhotoPixels {
  width: number;
  height: number;
  /** RGBA, sRGB-encoded, four bytes per pixel, row 0 at the top. */
  data: RgbaBytes;
}

/**
 * Size to decode at: the long side capped at `longSide`, aspect kept, never
 * upscaled. Enlarging a small photo invents no detail — it only multiplies the
 * cost of every pass that follows.
 */
export function workingSize(
  width: number,
  height: number,
  longSide: number = WORKING_LONG_SIDE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) {
    throw new RangeError(`image has no area: ${width}x${height}`);
  }

  const scale = Math.min(1, longSide / Math.max(width, height));

  // Round, then clamp to 1: a 4000x3 panorama would otherwise scale its short
  // side to 0 and produce a canvas with no pixels at all.
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/** Per-pixel index into `PhotoPixels.data` for the red channel. */
export function pixelOffset(x: number, y: number, width: number): number {
  return (y * width + x) * 4;
}

/**
 * Decode a dropped file and downscale it to the working size.
 *
 * Downscaling is not only about cost. A photo carries sensor noise and JPEG
 * ringing at the pixel level, and every term of the importance map (6.4) is a
 * difference between neighbouring pixels — which is precisely what noise is.
 * Averaging sixteen source pixels into one is a low-pass filter we would
 * otherwise have to write ourselves.
 */
export async function decodePhoto(
  source: Blob,
  longSide: number = WORKING_LONG_SIDE,
): Promise<PhotoPixels> {
  const bitmap = await createImageBitmap(source);

  try {
    const size = workingSize(bitmap.width, bitmap.height, longSide);
    const canvas = new OffscreenCanvas(size.width, size.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("this browser gave no 2D context");

    // The default is "low", which on a large downscale is a nearest-neighbour
    // pick: it keeps one source pixel in sixteen and throws the rest away,
    // aliasing every edge in the photo.
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, size.width, size.height);

    const image = context.getImageData(0, 0, size.width, size.height, {
      colorSpace: "srgb",
    });

    return { width: size.width, height: size.height, data: image.data };
  } finally {
    // The bitmap holds decoded pixels — several megabytes for a phone photo —
    // and the garbage collector will not hurry on our account.
    bitmap.close();
  }
}
