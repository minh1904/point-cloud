import { describe, expect, it } from "vitest";

import { BUILT_IN_PRESETS } from "./presets";
import { defaultValues, PARAM_BY_KEY, PARAMS } from "./schema";

describe("built-in presets", () => {
  it("each carry a complete set of values", () => {
    for (const preset of BUILT_IN_PRESETS) {
      expect(Object.keys(preset.values).length).toBe(PARAMS.length);
    }
  });

  it("only hold values the schema accepts", () => {
    for (const preset of BUILT_IN_PRESETS) {
      for (const param of PARAMS) {
        const value = preset.values[param.key];
        if (param.kind === "number") {
          expect(value).toBeGreaterThanOrEqual(param.min);
          expect(value).toBeLessThanOrEqual(param.max);
        } else if (param.kind === "enum") {
          expect(param.options).toContain(value);
        } else {
          expect(typeof value).toBe("boolean");
        }
      }
    }
  });

  it("have unique names", () => {
    const names = BUILT_IN_PRESETS.map((preset) => preset.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("start with one that is exactly the defaults", () => {
    expect(BUILT_IN_PRESETS[0]!.values).toEqual(defaultValues());
  });

  it("actually differ from the defaults, except that one", () => {
    for (const preset of BUILT_IN_PRESETS.slice(1)) {
      const changed = PARAMS.filter(
        (param) => preset.values[param.key] !== PARAM_BY_KEY.get(param.key)!.default,
      );
      expect(changed.length).toBeGreaterThan(3);
    }
  });
});
