"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useRef, type ComponentRef, type Ref } from "react";
import type { PerspectiveCamera, Vector3 } from "three";

import {
  defaultLensParams,
  ParticleField,
  type LensParams,
  type ParticleParams,
} from "./particle-field";
import { RenderInfo, type RenderStats } from "./render-info";
import { ScenePass, type PostParams } from "./scene-pass";

/** Imperative handle of the orbit controls (e.g. `.reset()`). */
export type OrbitControlsHandle = ComponentRef<typeof OrbitControls>;

const DEGREES = Math.PI / 180;

/**
 * P5.6 — applies the field of view, keeping the subject the same size on
 * screen by dollying the camera to match.
 *
 * Changing the focal length alone would just zoom, which says nothing. Pairing
 * it with a move along the view axis holds the framing steady and isolates the
 * one thing focal length really controls: how much perspective the picture has.
 * A short lens up close exaggerates depth; a long lens far away flattens it.
 * That flattening is why a relief under 1% of the width still reads as solid.
 *
 * The work happens in the frame loop rather than an effect because the camera
 * belongs to R3F, and mutating what a hook handed back is both a lint error
 * and a good way to fight the renderer.
 */
function Lens({ fov }: { fov: number }) {
  const applied = useRef<number | null>(null);

  useFrame(({ camera, controls }) => {
    if (applied.current === fov) return;

    const lens = camera as PerspectiveCamera;
    const target = (controls as { target?: Vector3 } | null)?.target;

    if (applied.current !== null && target) {
      // Equal-framing distance: a subject fills the same fraction of the frame
      // when distance scales with 1/tan(fov/2).
      const ratio =
        Math.tan(applied.current * DEGREES * 0.5) / Math.tan(fov * DEGREES * 0.5);
      lens.position.sub(target).multiplyScalar(ratio).add(target);
    }

    lens.fov = fov;
    lens.updateProjectionMatrix();
    applied.current = fov;
  });

  return null;
}

interface StageProps {
  params: ParticleParams;
  lens: LensParams;
  introReplay: number;
  postParams: PostParams;
  playing: boolean;
  onStats: (stats: RenderStats) => void;
  controlsRef?: Ref<OrbitControlsHandle>;
}

export function Stage({
  params,
  lens,
  introReplay,
  postParams,
  playing,
  onStats,
  controlsRef,
}: StageProps) {
  return (
    // R3F sizes the canvas to its parent and sets its own inline styles on the
    // wrapper, so position this element instead of styling <Canvas> itself.
    <div className="absolute inset-0">
      <Canvas
        dpr={[1, 2]}
        // Framed for the default 16 degree lens. The cloud is three world
        // units wide, and edge bokeh pushes its sides out by a further 13%, so
        // the distance leaves margin for that rather than fitting the bounds
        // exactly — otherwise the softened edges fall off the screen.
        camera={{ position: [0, 0, 8], fov: defaultLensParams.fov }}
        gl={{ antialias: true }}
      >
        {/*
          P1.6 — the controls move the camera, never the particles: left-drag
          orbits around the target, right-drag (or shift) pans, wheel dollies.
          Damping eases the camera toward where the input points instead of
          stopping dead, which reads as weight. Zoom goes toward the target,
          not the cursor, so the subject stays framed.

          P2.3 — OrbitControls and the offscreen pass both use priority -1.
          Mounting controls first registers its camera update before the FBO
          render at that priority, so damping never appears one frame late.
        */}
        <OrbitControls
          ref={controlsRef}
          makeDefault
          enableDamping
          dampingFactor={0.08}
          zoomToCursor={false}
          minDistance={1.5}
          maxDistance={40}
        />
        <Lens fov={lens.fov} />
        <ScenePass params={postParams}>
          <color attach="background" args={["#000000"]} />
          <ParticleField
            {...params}
            lens={lens}
            introReplay={introReplay}
            renderScale={postParams.renderScale}
            playing={playing}
          />
        </ScenePass>
        <RenderInfo onStats={onStats} />
      </Canvas>
    </div>
  );
}
