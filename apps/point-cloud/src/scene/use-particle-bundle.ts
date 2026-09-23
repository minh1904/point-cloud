"use client";

import { useEffect, useState } from "react";
import {
  ClampToEdgeWrapping,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  SRGBColorSpace,
  TextureLoader,
  type ColorSpace,
  type MagnificationTextureFilter,
  type Texture,
} from "three";

import { parseBundleMetadata, type BundleMetadata } from "@/bundle/metadata";

/** A loaded bundle: the numbers, and the three textures that carry them. */
export interface ParticleBundle {
  metadata: BundleMetadata;
  color: Texture;
  positionHigh: Texture;
  positionLow: Texture;
}

/** Where the committed sample lives under `public/`. */
export const SAMPLE_BUNDLE = "/particles/sample";

/**
 * A texture holding data must be read back exactly as it was written, so every
 * convenience three.js applies to *pictures* has to be switched off:
 *
 * - `NearestFilter` — return the texel that was asked for. Linear filtering
 *   would blend it with its neighbours, and neighbouring texels are unrelated
 *   particles, not nearby parts of one image.
 * - no mipmaps — a mipmap is an averaged-down copy, which is more blending.
 * - `flipY = false` — three.js flips images on upload so that uv (0,0) is the
 *   bottom-left, the OpenGL convention. Row 0 of the file must stay row 0 of
 *   the texture, or every particle reads another particle's data.
 * - `ClampToEdgeWrapping` — nothing should ever wrap round to the far side of
 *   the data.
 *
 * `colorSpace` is the one setting that differs between the maps. `color.png`
 * is a photograph: its bytes are sRGB-encoded and the GPU must decode them to
 * linear light on the way in. The position maps are *numbers*, where a byte of
 * 128 means 128 — decoding those as colour would bend every coordinate along a
 * curve, and nothing would report an error.
 */
function configureDataTexture(
  texture: Texture,
  colorSpace: ColorSpace,
  filter: MagnificationTextureFilter = NearestFilter,
): Texture {
  texture.minFilter = filter;
  texture.magFilter = filter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Loads `metadata.json` and the three data textures of a bundle, or nothing
 * at all when `baseUrl` is null.
 *
 * Deliberately not drei's `useTexture`: that returns a globally cached texture
 * which cannot legally be reconfigured (`react-hooks/immutability`), and these
 * textures are useless without the reconfiguration above. Owning them also
 * means an explicit `dispose()` — JavaScript's garbage collector knows nothing
 * about GPU memory.
 */
export function useParticleBundle(
  baseUrl: string | null = SAMPLE_BUNDLE,
): ParticleBundle | null {
  const [bundle, setBundle] = useState<ParticleBundle | null>(null);

  useEffect(() => {
    // `null` means a cloud built in the browser is taking this slot (6.8), so
    // there is nothing to fetch. The previous run's cleanup has already
    // cleared the state and disposed its textures.
    if (baseUrl === null) return;

    let cancelled = false;
    const loaded: Texture[] = [];
    const loader = new TextureLoader();

    const load = (file: string, colorSpace: ColorSpace) =>
      loader.loadAsync(`${baseUrl}/${file}`).then((texture) => {
        // Track it as soon as it exists, so an unmount mid-flight still
        // disposes everything that made it to the GPU.
        loaded.push(texture);
        return configureDataTexture(texture, colorSpace);
      });

    void (async () => {
      try {
        const response = await fetch(`${baseUrl}/metadata.json`);
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const metadata = parseBundleMetadata(await response.json());

        const [color, positionHigh, positionLow] = await Promise.all([
          load("color.png", SRGBColorSpace),
          load("position_h.png", NoColorSpace),
          load("position_l.png", NoColorSpace),
        ]);

        if (cancelled) return;
        setBundle({ metadata, color, positionHigh, positionLow });
      } catch (error) {
        console.error(`could not load the particle bundle at ${baseUrl}`, error);
      }
    })();

    return () => {
      cancelled = true;
      setBundle(null);
      for (const texture of loaded) texture.dispose();
    };
  }, [baseUrl]);

  return bundle;
}

/**
 * Loads a colour grade (P5.2).
 *
 * Almost the same settings as a data texture, with one deliberate difference:
 * `LinearFilter`. A LUT *wants* to be interpolated — 64 samples per axis is
 * coarse, and blending between neighbouring entries is what turns a lattice of
 * 262,144 colours into a smooth mapping over all of them. The one place
 * filtering must not reach is across a tile border, and `pcLutLookup` keeps the
 * sample half a texel inside for exactly that reason.
 *
 * `NoColorSpace`, though, for the same reason the position maps use it: the
 * bytes are a lookup table, not a picture. The shader does its own conversion
 * around the lookup, because grades are authored on display values.
 */
export function useLookupTexture(url: string): Texture | null {
  const [texture, setTexture] = useState<Texture | null>(null);

  useEffect(() => {
    let loaded: Texture | undefined;
    let cancelled = false;

    new TextureLoader().load(url, (result) => {
      if (cancelled) {
        result.dispose();
        return;
      }
      loaded = configureDataTexture(result, NoColorSpace, LinearFilter);
      setTexture(loaded);
    });

    return () => {
      cancelled = true;
      loaded?.dispose();
    };
  }, [url]);

  return texture;
}
