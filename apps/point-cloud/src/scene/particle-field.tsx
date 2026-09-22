"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Points, type ShaderMaterial } from "three";

import fragmentShader from "@/shaders/points.frag.glsl";
import vertexShader from "@/shaders/points.vert.glsl";

import { createScales, createSphereField } from "./sphere-field";

interface ParticleFieldProps {
  count?: number;
  radius?: number;
  /** World-space point size before the per-point 0.5–1 scale. */
  size?: number;
  color?: string;
  /** 0 = hard-edged disc, 1 = fades from the center out. */
  softness?: number;
  spinning: boolean;
}

/**
 * Every particle is one vertex of a single THREE.Points object, so the GPU
 * draws all of them with one GL_POINTS draw call (P1.1). The material is our
 * own shader pair (P1.2): round soft discs (P1.3) sized by perspective, with a
 * per-point scale and sub-pixel dimming (P1.4).
 */
export function ParticleField({
  count = 60_000,
  radius = 1.3,
  size = 0.025,
  color = "#dfe6ff",
  softness = 0.5,
  spinning,
}: ParticleFieldProps) {
  const points = useRef<Points>(null);
  const material = useRef<ShaderMaterial>(null);
  const positions = useMemo(() => createSphereField(count, radius), [count, radius]);
  const scales = useMemo(() => createScales(count), [count]);

  // Built once: R3F would recreate the material if `args` changed identity.
  const materialArgs = useMemo(
    () =>
      [
        {
          vertexShader,
          fragmentShader,
          uniforms: {
            uSize: { value: 0 },
            uScale: { value: 1 },
            uMaxPointSize: { value: 64 },
            uColor: { value: new Color() },
            uSoftness: { value: 0 },
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
    uniforms.uSize!.value = size;
    uniforms.uScale!.value = height * dpr * 0.5;
    uniforms.uMaxPointSize!.value = maxPointSize;
    (uniforms.uColor!.value as Color).set(color);
    uniforms.uSoftness!.value = softness;
  }, [size, color, softness, height, dpr, maxPointSize]);

  useFrame((_, delta) => {
    if (!spinning || !points.current) return;
    points.current.rotation.y += delta * 0.15;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
        <bufferAttribute attach="attributes-aScale" args={[scales, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} args={materialArgs} />
    </points>
  );
}
