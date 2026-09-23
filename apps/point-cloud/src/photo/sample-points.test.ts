import { describe, expect, it } from "vitest";

import { mulberry32, samplePoints } from "./sample-points";

const WIDTH = 64;
const HEIGHT = 64;

/** Importance 1 on the left half of the image, `low` on the right. */
function halves(low: number): Float32Array {
  const map = new Float32Array(WIDTH * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) map[y * WIDTH + x] = x < WIDTH / 2 ? 1 : low;
  }
  return map;
}

/** Mean distance from each point to its nearest neighbour, brute force. */
function meanNearestDistance(points: Float32Array): number {
  const count = points.length / 2;
  let total = 0;

  for (let i = 0; i < count; i++) {
    let best = Infinity;
    for (let j = 0; j < count; j++) {
      if (i === j) continue;
      const dx = points[j * 2]! - points[i * 2]!;
      const dy = points[j * 2 + 1]! - points[i * 2 + 1]!;
      const squared = dx * dx + dy * dy;
      if (squared < best) best = squared;
    }
    total += Math.sqrt(best);
  }

  return total / count;
}

describe("mulberry32", () => {
  it("repeats exactly for the same seed", () => {
    const a = mulberry32(7);
    const b = mulberry32(7);
    for (let i = 0; i < 20; i++) expect(a()).toBe(b());
  });

  it("gives different streams for different seeds", () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it("stays inside 0 and 1", () => {
    const random = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

describe("samplePoints", () => {
  it("places the requested number of points inside the image", () => {
    const points = samplePoints({
      width: WIDTH,
      height: HEIGHT,
      importance: halves(1),
      count: 400,
    });

    expect(points.length).toBe(800);
    for (let i = 0; i < 400; i++) {
      expect(points[i * 2]!).toBeGreaterThanOrEqual(0);
      expect(points[i * 2]!).toBeLessThan(WIDTH + 1);
      expect(points[i * 2 + 1]!).toBeGreaterThanOrEqual(0);
      expect(points[i * 2 + 1]!).toBeLessThan(HEIGHT + 1);
    }
  });

  it("follows the importance map", () => {
    const points = samplePoints({
      width: WIDTH,
      height: HEIGHT,
      importance: halves(0.1),
      count: 2000,
      seed: 3,
    });

    let left = 0;
    for (let i = 0; i < 2000; i++) if (points[i * 2]! < WIDTH / 2) left++;

    // Weights of 1 against 0.1 should put roughly ten times as many points on
    // the left; anything above 80% proves the distribution is being followed.
    expect(left / 2000).toBeGreaterThan(0.8);
  });

  it("spaces points more evenly than plain random sampling", () => {
    const importance = halves(1);
    const random = samplePoints({
      width: WIDTH,
      height: HEIGHT,
      importance,
      count: 500,
      candidates: 1,
      seed: 5,
    });
    const blue = samplePoints({
      width: WIDTH,
      height: HEIGHT,
      importance,
      count: 500,
      candidates: 8,
      seed: 5,
    });

    // This is the whole point of Mitchell's best-candidate: for the same
    // number of points in the same area, blue noise pushes the typical
    // nearest-neighbour distance up, because there are no clumps left.
    expect(meanNearestDistance(blue)).toBeGreaterThan(meanNearestDistance(random) * 1.2);
  });

  it("is reproducible from its seed", () => {
    const options = { width: WIDTH, height: HEIGHT, importance: halves(0.3), count: 300 };
    const a = samplePoints({ ...options, seed: 11 });
    const b = samplePoints({ ...options, seed: 11 });
    const c = samplePoints({ ...options, seed: 12 });

    expect(Array.from(a)).toEqual(Array.from(b));
    expect(Array.from(a)).not.toEqual(Array.from(c));
  });

  it("still produces a cloud from an empty importance map", () => {
    const points = samplePoints({
      width: WIDTH,
      height: HEIGHT,
      importance: new Float32Array(WIDTH * HEIGHT),
      count: 100,
    });
    expect(points.length).toBe(200);
    expect(points.some((v) => v > 0)).toBe(true);
  });

  it("rejects an importance map of the wrong size", () => {
    expect(() =>
      samplePoints({ width: 8, height: 8, importance: new Float32Array(9), count: 4 }),
    ).toThrow(RangeError);
  });
});
