import { describe, expect, it } from "vitest";

import { decodePng, encodePng } from "./png";

/** Deterministic bytes, so a failure is reproducible. */
function noise(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let state = seed;
  for (let i = 0; i < length; i++) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    out[i] = (state >> 16) & 0xff;
  }
  return out;
}

describe("encodePng / decodePng", () => {
  it("returns incompressible bytes exactly", () => {
    // The low byte of a 16-bit position is close to noise. If anything in the
    // encoder rounded, premultiplied or colour-managed, this is where it shows.
    const image = { width: 64, height: 64, channels: 3 as const, data: noise(64 * 64 * 3, 7) };
    const decoded = decodePng(encodePng(image));

    expect(decoded.width).toBe(64);
    expect(decoded.height).toBe(64);
    expect(decoded.channels).toBe(3);
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data));
  });

  it("round-trips RGBA as well", () => {
    const image = { width: 17, height: 5, channels: 4 as const, data: noise(17 * 5 * 4, 11) };
    const decoded = decodePng(encodePng(image));

    expect(decoded.channels).toBe(4);
    expect(Array.from(decoded.data)).toEqual(Array.from(image.data));
  });

  it("round-trips a single-row image, where no filter has a row above it", () => {
    const image = { width: 9, height: 1, channels: 3 as const, data: noise(27, 13) };
    expect(Array.from(decodePng(encodePng(image)).data)).toEqual(Array.from(image.data));
  });

  it("stores a coordinate ramp compactly", () => {
    // The high byte of x is a ramp across each row. Scanline filtering turns it
    // into a run of equal differences, which is the whole reason the bundle
    // fits in a few hundred KB.
    const size = 256;
    const data = new Uint8Array(size * size * 3);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        data[(y * size + x) * 3] = x;
        data[(y * size + x) * 3 + 1] = y;
      }
    }

    const encoded = encodePng({ width: size, height: size, channels: 3, data });

    expect(Array.from(decodePng(encoded).data)).toEqual(Array.from(data));
    expect(encoded.length).toBeLessThan(data.length / 20);
  });

  it("refuses input whose length does not match its dimensions", () => {
    expect(() =>
      encodePng({ width: 4, height: 4, channels: 3, data: new Uint8Array(10) }),
    ).toThrow(RangeError);
  });

  it("refuses a file that is not a PNG", () => {
    expect(() => decodePng(Buffer.from("this is not a png at all"))).toThrow(/not a PNG/);
  });
});
