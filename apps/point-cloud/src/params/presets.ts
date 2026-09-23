/**
 * Looks worth keeping (P7.5).
 *
 * A preset is just a full set of values, so it is exactly what `setAll` takes
 * and exactly what P8 will write into a bundle. Written here as **partial**
 * overrides, because what is interesting about a look is the handful of
 * numbers it changes, not the eighteen it leaves alone — `sanitiseValues`
 * fills the rest from the schema, which also means a preset written today
 * keeps loading after the schema grows.
 */
import { sanitiseValues, type ParamValues } from "./schema";

export interface Preset {
  name: string;
  values: ParamValues;
}

function preset(name: string, overrides: Record<string, number | boolean | string>): Preset {
  return { name, values: sanitiseValues(overrides) };
}

export const BUILT_IN_PRESETS: readonly Preset[] = [
  // The defaults, named so there is always a way back to them that is one tap
  // rather than four Resets.
  preset("Photographic", {}),

  // A long lens is a strong opinion. At 40 degrees the cloud gets its
  // perspective back and reads as a scene rather than a picture of one, so
  // everything else pulls back to match.
  preset("Documentary", {
    fov: 40,
    grade: "neutral",
    gradeIntensity: 0.35,
    vignette: 0.12,
    grain: 0.01,
    chromaticAberration: 0.0005,
    edgeBokeh: 0.1,
    focalRange: 1,
    noiseAmplitude: 0.005,
    size: 0.016,
  }),

  // The opposite: a narrow focal slice, heavy edges, and enough drift that the
  // surface never quite settles.
  preset("Dream", {
    focalDepth: 0.4,
    focalRange: 0.18,
    edgeBokeh: 0.8,
    grade: "cool",
    gradeIntensity: 1,
    noiseAmplitude: 0.045,
    noiseFrequency: 1.8,
    breathe: 0.03,
    softness: 0.9,
    size: 0.026,
    vignette: 0.55,
    grain: 0.05,
  }),

  // Hard dots, no grade, no lens tricks — the cloud as data rather than as a
  // photograph. Useful for reading what the sampler actually did.
  preset("Graphic", {
    softness: 0,
    size: 0.012,
    densityBoost: 0.4,
    grade: "neutral",
    gradeIntensity: 0,
    fov: 50,
    edgeBokeh: 0,
    focalRange: 1,
    vignette: 0,
    chromaticAberration: 0,
    grain: 0,
    noiseAmplitude: 0,
    breathe: 0,
  }),
];
