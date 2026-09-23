import { describe, expect, it } from "vitest";

import { createParticleGrid, DEFAULT_TEXTURE_SIZE } from "./particle-grid";

describe("createParticleGrid", () => {
  it("makes one particle per texel", () => {
    const grid = createParticleGrid(256);

    expect(grid.count).toBe(65_536);
    expect(grid.index).toHaveLength(65_536);
    expect(grid.particleUv).toHaveLength(65_536 * 2);
  });

  it("leaves every CPU position at zero", () => {
    const grid = createParticleGrid(64);

    expect(grid.positions).toHaveLength(64 * 64 * 3);
    expect(grid.positions.every((value) => value === 0)).toBe(true);
  });

  it("numbers the particles in order", () => {
    const grid = createParticleGrid(16);

    expect(grid.index[0]).toBe(0);
    expect(grid.index[255]).toBe(255);
    expect(grid.index.every((value, i) => value === i)).toBe(true);
  });

  it("aims at texel centres, not texel edges", () => {
    const grid = createParticleGrid(4);

    // Particle 0 owns column 0, row 0: half a texel in from both edges.
    expect(grid.particleUv[0]).toBeCloseTo(0.125, 6);
    expect(grid.particleUv[1]).toBeCloseTo(0.125, 6);

    // Particle 5 owns column 1, row 1.
    expect(grid.particleUv[10]).toBeCloseTo(0.375, 6);
    expect(grid.particleUv[11]).toBeCloseTo(0.375, 6);
  });

  it("stays clear of 0 and 1 so sampling never falls off the texture", () => {
    const grid = createParticleGrid(128);
    const margin = 0.5 / 128;

    for (let i = 0; i < grid.particleUv.length; i++) {
      expect(grid.particleUv[i]).toBeGreaterThanOrEqual(margin - 1e-6);
      expect(grid.particleUv[i]).toBeLessThanOrEqual(1 - margin + 1e-6);
    }
  });

  it("round-trips back to the texel a sampler would read", () => {
    const size = 256;
    const grid = createParticleGrid(size);

    // What the GPU does with a NearestFilter texture: uv -> texel coordinate.
    for (let i = 0; i < grid.count; i += 997) {
      const x = Math.floor(grid.particleUv[i * 2]! * size);
      const y = Math.floor(grid.particleUv[i * 2 + 1]! * size);

      expect(x).toBe(i % size);
      expect(y).toBe(Math.floor(i / size));
    }
  });

  it("gives every particle its own texel", () => {
    const size = 64;
    const grid = createParticleGrid(size);
    const seen = new Set<string>();

    for (let i = 0; i < grid.count; i++) {
      seen.add(`${grid.particleUv[i * 2]},${grid.particleUv[i * 2 + 1]}`);
    }

    expect(seen.size).toBe(grid.count);
  });

  it("defaults to a 256² texture", () => {
    expect(createParticleGrid().size).toBe(DEFAULT_TEXTURE_SIZE);
    expect(createParticleGrid().count).toBe(DEFAULT_TEXTURE_SIZE ** 2);
  });

  it("rejects sizes that cannot describe a texture", () => {
    expect(() => createParticleGrid(0)).toThrow(RangeError);
    expect(() => createParticleGrid(-8)).toThrow(RangeError);
    expect(() => createParticleGrid(12.5)).toThrow(RangeError);
  });
});
