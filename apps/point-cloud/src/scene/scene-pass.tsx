"use client";

import { ScreenQuad, useFBO } from "@react-three/drei";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { HalfFloatType, Scene, type ShaderMaterial } from "three";

import postFragmentShader from "@/shaders/post.frag.glsl";
import postVertexShader from "@/shaders/post.vert.glsl";

const OFFSCREEN_RENDER_PRIORITY = -1;
const SCREEN_RENDER_PRIORITY = 1;

interface ScenePassProps {
  children: ReactNode;
  invert?: boolean;
}

/**
 * Renders its children into a floating-point texture, then processes that
 * texture over a fullscreen triangle. Inversion is an opt-in P2.2 sanity check;
 * the production path copies the scene unchanged.
 */
export function ScenePass({ children, invert = false }: ScenePassProps) {
  const gl = useThree((state) => state.gl);
  const renderer = useRef(gl);
  const postMaterial = useRef<ShaderMaterial>(null);
  const contentScene = useMemo(() => new Scene(), []);
  const target = useFBO({
    type: HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const uniforms = useMemo(
    () => ({
      uScene: { value: target.texture },
      uInvert: { value: 0 },
    }),
    [target.texture],
  );

  useLayoutEffect(() => {
    const invertUniform = postMaterial.current?.uniforms.uInvert;
    if (invertUniform) invertUniform.value = invert ? 1 : 0;
  }, [invert]);

  // The pipeline owns both render calls. Keep automatic clearing enabled so
  // each pass clears its own target, but reset renderer stats only once so the
  // HUD reports the combined offscreen + screen work.
  useLayoutEffect(() => {
    const currentRenderer = renderer.current;
    const info = currentRenderer.info;
    const previousAutoClear = currentRenderer.autoClear;
    const previousAutoReset = info.autoReset;

    currentRenderer.autoClear = true;
    info.autoReset = false;

    return () => {
      currentRenderer.autoClear = previousAutoClear;
      info.autoReset = previousAutoReset;
      info.reset();
    };
  }, []);

  useFrame(({ camera }) => {
    gl.info.reset();
    const previousTarget = gl.getRenderTarget();
    gl.setRenderTarget(target);
    gl.render(contentScene, camera);
    gl.setRenderTarget(previousTarget);
  }, OFFSCREEN_RENDER_PRIORITY);

  // A positive priority disables R3F's automatic render. This is the only
  // screen render for the frame, so the quad is not drawn a second time.
  useFrame(({ camera, scene }) => {
    gl.setRenderTarget(null);
    gl.render(scene, camera);
  }, SCREEN_RENDER_PRIORITY);

  return (
    <>
      {createPortal(children, contentScene)}
      <ScreenQuad>
        <shaderMaterial
          ref={postMaterial}
          uniforms={uniforms}
          vertexShader={postVertexShader}
          fragmentShader={postFragmentShader}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </ScreenQuad>
    </>
  );
}
