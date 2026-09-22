"use client";

import { ScreenQuad, useFBO } from "@react-three/drei";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { HalfFloatType, Scene } from "three";

const fullscreenVertexShader = /* glsl */ `
varying vec2 vUv;

void main() {
  // ScreenQuad is one oversized triangle in clip space. Deriving UVs from
  // those positions gives 0..1 across the visible part of the triangle.
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const copyFragmentShader = /* glsl */ `
uniform sampler2D uScene;

varying vec2 vUv;

void main() {
  gl_FragColor = texture2D(uScene, vUv);

  // The FBO stores linear colour. Convert only when copying to the screen,
  // matching the direct-to-screen output from P1.
  #include <colorspace_fragment>
}
`;

interface ScenePassProps {
  children: ReactNode;
}

/**
 * P2.1 — renders its children into a floating-point texture, then copies that
 * texture to the canvas unchanged. Later P2 steps replace the copy shader with
 * post-processing while the particle scene remains isolated in this portal.
 */
export function ScenePass({ children }: ScenePassProps) {
  const gl = useThree((state) => state.gl);
  const renderer = useRef(gl);
  const contentScene = useMemo(() => new Scene(), []);
  const target = useFBO({
    type: HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const uniforms = useMemo(
    () => ({ uScene: { value: target.texture } }),
    [target.texture],
  );

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
          uniforms={uniforms}
          vertexShader={fullscreenVertexShader}
          fragmentShader={copyFragmentShader}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </ScreenQuad>
    </>
  );
}
