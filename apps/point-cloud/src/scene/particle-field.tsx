"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type ShaderMaterial } from "three";

import fragmentShader from "@/shaders/points.frag.glsl";
import vertexShader from "@/shaders/points.vert.glsl";

import "./shader-chunks";
import { createParticleGrid } from "./particle-grid";
import { SAMPLE_BUNDLE, useParticleBundle } from "./use-particle-bundle";

export interface ParticleParams {
  /** World-space point size before the per-point 0.5–1 scale. */
  size: number;
  /** 0 = hard-edged disc, 1 = fades from the center out. */
  softness: number;
  /** Curl offset on screen, in normalised device units (the screen spans 2). */
  noiseAmplitude: number;
  /** How many noise cells span the cloud: low is broad swells, high is churn. */
  noiseFrequency: number;
  /** How far apart neighbouring particles sample the field. 0 moves them as one. */
  noiseScatter: number;
  /** Depth breathing, in world units. Relief is only ~0.08, so this is small. */
  breathe: number;
  /** Multiplier on animation time: 0 freezes everything, 2 doubles it. */
  speed: number;
  /** Paint the fBM field instead of the photo (P4.1). */
  debugNoise: boolean;
}

export const defaultParticleParams: ParticleParams = {
  // Grid spacing is about 0.0117 world units, but points need roughly 4x that
  // to actually cover it: half of them are shrunk by the per-point 0.5-1 scale,
  // and a soft rim contributes little alpha. Below ~0.03 the photo reads as
  // dark speckle instead of a surface.
  size: 0.045,
  softness: 0.5,
  noiseAmplitude: 0.012,
  noiseFrequency: 3,
  // Small on purpose. Scatter is how far apart neighbours sample the field, so
  // past ~0.5 they stop sharing a flow at all and the cloud shimmers in place
  // instead of drifting — and the debug view turns from clouds into confetti.
  noiseScatter: 0.15,
  breathe: 0.01,
  speed: 1,
  debugNoise: false,
};

interface ParticleFieldProps extends ParticleParams {
  /** Bundle to render, as a URL under `public/`. */
  bundleUrl?: string;
  renderScale?: number;
  playing: boolean;
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
 */
export function ParticleField({
  bundleUrl = SAMPLE_BUNDLE,
  renderScale = 1,
  size,
  softness,
  noiseAmplitude,
  noiseFrequency,
  noiseScatter,
  breathe,
  speed,
  debugNoise,
  playing,
}: ParticleFieldProps) {
  const material = useRef<ShaderMaterial>(null);
  const bundle = useParticleBundle(bundleUrl);

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

  // Uniforms are how a ShaderMaterial is tweaked: new values are uploaded on
  // the next draw, with no shader recompile.
  const size2d = useThree((state) => state.size);
  const height = size2d.height;
  const dpr = useThree((state) => state.viewport.dpr);
  useEffect(() => {
    const uniforms = material.current?.uniforms;
    if (!uniforms || !bundle) return;

    uniforms.uColorMap!.value = bundle.color;
    uniforms.uPositionHigh!.value = bundle.positionHigh;
    uniforms.uPositionLow!.value = bundle.positionLow;
    (uniforms.uBoundsMin!.value as Vector3).fromArray(bundle.metadata.bounds.min);
    (uniforms.uBoundsMax!.value as Vector3).fromArray(bundle.metadata.bounds.max);
    uniforms.uTextureSize!.value = bundle.metadata.width;
    uniforms.uSize!.value = size;
    uniforms.uScale!.value = height * dpr * renderScale * 0.5;
    uniforms.uMaxPointSize!.value = maxPointSize;
    uniforms.uSoftness!.value = softness;
    uniforms.uNoiseAmplitude!.value = noiseAmplitude;
    uniforms.uNoiseFrequency!.value = noiseFrequency;
    uniforms.uNoiseScatter!.value = noiseScatter;
    uniforms.uBreathe!.value = breathe;
    uniforms.uViewportAspect!.value = size2d.width / Math.max(1, size2d.height);
    uniforms.uDebugNoise!.value = debugNoise ? 1 : 0;
  }, [
    bundle,
    size,
    softness,
    noiseAmplitude,
    noiseFrequency,
    noiseScatter,
    breathe,
    debugNoise,
    size2d,
    height,
    dpr,
    maxPointSize,
    renderScale,
  ]);

  useFrame((_, delta) => {
    if (!playing || !material.current) return;
    // Advance time here instead of multiplying elapsed time by the speed in
    // the shader: changing the speed then bends the motion smoothly rather
    // than jumping every point to a different phase.
    material.current.uniforms.uTime!.value += delta * speed;
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
        {/* Identity rather than address. P4.2 seeds the flow field from the
            texel hash instead, since hashing a five-digit integer loses float
            precision (P3.1), so this is still waiting for P5.5 (reveal order),
            which needs the ordinal itself rather than a hash of it. */}
        <bufferAttribute attach="attributes-aIndex" args={[grid.index, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} args={materialArgs} />
    </points>
  );
}
