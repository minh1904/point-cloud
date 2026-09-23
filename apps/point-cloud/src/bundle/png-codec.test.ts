import { describe, expect, it } from "vitest";

import {
  buildPng,
  filterScanlines,
  PNG_SIGNATURE,
  readPngChunks,
  unfilterScanlines,
  type Image,
} from "./png-codec";

/** Noise is the cruellest input for a filter heuristic, and for an encoder. */
function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i++) {
    state = (state * 1664525 + 1013904223) >>> 0;
    out[i] = state >>> 24;
  }
  return out;
}

function image(width: number, height: number, channels: 3 | 4, seed = 1): Image {
  return { width, height, channels, data: noise(width * height * channels, seed) };
}

/** The identity the split has to preserve, with compression left out. */
function roundTrip(source: Image): Uint8Array {
  const filtered = filterScanlines(source);
  return unfilterScanlines(filtered, source.width, source.height, source.channels);
}

describe("filter and unfilter", () => {
  it("round-trips RGB noise exactly", () => {
    const source = image(17, 11, 3, 7);
    expect(Array.from(roundTrip(source))).toEqual(Array.from(source.data));
  });

  it("round-trips RGBA noise exactly", () => {
    const source = image(16, 16, 4, 99);
    expect(Array.from(roundTrip(source))).toEqual(Array.from(source.data));
  });

  it("round-trips a single row, which has no row above to reference", () => {
    const source = image(32, 1, 4, 3);
    expect(Array.from(roundTrip(source))).toEqual(Array.from(source.data));
  });

  it("round-trips a single column", () => {
    const source = image(1, 32, 3, 4);
    expect(Array.from(roundTrip(source))).toEqual(Array.from(source.data));
  });

  it("writes one filter byte per scanline", () => {
    const source = image(8, 5, 4);
    expect(filterScanlines(source).length).toBe((8 * 4 + 1) * 5);
  });

  it("collapses a coordinate ramp, which is the whole reason filters exist", () => {
    // A gradient across x: raw bytes all differ, filtered bytes are constant.
    const width = 64;
    const data = new Uint8Array(width * 4 * 3);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < width; x++) {
        for (let c = 0; c < 3; c++) data[(y * width + x) * 3 + c] = x * 4;
      }
    }

    const filtered = filterScanlines({ width, height: 4, channels: 3, data });
    // Filter byte, the run of equal differences, and the row start. No more.
    expect(new Set(filtered).size).toBeLessThan(6);
  });

  it("rejects a buffer that is not width * height * channels", () => {
    expect(() =>
      filterScanlines({ width: 4, height: 4, channels: 3, data: new Uint8Array(10) }),
    ).toThrow(RangeError);
  });

  it("rejects an unknown filter type on the way back", () => {
    const raw = new Uint8Array((4 * 3 + 1) * 2);
    raw[0] = 9;
    expect(() => unfilterScanlines(raw, 4, 2, 3)).toThrow(/unknown scanline filter/);
  });
});

describe("buildPng and readPngChunks", () => {
  it("writes the signature and reads the header back", () => {
    const png = buildPng(13, 7, 4, new Uint8Array([1, 2, 3]));

    expect([...png.subarray(0, 8)]).toEqual([...PNG_SIGNATURE]);

    const chunks = readPngChunks(png);
    expect(chunks.width).toBe(13);
    expect(chunks.height).toBe(7);
    expect(chunks.channels).toBe(4);
    expect(Array.from(chunks.compressed)).toEqual([1, 2, 3]);
  });

  it("marks RGB as colour type 2 and RGBA as 6", () => {
    expect(readPngChunks(buildPng(2, 2, 3, new Uint8Array(1))).channels).toBe(3);
    expect(readPngChunks(buildPng(2, 2, 4, new Uint8Array(1))).channels).toBe(4);
  });

  it("refuses something that is not a PNG", () => {
    expect(() => readPngChunks(new Uint8Array(32))).toThrow(/not a PNG/);
  });

  it("refuses a bit depth it cannot read", () => {
    const png = buildPng(2, 2, 3, new Uint8Array(1));
    // The bit depth is the 9th byte of IHDR's data: 8 signature + 8 chunk head.
    png[8 + 8 + 8] = 16;
    expect(() => readPngChunks(png)).toThrow(/only 8-bit/);
  });
});
