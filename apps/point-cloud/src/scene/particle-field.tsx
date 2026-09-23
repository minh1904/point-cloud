"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type ShaderMaterial } from "three";

import { applyPointUniforms, type Uniforms } from "@/params/apply";
import { numberValue, stringValue } from "@/params/schema";
import fragmentShader from "@/shaders/points.frag.glsl";
import vertexShader from "@/shaders/points.vert.glsl";
import { readParams, useParamsStore } from "@/store/params-store";
import { usePhotoStore } from "@/store/photo-store";
import { readSession } from "@/store/session-store";

import "./shader-chunks";
import { IntroDolly } from "./intro-dolly";
import { createParticleGrid } from "./particle-grid";
import { useCloudBundle } from "./use-cloud-bundle";
import {
  SAMPLE_BUNDLE,
  useLookupTexture,
  useParticleBundle,
} from "./use-particle-bundle";

/** Seconds the intro takes to run from nothing to the full cloud. */
export const INTRO_SECONDS = 2.6;

/** The intro's progress, 0 to 1. Mutated here, read by the camera dolly. */
export interface IntroClock {
  value: number;
}

interface ParticleFieldProps {
  /** Bundle to render, as a URL under `public/`. Overridden by a built cloud. */
  bundleUrl?: string;
}

/**
 * Every particle is one vertex of a single THREE.Points object, so the GPU
 * draws all of them with one GL_POINTS draw call (P1.1). The material is our
 * own shader pair (P1.2): round soft discs (P1.3) sized by perspective, with a
 * per-point scale and sub-pixel dimming (P1.4), drifting on the GPU (P1.5).
 *
 * P3 — the geometry carries no data at all. `position` is a buffer of zeros
 * and each vertex knows only which texel is its own; colour (3.2) and position
 * (3.3, 3.4) are both fetched from textures in the vertex shader. Which means
 * this component no longer knows or cares what it is drawing: hand it another
 * bundle and it renders that instead, whether the bundle came from a file or,
 * from P6, from a photo the user dropped in.
 *
 * P4 — motion sits on top of that fixed home position and keeps no state at
 * all: the whole offset is recomputed from `uTime` every frame. Nothing to
 * store, nothing to drift out of sync, and the cost per particle is the
 * arithmetic alone.
 *
 * P7.3 — and no parameter reaches this component through React any more. The
 * frame loop reads the store with `getState()`, which does not subscribe, so
 * dragging a slider re-renders the slider and nothing else. What is left in
 * React state is only what genuinely changes the *tree*: which bundle is
 * loaded, and which colour grade texture.
 */
export function ParticleField({ bundleUrl = SAMPLE_BUNDLE }: ParticleFieldProps) {
  const material = useRef<ShaderMaterial>(null);
  const intro = useRef<IntroClock>({ value: 0 });
  const introSeen = useRef(0);

  // P6.8 — a cloud built from a dropped photo takes precedence over the file
  // bundle, and the renderer below cannot tell which one it got. That is the
  // seam P3 was designed around: same textures, same shader, same effects.
  const packed = usePhotoStore((state) => state.bundle);
  const photoBundle = useCloudBundle(packed);
  const fileBundle = useParticleBundle(packed ? null : bundleUrl);
  const bundle = photoBundle ?? fileBundle;

  // The one parameter that is still subscribed to: it names a file, and
  // loading a file is a side effect with a lifecycle, not a uniform write.
  const grade = useParamsStore((state) => stringValue(state.values, "grade"));
  const lut = useLookupTexture(`/luts/${grade}.png`);

  // A new cloud earns a new arrival: swapping 65,536 points in mid-frame with
  // the intro already finished would just blink the old picture out.
  useEffect(() => {
    intro.current.value = 0;
  }, [bundle]);

  // The grid is pure addressing, so it only depends on the texture size the
  // bundle declares — 256² here, one particle per texel.
  const textureSize = bundle?.metadata.width;
  const grid = useMemo(
    () => (textureSize === undefined ? undefined : createParticleGrid(textureSize)),
    [textureSize],
  );

  // Built once: R3F would recreate the material if `args` changed identity.
  const materialArgs = useMemo(
    () =>
      [
        {
          vertexShader,
          fragmentShader,
          uniforms: {
            uColorMap: { value: null },
            uPositionHigh: { value: null },
            uPositionLow: { value: null },
            uBoundsMin: { value: new Vector3() },
            uBoundsMax: { value: new Vector3() },
            uTextureSize: { value: 1 },
            uSize: { value: 0 },
            uScale: { value: 1 },
            uMaxPointSize: { value: 64 },
            uSoftness: { value: 0 },
            uTime: { value: 0 },
            uNoiseAmplitude: { value: 0 },
            uNoiseFrequency: { value: 1 },
            uNoiseScatter: { value: 0 },
            uBreathe: { value: 0 },
            uViewportAspect: { value: 1 },
            uDebugNoise: { value: 0 },
            uLut: { value: null },
            uLutIntensity: { value: 0 },
            uProgress: { value: 0 },
            uDensityBoost: { value: 0 },
            uFocalDepth: { value: 0.5 },
            uFocalRange: { value: 1 },
            uEdgeBokeh: { value: 0 },
          },
          // Soft rims need alpha blending. Not writing depth keeps a faded rim
          // from hiding the points behind it; with thousands of small
          // overlapping points, skipping back-to-front sorting is acceptable.
          transparent: true,
          depthWrite: false,
        },
      ] as const,
    [],
  );

  // The largest point this GPU can rasterise (commonly 64–8192 px).
  const gl = useThree((state) => state.gl);
  const maxPointSize = useMemo(() => {
    const context = gl.getContext();
    const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    return range[1] ?? 64;
  }, [gl]);

  // The bundle's own numbers are not parameters — they arrive with the data
  // and change only when the data does, so an effect is the right home.
  useEffect(() => {
    const uniforms = material.current?.uniforms;
    if (!uniforms || !bundle) return;

    uniforms.uColorMap!.value = bundle.color;
    uniforms.uPositionHigh!.value = bundle.positionHigh;
    uniforms.uPositionLow!.value = bundle.positionLow;
    (uniforms.uBoundsMin!.value as Vector3).fromArray(bundle.metadata.bounds.min);
    (uniforms.uBoundsMax!.value as Vector3).fromArray(bundle.metadata.bounds.max);
    uniforms.uTextureSize!.value = bundle.metadata.width;
  }, [bundle]);

  useFrame(({ size, viewport }, delta) => {
    const current = material.current;
    if (!current) return;

    const values = readParams();
    const session = readSession();

    applyPointUniforms(current.uniforms as Uniforms, values, {
      heightScale: size.height * viewport.dpr * 0.5,
      maxPointSize,
      viewportAspect: size.width / Math.max(1, size.height),
      lut,
    });

    // Replay is a counter rather than an event, because the frame loop is the
    // only place allowed to touch this clock and it cannot listen for events.
    if (introSeen.current !== session.introRun) {
      introSeen.current = session.introRun;
      intro.current.value = 0;
    }

    // The intro runs on its own clock, unaffected by Pause: freezing the drift
    // to study a frame should not also freeze the cloud half-arrived.
    const clock = intro.current;
    if (clock.value < 1) {
      clock.value = Math.min(1, clock.value + delta / INTRO_SECONDS);
    }
    current.uniforms.uProgress!.value = clock.value;

    if (!session.playing) return;
    // Advance time here instead of multiplying elapsed time by the speed in
    // the shader: changing the speed then bends the motion smoothly rather
    // than jumping every point to a different phase.
    current.uniforms.uTime!.value += delta * numberValue(values, "speed");
  });

  // Every particle's position and colour live in the bundle, so there is no
  // meaningful frame to draw before it arrives.
  if (!bundle || !grid) return null;

  return (
    // The real positions only exist inside the vertex shader, so the bounding
    // sphere three.js computes from the zeroed `position` attribute has radius
    // 0 at the origin. Left on, frustum culling would drop the whole draw call
    // the moment that single point left the view.
    <points frustumCulled={false}>
      <bufferGeometry>
        {/* Zeros, but required: three.js reads the vertex count from here. */}
        <bufferAttribute attach="attributes-position" args={[grid.positions, 3]} />
        <bufferAttribute attach="attributes-aParticleUv" args={[grid.particleUv, 2]} />
        {/* Identity rather than address. P6.9 shuffling the packing order
            removed the first reason this goes unread; hashing a five-digit
            integer in a float shader is still the second. */}
        <bufferAttribute attach="attributes-aIndex" args={[grid.index, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} args={materialArgs} />
      <IntroDolly clock={intro} />
    </points>
  );
}
