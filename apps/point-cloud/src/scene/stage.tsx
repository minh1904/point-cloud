"use client";

import { OrbitControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { memo, useRef, type ComponentRef, type Ref } from "react";
import type { PerspectiveCamera, Vector3 } from "three";

import { defaultNumber, numberValue } from "@/params/schema";
import { readParams } from "@/store/params-store";

import { ParticleField } from "./particle-field";
import { RenderInfo } from "./render-info";
import { ScenePass } from "./scene-pass";

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
 * That flattening is why a relief under 3% of the width still reads as solid.
 *
 * The work happens in the frame loop rather than an effect because the camera
 * belongs to R3F, and mutating what a hook handed back is both a lint error
 * and a good way to fight the renderer. P7.3 made that convenient rather than
 * merely correct: the loop can read the store without subscribing to it.
 */
function Lens() {
  const applied = useRef<number | null>(null);

  useFrame(({ camera, controls }) => {
    const fov = numberValue(readParams(), "fov");
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
  controlsRef?: Ref<OrbitControlsHandle>;
}

/**
 * The viewport (P7.1).
 *
 * It takes one prop, and that prop is a ref. Everything the scene needs it
 * reads from a store, in the frame loop, without subscribing — so this element
 * never has a reason to re-render, and `memo` makes that guarantee explicit:
 * the inspector can re-render as often as it likes and the canvas will not
 * notice. That is the whole "tweaking a slider never re-mounts the canvas"
 * criterion, turned into something the type system can hold up.
 */
export const Stage = memo(function Stage({ controlsRef }: StageProps) {
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
        camera={{ position: [0, 0, 8], fov: defaultNumber("fov") }}
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
        <Lens />
        <ScenePass>
          <color attach="background" args={["#000000"]} />
          <ParticleField />
        </ScenePass>
        <RenderInfo />
      </Canvas>
    </div>
  );
});
