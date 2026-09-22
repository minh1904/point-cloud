"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Points } from "three";

import { createSphereField } from "./sphere-field";

interface ParticleFieldProps {
  count?: number;
  radius?: number;
  spinning: boolean;
}

/**
 * P1.1 — every particle is one vertex of a single THREE.Points object, so the
 * GPU draws all of them with one GL_POINTS draw call.
 */
export function ParticleField({ count = 60_000, radius = 1.3, spinning }: ParticleFieldProps) {
  const points = useRef<Points>(null);
  const positions = useMemo(() => createSphereField(count, radius), [count, radius]);

  useFrame((_, delta) => {
    if (!spinning || !points.current) return;
    points.current.rotation.y += delta * 0.15;
  });

  return (
    <points ref={points}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.012} sizeAttenuation color="#dfe6ff" />
    </points>
  );
}
