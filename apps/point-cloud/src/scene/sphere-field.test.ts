import { describe, expect, it } from "vitest";

import { createRandomness, createScales, createSphereField } from "./sphere-field";

/** Small deterministic PRNG (mulberry32) so the statistics are reproducible. */
function seeded(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function radii(positions: Float32Array): number[] {
  const out: number[] = [];
  for (let i = 0; i < positions.length; i += 3) {
    out.push(Math.hypot(positions[i]!, positions[i + 1]!, positions[i + 2]!));
  }
  return out;
}

describe("createSphereField", () => {
  it("returns three floats per point", () => {
    expect(createSphereField(10, 1)).toHaveLength(30);
  });

  it("keeps every point inside the sphere", () => {
    const r = radii(createSphereField(5000, 2, seeded(1)));
    expect(Math.max(...r)).toBeLessThanOrEqual(2);
  });

  it("fills the volume uniformly (1/8 of points inside half the radius)", () => {
    const count = 20000;
    const r = radii(createSphereField(count, 1, seeded(2)));
    const inner = r.filter((d) => d < 0.5).length / count;

    // Volume ratio (0.5)³ = 0.125. Without the cube root it would be 0.5.
    expect(inner).toBeCloseTo(0.125, 2);
  });

  it("does not bunch points at the poles", () => {
    const count = 20000;
    const p = createSphereField(count, 1, seeded(3));
    let nearPole = 0;
    for (let i = 0; i < p.length; i += 3) {
      const d = Math.hypot(p[i]!, p[i + 1]!, p[i + 2]!);
      if (d > 0 && Math.abs(p[i + 2]! / d) > 0.9) nearPole++;
    }

    // Uniform directions: |cos φ| > 0.9 covers 10% of the sphere's surface.
    expect(nearPole / count).toBeCloseTo(0.1, 2);
  });
});

describe("createScales", () => {
  it("returns one value per point inside [min, max]", () => {
    const scales = createScales(5000, 0.5, 1, seeded(4));

    expect(scales).toHaveLength(5000);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.5);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1);
  });

  it("spreads values evenly across the range", () => {
    const scales = createScales(20000, 0.5, 1, seeded(5));
    const mean = scales.reduce((sum, s) => sum + s, 0) / scales.length;

    expect(mean).toBeCloseTo(0.75, 2);
  });
});

describe("createRandomness", () => {
  it("returns three values in [0, 1) per point", () => {
    const values = createRandomness(1000, seeded(6));

    expect(values).toHaveLength(3000);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
  });
});
