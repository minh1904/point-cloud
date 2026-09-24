"use client";

/**
 * The one stateful thing in the whole renderer (P9.1).
 *
 * ## Why this needs a different shape from everything else
 *
 * P4 made a point of being stateless: the entire curl offset is recomputed
 * from `uTime` every frame, so there is nothing to store, nothing to drift out
 * of sync, and changing a parameter mid-flight needs no reset.
 *
 * "Push these particles aside and let them settle back" cannot work that way.
 * Where a particle is now depends on where the pointer has *been*, not on what
 * time it is. That is history, and history has to live somewhere.
 *
 * ## Ping-pong
 *
 * It lives in a texture, and the texture is updated by rendering. A shader
 * cannot read and write the same texture in one pass — the result would depend
 * on which texels the GPU happened to finish first — so there are **two**
 * render targets and they trade places every frame:
 *
 * ```
 * frame n:    read A ──▶ [simulation] ──▶ write B      then swap
 * frame n+1:  read B ──▶ [simulation] ──▶ write A      then swap
 * ```
 *
 * That is the whole of GPGPU on the web: a render target is an array, a
 * fragment shader is a loop body, and the render is the loop. One texel per
 * particle, so the "loop" runs 65,536 times in parallel.
 *
 * ## What is stored
 *
 * A **displacement**, not a position. The home position still comes from the
 * bundle's two byte textures exactly as it did in P3.3; this only says how far
 * each particle has been shoved away from it. Which means the decode path, the
 * bounds and the format are untouched, and switching the pointer off is just
 * adding zero.
 */
import { useFBO } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import {
  DataTexture,
  HalfFloatType,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  Plane,
  PlaneGeometry,
  Raycaster,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  UnsignedByteType,
  Vector2,
  Vector3,
  type Texture,
  type WebGLRenderTarget,
} from "three";

import { applyPointerUniforms, type Uniforms } from "@/params/apply";
import { numberValue } from "@/params/schema";
import pointerFragmentShader from "@/shaders/pointer.frag.glsl";
import pointerVertexShader from "@/shaders/pointer.vert.glsl";
import { readParams } from "@/store/params-store";

import "./shader-chunks";
import type { ParticleBundle } from "./use-particle-bundle";

/**
 * Runs before everything else in the frame.
 *
 * `RenderInfo` reads the draw-call counter at -2 and `ScenePass` resets it at
 * -1, so a simulation pass at -3 is counted in the figure the HUD reports —
 * which is the honest answer: while the pointer is live there really are three
 * draw calls, not two.
 */
const SIMULATION_PRIORITY = -3;

/** Seconds to keep simulating after the force is switched off, so it settles. */
const SETTLE_SECONDS = 4;

/**
 * What a particle reads when nothing is pushing it: three zero bytes.
 *
 * A module-level singleton, and deliberately so. A `sampler2D` uniform left at
 * `null` does not read as zero — three.js substitutes a default **white**
 * texture, so every particle would be shoved a full world unit on the first
 * frame before anything had a chance to bind something real. One 1×1 texture
 * shared by every material costs four bytes and removes that whole class of
 * flash.
 */
export const ZERO_DISPLACEMENT: DataTexture = (() => {
  const texture = new DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    RGBAFormat,
    UnsignedByteType,
  );
  texture.needsUpdate = true;
  return texture;
})();

interface Rig {
  material: ShaderMaterial;
  scene: Scene;
  camera: OrthographicCamera;
  raycaster: Raycaster;
  plane: Plane;
  hit: Vector3;
  ndc: Vector2;
  /** The two render targets, trading places every frame. */
  ping: { read: WebGLRenderTarget; write: WebGLRenderTarget };
  /** Seconds left of settling after the force was switched off. */
  settle: number;
}

/**
 * Returns a **ref**, not a texture.
 *
 * The simulation swaps its two targets every frame, and a re-render per frame
 * is exactly what P7.3 went to some trouble to avoid. `ParticleField` reads
 * `.current` inside its own `useFrame`, which runs later in the same frame.
 */
export function usePointerField(
  bundle: ParticleBundle | null,
): { readonly current: Texture } {
  const gl = useThree((state) => state.gl);
  const size = bundle?.metadata.width ?? 1;

  // Half float, not float: it holds negative numbers (a displacement has a
  // direction) which a byte texture cannot, and it is half the bandwidth of
  // full float for a value measured in hundredths of a world unit.
  const settings = useMemo(
    () => ({
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    }),
    [],
  );
  const targetA = useFBO(size, size, settings);
  const targetB = useFBO(size, size, settings);

  /**
   * Everything the simulation owns, built in an effect and held in a ref.
   *
   * Not `useMemo`: `react-hooks/immutability` refuses to let a frame callback
   * mutate what a memo returned, and a shader material exists to be mutated.
   * A ref this hook created is the exception the rule makes, and it is the
   * same pattern `ParticleField` uses for its own material. Building the GL
   * objects after mount rather than during render is the better shape anyway.
   */
  const rig = useRef<Rig | null>(null);

  useEffect(() => {
    const material = new ShaderMaterial({
      vertexShader: pointerVertexShader,
      fragmentShader: pointerFragmentShader,
      uniforms: {
        uPrevious: { value: null },
        uPositionHigh: { value: null },
        uPositionLow: { value: null },
        uBoundsMin: { value: new Vector3() },
        uBoundsMax: { value: new Vector3() },
        uPointer: { value: new Vector3() },
        uActive: { value: 0 },
        uDelta: { value: 0 },
        uStrength: { value: 0 },
        uRadius: { value: 0.6 },
        uRelax: { value: 3 },
        uSwirl: { value: 0 },
        uAttract: { value: 0 },
      },
    });

    // A scene of one quad, built by hand rather than through JSX: it is never
    // part of the visible scene graph, and portalling it there would mean
    // R3F reconciling something that exists only to be rendered off screen.
    const geometry = new PlaneGeometry(2, 2);
    const scene = new Scene();
    scene.add(new Mesh(geometry, material));

    rig.current = {
      material,
      scene,
      camera: new OrthographicCamera(-1, 1, 1, -1, 0, 1),
      raycaster: new Raycaster(),
      // The cloud is a shallow relief around z = 0, so intersecting the
      // pointer ray with that plane answers "which particle is under the
      // cursor" well enough — and far more cheaply than raycasting 65,536
      // points would.
      plane: new Plane(new Vector3(0, 0, 1), 0),
      hit: new Vector3(),
      ndc: new Vector2(),
      ping: { read: targetA, write: targetB },
      settle: 0,
    };

    return () => {
      rig.current = null;
      geometry.dispose();
      material.dispose();
    };
  }, [targetA, targetB]);

  /**
   * Whether the pointer is over the canvas at all.
   *
   * Driven by `pointermove` rather than `pointerenter`, which matters more
   * than it sounds. `pointerenter` fires once, on the way in; anything that
   * later clears the flag then needs a full exit and re-entry to restore it.
   * `pointermove` re-asserts the truth continuously, and it is also the only
   * one that fires when the canvas appears *underneath* a cursor that was
   * already there.
   *
   * `pointerup` only ends the interaction for a finger. Clearing it for a
   * mouse was a real bug: orbiting the camera ends in a `pointerup`, so one
   * drag killed the effect until the cursor left the canvas and came back.
   */
  const over = useRef(false);
  useEffect(() => {
    const element = gl.domElement;
    const move = () => {
      over.current = true;
    };
    const leave = () => {
      over.current = false;
    };
    const release = (event: PointerEvent) => {
      if (event.pointerType !== "mouse") over.current = false;
    };

    element.addEventListener("pointermove", move);
    element.addEventListener("pointerleave", leave);
    element.addEventListener("pointercancel", leave);
    element.addEventListener("pointerup", release);

    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", leave);
      element.removeEventListener("pointercancel", leave);
      element.removeEventListener("pointerup", release);
    };
  }, [gl]);

  const current = useRef<Texture>(ZERO_DISPLACEMENT);

  useFrame(({ camera, pointer }, delta) => {
    if (!rig.current || !bundle) {
      current.current = ZERO_DISPLACEMENT;
      return;
    }

    const values = readParams();
    const strength = numberValue(values, "pointerStrength");

    // Keep simulating for a few seconds after the force is switched off, so
    // the cloud relaxes home instead of snapping there the moment the slider
    // reaches zero.
    rig.current.settle =
      strength > 0 ? SETTLE_SECONDS : Math.max(0, rig.current.settle - delta);

    if (strength <= 0 && rig.current.settle <= 0) {
      current.current = ZERO_DISPLACEMENT;
      return;
    }

    rig.current.ndc.set(pointer.x, pointer.y);
    rig.current.raycaster.setFromCamera(rig.current.ndc, camera);
    const reached =
      rig.current.raycaster.ray.intersectPlane(rig.current.plane, rig.current.hit) !==
      null;

    // Written through the full path rather than an extracted local, which the
    // immutability rule rejects (see docs/status.md).
    rig.current.material.uniforms.uPrevious!.value = rig.current.ping.read.texture;
    rig.current.material.uniforms.uPositionHigh!.value = bundle.positionHigh;
    rig.current.material.uniforms.uPositionLow!.value = bundle.positionLow;
    (rig.current.material.uniforms.uBoundsMin!.value as Vector3).fromArray(
      bundle.metadata.bounds.min,
    );
    (rig.current.material.uniforms.uBoundsMax!.value as Vector3).fromArray(
      bundle.metadata.bounds.max,
    );
    (rig.current.material.uniforms.uPointer!.value as Vector3).copy(rig.current.hit);
    rig.current.material.uniforms.uActive!.value = over.current && reached ? 1 : 0;
    // Clamped: a tab returning from the background reports a delta of several
    // seconds, and one frame of that would fling the whole cloud off screen.
    rig.current.material.uniforms.uDelta!.value = Math.min(delta, 1 / 30);

    // Five knobs, written by walking the schema (P7.2).
    applyPointerUniforms(rig.current.material.uniforms as Uniforms, values);

    const previous = gl.getRenderTarget();
    gl.setRenderTarget(rig.current.ping.write);
    gl.render(rig.current.scene, rig.current.camera);
    gl.setRenderTarget(previous);

    current.current = rig.current.ping.write.texture;
    rig.current.ping = {
      read: rig.current.ping.write,
      write: rig.current.ping.read,
    };
  }, SIMULATION_PRIORITY);

  // Read in the same frame loop by ParticleField, which runs later.
  return current;
}
