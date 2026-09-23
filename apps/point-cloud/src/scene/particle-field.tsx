"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { Vector3, type ShaderMaterial } from "three";

import fragmentShader from "@/shaders/points.frag.glsl";
import vertexShader from "@/shaders/points.vert.glsl";

import { usePhotoStore } from "@/store/photo-store";

import "./shader-chunks";
import { IntroDolly } from "./intro-dolly";
import { createParticleGrid } from "./particle-grid";
import { useCloudBundle } from "./use-cloud-bundle";
import {
  SAMPLE_BUNDLE,
  useLookupTexture,
  useParticleBundle,
} from "./use-particle-bundle";

export interface ParticleParams {
  /** World-space point size before the per-point 0.5–1 scale. */
  size: number;
  /** 0 = hard-edged disc, 1 = fades from the center out. */
  softness: number;
  /** Curl offset on screen, in normalised device units (the screen spans 2). */
  noiseAmplitude: number;
  /** How many noise cells span the cloud: low is broad swells, high is churn. */
  noiseFrequency: number;
  /** How far apart neighbouring particles sample the field. 0 moves them as one. */
  noiseScatter: number;
  /** Depth breathing, in world units. Relief is only ~0.08, so this is small. */
  breathe: number;
  /** Multiplier on animation time: 0 freezes everything, 2 doubles it. */
  speed: number;
  /**
   * How hard point size chases point spacing (P5.1). 0 leaves every point the
   * same size; 1 makes size exactly proportional to the gap around it.
   */
  densityBoost: number;
  /** Paint the fBM field instead of the photo (P4.1). */
  debugNoise: boolean;
}

export const defaultParticleParams: ParticleParams = {
  // Grid spacing is about 0.0117 world units, but points need several times
  // that to actually cover it: half of them are shrunk by the per-point 0.5-1
  // scale, and a soft rim contributes little alpha. Below a third of this the
  // photo reads as dark speckle instead of a surface.
  //
  // The number changed at P5.6 even though nothing looks different: uScale now
  // carries the lens, so `size` is finally a true world measurement instead of
  // one that silently assumed a 45 degree field of view.
  size: 0.019,
  softness: 0.5,
  noiseAmplitude: 0.012,
  noiseFrequency: 3,
  // Small on purpose. Scatter is how far apart neighbours sample the field, so
  // past ~0.5 they stop sharing a flow at all and the cloud shimmers in place
  // instead of drifting — and the debug view turns from clouds into confetti.
  noiseScatter: 0.15,
  breathe: 0.01,
  speed: 1,
  // P5.1 — only bites on a cloud built from a photo. The sample bundle is a
  // regular grid whose crowding is 1 everywhere by construction, so this
  // multiplies by one there however far it is pushed.
  //
  // Tuned by eye against a 1024px photo: at 0.5 the sky still shows holes, at
  // 1.5 every point is a soft blob and the subject loses its edges. 0.9 closes
  // the background into a surface while the detail the sampler paid for
  // survives.
  densityBoost: 0.9,
  debugNoise: false,
};

/**
 * The lens. Focal length frames the shot, focus and edge bokeh shape what it
 * draws attention to — all three imitate optics the renderer does not have.
 */
export interface LensParams {
  /** Vertical field of view in degrees. ~16 is a telephoto, 50 is a normal lens. */
  fov: number;
  /** Which depth slice is sharp, 0..1 across the bundle's z bounds. */
  focalDepth: number;
  /** How much depth stays sharp around it. Above ~0.6 everything is in focus. */
  focalRange: number;
  /** How strongly the left and right edges blow out and fade. */
  edgeBokeh: number;
  /** Which colour grade to apply; a file under `public/luts/`. */
  grade: GradeName;
  /** 0 leaves the photo alone, 1 applies the grade in full. */
  gradeIntensity: number;
}

/** The grades `bun run build:luts` bakes. `neutral` is the identity control. */
export const GRADES = ["neutral", "warm", "cool"] as const;
export type GradeName = (typeof GRADES)[number];

export const defaultLensParams: LensParams = {
  // Telephoto. Research note section 2.2: the original shoots at 16 degrees,
  // and that is most of why a relief under 1% of the width still reads as a
  // photograph — a long lens flattens perspective, so shallow depth stops
  // looking shallow and starts looking compressed.
  fov: 16,
  // Just behind the subject, who sits a little forward of the mid depth.
  //
  // The range is wide because the depth here spans the whole picture: the sky
  // sits at 0 and the foreground grass at 1, so anything under about 0.5
  // throws both ends away and leaves a sharp band across the middle. That is a
  // striking effect and the wrong default — narrow it with the slider to see
  // it, and note how hard it is to unsee once the focus lands on the subject.
  focalDepth: 0.45,
  focalRange: 0.8,
  edgeBokeh: 0.35,
  grade: "warm",
  // Not 1.0. The original mixes its LUT at 0.8, and the reason shows up as
  // soon as you compare: a grade at full strength replaces the photograph's
  // colour, while a grade held back leaves the original showing through it.
  gradeIntensity: 0.8,
};

/** Seconds the intro takes to run from nothing to the full cloud. */
export const INTRO_SECONDS = 2.6;

/** The intro's progress, 0 to 1. Mutated here, read by the camera dolly. */
export interface IntroClock {
  value: number;
}

interface ParticleFieldProps extends ParticleParams {
  lens: LensParams;
  /** Bump this to run the intro again. */
  introReplay: number;
  /** Bundle to render, as a URL under `public/`. */
  bundleUrl?: string;
  renderScale?: number;
  playing: boolean;
}

/**
 * Every particle is one vertex of a single THREE.Points object, so the GPU
 * draws all of them with one GL_POINTS draw call (P1.1). The material is our
 * own shader pair (P1.2): round soft discs (P1.3) sized by perspective, with a
 * per-point scale and sub-pixel dimming (P1.4), drifting on the GPU (P1.5).
 *
 * P3 — the geometry carries no data at all. `position` is a buffer of zeros
 * and each vertex knows only which texel is its own; colour (3.2) and position
 * (3.3, 3.4) are both fetched from textures in the vertex shader. Which means
 * this component no longer knows or cares what it is drawing: hand it another
 * bundle and it renders that instead, whether the bundle came from a file or,
 * from P6, from a photo the user dropped in.
 *
 * P4 — motion sits on top of that fixed home position and keeps no state at
 * all: the whole offset is recomputed from `uTime` every frame. Nothing to
 * store, nothing to drift out of sync, and the cost per particle is the
 * arithmetic alone.
 */
export function ParticleField({
  bundleUrl = SAMPLE_BUNDLE,
  renderScale = 1,
  size,
  softness,
  noiseAmplitude,
  noiseFrequency,
  noiseScatter,
  breathe,
  speed,
  densityBoost,
  debugNoise,
  lens,
  introReplay,
  playing,
}: ParticleFieldProps) {
  const material = useRef<ShaderMaterial>(null);
  const intro = useRef<IntroClock>({ value: 0 });

  // P6.8 — a cloud built from a dropped photo takes precedence over the file
  // bundle, and the renderer below cannot tell which one it got. That is the
  // seam P3 was designed around: same textures, same shader, same effects.
  const packed = usePhotoStore((state) => state.bundle);
  const photoBundle = useCloudBundle(packed);
  const fileBundle = useParticleBundle(packed ? null : bundleUrl);
  const bundle = photoBundle ?? fileBundle;
  const lut = useLookupTexture(`/luts/${lens.grade}.png`);

  // A new cloud earns a new arrival: swapping 65,536 points in mid-frame with
  // the intro already finished would just blink the old picture out.
  useEffect(() => {
    intro.current.value = 0;
  }, [introReplay, bundle]);

  // The grid is pure addressing, so it only depends on the texture size the
  // bundle declares — 256² here, one particle per texel.
  const textureSize = bundle?.metadata.width;
  const grid = useMemo(
    () => (textureSize === undefined ? undefined : createParticleGrid(textureSize)),
    [textureSize],
  );

  // Built once: R3F would recreate the material if `args` changed identity.
  const materialArgs = useMemo(
    () =>
      [
        {
          vertexShader,
          fragmentShader,
          uniforms: {
            uColorMap: { value: null },
            uPositionHigh: { value: null },
            uPositionLow: { value: null },
            uBoundsMin: { value: new Vector3() },
            uBoundsMax: { value: new Vector3() },
            uTextureSize: { value: 1 },
            uSize: { value: 0 },
            uScale: { value: 1 },
            uMaxPointSize: { value: 64 },
            uSoftness: { value: 0 },
            uTime: { value: 0 },
            uNoiseAmplitude: { value: 0 },
            uNoiseFrequency: { value: 1 },
            uNoiseScatter: { value: 0 },
            uBreathe: { value: 0 },
            uViewportAspect: { value: 1 },
            uDebugNoise: { value: 0 },
            uLut: { value: null },
            uLutIntensity: { value: 0 },
            uProgress: { value: 0 },
            uDensityBoost: { value: 0 },
            uFocalDepth: { value: 0.5 },
            uFocalRange: { value: 1 },
            uEdgeBokeh: { value: 0 },
          },
          // Soft rims need alpha blending. Not writing depth keeps a faded rim
          // from hiding the points behind it; with thousands of small
          // overlapping points, skipping back-to-front sorting is acceptable.
          transparent: true,
          depthWrite: false,
        },
      ] as const,
    [],
  );

  // The largest point this GPU can rasterise (commonly 64–8192 px).
  const gl = useThree((state) => state.gl);
  const maxPointSize = useMemo(() => {
    const context = gl.getContext();
    const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    return range[1] ?? 64;
  }, [gl]);

  // Uniforms are how a ShaderMaterial is tweaked: new values are uploaded on
  // the next draw, with no shader recompile.
  const size2d = useThree((state) => state.size);
  const height = size2d.height;
  const dpr = useThree((state) => state.viewport.dpr);
  useEffect(() => {
    const uniforms = material.current?.uniforms;
    if (!uniforms || !bundle) return;

    uniforms.uColorMap!.value = bundle.color;
    uniforms.uPositionHigh!.value = bundle.positionHigh;
    uniforms.uPositionLow!.value = bundle.positionLow;
    (uniforms.uBoundsMin!.value as Vector3).fromArray(bundle.metadata.bounds.min);
    (uniforms.uBoundsMax!.value as Vector3).fromArray(bundle.metadata.bounds.max);
    uniforms.uTextureSize!.value = bundle.metadata.width;
    uniforms.uSize!.value = size;
    // P5.6 — the lens belongs in here. A world-sized point covers more pixels
    // through a long lens for exactly the reason everything else does, and
    // 1/tan(fov/2) is that magnification. Leaving it out (as this did until
    // P5.6) silently pins the point size to one field of view, so zooming in
    // with the FOV slider would grow the scene while the points stayed put and
    // the surface fell apart into specks.
    const lensScale = 1 / Math.tan((lens.fov * Math.PI) / 360);
    uniforms.uScale!.value = height * dpr * renderScale * 0.5 * lensScale;
    uniforms.uMaxPointSize!.value = maxPointSize;
    uniforms.uSoftness!.value = softness;
    uniforms.uNoiseAmplitude!.value = noiseAmplitude;
    uniforms.uNoiseFrequency!.value = noiseFrequency;
    uniforms.uNoiseScatter!.value = noiseScatter;
    uniforms.uBreathe!.value = breathe;
    uniforms.uViewportAspect!.value = size2d.width / Math.max(1, size2d.height);
    uniforms.uDebugNoise!.value = debugNoise ? 1 : 0;
    uniforms.uDensityBoost!.value = densityBoost;
    uniforms.uFocalDepth!.value = lens.focalDepth;
    uniforms.uFocalRange!.value = lens.focalRange;
    uniforms.uEdgeBokeh!.value = lens.edgeBokeh;
    uniforms.uLut!.value = lut;
    // Without a grade loaded the lookup would sample a null texture, which
    // reads as black. Holding the intensity at 0 until it arrives keeps the
    // first frames honest rather than dark.
    uniforms.uLutIntensity!.value = lut ? lens.gradeIntensity : 0;
  }, [
    bundle,
    size,
    softness,
    noiseAmplitude,
    noiseFrequency,
    noiseScatter,
    breathe,
    debugNoise,
    densityBoost,
    lens,
    lut,
    size2d,
    height,
    dpr,
    maxPointSize,
    renderScale,
  ]);

  useFrame((_, delta) => {
    if (!material.current) return;

    // The intro runs on its own clock, unaffected by Pause: freezing the drift
    // to study a frame should not also freeze the cloud half-arrived.
    const clock = intro.current;
    if (clock.value < 1) {
      clock.value = Math.min(1, clock.value + delta / INTRO_SECONDS);
    }
    material.current.uniforms.uProgress!.value = clock.value;

    if (!playing) return;
    // Advance time here instead of multiplying elapsed time by the speed in
    // the shader: changing the speed then bends the motion smoothly rather
    // than jumping every point to a different phase.
    material.current.uniforms.uTime!.value += delta * speed;
  });

  // Every particle's position and colour live in the bundle, so there is no
  // meaningful frame to draw before it arrives.
  if (!bundle || !grid) return null;

  return (
    // The real positions only exist inside the vertex shader, so the bounding
    // sphere three.js computes from the zeroed `position` attribute has radius
    // 0 at the origin. Left on, frustum culling would drop the whole draw call
    // the moment that single point left the view.
    <points frustumCulled={false}>
      <bufferGeometry>
        {/* Zeros, but required: three.js reads the vertex count from here. */}
        <bufferAttribute attach="attributes-position" args={[grid.positions, 3]} />
        <bufferAttribute attach="attributes-aParticleUv" args={[grid.particleUv, 2]} />
        {/* Identity rather than address. P4.2 seeds the flow field from the
            texel hash instead, since hashing a five-digit integer loses float
            precision (P3.1), so this is still waiting for P5.5 (reveal order),
            which needs the ordinal itself rather than a hash of it. */}
        <bufferAttribute attach="attributes-aIndex" args={[grid.index, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} args={materialArgs} />
      <IntroDolly clock={intro} replay={introReplay} />
    </points>
  );
}
