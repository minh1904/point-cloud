import { describe, expect, it } from "vitest";

import { liftToCloud } from "./lift";

const WIDTH = 8;
const HEIGHT = 4;

function pixels(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(WIDTH * HEIGHT * 4);
  for (let i = 0; i < WIDTH * HEIGHT; i++) {
    data[i * 4] = i;
    data[i * 4 + 1] = 100;
    data[i * 4 + 2] = 200;
    data[i * 4 + 3] = 255;
  }
  return data;
}

const base = {
  width: WIDTH,
  height: HEIGHT,
  pixels: pixels(),
  fieldWidth: 4,
  relief: 0.2,
};

describe("liftToCloud", () => {
  it("maps pixel space onto a centred field with the photo's aspect", () => {
    const cloud = liftToCloud({
      ...base,
      points: Float32Array.from([0, 0, WIDTH, HEIGHT, WIDTH / 2, HEIGHT / 2]),
      density: Float32Array.from([0, 0.5, 1]),
      depth: new Float32Array(WIDTH * HEIGHT).fill(0.5),
    });

    // Top-left pixel -> left edge, top edge. Field is 4 wide, so 2 tall.
    expect(cloud.positions[0]!).toBeCloseTo(-2, 5);
    expect(cloud.positions[1]!).toBeCloseTo(1, 5);
    // Bottom-right -> right edge, bottom edge.
    expect(cloud.positions[3]!).toBeCloseTo(2, 5);
    expect(cloud.positions[4]!).toBeCloseTo(-1, 5);
    // Centre -> origin.
    expect(cloud.positions[6]!).toBeCloseTo(0, 5);
    expect(cloud.positions[7]!).toBeCloseTo(0, 5);
  });

  it("puts near depth in front of far depth", () => {
    const depth = new Float32Array(WIDTH * HEIGHT);
    depth.fill(0); // everything nearest
    const near = liftToCloud({
      ...base,
      points: Float32Array.from([4, 2]),
      density: Float32Array.from([1]),
      depth,
    });

    const far = liftToCloud({
      ...base,
      points: Float32Array.from([4, 2]),
      density: Float32Array.from([1]),
      depth: new Float32Array(WIDTH * HEIGHT).fill(1),
    });

    expect(near.positions[2]!).toBeGreaterThan(far.positions[2]!);
    // The whole relief is 0.2, so the two ends sit 0.2 apart.
    expect(near.positions[2]! - far.positions[2]!).toBeCloseTo(0.2, 5);
  });

  it("interpolates depth between pixels", () => {
    const depth = new Float32Array(WIDTH * HEIGHT);
    for (let y = 0; y < HEIGHT; y++) {
      depth[y * WIDTH + 2] = 0;
      depth[y * WIDTH + 3] = 1;
    }

    const cloud = liftToCloud({
      ...base,
      points: Float32Array.from([3, 2]),
      density: Float32Array.from([1]),
      depth,
    });

    // Halfway between the 0 pixel at x=2 and the 1 pixel at x=3.
    expect(cloud.positions[2]!).toBeCloseTo(0, 5);
  });

  it("takes colour from the nearest pixel, never a blend", () => {
    const cloud = liftToCloud({
      ...base,
      points: Float32Array.from([3.9, 0.1]),
      density: Float32Array.from([1]),
      depth: new Float32Array(WIDTH * HEIGHT),
    });

    expect(cloud.colors[0]!).toBe(3);
    expect(cloud.colors[1]!).toBe(100);
    expect(cloud.colors[2]!).toBe(200);
  });

  it("rejects mismatched inputs", () => {
    expect(() =>
      liftToCloud({
        ...base,
        points: Float32Array.from([1, 1]),
        density: Float32Array.from([1, 1]),
        depth: new Float32Array(WIDTH * HEIGHT),
      }),
    ).toThrow(RangeError);

    expect(() =>
      liftToCloud({
        ...base,
        points: Float32Array.from([1, 1]),
        density: Float32Array.from([1]),
        depth: new Float32Array(3),
      }),
    ).toThrow(RangeError);
  });
});
