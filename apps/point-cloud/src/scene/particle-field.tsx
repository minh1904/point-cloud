"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Color, type Points, type ShaderMaterial } from "three";

import fragmentShader from "@/shaders/points.frag.glsl";
import vertexShader from "@/shaders/points.vert.glsl";

import { createSphereField } from "./sphere-field";

interface ParticleFieldProps {
  count?: number;
  radius?: number;
  size?: number;
  color?: string;
  spinning: boolean;
}

/**
 * Every particle is one vertex of a single THREE.Points object, so the GPU
 * draws all of them with one GL_POINTS draw call (P1.1). The material is our
 * own shader pair (P1.2), which later steps extend.
 */
export function ParticleField({
  count = 60_000,
  radius = 1.3,
  size = 0.012,
  color = "#dfe6ff",
  spinning,
}: ParticleFieldProps) {
  const points = useRef<Points>(null);
  const material = useRef<ShaderMaterial>(null);
  const positions = useMemo(() => createSphereField(count, radius), [count, radius]);

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
            uColor: { value: new Color() },
          },
        },
      ] as const,
    [],
  );

  // Uniforms are how a ShaderMaterial is tweaked: new values are uploaded on
  // the next draw, with no shader recompile.
  const height = useThree((state) => state.size.height);
  const dpr = useThree((state) => state.viewport.dpr);
  useEffect(() => {
    const uniforms = material.current?.uniforms;
    if (!uniforms) return;
    uniforms.uSize!.value = size;
    uniforms.uScale!.value = height * dpr * 0.5;
    (uniforms.uColor!.value as Color).set(color);
  }, [size, color, height, dpr]);

  useFrame((_, delta) => {
    if (!spinning || !points.current) return;
    points.current.rotation.y += delta * 0.15;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <shaderMaterial ref={material} args={materialArgs} />
    </points>
  );
}
