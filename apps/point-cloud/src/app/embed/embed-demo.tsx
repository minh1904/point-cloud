"use client";

import { ParticleImage } from "@atelier/particle-image";
import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { useState } from "react";

export function EmbedDemo() {
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <main className="relative h-dvh w-full bg-background">
      <Canvas camera={{ position: [0, 0, 8], fov: 16 }} gl={{ antialias: true }}>
        <color attach="background" args={["#000000"]} />
        <OrbitControls enableDamping dampingFactor={0.08} />
        <ParticleImage
          src="/particles/sample"
          lut="/luts/warm.png"
          onLoad={(info) => setCount(info.particleCount)}
          onError={(cause) => setError(cause.message)}
        />
      </Canvas>

      <p className="absolute top-3 left-3 font-mono text-2xs text-muted-foreground tabular-nums">
        {error
          ? `failed: ${error}`
          : count
            ? `${count.toLocaleString("en-US")} points from /particles/sample`
            : "loading…"}
      </p>
    </main>
  );
}
