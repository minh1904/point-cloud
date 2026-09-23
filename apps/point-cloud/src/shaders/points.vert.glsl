// Point transform, motion and size.
//
// ShaderMaterial prepends the built-ins used here: the `position` attribute
// and the `modelViewMatrix` / `projectionMatrix` uniforms.
//
// P3.1 — `position` is now all zeros and is never read. A particle is no
// longer handed its place in the world; it is handed an address (aParticleUv,
// the centre of its texel) and works the rest out on the GPU.
//
// P3.2 — the address starts paying off: the colour comes from this particle's
// own texel.
//
// P3.3/P3.4 — and so does the position. Nothing about where a particle sits
// is computed here any more; it is read out of two textures and mapped back
// onto the bundle's bounds. The placeholder grid is gone.

attribute vec2 aParticleUv;  // centre of this particle's texel, in (0, 1)

uniform sampler2D uColorMap;      // one texel of colour per particle
uniform sampler2D uPositionHigh;  // high byte of each 16-bit coordinate
uniform sampler2D uPositionLow;   // low byte
uniform vec3 uBoundsMin;          // world extent the 0..1 values map onto
uniform vec3 uBoundsMax;
uniform float uTextureSize;  // side of the square data texture, in texels
uniform float uSize;         // point size in world units
uniform float uScale;        // half the drawing-buffer height, in device pixels
uniform float uMaxPointSize; // largest gl_PointSize this GPU supports
uniform float uTime;         // seconds of animation, advanced on the CPU
uniform float uDriftAmplitude; // how far points wander, in world units

varying float vCoverage; // how much of the 1px minimum the point really fills
varying vec3 vColor;     // this particle's colour, fetched from uColorMap

// Deterministic pseudo-randomness from a 2D coordinate (Dave Hoskins' hash32).
// This replaces the aScale / aRandomness attributes of P1.4-P1.5: the same
// texel always produces the same numbers, on every machine, with no CPU buffer
// to upload or keep in sync.
//
// Feed it texel coordinates (0 .. size), never uv (0 .. 1). The first fract()
// is what decorrelates neighbours, and fract() of a number below 1 returns the
// number unchanged — with uv the hash would degrade into a smooth ramp.
vec3 hash32(vec2 p) {
  vec3 p3 = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

void main() {
  vec2 texel = aParticleUv * uTextureSize;

  // P3.3 — one coordinate, two bytes. A PNG channel holds 256 levels, which
  // over this field is a step the size of a whole grid cell; two channels give
  // 65,536 levels and a step 250x finer. The divisor is 65535, not the 65536
  // the original UntilLabs shader uses: two bytes span 0..65535 inclusive, so
  // 65535 is the value that has to land on 1.0. See src/bundle/position-codec.ts.
  vec3 high = texture2D(uPositionHigh, aParticleUv).rgb * 255.0;
  vec3 low = texture2D(uPositionLow, aParticleUv).rgb * 255.0;
  vec3 normalised = (high * 256.0 + low) / 65535.0;

  // P3.4 — the PNGs only ever hold 0..1. metadata.json says what range that
  // stands for, which is how the format stays both small and precise: every
  // one of the 65,536 levels is spent on ground the cloud actually covers.
  vec3 home = mix(uBoundsMin, uBoundsMax, normalised);

  // Three vertex texture fetches, 65,536 particles, all in parallel. These are
  // the lines the whole P3 phase exists to make possible.
  vColor = texture2D(uColorMap, aParticleUv).rgb;

  vec3 randomness = hash32(texel);
  float scale = mix(0.5, 1.0, hash32(texel + 91.7).y);

  // P1.5 — every point runs the same code, but its own randomness makes it
  // move differently: the random value sets both how far it swings (the
  // multiplier) and where in the cycle it starts (the phase, * 10.0). Three
  // axes with different frequencies (0.5, 0.3, 0.4) never line up, so the
  // motion reads as wandering rather than a loop.
  vec3 drift = vec3(
    sin(uTime * 0.5 + randomness.x * 10.0) * randomness.x,
    cos(uTime * 0.3 + randomness.y * 10.0) * randomness.y,
    sin(uTime * 0.4 + randomness.z * 10.0) * randomness.z
  );
  vec3 displaced = home + drift * uDriftAmplitude;

  // Object space -> camera (view) space. The camera looks down -z,
  // so -mvPosition.z is the distance in front of it.
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);

  // View space -> clip space; the GPU then divides by w for perspective.
  gl_Position = projectionMatrix * mvPosition;

  // Points have no geometry for the projection to shrink, so perspective is
  // applied by hand: a world-sized point covers fewer pixels further away.
  // uScale is in device pixels, so the apparent (CSS) size is the same at any
  // devicePixelRatio and scales with the viewport like the rest of the scene.
  float pixels = uSize * scale * (uScale / -mvPosition.z);

  // The GPU cannot draw less than one pixel: a 0.3px point would be drawn as
  // a full pixel and look too bright. Draw 1px but let the fragment shader
  // dim it by the area the point should have covered (0.3² = 9%).
  vCoverage = min(pixels * pixels, 1.0);

  // Past the hardware limit the GPU clamps silently; clamping here keeps the
  // behavior explicit and identical across devices.
  gl_PointSize = clamp(pixels, 1.0, uMaxPointSize);
}
