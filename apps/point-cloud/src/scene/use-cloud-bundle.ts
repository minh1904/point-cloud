"use client";

/**
 * Uploading a cloud built in the browser to the GPU (P6.8).
 *
 * The file path (`useParticleBundle`) decodes PNGs into `Texture`s. This path
 * already has the bytes, so it wraps them in `DataTexture` — the same object
 * as far as a sampler is concerned, just fed from an array instead of an
 * image. Every flag has to match the file path exactly or the two sources
 * would not be interchangeable, which is the entire point of 6.8.
 *
 * Textures are GPU memory, and the garbage collector cannot see GPU memory. A
 * new photo every few seconds without the `dispose()` below leaks three
 * megabytes a time until the context gives up.
 */
import { useEffect, useMemo } from "react";
import {
  ClampToEdgeWrapping,
  DataTexture,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  UnsignedByteType,
  type ColorSpace,
} from "three";

import type { PackedBundle } from "@/photo/pack-bundle";

import type { ParticleBundle } from "./use-particle-bundle";

/**
 * `RGBAFormat` and not RGB: WebGL2 dropped three-channel byte textures, and
 * three.js removed `RGBFormat` with them. The packer writes four channels for
 * that reason — and then puts the crowding from 6.6 in the spare one rather
 * than padding it with a wasted byte.
 */
function dataTexture(
  data: Uint8Array,
  size: number,
  colorSpace: ColorSpace,
): DataTexture {
  const texture = new DataTexture(data, size, size, RGBAFormat, UnsignedByteType);

  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = colorSpace;
  // A DataTexture is *not* flipped on upload the way an image is, and it must
  // not be: the packer writes row 0 first and the shader expects to read it
  // first. `flipY` is left at its false default on purpose.
  texture.needsUpdate = true;

  return texture;
}

/**
 * Wrap a packed bundle in textures, disposing the previous set.
 *
 * Derived with `useMemo` rather than state-plus-effect: the textures are a
 * pure function of the bytes, so there is nothing to synchronise and no reason
 * to render once without them. The effect is left with the one job only an
 * effect can do — running the `dispose()` when this set is replaced.
 */
export function useCloudBundle(packed: PackedBundle | null): ParticleBundle | null {
  const bundle = useMemo<ParticleBundle | null>(() => {
    if (!packed) return null;

    const size = packed.metadata.width;
    return {
      metadata: packed.metadata,
      color: dataTexture(packed.color, size, SRGBColorSpace),
      positionHigh: dataTexture(packed.positionHigh, size, NoColorSpace),
      positionLow: dataTexture(packed.positionLow, size, NoColorSpace),
    };
  }, [packed]);

  useEffect(
    () => () => {
      bundle?.color.dispose();
      bundle?.positionHigh.dispose();
      bundle?.positionLow.dispose();
    },
    [bundle],
  );

  return bundle;
}
