"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type ShaderMaterial } from "three";

import fragmentShader from "@/shaders/points.frag.glsl";
import vertexShader from "@/shaders/points.vert.glsl";

import { createParticleGrid, DEFAULT_TEXTURE_SIZE } from "./particle-grid";

export interface ParticleParams {
  /** World-space point size before the per-point 0.5–1 scale. */
  size: number;
  /** 0 = hard-edged disc, 1 = fades from the center out. */
  softness: number;
  /** How far points wander from their home position, in world units. */
  driftAmplitude: number;
  /** Multiplier on animation time: 0 freezes the drift, 2 doubles it. */
  driftSpeed: number;
}

export const defaultParticleParams: ParticleParams = {
  // Tuned to the grid spacing (fieldSize / textureSize ≈ 0.0117 world units):
  // points just touch, so the field reads as a surface rather than a lattice.
  size: 0.016,
  softness: 0.5,
  driftAmplitude: 0.01,
  driftSpeed: 1,
};

interface ParticleFieldProps extends ParticleParams {
  /** Side of the square data texture; the field holds `textureSize²` points. */
  textureSize?: number;
  /** World width and height the grid of texels is spread over. */
  fieldSize?: number;
  color?: string;
  renderScale?: number;
  playing: boolean;
}

/**
 * Every particle is one vertex of a single THREE.Points object, so the GPU
 * draws all of them with one GL_POINTS draw call (P1.1). The material is our
 * own shader pair (P1.2): round soft discs (P1.3) sized by perspective, with a
 * per-point scale and sub-pixel dimming (P1.4), drifting on the GPU (P1.5).
 *
 * P3.1 — the geometry no longer carries any real data. `position` is a buffer
 * of zeros and each vertex instead knows which texel of the data texture is
 * its own; the vertex shader derives everything else from that coordinate.
 */
export function ParticleField({
  textureSize = DEFAULT_TEXTURE_SIZE,
  fieldSize = 3,
  color = "#dfe6ff",
  renderScale = 1,
  size,
  softness,
  driftAmplitude,
  driftSpeed,
  playing,
}: ParticleFieldProps) {
  const material = useRef<ShaderMaterial>(null);
  const grid = useMemo(() => createParticleGrid(textureSize), [textureSize]);

  // Built once: R3F would recreate the material if `args` changed identity.
  const materialArgs = useMemo(
    () =>
      [
        {
          vertexShader,
          fragmentShader,
          uniforms: {
            uTextureSize: { value: 1 },
            uFieldSize: { value: 1 },
            uSize: { value: 0 },
            uScale: { value: 1 },
            uMaxPointSize: { value: 64 },
            uColor: { value: new Color() },
            uSoftness: { value: 0 },
            uTime: { value: 0 },
            uDriftAmplitude: { value: 0 },
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
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  useEffect(() => {
    const uniforms = material.current?.uniforms;
    if (!uniforms) return;
    uniforms.uTextureSize!.value = grid.size;
    uniforms.uFieldSize!.value = fieldSize;
    uniforms.uSize!.value = size;
    uniforms.uScale!.value = height * dpr * renderScale * 0.5;
    uniforms.uMaxPointSize!.value = maxPointSize;
    (uniforms.uColor!.value as Color).set(color);
    uniforms.uSoftness!.value = softness;
    uniforms.uDriftAmplitude!.value = driftAmplitude;
  }, [
    grid,
    fieldSize,
    size,
    color,
    softness,
    driftAmplitude,
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
    material.current.uniforms.uTime!.value += delta * driftSpeed;
  });

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
        {/* Identity rather than address. First read by the shader in P4.2
            (curl-noise seed) and P5.5 (reveal order). */}
        <bufferAttribute attach="attributes-aIndex" args={[grid.index, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} args={materialArgs} />
    </points>
  );
}
