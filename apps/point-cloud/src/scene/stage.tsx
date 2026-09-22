"use client";

import { Canvas } from "@react-three/fiber";

import { ParticleField, type ParticleParams } from "./particle-field";
import { RenderInfo, type RenderStats } from "./render-info";

interface StageProps {
  params: ParticleParams;
  playing: boolean;
  onStats: (stats: RenderStats) => void;
}

export function Stage({ params, playing, onStats }: StageProps) {
  return (
    // R3F sizes the canvas to its parent and sets its own inline styles on the
    // wrapper, so position this element instead of styling <Canvas> itself.
    <div className="absolute inset-0">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 4], fov: 45 }} gl={{ antialias: true }}>
        <color attach="background" args={["#000000"]} />
        <ParticleField {...params} playing={playing} />
        <RenderInfo onStats={onStats} />
      </Canvas>
    </div>
  );
}
