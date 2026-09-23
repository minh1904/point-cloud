/**
 * The node half of the PNG codec: compression, and nothing else (P3.5, P8.2).
 *
 * Everything structural — the signature, the CRC, the chunk layout, the
 * scanline filters — lives in `src/bundle/png-codec.ts`, because P8.2 needs
 * the same logic in the browser where `node:zlib` does not exist. This file
 * is what is left once that is factored out: two calls into zlib.
 */
import { deflateSync, inflateSync } from "node:zlib";

import {
  buildPng,
  filterScanlines,
  readPngChunks,
  unfilterScanlines,
  type Image,
} from "../src/bundle/png-codec";

export type { Image };

export function encodePng(image: Image): Uint8Array {
  return buildPng(
    image.width,
    image.height,
    image.channels,
    deflateSync(filterScanlines(image), { level: 9 }),
  );
}

export function decodePng(bytes: Uint8Array): Image {
  const { width, height, channels, compressed } = readPngChunks(bytes);
  return {
    width,
    height,
    channels,
    data: unfilterScanlines(inflateSync(compressed), width, height, channels),
  };
}
