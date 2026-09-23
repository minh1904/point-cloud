/**
 * Every knob in the tool, declared once (P7.2).
 *
 * Until now a parameter had to be written out four times: a field on a params
 * interface, a default, a `<Slider>` in the studio, and a line in the effect
 * that copies it into a uniform. Four places to add, four to keep in step, and
 * the compiler could only catch two of them.
 *
 * Here a parameter is **one entry in an array**. The inspector renders itself
 * from the groups, the scene writes uniforms by walking the same list, presets
 * serialise by key, and P8's export will read the same thing. Adding a knob is
 * adding an entry — that is the whole test of whether this worked.
 *
 * The idea is not new: it is what a schema-driven control panel (leva, tweakpane,
 * Toolcraft) does. What is worth understanding is *why* it pays off here — the
 * data has four consumers, and a single description is the only way they cannot
 * disagree.
 */

/** Which part of the renderer a parameter reaches. */
export type ParamStage =
  /** A uniform on the particle material. */
  | "points"
  /** A uniform on the post-processing material. */
  | "post"
  /** Not a uniform at all — the camera, the render target, a texture URL. */
  | "scene";

export type GroupId = "particles" | "motion" | "lens" | "post";

export interface ParamGroup {
  id: GroupId;
  /** Panel heading. */
  label: string;
}

export const PARAM_GROUPS: readonly ParamGroup[] = [
  { id: "particles", label: "Particles" },
  { id: "motion", label: "Motion" },
  { id: "lens", label: "Lens" },
  { id: "post", label: "Post effects" },
];

interface ParamBase {
  /** Stable id. Presets and exports are keyed on it, so it must not change. */
  key: string;
  label: string;
  group: GroupId;
  stage: ParamStage;
  /** Uniform to write to. Omitted when `stage` is `"scene"`. */
  uniform?: string;
  /** One line for the help overlay and the inspector's title attribute. */
  hint?: string;
}

export interface NumberParam extends ParamBase {
  kind: "number";
  default: number;
  min: number;
  max: number;
  step: number;
  format?: Intl.NumberFormatOptions;
}

export interface ToggleParam extends ParamBase {
  kind: "toggle";
  default: boolean;
  /** Label while on; `label` is used while off. */
  onLabel?: string;
}

export interface EnumParam extends ParamBase {
  kind: "enum";
  default: string;
  options: readonly string[];
}

export type Param = NumberParam | ToggleParam | EnumParam;
export type ParamValue = number | boolean | string;
export type ParamValues = Record<string, ParamValue>;

/**
 * The knobs themselves.
 *
 * Comments that explain *why a number is what it is* live here now, next to
 * the number, rather than in the component that happened to render it.
 */
export const PARAMS: readonly Param[] = [
  // ── Particles ────────────────────────────────────────────────────────────
  {
    key: "size",
    label: "Size",
    group: "particles",
    stage: "points",
    uniform: "uSize",
    kind: "number",
    // Grid spacing is about 0.0117 world units, and points need several times
    // that to cover it: half are shrunk by the per-point 0.5-1 scale and a soft
    // rim contributes little alpha. The number changed at P5.6 without anything
    // looking different, because uScale started carrying the lens.
    default: 0.019,
    min: 0.005,
    max: 0.1,
    step: 0.001,
    format: { maximumFractionDigits: 3 },
    hint: "Point size in world units, before the per-point 0.5-1 variation",
  },
  {
    key: "softness",
    label: "Softness",
    group: "particles",
    stage: "points",
    uniform: "uSoftness",
    kind: "number",
    default: 0.5,
    min: 0,
    max: 1,
    step: 0.01,
    format: { maximumFractionDigits: 2 },
    hint: "0 is a hard disc, 1 fades from the centre out",
  },
  {
    key: "densityBoost",
    label: "Fill sparse",
    group: "particles",
    stage: "points",
    uniform: "uDensityBoost",
    kind: "number",
    // Tuned by eye against a 1024px photo: at 0.5 the sky still shows holes, at
    // 1.5 every point is a soft blob and the subject loses its edges.
    default: 0.9,
    min: 0,
    max: 1.5,
    step: 0.05,
    format: { maximumFractionDigits: 2 },
    hint: "How hard point size chases point spacing (P5.1). Does nothing to the sample grid",
  },

  // ── Motion ───────────────────────────────────────────────────────────────
  {
    key: "noiseAmplitude",
    label: "Amplitude",
    group: "motion",
    stage: "points",
    uniform: "uNoiseAmplitude",
    kind: "number",
    default: 0.012,
    min: 0,
    max: 0.15,
    step: 0.001,
    format: { maximumFractionDigits: 3 },
    hint: "Curl offset on screen, in normalised device units",
  },
  {
    key: "noiseFrequency",
    label: "Frequency",
    group: "motion",
    stage: "points",
    uniform: "uNoiseFrequency",
    kind: "number",
    default: 3,
    min: 0.2,
    max: 12,
    step: 0.1,
    format: { maximumFractionDigits: 1 },
    hint: "How many noise cells span the cloud: low is broad swells, high is churn",
  },
  {
    key: "noiseScatter",
    label: "Scatter",
    group: "motion",
    stage: "points",
    uniform: "uNoiseScatter",
    kind: "number",
    // Small on purpose: past ~0.5 neighbours stop sharing a flow at all and the
    // cloud shimmers in place instead of drifting.
    default: 0.15,
    min: 0,
    max: 4,
    step: 0.05,
    format: { maximumFractionDigits: 2 },
    hint: "How far apart neighbouring particles sample the field. 0 moves them as one",
  },
  {
    key: "breathe",
    label: "Breathe",
    group: "motion",
    stage: "points",
    uniform: "uBreathe",
    kind: "number",
    default: 0.01,
    min: 0,
    max: 0.08,
    step: 0.001,
    format: { maximumFractionDigits: 3 },
    hint: "Depth breathing in world units. Relief is only ~0.09, so this is small",
  },
  {
    key: "speed",
    label: "Speed",
    group: "motion",
    stage: "scene",
    kind: "number",
    default: 1,
    min: 0,
    max: 3,
    step: 0.1,
    format: { maximumFractionDigits: 1 },
    hint: "Multiplier on animation time. Advanced on the CPU so changes bend the motion smoothly",
  },
  {
    key: "debugNoise",
    label: "Show noise field",
    group: "motion",
    stage: "points",
    uniform: "uDebugNoise",
    kind: "toggle",
    default: false,
    onLabel: "Showing noise field",
    hint: "Paint the fBM field the motion is driven by onto the particles",
  },

  // ── Lens ─────────────────────────────────────────────────────────────────
  {
    key: "fov",
    label: "FOV",
    group: "lens",
    stage: "scene",
    kind: "number",
    // Telephoto. A long lens flattens perspective, which is most of why a relief
    // under 3% of the width still reads as a photograph.
    default: 16,
    min: 8,
    max: 60,
    step: 1,
    format: { maximumFractionDigits: 0 },
    hint: "Vertical field of view. The camera dollies to hold the framing, so this is compression, not zoom",
  },
  {
    key: "focalDepth",
    label: "Focus",
    group: "lens",
    stage: "points",
    uniform: "uFocalDepth",
    kind: "number",
    default: 0.45,
    min: 0,
    max: 1,
    step: 0.01,
    format: { maximumFractionDigits: 2 },
    hint: "Which depth slice is sharp, across the bundle's z bounds",
  },
  {
    key: "focalRange",
    label: "Range",
    group: "lens",
    stage: "points",
    uniform: "uFocalRange",
    kind: "number",
    // Wide because the depth spans the whole picture: under about 0.5 both ends
    // are thrown away and a sharp band is left across the middle.
    default: 0.8,
    min: 0.02,
    max: 1,
    step: 0.01,
    format: { maximumFractionDigits: 2 },
    hint: "How much depth stays sharp around the focus. Above ~0.6 everything is in focus",
  },
  {
    key: "edgeBokeh",
    label: "Edge",
    group: "lens",
    stage: "points",
    uniform: "uEdgeBokeh",
    kind: "number",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    format: { maximumFractionDigits: 2 },
    hint: "How strongly the left and right edges blow out and push apart",
  },
  {
    key: "gradeIntensity",
    label: "Grade",
    group: "lens",
    stage: "points",
    uniform: "uLutIntensity",
    kind: "number",
    // Not 1.0. A grade at full strength replaces the photograph's colour; a
    // grade held back leaves the original showing through it.
    default: 0.8,
    min: 0,
    max: 1,
    step: 0.01,
    format: { maximumFractionDigits: 2 },
    hint: "0 leaves the photo alone, 1 applies the grade in full",
  },
  {
    key: "grade",
    label: "LUT",
    group: "lens",
    stage: "scene",
    kind: "enum",
    default: "warm",
    // `neutral` is the identity grade: at full intensity it must leave the
    // picture untouched, which is the only real test that the lookup maths works.
    options: ["neutral", "warm", "cool"],
    hint: "Which baked colour grade to sample",
  },

  // ── Post effects ─────────────────────────────────────────────────────────
  {
    key: "renderScale",
    label: "Scale",
    group: "post",
    stage: "scene",
    kind: "number",
    default: 1,
    min: 0.5,
    max: 1,
    step: 0.05,
    format: { style: "percent" },
    hint: "Offscreen buffer size relative to the canvas. Point size stays invariant on screen",
  },
  {
    key: "vignette",
    label: "Vignette",
    group: "post",
    stage: "post",
    uniform: "uVignette",
    kind: "number",
    default: 0.35,
    min: 0,
    max: 1,
    step: 0.01,
    format: { maximumFractionDigits: 2 },
  },
  {
    key: "chromaticAberration",
    label: "Chromatic",
    group: "post",
    stage: "post",
    uniform: "uChromaticAberration",
    kind: "number",
    default: 0.002,
    min: 0,
    max: 0.02,
    step: 0.0005,
    format: { maximumFractionDigits: 4 },
  },
  {
    key: "grain",
    label: "Grain",
    group: "post",
    stage: "post",
    uniform: "uGrain",
    kind: "number",
    default: 0.025,
    min: 0,
    max: 0.15,
    step: 0.005,
    format: { maximumFractionDigits: 3 },
  },
];

/** Lookup by key. Built once; the schema never changes at runtime. */
export const PARAM_BY_KEY: ReadonlyMap<string, Param> = new Map(
  PARAMS.map((param) => [param.key, param]),
);

export function paramsInGroup(group: GroupId): readonly Param[] {
  return PARAMS.filter((param) => param.group === group);
}

/** Uniform-writing parameters for one stage, resolved once at module load. */
export const UNIFORM_PARAMS: Readonly<Record<"points" | "post", readonly Param[]>> = {
  points: PARAMS.filter((p) => p.stage === "points" && p.uniform),
  post: PARAMS.filter((p) => p.stage === "post" && p.uniform),
};

export function defaultValues(): ParamValues {
  const values: ParamValues = {};
  for (const param of PARAMS) values[param.key] = param.default;
  return values;
}

/** Clamp and coerce one incoming value — presets and storage are untrusted. */
export function coerce(param: Param, value: unknown): ParamValue {
  if (param.kind === "number") {
    // Strings are parsed because a numeric input will one day send one.
    // Everything else falls through to NaN on purpose: `Number(null)`,
    // `Number([])` and `Number(false)` are all 0, and a 0 would be *clamped
    // into range* rather than rejected — so a corrupt preset would quietly
    // pin every parameter to its minimum instead of its default.
    const number =
      typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (!Number.isFinite(number)) return param.default;
    return Math.min(param.max, Math.max(param.min, number));
  }
  if (param.kind === "toggle") return typeof value === "boolean" ? value : param.default;
  return typeof value === "string" && param.options.includes(value) ? value : param.default;
}

/**
 * Take an arbitrary object and return a complete, valid set of values.
 *
 * Anything stored in `localStorage` was written by a previous version of this
 * schema, and anything typed into a preset file was written by a person. Keys
 * that no longer exist are dropped; keys that were added since are filled from
 * their defaults. That is what lets the schema keep changing.
 */
export function sanitiseValues(raw: unknown): ParamValues {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const values: ParamValues = {};

  for (const param of PARAMS) {
    values[param.key] = param.key in source ? coerce(param, source[param.key]) : param.default;
  }

  return values;
}

/** A parameter's declared default, for code that runs before the store exists. */
export function defaultNumber(key: string): number {
  const param = PARAM_BY_KEY.get(key);
  return param && param.kind === "number" ? param.default : 0;
}

/** Read a number from the store without the call site restating the type. */
export function numberValue(values: ParamValues, key: string): number {
  const value = values[key];
  if (typeof value === "number") return value;
  const param = PARAM_BY_KEY.get(key);
  return param && param.kind === "number" ? param.default : 0;
}

export function booleanValue(values: ParamValues, key: string): boolean {
  return values[key] === true;
}

export function stringValue(values: ParamValues, key: string): string {
  const value = values[key];
  if (typeof value === "string") return value;
  const param = PARAM_BY_KEY.get(key);
  return param && param.kind === "enum" ? param.default : "";
}
