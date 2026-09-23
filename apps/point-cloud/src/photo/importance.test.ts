import { describe, expect, it } from "vitest";

import {
  defaultImportanceWeights,
  importanceComponents,
  localContrast,
  luminanceField,
  mixImportance,
  sobelMagnitude,
  type ImportanceComponents,
} from "./importance";

/** A step edge down the middle: left black, right white. */
function step(width: number, height: number): Float32Array {
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) out[y * width + x] = x < width / 2 ? 0 : 1;
  }
  return out;
}

describe("sobelMagnitude", () => {
  it("is zero on a flat field", () => {
    const flat = new Float32Array(64).fill(0.4);
    for (const value of sobelMagnitude(flat, 8, 8)) expect(value).toBeCloseTo(0, 6);
  });

  it("peaks either side of a step and stays quiet away from it", () => {
    const width = 16;
    const edge = sobelMagnitude(step(width, 8), width, 8);
    const row = 4 * width;

    expect(edge[row + 7]!).toBeGreaterThan(1);
    expect(edge[row + 8]!).toBeGreaterThan(1);
    expect(edge[row + 2]!).toBeCloseTo(0, 6);
    expect(edge[row + 14]!).toBeCloseTo(0, 6);
  });

  it("does not care which way the edge faces", () => {
    const width = 16;
    const rising = sobelMagnitude(step(width, 8), width, 8);
    const falling = sobelMagnitude(
      step(width, 8).map((v) => 1 - v) as unknown as Float32Array,
      width,
      8,
    );
    for (let i = 0; i < rising.length; i++) {
      expect(rising[i]!).toBeCloseTo(falling[i]!, 6);
    }
  });
});

describe("localContrast", () => {
  it("is zero on a flat field", () => {
    const flat = new Float32Array(256).fill(0.7);
    for (const value of localContrast(flat, 16, 16, 2)) expect(value).toBeCloseTo(0, 5);
  });

  it("is high in a checkerboard and low in a smooth ramp", () => {
    const size = 32;
    const checker = new Float32Array(size * size);
    const ramp = new Float32Array(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        checker[y * size + x] = (x + y) % 2;
        ramp[y * size + x] = x / (size - 1);
      }
    }

    const middle = 16 * size + 16;
    expect(localContrast(checker, size, size, 2)[middle]!).toBeGreaterThan(
      localContrast(ramp, size, size, 2)[middle]! * 5,
    );
  });

  it("never returns NaN when the variance rounds below zero", () => {
    const tiny = new Float32Array(64).fill(1e-8);
    for (const value of localContrast(tiny, 8, 8, 1)) expect(Number.isNaN(value)).toBe(false);
  });
});

describe("luminanceField", () => {
  it("reads one value per pixel from RGBA bytes", () => {
    const pixels = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255]);
    const luma = luminanceField(pixels, 2, 1);
    expect(luma.length).toBe(2);
    expect(luma[0]!).toBeCloseTo(1, 5);
    expect(luma[1]!).toBe(0);
  });
});

describe("importanceComponents", () => {
  const size = 32;

  function photo(): Uint8ClampedArray {
    const data = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const level = x < size / 2 ? 20 : 230;
        const p = (y * size + x) * 4;
        data[p] = level;
        data[p + 1] = level;
        data[p + 2] = level;
        data[p + 3] = 255;
      }
    }
    return data;
  }

  it("returns three normalised maps the size of the image", () => {
    const depth = new Float32Array(size * size).fill(0.5);
    const components = importanceComponents({ width: size, height: size, pixels: photo(), depth });

    for (const map of [components.edges, components.texture, components.depthEdges]) {
      expect(map.length).toBe(size * size);
      expect(Math.min(...map)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...map)).toBeLessThanOrEqual(1);
    }
  });

  it("finds the colour edge in the middle of the frame", () => {
    const depth = new Float32Array(size * size).fill(0.5);
    const { edges } = importanceComponents({ width: size, height: size, pixels: photo(), depth });
    const row = 16 * size;

    expect(edges[row + 16]!).toBeGreaterThan(edges[row + 2]!);
  });

  it("rejects a depth map of the wrong size", () => {
    expect(() =>
      importanceComponents({
        width: size,
        height: size,
        pixels: photo(),
        depth: new Float32Array(4),
      }),
    ).toThrow(RangeError);
  });
});

describe("mixImportance", () => {
  const components: ImportanceComponents = {
    width: 2,
    height: 1,
    edges: new Float32Array([1, 0]),
    texture: new Float32Array([0, 1]),
    depthEdges: new Float32Array([0, 0]),
  };

  it("keeps the floor under the quietest pixel", () => {
    const mixed = mixImportance(components, {
      edges: 1,
      texture: 0,
      depthEdges: 0,
      floor: 0.25,
    });
    expect(mixed[0]!).toBeCloseTo(1, 6);
    expect(mixed[1]!).toBeCloseTo(0.25, 6);
  });

  it("treats the weights as shares, not gains", () => {
    const single = mixImportance(components, defaultImportanceWeights);
    const doubled = mixImportance(components, {
      ...defaultImportanceWeights,
      edges: defaultImportanceWeights.edges * 2,
      texture: defaultImportanceWeights.texture * 2,
      depthEdges: defaultImportanceWeights.depthEdges * 2,
    });

    for (let i = 0; i < single.length; i++) expect(doubled[i]!).toBeCloseTo(single[i]!, 6);
  });

  it("falls back to a flat map when every weight is zero", () => {
    const mixed = mixImportance(components, { edges: 0, texture: 0, depthEdges: 0, floor: 0 });
    expect(Array.from(mixed)).toEqual([1, 1]);
  });
});
