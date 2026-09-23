import { describe, expect, it } from "vitest";

import {
  computeBounds,
  decode,
  decodePositions,
  encodePositions,
  MAX_16_BIT,
  quantisationStep,
  type Bounds,
} from "./position-codec";

const BOUNDS: Bounds = { min: [-1.5, -1, -0.045], max: [1.5, 1, 0.045] };

describe("computeBounds", () => {
  it("finds the range of each axis independently", () => {
    const bounds = computeBounds(new Float32Array([0, 10, -5, 2, -10, 5, -2, 0, 0]));

    expect(bounds.min).toEqual([-2, -10, -5]);
    expect(bounds.max).toEqual([2, 10, 5]);
  });

  it("widens an axis with no extent so decoding cannot divide by zero", () => {
    // Every particle on the same plane: the flat grid P3.2 rendered.
    const bounds = computeBounds(new Float32Array([1, 2, 0, -1, -2, 0]));

    expect(bounds.max[2]! - bounds.min[2]!).toBeGreaterThan(0);
    expect(Number.isFinite(decode(128, 0, bounds.min[2]!, bounds.max[2]!))).toBe(true);
  });

  it("rejects buffers that are not whole positions", () => {
    expect(() => computeBounds(new Float32Array([]))).toThrow(RangeError);
    expect(() => computeBounds(new Float32Array([1, 2]))).toThrow(RangeError);
  });
});

describe("encode / decode round trip", () => {
  it("returns every position within one quantisation step", () => {
    const positions = new Float32Array(3 * 2000);
    for (let i = 0; i < positions.length; i += 3) {
      positions[i] = -1.5 + 3 * ((i / 3) % 97) / 96;
      positions[i + 1] = -1 + 2 * ((i / 3) % 53) / 52;
      positions[i + 2] = -0.045 + 0.09 * ((i / 3) % 31) / 30;
    }

    const { high, low } = encodePositions(positions, BOUNDS);
    const decoded = decodePositions(high, low, BOUNDS);

    for (let i = 0; i < positions.length; i++) {
      const axis = i % 3;
      const step = quantisationStep(BOUNDS.min[axis]!, BOUNDS.max[axis]!);
      // Rounding to the nearest level, so the error is at most half a step.
      expect(Math.abs(decoded[i]! - positions[i]!)).toBeLessThanOrEqual(step * 0.5 + 1e-7);
    }
  });

  it("maps the ends of the range exactly", () => {
    const positions = new Float32Array([-1.5, -1, -0.045, 1.5, 1, 0.045]);
    const { high, low } = encodePositions(positions, BOUNDS);

    expect(Array.from(high)).toEqual([0, 0, 0, 255, 255, 255]);
    expect(Array.from(low)).toEqual([0, 0, 0, 255, 255, 255]);

    const decoded = decodePositions(high, low, BOUNDS);
    expect(decoded[0]).toBeCloseTo(-1.5, 6);
    expect(decoded[3]).toBeCloseTo(1.5, 6);
  });

  it("clamps positions that fall outside the bounds", () => {
    const positions = new Float32Array([-99, 99, 0]);
    const { high, low } = encodePositions(positions, BOUNDS);

    expect([high[0], low[0]]).toEqual([0, 0]);
    expect([high[1], low[1]]).toEqual([255, 255]);
  });

  it("refuses mismatched buffers", () => {
    expect(() => decodePositions(new Uint8Array(3), new Uint8Array(6), BOUNDS)).toThrow(RangeError);
    expect(() => encodePositions(new Float32Array([1, 2]), BOUNDS)).toThrow(RangeError);
  });
});

describe("the 16-bit split", () => {
  it("puts the coarse byte in high and the fine byte in low", () => {
    // Mid-range: 0.5 * 65535 = 32767.5, rounds to 32768 = 0x8000.
    const { high, low } = encodePositions(new Float32Array([0, 0, 0]), BOUNDS);

    expect(high[0]).toBe(0x80);
    expect(low[0]).toBe(0x00);
  });

  it("moves only the low byte for a step far below 8-bit resolution", () => {
    const step = quantisationStep(BOUNDS.min[0]!, BOUNDS.max[0]!);
    // Sit exactly on level 12345 so the next step cannot land on a .5 boundary
    // and round the wrong way.
    const base = BOUNDS.min[0]! + 12345 * step;
    const a = encodePositions(new Float32Array([base, 0, 0]), BOUNDS);
    const b = encodePositions(new Float32Array([base + step, 0, 0]), BOUNDS);

    expect([a.high[0], a.low[0]]).toEqual([12345 >> 8, 12345 & 0xff]);
    expect(b.high[0]).toBe(a.high[0]);
    expect(b.low[0]).toBe(a.low[0]! + 1);
  });

  it("resolves detail that a single byte would flatten", () => {
    // Two particles a third of a grid cell apart: invisible to 8 bits.
    const spacing = 3 / 256;
    const positions = new Float32Array([0, 0, 0, spacing / 3, 0, 0]);

    const eightBit = positions.map((v) => {
      const t = (v - BOUNDS.min[0]!) / (BOUNDS.max[0]! - BOUNDS.min[0]!);
      return Math.round(t * 255);
    });
    expect(eightBit[0]).toBe(eightBit[3]); // collapsed onto the same level

    const { high, low } = encodePositions(positions, BOUNDS);
    expect([high[0], low[0]]).not.toEqual([high[3], low[3]]);
  });
});

describe("the 65535 vs 65536 divisor", () => {
  it("reaches the top of the range with 65535", () => {
    expect(decode(255, 255, 0, 100)).toBeCloseTo(100, 9);
  });

  it("falls short of it with the original shader's 65536", () => {
    const original = (0 * 1) + ((255 * 256 + 255) / 65536) * 100;

    expect(original).toBeLessThan(100);
    // Exactly one part in 65536 of the range — ~15 ppm. Harmless on its own,
    // but it squeezes the whole cloud toward min, and it is only accidentally
    // this close because the texture happens to be 256².
    expect(100 - original).toBeCloseTo(100 / 65536, 10);
  });
});

describe("the GLSL mirror", () => {
  // The shader reads a byte as a float in 0..1 and multiplies by 255 again:
  //   vec3 hi = texture2D(uPositionHigh, uv).rgb * 255.0;
  // float32 cannot represent byte/255 exactly, so this checks that the
  // round-trip through that division survives to the same world position.
  function decodeLikeGlsl(high: number, low: number, min: number, max: number): number {
    const hi = Math.fround(Math.fround(high / 255) * 255);
    const lo = Math.fround(Math.fround(low / 255) * 255);
    const n = Math.fround((hi * 256 + lo) / MAX_16_BIT);
    return min + n * (max - min);
  }

  it("agrees with the CPU decoder to well under one quantisation step", () => {
    const step = quantisationStep(BOUNDS.min[0]!, BOUNDS.max[0]!);

    for (let q = 0; q <= MAX_16_BIT; q += 257) {
      const high = q >> 8;
      const low = q & 0xff;
      const cpu = decode(high, low, BOUNDS.min[0]!, BOUNDS.max[0]!);
      const gpu = decodeLikeGlsl(high, low, BOUNDS.min[0]!, BOUNDS.max[0]!);

      expect(Math.abs(gpu - cpu)).toBeLessThan(step * 0.01);
    }
  });
});
