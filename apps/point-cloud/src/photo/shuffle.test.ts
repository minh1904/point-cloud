import { describe, expect, it } from "vitest";

import type { PointCloud } from "./lift";
import { shuffleCloud, shuffledOrder } from "./shuffle";

function cloud(count: number): PointCloud {
  const positions = new Float32Array(count * 3);
  const colors = new Uint8ClampedArray(count * 3);
  const density = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = i;
    positions[i * 3 + 1] = i + 0.5;
    positions[i * 3 + 2] = -i;
    colors[i * 3] = i % 256;
    colors[i * 3 + 1] = (i * 2) % 256;
    colors[i * 3 + 2] = (i * 3) % 256;
    density[i] = i / count;
  }

  return { count, positions, colors, density };
}

describe("shuffledOrder", () => {
  it("is a permutation: every index exactly once", () => {
    const order = shuffledOrder(500, 4);
    expect(new Set(order).size).toBe(500);
    expect(Math.min(...order)).toBe(0);
    expect(Math.max(...order)).toBe(499);
  });

  it("repeats for the same seed and differs for another", () => {
    expect(Array.from(shuffledOrder(50, 7))).toEqual(Array.from(shuffledOrder(50, 7)));
    expect(Array.from(shuffledOrder(50, 7))).not.toEqual(Array.from(shuffledOrder(50, 8)));
  });

  it("actually moves things", () => {
    const order = shuffledOrder(200, 1);
    let fixed = 0;
    for (let i = 0; i < 200; i++) if (order[i] === i) fixed++;
    // A random permutation leaves one element in place on average.
    expect(fixed).toBeLessThan(10);
  });
});

describe("shuffleCloud", () => {
  it("keeps each point's fields together", () => {
    const source = cloud(64);
    const shuffled = shuffleCloud(source, 3);

    for (let i = 0; i < 64; i++) {
      // x is the original index, so it says which point this used to be, and
      // every other field must agree with it.
      const was = shuffled.positions[i * 3]!;
      expect(shuffled.positions[i * 3 + 1]!).toBeCloseTo(was + 0.5, 5);
      expect(shuffled.positions[i * 3 + 2]!).toBeCloseTo(-was, 5);
      expect(shuffled.colors[i * 3]!).toBe(was % 256);
      expect(shuffled.density[i]!).toBeCloseTo(was / 64, 5);
    }
  });

  it("loses no points", () => {
    const shuffled = shuffleCloud(cloud(128), 2);
    const seen = new Set<number>();
    for (let i = 0; i < 128; i++) seen.add(shuffled.positions[i * 3]!);
    expect(seen.size).toBe(128);
  });

  it("leaves the source untouched", () => {
    const source = cloud(32);
    const before = Array.from(source.positions);
    shuffleCloud(source, 5);
    expect(Array.from(source.positions)).toEqual(before);
  });
});
