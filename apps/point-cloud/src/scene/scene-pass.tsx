"use client";

import { ScreenQuad, useFBO } from "@react-three/drei";
import { createPortal, useFrame, useThree } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { HalfFloatType, Scene, type ShaderMaterial } from "three";

import postFragmentShader from "@/shaders/post.frag.glsl";
import postVertexShader from "@/shaders/post.vert.glsl";

const OFFSCREEN_RENDER_PRIORITY = -1;
const SCREEN_RENDER_PRIORITY = 1;

export interface PostParams {
  renderScale: number;
  vignette: number;
  chromaticAberration: number;
  grain: number;
}

export const defaultPostParams: PostParams = {
  renderScale: 1,
  vignette: 0.35,
  chromaticAberration: 0.002,
  grain: 0.025,
};

interface ScenePassProps {
  children: ReactNode;
  params: PostParams;
  invert?: boolean;
}

/**
 * Renders its children into a floating-point texture, then processes that
 * texture over a fullscreen triangle. Inversion is an opt-in P2.2 sanity check;
 * the production path copies the scene unchanged.
 */
export function ScenePass({
  children,
  params,
  invert = false,
}: ScenePassProps) {
  const gl = useThree((state) => state.gl);
  const renderer = useRef(gl);
  const postMaterial = useRef<ShaderMaterial>(null);
  const contentScene = useMemo(() => new Scene(), []);

  const size = useThree((state) => state.size);
  const dpr = useThree((state) => state.viewport.dpr);
  const renderScale = params.renderScale ?? 1;

  const fboWidth = Math.max(1, Math.round(size.width * dpr * renderScale));
  const fboHeight = Math.max(1, Math.round(size.height * dpr * renderScale));

  const target = useFBO(fboWidth, fboHeight, {
    type: HalfFloatType,
    depthBuffer: true,
    stencilBuffer: false,
  });
  const uniforms = useMemo(
    () => ({
      uScene: { value: target.texture },
      uTime: { value: 0 },
      uInvert: { value: 0 },
      uVignette: { value: 0 },
      uChromaticAberration: { value: 0 },
      uGrain: { value: 0 },
    }),
    [target.texture],
  );

  useLayoutEffect(() => {
    const postUniforms = postMaterial.current?.uniforms;
    if (!postUniforms) return;

    postUniforms.uInvert!.value = invert ? 1 : 0;
    postUniforms.uVignette!.value = params.vignette;
    postUniforms.uChromaticAberration!.value = params.chromaticAberration;
    postUniforms.uGrain!.value = params.grain;
  }, [invert, params.vignette, params.chromaticAberration, params.grain]);

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
  useFrame(({ camera, clock, scene }) => {
    if (postMaterial.current) {
      postMaterial.current.uniforms.uTime!.value = clock.elapsedTime;
    }

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
