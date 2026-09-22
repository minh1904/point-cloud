"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import type { ComponentRef, Ref } from "react";

import { ParticleField, type ParticleParams } from "./particle-field";
import { RenderInfo, type RenderStats } from "./render-info";
import { ScenePass } from "./scene-pass";

/** Imperative handle of the orbit controls (e.g. `.reset()`). */
export type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

interface StageProps {
  params: ParticleParams;
  playing: boolean;
  onStats: (stats: RenderStats) => void;
  controlsRef?: Ref<OrbitControlsHandle>;
}

export function Stage({ params, playing, onStats, controlsRef }: StageProps) {
  return (
    // R3F sizes the canvas to its parent and sets its own inline styles on the
    // wrapper, so position this element instead of styling <Canvas> itself.
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        camera={{ position: [0, 0, 4], fov: 45 }}
        gl={{ antialias: true }}
      >
        <ScenePass>
          <color attach="background" args={["#000000"]} />
          <ParticleField {...params} playing={playing} />
        </ScenePass>
        {/*
          P1.6 — the controls move the camera, never the particles: left-drag
          orbits around the target, right-drag (or shift) pans, wheel dollies.
          Damping eases the camera toward where the input points instead of
          stopping dead, which reads as weight. Zoom goes toward the target,
          not the cursor, so the subject stays framed.
        */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          zoomToCursor={false}
          minDistance={0.6}
          maxDistance={12}
        />
        <RenderInfo onStats={onStats} />
      </Canvas>
    </div>
  );
}
