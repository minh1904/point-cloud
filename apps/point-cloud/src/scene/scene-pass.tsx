"use client";

import { ScreenQuad, useFBO } from "@react-three/drei";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { HalfFloatType, Scene, type ShaderMaterial } from "three";

import postFragmentShader from "@/shaders/post.frag.glsl";
import postVertexShader from "@/shaders/post.vert.glsl";

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

  // WebGLRenderer normally resets stats on every render call. This frame now
  // has two calls to render() (content + screen), so reset once ourselves and
  // let RenderInfo report the combined result on the following frame.
  useLayoutEffect(() => {
    const info = renderer.current.info;
    const previousAutoReset = info.autoReset;
    info.autoReset = false;

    return () => {
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
  });

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
