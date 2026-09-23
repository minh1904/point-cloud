// Point transform, motion and size.
//
// ShaderMaterial prepends the built-ins used here: the `position` attribute
// and the `modelViewMatrix` / `projectionMatrix` uniforms.
//
// P3.1 — `position` is now all zeros and is never read. A particle is no
// longer handed its place in the world; it is handed an address (aParticleUv,
// the centre of its texel) and works the rest out on the GPU. Until 3.2-3.3
// load real data textures the address is turned straight into a spot on a flat
// grid: the same grid the photo data will arrive on.

attribute vec2 aParticleUv;  // centre of this particle's texel, in (0, 1)

uniform float uTextureSize;  // side of the square data texture, in texels
uniform float uFieldSize;    // world width/height the grid is spread over
uniform float uSize;         // point size in world units
uniform float uScale;        // half the drawing-buffer height, in device pixels
uniform float uMaxPointSize; // largest gl_PointSize this GPU supports
uniform float uTime;         // seconds of animation, advanced on the CPU
uniform float uDriftAmplitude; // how far points wander, in world units

varying float vCoverage; // how much of the 1px minimum the point really fills

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

  // The whole point of P3: the position is derived from the address instead of
  // being read from a CPU buffer. P3.3 replaces this line with a texture fetch,
  // and the rest of the shader does not need to change.
  vec3 home = vec3((aParticleUv - 0.5) * uFieldSize, 0.0);

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
