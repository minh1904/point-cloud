"use client";

import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Mesh } from "three";

export function SpinningCube({ spinning }: { spinning: boolean }) {
  const mesh = useRef<Mesh>(null);

  // useFrame runs inside R3F's render loop: mutate the object directly,
  // never set React state here, or every frame triggers a re-render.
  useFrame((_, delta) => {
    if (!spinning || !mesh.current) return;
    mesh.current.rotation.x += delta * 0.4;
    mesh.current.rotation.y += delta * 0.6;
  });

  return (
    <mesh ref={mesh}>
      <boxGeometry args={[1.4, 1.4, 1.4]} />
      <meshStandardMaterial color="#4c8dff" roughness={0.4} metalness={0.1} />
    </mesh>
  );
}
