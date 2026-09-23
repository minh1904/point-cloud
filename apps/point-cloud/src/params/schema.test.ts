import { describe, expect, it } from "vitest";

import {
  coerce,
  defaultNumber,
  defaultValues,
  PARAM_BY_KEY,
  PARAM_GROUPS,
  PARAMS,
  paramsInGroup,
  sanitiseValues,
  UNIFORM_PARAMS,
} from "./schema";

describe("the schema itself", () => {
  it("has no duplicate keys", () => {
    const keys = PARAMS.map((param) => param.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("has no duplicate uniforms", () => {
    const uniforms = PARAMS.map((param) => param.uniform).filter(Boolean);
    expect(new Set(uniforms).size).toBe(uniforms.length);
  });

  it("only declares a uniform on parameters that write one", () => {
    for (const param of PARAMS) {
      if (param.stage === "scene") expect(param.uniform).toBeUndefined();
      else expect(param.uniform).toBeTruthy();
    }
  });

  it("puts every parameter in a declared group", () => {
    const groups = new Set(PARAM_GROUPS.map((group) => group.id));
    for (const param of PARAMS) expect(groups.has(param.group)).toBe(true);
  });

  it("gives every number a default inside its own range", () => {
    for (const param of PARAMS) {
      if (param.kind !== "number") continue;
      expect(param.min).toBeLessThan(param.max);
      expect(param.default).toBeGreaterThanOrEqual(param.min);
      expect(param.default).toBeLessThanOrEqual(param.max);
    }
  });

  it("gives every enum a default that is one of its options", () => {
    for (const param of PARAMS) {
      if (param.kind !== "enum") continue;
      expect(param.options).toContain(param.default);
    }
  });

  it("accounts for every parameter exactly once across the groups", () => {
    const counted = PARAM_GROUPS.reduce(
      (total, group) => total + paramsInGroup(group.id).length,
      0,
    );
    expect(counted).toBe(PARAMS.length);
  });

  it("splits the uniform-writing parameters by stage", () => {
    const listed = UNIFORM_PARAMS.points.length + UNIFORM_PARAMS.post.length;
    expect(listed).toBe(PARAMS.filter((param) => param.uniform).length);
    for (const param of UNIFORM_PARAMS.points) expect(param.stage).toBe("points");
    for (const param of UNIFORM_PARAMS.post) expect(param.stage).toBe("post");
  });
});

describe("defaultValues", () => {
  it("returns one value per parameter", () => {
    const values = defaultValues();
    expect(Object.keys(values).length).toBe(PARAMS.length);
    for (const param of PARAMS) expect(values[param.key]).toBe(param.default);
  });

  it("returns a fresh object each time, so one caller cannot poison another", () => {
    const first = defaultValues();
    first.size = 99;
    expect(defaultValues().size).toBe(PARAM_BY_KEY.get("size")!.default);
  });
});

describe("coerce", () => {
  const size = PARAM_BY_KEY.get("size")!;
  const grade = PARAM_BY_KEY.get("grade")!;
  const debug = PARAM_BY_KEY.get("debugNoise")!;

  it("clamps numbers into range", () => {
    expect(coerce(size, 100)).toBe(0.1);
    expect(coerce(size, -5)).toBe(0.005);
    expect(coerce(size, 0.02)).toBe(0.02);
  });

  it("falls back to the default for values that are not numbers at all", () => {
    expect(coerce(size, "abc")).toBe(0.019);
    expect(coerce(size, NaN)).toBe(0.019);
    expect(coerce(size, null)).toBe(0.019);
  });

  it("rejects an enum value that is not an option", () => {
    expect(coerce(grade, "cool")).toBe("cool");
    expect(coerce(grade, "sepia")).toBe("warm");
  });

  it("takes only real booleans for a toggle", () => {
    expect(coerce(debug, true)).toBe(true);
    expect(coerce(debug, "true")).toBe(false);
  });
});

describe("sanitiseValues", () => {
  it("fills in keys the stored object never had", () => {
    const values = sanitiseValues({ size: 0.03 });
    expect(values.size).toBe(0.03);
    expect(values.softness).toBe(PARAM_BY_KEY.get("softness")!.default);
  });

  it("drops keys the schema no longer has", () => {
    const values = sanitiseValues({ size: 0.03, removedInP7: 12 });
    expect("removedInP7" in values).toBe(false);
  });

  it("survives anything at all", () => {
    for (const rubbish of [null, undefined, 7, "x", []]) {
      expect(Object.keys(sanitiseValues(rubbish)).length).toBe(PARAMS.length);
    }
  });
});

describe("defaultNumber", () => {
  it("reads a declared default", () => {
    expect(defaultNumber("fov")).toBe(16);
  });

  it("returns 0 for a key that is not a number parameter", () => {
    expect(defaultNumber("grade")).toBe(0);
    expect(defaultNumber("nope")).toBe(0);
  });
});
