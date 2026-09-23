import { describe, expect, it } from "vitest";

import { decode } from "@/bundle/position-codec";

import type { PointCloud } from "./lift";
import { packCloud, pointsForSize } from "./pack-bundle";

function cloud(count: number): PointCloud {
  const positions = new Float32Array(count * 3);
  const colors = new Uint8ClampedArray(count * 3);
  const density = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (i / count) * 2 - 1;
    positions[i * 3 + 1] = 0.5 - i / count;
    positions[i * 3 + 2] = (i % 7) * 0.01;
    colors[i * 3] = i % 256;
    colors[i * 3 + 1] = 17;
    colors[i * 3 + 2] = 200;
    density[i] = i / (count - 1);
  }

  return { count, positions, colors, density };
}

const options = { size: 8, depthKind: "heuristic", relief: 0.09, aspect: 1.5 };

describe("packCloud", () => {
  it("writes four channels per texel for every map", () => {
    const packed = packCloud(cloud(pointsForSize(8)), options);
    const texels = pointsForSize(8);

    expect(packed.color.length).toBe(texels * 4);
    expect(packed.positionHigh.length).toBe(texels * 4);
    expect(packed.positionLow.length).toBe(texels * 4);
  });

  it("puts crowding in the colour map's alpha", () => {
    const source = cloud(pointsForSize(8));
    const packed = packCloud(source, options);

    expect(packed.color[3]!).toBe(0);
    expect(packed.color[(source.count - 1) * 4 + 3]!).toBe(255);
    // And the colour itself is untouched by it.
    expect(packed.color[0]!).toBe(source.colors[0]!);
    expect(packed.color[1]!).toBe(17);
    expect(packed.color[2]!).toBe(200);
  });

  it("round-trips positions through the 16-bit encoding", () => {
    const source = cloud(pointsForSize(8));
    const packed = packCloud(source, options);
    const { min, max } = packed.metadata.bounds;

    for (let i = 0; i < source.count; i++) {
      for (let axis = 0; axis < 3; axis++) {
        const decoded = decode(
          packed.positionHigh[i * 4 + axis]!,
          packed.positionLow[i * 4 + axis]!,
          min[axis]!,
          max[axis]!,
        );
        expect(decoded).toBeCloseTo(source.positions[i * 3 + axis]!, 4);
      }
    }
  });

  it("describes itself in the metadata", () => {
    const packed = packCloud(cloud(pointsForSize(8)), options);

    expect(packed.metadata.width).toBe(8);
    expect(packed.metadata.height).toBe(8);
    expect(packed.metadata.particleCount).toBe(64);
    expect(packed.metadata.precision).toBe(16);
    expect(packed.metadata.depth?.kind).toBe("heuristic");
    expect(packed.metadata.depth?.relief).toBe(0.09);
  });

  it("refuses a cloud that does not fill the texture exactly", () => {
    expect(() => packCloud(cloud(63), options)).toThrow(RangeError);
  });
});
