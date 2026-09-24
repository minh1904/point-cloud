// Decoding a 16-bit position out of two byte textures (P3.3).
//
// Registered as the `pc_decode` ShaderChunk, because two shaders need it now:
// points.vert.glsl, which has always done this inline, and pointer.frag.glsl
// (P9.1), whose simulation has to know where a particle's *home* is before it
// can work out how far the pointer is from it.
//
// The divisor is 65535, not 65536. Two bytes span 0..65535 inclusive, so 65535
// is the value that has to land on 1.0 — see src/bundle/position-codec.ts.

vec3 pcDecodePosition(
  sampler2D high,
  sampler2D low,
  vec2 uv,
  vec3 boundsMin,
  vec3 boundsMax
) {
  vec3 hi = texture2D(high, uv).rgb * 255.0;
  vec3 lo = texture2D(low, uv).rgb * 255.0;
  vec3 normalised = (hi * 256.0 + lo) / 65535.0;

  return mix(boundsMin, boundsMax, normalised);
}
