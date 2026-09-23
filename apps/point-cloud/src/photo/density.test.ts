import { describe, expect, it } from "vitest";

import { pointDensity } from "./density";

/** Points on a regular lattice of the given spacing, filling width x height. */
function lattice(width: number, height: number, spacing: number): Float32Array {
  const xs: number[] = [];
  for (let y = spacing / 2; y < height; y += spacing) {
    for (let x = spacing / 2; x < width; x += spacing) xs.push(x, y);
  }
  return Float32Array.from(xs);
}

describe("pointDensity", () => {
  it("reads an even cloud as the middle of the range, not as a gradient", () => {
    const points = lattice(64, 64, 4);
    const density = pointDensity({ points, width: 64, height: 64 });

    // The interior of a lattice has no variation to report, so every value
    // must land on the neutral 0.5 — a min/max normalisation would stretch
    // the border noise across the whole range instead.
    const columns = 16;
    for (let row = 1; row < columns - 1; row++) {
      for (let column = 1; column < columns - 1; column++) {
        expect(density[row * columns + column]!).toBeCloseTo(0.5, 5);
      }
    }
  });

  it("calls the crowded half denser than the sparse half", () => {
    // Left half packed at 2px spacing, right half at 8px.
    const values: number[] = [];
    for (let y = 1; y < 64; y += 2) for (let x = 1; x < 32; x += 2) values.push(x, y);
    const dense = values.length / 2;
    for (let y = 4; y < 64; y += 8) for (let x = 36; x < 64; x += 8) values.push(x, y);
    const points = Float32Array.from(values);

    const density = pointDensity({ points, width: 64, height: 64 });

    let denseSum = 0;
    for (let i = 0; i < dense; i++) denseSum += density[i]!;
    let sparseSum = 0;
    for (let i = dense; i < points.length / 2; i++) sparseSum += density[i]!;

    expect(denseSum / dense).toBeGreaterThan(
      sparseSum / (points.length / 2 - dense) + 0.4,
    );
  });

  it("returns one value per point, all inside 0 and 1", () => {
    const points = lattice(32, 32, 3);
    const density = pointDensity({ points, width: 32, height: 32 });

    expect(density.length).toBe(points.length / 2);
    for (const value of density) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it("does not divide by zero when two points coincide", () => {
    const points = Float32Array.from([5, 5, 5, 5, 5, 5, 9, 9, 12, 3, 20, 20, 2, 18]);
    const density = pointDensity({ points, width: 32, height: 32, neighbours: 3 });

    for (const value of density) expect(Number.isFinite(value)).toBe(true);
  });

  it("gives a flat answer when there are fewer points than neighbours", () => {
    const density = pointDensity({
      points: Float32Array.from([1, 1, 2, 2]),
      width: 8,
      height: 8,
      neighbours: 6,
    });
    expect(Array.from(density)).toEqual([0.5, 0.5]);
  });
});
