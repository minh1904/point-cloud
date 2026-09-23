import { describe, expect, it } from "vitest";

import { heuristicDepth } from "./heuristic-depth";

/** A flat grey image: the only cue left is the ground plane. */
function grey(width: number, height: number, level = 128): Uint8ClampedArray {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = level;
    data[i * 4 + 1] = level;
    data[i * 4 + 2] = level;
    data[i * 4 + 3] = 255;
  }
  return data;
}

describe("heuristicDepth", () => {
  it("puts the top of the frame farther away than the bottom", () => {
    const size = 64;
    const { data } = heuristicDepth({ width: size, height: size, data: grey(size, size) });

    const topRow = data[2]!;
    const bottomRow = data[(size - 1) * size + 2]!;
    expect(topRow).toBeGreaterThan(bottomRow);
  });

  it("returns one normalised value per pixel", () => {
    const { data, width, height, kind } = heuristicDepth({
      width: 32,
      height: 16,
      data: grey(32, 16),
    });

    expect(width).toBe(32);
    expect(height).toBe(16);
    expect(data.length).toBe(512);
    expect(kind).toBe("heuristic");
    expect(Math.min(...data)).toBeCloseTo(0, 6);
    expect(Math.max(...data)).toBeCloseTo(1, 6);
  });

  it("reads a bright desaturated patch as farther than a dark saturated one", () => {
    const size = 32;
    const data = grey(size, size, 40);
    // Paint the left half of one row hazy white, the right half deep green.
    const row = size / 2;
    for (let x = 0; x < size; x++) {
      const p = (row * size + x) * 4;
      const far = x < size / 2;
      data[p] = far ? 235 : 20;
      data[p + 1] = far ? 235 : 120;
      data[p + 2] = far ? 235 : 20;
    }

    const depth = heuristicDepth({ width: size, height: size, data });
    expect(depth.data[row * size + 4]!).toBeGreaterThan(depth.data[row * size + size - 4]!);
  });

  it("rejects a buffer too short for the stated size", () => {
    expect(() =>
      heuristicDepth({ width: 8, height: 8, data: new Uint8ClampedArray(16) }),
    ).toThrow(RangeError);
  });

  it("reads three-channel data too, which is what the PNG decoder returns", () => {
    const rgb = new Uint8ClampedArray(8 * 8 * 3).fill(100);
    const depth = heuristicDepth({ width: 8, height: 8, data: rgb, channels: 3 });
    expect(depth.data.length).toBe(64);
  });
});
