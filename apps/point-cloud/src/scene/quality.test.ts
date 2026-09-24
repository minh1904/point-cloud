import { afterEach, describe, expect, it, vi } from "vitest";

import { detectTier, QUALITY_PROFILES, resolveProfile } from "./quality";

/** Pretend to be a particular machine for one assertion. */
function asDevice(cores: number, memory: number, coarse: boolean) {
  vi.stubGlobal("navigator", { hardwareConcurrency: cores, deviceMemory: memory });
  vi.stubGlobal("window", { matchMedia: () => ({ matches: coarse }) });
}

afterEach(() => vi.unstubAllGlobals());

describe("detectTier", () => {
  it("calls a weak phone low", () => {
    asDevice(4, 4, true);
    expect(detectTier()).toBe("low");
  });

  it("calls a strong tablet medium rather than low", () => {
    asDevice(8, 8, true);
    expect(detectTier()).toBe("medium");
  });

  it("calls a weak laptop medium", () => {
    asDevice(4, 8, false);
    expect(detectTier()).toBe("medium");
  });

  it("calls a desktop high", () => {
    asDevice(16, 16, false);
    expect(detectTier()).toBe("high");
  });

  it("assumes a modest machine when the browser will not say", () => {
    // Firefox and Safari report no deviceMemory at all, so that one defaults
    // generously (8 GB) rather than reading every one of them as weak. A
    // missing core count is much rarer and defaults conservatively instead.
    vi.stubGlobal("navigator", {});
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(detectTier()).toBe("medium");
  });

  it("does not punish Firefox and Safari for hiding deviceMemory", () => {
    vi.stubGlobal("navigator", { hardwareConcurrency: 12 });
    vi.stubGlobal("window", { matchMedia: () => ({ matches: false }) });
    expect(detectTier()).toBe("high");
  });
});

describe("resolveProfile", () => {
  it("takes an explicit choice over the detected tier", () => {
    expect(resolveProfile("low", "high")).toBe(QUALITY_PROFILES.low);
    expect(resolveProfile("high", "low")).toBe(QUALITY_PROFILES.high);
  });

  it("follows the detected tier on auto", () => {
    expect(resolveProfile("auto", "low")).toBe(QUALITY_PROFILES.low);
  });

  it("falls back to medium before anything has been detected", () => {
    expect(resolveProfile("auto", null)).toBe(QUALITY_PROFILES.medium);
  });

  it("ignores a setting that means nothing", () => {
    expect(resolveProfile("ultra", "high")).toBe(QUALITY_PROFILES.high);
  });
});

describe("the profiles themselves", () => {
  it("get cheaper as the tier drops", () => {
    expect(QUALITY_PROFILES.low.maxDpr).toBeLessThan(QUALITY_PROFILES.medium.maxDpr);
    expect(QUALITY_PROFILES.medium.maxDpr).toBeLessThan(QUALITY_PROFILES.high.maxDpr);
    expect(QUALITY_PROFILES.low.fbmOctaves).toBeLessThan(QUALITY_PROFILES.high.fbmOctaves);
  });

  it("keep the authored look at the top tier", () => {
    expect(QUALITY_PROFILES.high.fbmOctaves).toBe(4);
  });

  it("never ask for more than one octave", () => {
    for (const profile of Object.values(QUALITY_PROFILES)) {
      expect(profile.fbmOctaves).toBeGreaterThanOrEqual(1);
      expect(profile.maxDpr).toBeGreaterThanOrEqual(1);
    }
  });
});
