import { describe, expect, it } from "vitest";

import { pixelOffset, workingSize } from "./decode-image";

describe("workingSize", () => {
  it("caps the long side and keeps the aspect", () => {
    expect(workingSize(4000, 3000, 1024)).toEqual({ width: 1024, height: 768 });
    expect(workingSize(3000, 4000, 1024)).toEqual({ width: 768, height: 1024 });
  });

  it("never upscales", () => {
    expect(workingSize(640, 480, 1024)).toEqual({ width: 640, height: 480 });
  });

  it("keeps a sliver of a panorama rather than rounding it to nothing", () => {
    // 4000x3 scaled by 1024/4000 puts the short side at 0.77 px.
    expect(workingSize(4000, 3, 1024)).toEqual({ width: 1024, height: 1 });
  });

  it("rejects an image with no area", () => {
    expect(() => workingSize(0, 100)).toThrow(RangeError);
  });
});

describe("pixelOffset", () => {
  it("addresses RGBA pixels row by row", () => {
    expect(pixelOffset(0, 0, 16)).toBe(0);
    expect(pixelOffset(1, 0, 16)).toBe(4);
    expect(pixelOffset(0, 1, 16)).toBe(64);
    expect(pixelOffset(15, 15, 16)).toBe(1020);
  });
});
