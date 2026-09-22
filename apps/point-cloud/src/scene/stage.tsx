"use client";

import { Canvas } from "@react-three/fiber";

import { SpinningCube } from "./spinning-cube";

export function Stage({ spinning }: { spinning: boolean }) {
  return (
    // R3F sizes the canvas to its parent and sets its own inline styles on the
    // wrapper, so position this element instead of styling <Canvas> itself.
    <div className="absolute inset-0">
      <Canvas dpr={[1, 2]} camera={{ position: [0, 0, 4], fov: 45 }} gl={{ antialias: true }}>
        <color attach="background" args={["#000000"]} />
        <ambientLight intensity={0.4} />
        <directionalLight position={[3, 4, 5]} intensity={1.2} />
        <SpinningCube spinning={spinning} />
      </Canvas>
    </div>
  );
}
