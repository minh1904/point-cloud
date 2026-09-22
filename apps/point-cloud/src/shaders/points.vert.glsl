// Point transform, motion and size.
//
// ShaderMaterial prepends the built-ins used here: the `position` attribute
// and the `modelViewMatrix` / `projectionMatrix` uniforms.

attribute float aScale;      // per-point size multiplier (P1.4)
attribute vec3 aRandomness;  // per-point random numbers in [0, 1) (P1.5)

uniform float uSize;         // point size in world units
uniform float uScale;        // half the drawing-buffer height, in device pixels
uniform float uMaxPointSize; // largest gl_PointSize this GPU supports
uniform float uTime;         // seconds of animation, advanced on the CPU
uniform float uDriftAmplitude; // how far points wander, in world units

varying float vCoverage; // how much of the 1px minimum the point really fills

void main() {
  // P1.5 — every point runs the same code, but its own aRandomness makes it
  // move differently: the random value sets both how far it swings (the
  // multiplier) and where in the cycle it starts (the phase, * 10.0). Three
  // axes with different frequencies (0.5, 0.3, 0.4) never line up, so the
  // motion reads as wandering rather than a loop.
  vec3 drift = vec3(
    sin(uTime * 0.5 + aRandomness.x * 10.0) * aRandomness.x,
    cos(uTime * 0.3 + aRandomness.y * 10.0) * aRandomness.y,
    sin(uTime * 0.4 + aRandomness.z * 10.0) * aRandomness.z
  );
  vec3 displaced = position + drift * uDriftAmplitude;

  // Object space -> camera (view) space. The camera looks down -z,
  // so -mvPosition.z is the distance in front of it.
  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);

  // View space -> clip space; the GPU then divides by w for perspective.
  gl_Position = projectionMatrix * mvPosition;

  // Points have no geometry for the projection to shrink, so perspective is
  // applied by hand: a world-sized point covers fewer pixels further away.
  // uScale is in device pixels, so the apparent (CSS) size is the same at any
  // devicePixelRatio and scales with the viewport like the rest of the scene.
  float pixels = uSize * aScale * (uScale / -mvPosition.z);

  // The GPU cannot draw less than one pixel: a 0.3px point would be drawn as
  // a full pixel and look too bright. Draw 1px but let the fragment shader
  // dim it by the area the point should have covered (0.3² = 9%).
  vCoverage = min(pixels * pixels, 1.0);

  // Past the hardware limit the GPU clamps silently; clamping here keeps the
  // behavior explicit and identical across devices.
  gl_PointSize = clamp(pixels, 1.0, uMaxPointSize);
}
