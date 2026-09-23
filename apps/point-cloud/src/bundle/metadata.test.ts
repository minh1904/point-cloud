import { describe, expect, it } from "vitest";

import { BUNDLE_VERSION, parseBundleMetadata } from "./metadata";

const valid = {
  version: 1,
  width: 256,
  height: 256,
  particleCount: 65536,
  precision: 16,
  bounds: { min: [-1.5, -1, -0.05], max: [1.5, 1, 0.05] },
  source: { image: "upload", aspect: 1.5 },
  depth: { kind: "depth-anything-v2-small", relief: 0.09 },
};

describe("parseBundleMetadata", () => {
  it("accepts a bundle this repo wrote", () => {
    const parsed = parseBundleMetadata(valid);
    expect(parsed.version).toBe(BUNDLE_VERSION);
    expect(parsed.particleCount).toBe(65536);
    expect(parsed.bounds.min).toEqual([-1.5, -1, -0.05]);
  });

  it("fills in a precision the file never stated", () => {
    const { precision, ...without } = valid;
    void precision;
    expect(parseBundleMetadata(without).precision).toBe(16);
  });

  it("accepts a bundle with no source or depth", () => {
    const { source, depth, ...bare } = valid;
    void source;
    void depth;
    expect(() => parseBundleMetadata(bare)).not.toThrow();
  });

  it("names the field that is wrong", () => {
    expect(() => parseBundleMetadata({ ...valid, width: 0 })).toThrow(/width/);
    expect(() => parseBundleMetadata({ ...valid, height: 128 })).toThrow(/height/);
    expect(() => parseBundleMetadata({ ...valid, particleCount: 10 })).toThrow(
      /particleCount/,
    );
  });

  it("refuses a texture that is not square", () => {
    expect(() =>
      parseBundleMetadata({ ...valid, height: 128, particleCount: 256 * 128 }),
    ).toThrow(/square/);
  });

  it("refuses bounds that would divide by zero", () => {
    expect(() =>
      parseBundleMetadata({
        ...valid,
        bounds: { min: [-1.5, -1, 0.05], max: [1.5, 1, 0.05] },
      }),
    ).toThrow(/bounds/);
  });

  it("refuses bounds that are not three numbers", () => {
    expect(() =>
      parseBundleMetadata({ ...valid, bounds: { min: [0, 0], max: [1, 1] } }),
    ).toThrow(/bounds/);
    expect(() =>
      parseBundleMetadata({
        ...valid,
        bounds: { min: [0, 0, "near"], max: [1, 1, 1] },
      }),
    ).toThrow(/bounds/);
  });

  it("refuses a version it has never heard of", () => {
    expect(() => parseBundleMetadata({ ...valid, version: 2 })).toThrow(/version/);
  });

  it("refuses anything that is not an object at all", () => {
    for (const rubbish of [null, undefined, 7, "metadata", []]) {
      expect(() => parseBundleMetadata(rubbish)).toThrow(TypeError);
    }
  });

  it("copies the bounds rather than aliasing the input", () => {
    const input = structuredClone(valid);
    const parsed = parseBundleMetadata(input);
    input.bounds.min[0] = 999;
    expect(parsed.bounds.min[0]).toBe(-1.5);
  });
});
