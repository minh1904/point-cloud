import { describe, expect, it } from "vitest";

import { boxBlur, luminance, normalise } from "./filters";

/** The definition the separable version has to agree with. */
function naiveBoxBlur(
  values: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const out = new Float32Array(values.length);
  const clamp = (v: number, limit: number) => (v < 0 ? 0 : v >= limit ? limit - 1 : v);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          sum += values[clamp(y + dy, height) * width + clamp(x + dx, width)]!;
          count++;
        }
      }
      out[y * width + x] = sum / count;
    }
  }
  return out;
}

describe("boxBlur", () => {
  it("leaves a constant field alone", () => {
    const flat = new Float32Array(64).fill(0.25);
    for (const value of boxBlur(flat, 8, 8, 2, 3)) {
      expect(value).toBeCloseTo(0.25, 6);
    }
  });

  it("matches a naive square average, which is what separable means", () => {
    const width = 11;
    const height = 7;
    const values = new Float32Array(width * height);
    for (let i = 0; i < values.length; i++) values[i] = Math.sin(i * 1.7) * 0.5 + 0.5;

    const separable = boxBlur(values, width, height, 2);
    const naive = naiveBoxBlur(values, width, height, 2);

    for (let i = 0; i < values.length; i++) {
      expect(separable[i]!).toBeCloseTo(naive[i]!, 5);
    }
  });

  it("spreads a spike without changing the total much", () => {
    const values = new Float32Array(81);
    values[40] = 1;
    const blurred = boxBlur(values, 9, 9, 1);

    expect(blurred[40]!).toBeLessThan(1);
    expect(blurred[40]!).toBeGreaterThan(0);
    expect(blurred[39]!).toBeGreaterThan(0);
  });

  it("copies rather than mutating its input", () => {
    const values = new Float32Array([0, 1, 0, 1]);
    boxBlur(values, 2, 2, 1, 2);
    expect(Array.from(values)).toEqual([0, 1, 0, 1]);
  });

  it("rejects a buffer that is not width * height", () => {
    expect(() => boxBlur(new Float32Array(10), 4, 4, 1)).toThrow(RangeError);
  });
});

describe("normalise", () => {
  it("stretches to exactly 0 and 1", () => {
    const out = normalise(new Float32Array([2, 4, 6]));
    expect(Array.from(out)).toEqual([0, 0.5, 1]);
  });

  it("sends a flat field to the middle instead of dividing by zero", () => {
    const out = normalise(new Float32Array([3, 3, 3]));
    expect(Array.from(out)).toEqual([0.5, 0.5, 0.5]);
  });

  it("handles negative values, which a depth model will produce", () => {
    const out = normalise(new Float32Array([-4, 0, 4]));
    expect(Array.from(out)).toEqual([0, 0.5, 1]);
  });
});

describe("luminance", () => {
  it("weights green far above blue", () => {
    expect(luminance(0, 255, 0)).toBeGreaterThan(luminance(0, 0, 255) * 9);
  });

  it("runs 0 to 1", () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 6);
  });
});
