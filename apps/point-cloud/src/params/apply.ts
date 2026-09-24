/**
 * Schema values into shader uniforms (P7.3).
 *
 * The important thing about this file is where it is *called from*: inside
 * `useFrame`, never from a React effect. Nothing here reads state through a
 * hook, so nothing here can cause a render.
 *
 * Writing every uniform every frame sounds wasteful and is not. A uniform is a
 * plain JavaScript property on an object that three.js walks anyway before each
 * draw; thirteen assignments per frame is beneath measurement. What it buys is
 * that there is no subscription to set up, no ordering problem between the
 * material mounting and the store changing, and no stale value — the uniforms
 * are simply always whatever the store says.
 */
import type { IUniform, Texture } from "three";

import {
  booleanValue,
  numberValue,
  UNIFORM_PARAMS,
  type ParamValues,
} from "./schema";

export type Uniforms = Record<string, IUniform>;

/** Everything the particle uniforms need that is not a parameter. */
export interface PointContext {
  /** Half the drawing-buffer height in device pixels — before the lens factor. */
  heightScale: number;
  /** Largest `gl_PointSize` this GPU will rasterise. */
  maxPointSize: number;
  viewportAspect: number;
  /** The colour grade, or null until it has loaded. */
  lut: Texture | null;
}

/** Write the declared uniforms of one stage straight from the values. */
function writeDeclared(
  uniforms: Uniforms,
  values: ParamValues,
  stage: "points" | "post" | "pointer",
): void {
  for (const param of UNIFORM_PARAMS[stage]) {
    const uniform = uniforms[param.uniform!];
    if (!uniform) continue;

    // GLSL has no bool uniform here — the shaders take 0 or 1 floats, because
    // mixing by a float is branchless and a branch in a vertex shader is not.
    uniform.value =
      param.kind === "toggle"
        ? booleanValue(values, param.key)
          ? 1
          : 0
        : values[param.key];
  }
}

export function applyPointUniforms(
  uniforms: Uniforms,
  values: ParamValues,
  context: PointContext,
): void {
  writeDeclared(uniforms, values, "points");

  // P5.6 — the lens belongs in the point size. A world-sized point covers more
  // pixels through a long lens for exactly the reason everything else does, and
  // 1/tan(fov/2) is that magnification. Leaving it out pins point size to one
  // field of view, so zooming with the FOV slider grows the scene while the
  // points stay put and the surface falls apart into specks.
  const lensScale = 1 / Math.tan((numberValue(values, "fov") * Math.PI) / 360);
  uniforms.uScale!.value =
    context.heightScale * numberValue(values, "renderScale") * lensScale;

  uniforms.uMaxPointSize!.value = context.maxPointSize;
  uniforms.uViewportAspect!.value = context.viewportAspect;

  // Without a grade loaded the lookup would sample a null texture, which reads
  // as black. Holding the intensity at 0 until it arrives keeps the first
  // frames honest rather than dark.
  uniforms.uLut!.value = context.lut;
  if (!context.lut) uniforms.uLutIntensity!.value = 0;
}

export function applyPostUniforms(uniforms: Uniforms, values: ParamValues): void {
  writeDeclared(uniforms, values, "post");
}

/**
 * The pointer simulation's knobs (P9.1).
 *
 * Nothing new was needed to support a whole extra material: the schema grew a
 * `"pointer"` stage, `UNIFORM_PARAMS` grew a list, and this is the one line
 * that reads it. That is the return on P7.2 — a third shader cost three lines
 * rather than a third copy of the wiring.
 */
export function applyPointerUniforms(uniforms: Uniforms, values: ParamValues): void {
  writeDeclared(uniforms, values, "pointer");
}
