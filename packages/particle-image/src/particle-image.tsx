import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ClampToEdgeWrapping,
  DataTexture,
  LinearFilter,
  NearestFilter,
  NoColorSpace,
  RGBAFormat,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
  Vector3,
  type ColorSpace,
  type ShaderMaterial,
  type Texture,
} from "three";

import { particleFragmentShader, particleVertexShader } from "./shaders.gen";

/**
 * Renders an exported point-cloud bundle in someone else's project (P8.6).
 *
 * ```tsx
 * <Canvas camera={{ position: [0, 0, 8], fov: 16 }}>
 *   <ParticleImage src="/particles/my-cloud" />
 * </Canvas>
 * ```
 *
 * `src` is a directory served over HTTP holding the four files of the bundle
 * format: unzip an export into `public/particles/my-cloud/` and point at it.
 *
 * ## What it deliberately does not do
 *
 * No store, no inspector, no schema, no worker, no depth model. The tool that
 * *makes* a cloud is a large piece of software; the thing that *shows* one is
 * a loader, a material and a draw call. Anything shared between them would be
 * a dependency this component does not need and a consumer cannot drop.
 *
 * The shaders are embedded as strings by `bun run build:particle-image`, for
 * the same reason: a consumer's bundler will not be configured to import
 * `.glsl`, and `ShaderChunk` will not have been populated by a module side
 * effect that only runs inside the studio.
 */

export interface ParticleImageParams {
  /** Point size in world units, before the per-point 0.5-1 variation. */
  size: number;
  /** 0 is a hard disc, 1 fades from the centre out. */
  softness: number;
  /** How hard point size chases point spacing. 0 leaves every point equal. */
  densityBoost: number;
  /** Curl offset on screen, in normalised device units. */
  noiseAmplitude: number;
  /** How many noise cells span the cloud. */
  noiseFrequency: number;
  /** How far apart neighbours sample the field. 0 moves them as one. */
  noiseScatter: number;
  /** Depth breathing, in world units. */
  breathe: number;
  /** Multiplier on animation time. 0 freezes the drift. */
  speed: number;
  /** Which depth slice is sharp, 0…1 across the cloud's own z bounds. */
  focalDepth: number;
  /** How much depth stays sharp around it. Above ~0.6 everything is sharp. */
  focalRange: number;
  /** How strongly the left and right edges blow out and push apart. */
  edgeBokeh: number;
  /** 0 leaves the colour alone, 1 applies the LUT in full. Needs `lut`. */
  gradeIntensity: number;
}

/** The studio's defaults, so an unconfigured component looks like the tool. */
export const defaultParticleImageParams: ParticleImageParams = {
  size: 0.019,
  softness: 0.5,
  densityBoost: 0.9,
  noiseAmplitude: 0.012,
  noiseFrequency: 3,
  noiseScatter: 0.15,
  breathe: 0.01,
  speed: 1,
  focalDepth: 0.45,
  focalRange: 0.8,
  edgeBokeh: 0.35,
  gradeIntensity: 0.8,
};

export interface ParticleImageProps extends Partial<ParticleImageParams> {
  /** Directory holding `metadata.json` and the three PNGs, without a trailing slash. */
  src: string;
  /** Optional colour grade — a 512² LUT PNG, as baked by the studio. */
  lut?: string;
  /**
   * Use the look stored in the bundle's `params.json`, if it has one.
   * Explicit props always win over it. Default: true.
   */
  useBundleParams?: boolean;
  /** Seconds the reveal takes. 0 shows the cloud immediately. */
  introSeconds?: number;
  onLoad?: (info: { particleCount: number }) => void;
  onError?: (error: Error) => void;
}

interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

interface Loaded {
  size: number;
  particleCount: number;
  bounds: Bounds;
  color: Texture;
  positionHigh: Texture;
  positionLow: Texture;
  params: Partial<ParticleImageParams>;
}

/**
 * A texture holding data must be read back exactly as it was written, so every
 * convenience three.js applies to pictures has to be switched off. `flipY`
 * especially: three flips images on upload so uv (0,0) is the bottom-left, and
 * row 0 of the file has to stay row 0 of the texture or every particle reads
 * another particle's data.
 */
function configure(texture: Texture, colorSpace: ColorSpace): Texture {
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * What the shader reads where the studio would put pointer displacement.
 *
 * The vertex shader is shared with the tool, which has an interactive
 * simulation writing into a texture here (P9.1). This component has no such
 * thing — but the uniform cannot be left `null`, because three.js substitutes
 * a default **white** texture for an unbound sampler, and white would shove
 * every particle a full world unit.
 */
const zeroDisplacement = (() => {
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

/** One particle per texel: the address each vertex looks its data up with. */
function createGrid(size: number) {
  const count = size * size;
  const particleUv = new Float32Array(count * 2);
  const index = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    // The + 0.5 aims at the texel's centre. Aiming at `x / size` lands on the
    // boundary between two texels, where one ulp of rounding picks up the
    // neighbour's data.
    particleUv[i * 2] = ((i % size) + 0.5) / size;
    particleUv[i * 2 + 1] = (Math.floor(i / size) + 0.5) / size;
    index[i] = i;
  }

  return { count, positions: new Float32Array(count * 3), particleUv, index };
}

export function ParticleImage({
  src,
  lut,
  useBundleParams = true,
  introSeconds = 2.6,
  onLoad,
  onError,
  ...overrides
}: ParticleImageProps) {
  const material = useRef<ShaderMaterial>(null);
  const progress = useRef(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [grade, setGrade] = useState<Texture | null>(null);

  /**
   * The callbacks, held in a ref rather than named as dependencies.
   *
   * `onLoad` and `onError` are almost always inline arrows at the call site,
   * so they are a new function on every render. Listing them in the loader's
   * dependency array turns the component into a fetch loop: load, setState,
   * render, new identity, reload — verified as 36 requests for 4 files before
   * this ref existed. This is the "latest callback" pattern, and the reason
   * `useEffectEvent` is being added to React.
   */
  const callbacks = useRef({ onLoad, onError });
  useEffect(() => {
    callbacks.current = { onLoad, onError };
  }, [onLoad, onError]);

  useEffect(() => {
    let cancelled = false;
    const textures: Texture[] = [];
    const loader = new TextureLoader();

    const load = (file: string, colorSpace: ColorSpace) =>
      loader.loadAsync(`${src}/${file}`).then((texture) => {
        textures.push(texture);
        return configure(texture, colorSpace);
      });

    void (async () => {
      try {
        const response = await fetch(`${src}/metadata.json`);
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const metadata = (await response.json()) as {
          width: number;
          particleCount: number;
          bounds: Bounds;
        };

        // Optional, and a 404 is not an error: a bundle exported as data only
        // simply has no look to carry.
        const params = useBundleParams
          ? await fetch(`${src}/params.json`)
              .then((result) => (result.ok ? (result.json() as Promise<Partial<ParticleImageParams>>) : {}))
              .catch(() => ({}))
          : {};

        const [color, positionHigh, positionLow] = await Promise.all([
          load("color.png", SRGBColorSpace),
          load("position_h.png", NoColorSpace),
          load("position_l.png", NoColorSpace),
        ]);

        if (cancelled) return;
        progress.current = 0;
        setLoaded({
          size: metadata.width,
          particleCount: metadata.particleCount,
          bounds: metadata.bounds,
          color,
          positionHigh,
          positionLow,
          params,
        });
        callbacks.current.onLoad?.({ particleCount: metadata.particleCount });
      } catch (cause) {
        if (cancelled) return;
        callbacks.current.onError?.(
          cause instanceof Error ? cause : new Error(String(cause)),
        );
      }
    })();

    return () => {
      cancelled = true;
      setLoaded(null);
      // Textures are GPU memory, which the garbage collector cannot see.
      for (const texture of textures) texture.dispose();
    };
  }, [src, useBundleParams]);

  useEffect(() => {
    if (!lut) return;

    let cancelled = false;
    let texture: Texture | undefined;

    void new TextureLoader().loadAsync(lut).then((result) => {
      if (cancelled) {
        result.dispose();
        return;
      }
      // A LUT wants interpolation — 64 samples per axis is coarse, and
      // blending between entries is what makes it smooth. `NoColorSpace`
      // though: the bytes are a lookup table, not a picture.
      texture = result;
      result.minFilter = LinearFilter;
      result.magFilter = LinearFilter;
      result.generateMipmaps = false;
      result.flipY = false;
      result.colorSpace = NoColorSpace;
      result.needsUpdate = true;
      setGrade(result);
    });

    return () => {
      cancelled = true;
      texture?.dispose();
    };
  }, [lut]);

  const grid = useMemo(() => (loaded ? createGrid(loaded.size) : null), [loaded]);

  const materialArgs = useMemo(
    () =>
      [
        {
          vertexShader: particleVertexShader,
          fragmentShader: particleFragmentShader,
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
            uDisplacement: { value: zeroDisplacement },
          },
          transparent: true,
          depthWrite: false,
        },
      ] as const,
    [],
  );

  const gl = useThree((state) => state.gl);
  const maxPointSize = useMemo(() => {
    const context = gl.getContext();
    const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE) as Float32Array;
    return range[1] ?? 64;
  }, [gl]);

  useEffect(() => {
    const current = material.current;
    if (!current || !loaded) return;

    current.uniforms.uColorMap!.value = loaded.color;
    current.uniforms.uPositionHigh!.value = loaded.positionHigh;
    current.uniforms.uPositionLow!.value = loaded.positionLow;
    (current.uniforms.uBoundsMin!.value as Vector3).fromArray(loaded.bounds.min);
    (current.uniforms.uBoundsMax!.value as Vector3).fromArray(loaded.bounds.max);
    current.uniforms.uTextureSize!.value = loaded.size;
  }, [loaded]);

  useFrame(({ camera, size: viewport, viewport: view }, delta) => {
    const current = material.current;
    if (!current || !loaded) return;

    // Explicit props beat the bundle's stored look, which beats the defaults.
    const params = { ...defaultParticleImageParams, ...loaded.params, ...overrides };
    const uniforms = current.uniforms;

    uniforms.uSize!.value = params.size;
    uniforms.uSoftness!.value = params.softness;
    uniforms.uDensityBoost!.value = params.densityBoost;
    uniforms.uNoiseAmplitude!.value = params.noiseAmplitude;
    uniforms.uNoiseFrequency!.value = params.noiseFrequency;
    uniforms.uNoiseScatter!.value = params.noiseScatter;
    uniforms.uBreathe!.value = params.breathe;
    uniforms.uFocalDepth!.value = params.focalDepth;
    uniforms.uFocalRange!.value = params.focalRange;
    uniforms.uEdgeBokeh!.value = params.edgeBokeh;
    uniforms.uLut!.value = grade;
    uniforms.uLutIntensity!.value = grade ? params.gradeIntensity : 0;
    uniforms.uMaxPointSize!.value = maxPointSize;
    uniforms.uViewportAspect!.value = viewport.width / Math.max(1, viewport.height);

    // A world-sized point covers more pixels through a long lens for the same
    // reason everything else does, and 1/tan(fov/2) is that magnification.
    const fov = "fov" in camera ? (camera.fov as number) : 50;
    uniforms.uScale!.value =
      viewport.height * view.dpr * 0.5 * (1 / Math.tan((fov * Math.PI) / 360));

    if (introSeconds > 0 && progress.current < 1) {
      progress.current = Math.min(1, progress.current + delta / introSeconds);
    } else {
      progress.current = 1;
    }
    uniforms.uProgress!.value = progress.current;
    uniforms.uTime!.value += delta * params.speed;
  });

  if (!loaded || !grid) return null;

  return (
    // The real positions only exist inside the vertex shader, so the bounding
    // sphere three.js derives from the zeroed `position` attribute has radius
    // 0. Left on, frustum culling drops the whole draw call as soon as the
    // camera looks away from the origin — silently.
    <points frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[grid.positions, 3]} />
        <bufferAttribute attach="attributes-aParticleUv" args={[grid.particleUv, 2]} />
        <bufferAttribute attach="attributes-aIndex" args={[grid.index, 1]} />
      </bufferGeometry>
      <shaderMaterial ref={material} args={materialArgs} />
    </points>
  );
}
