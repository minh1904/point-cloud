// 3D colour lookup, from a cube flattened into a 2D image (P5.2).
//
// Registered as a ShaderChunk in scene/shader-chunks.ts: `#include <pc_lut>`.
//
// WebGL 1 has no 3D textures, so the 64x64x64 cube is stored as 64 slices of
// 64x64 laid out in an 8x8 grid — one 512x512 PNG. Within a slice, red runs
// left to right and green top to bottom; the slice index is blue.
//
//   ┌────┬────┬────┬────┬────┬────┬────┬────┐
//   │ b0 │ b1 │ b2 │ b3 │ b4 │ b5 │ b6 │ b7 │   each cell: 64x64
//   ├────┼────┼────┼────┼────┼────┼────┼────┤   red  →
//   │ b8 │ b9 │ …  │    │    │    │    │    │   green ↓
//   └────┴────┴────┴────┴────┴────┴────┴────┘

const float PC_LUT_SIZE = 64.0;
const float PC_LUT_TILES = 8.0;
const float PC_LUT_IMAGE = 512.0;

vec3 pcLutLookup(sampler2D lut, vec3 color) {
  vec3 c = clamp(color, 0.0, 1.0);

  // Blue picks the slice. It almost never lands exactly on one, so read the
  // two neighbouring slices and blend — this is the third dimension of the
  // interpolation, which the hardware cannot do for us across tiles.
  float blue = c.b * (PC_LUT_SIZE - 1.0);
  float slice = floor(blue);
  float next = min(slice + 1.0, PC_LUT_SIZE - 1.0);
  float blend = blue - slice;

  // Where inside a tile. The +0.5 lands on a texel centre, and scaling by
  // (size - 1) before that keeps the lookup inside the tile's own 64 texels:
  // bilinear filtering must never reach across a tile border, because the
  // neighbour is a completely different blue.
  vec2 inside = (c.rg * (PC_LUT_SIZE - 1.0) + 0.5) / PC_LUT_IMAGE;

  vec2 tile = vec2(mod(slice, PC_LUT_TILES), floor(slice / PC_LUT_TILES)) / PC_LUT_TILES;
  vec2 tileNext = vec2(mod(next, PC_LUT_TILES), floor(next / PC_LUT_TILES)) / PC_LUT_TILES;

  return mix(
    texture2D(lut, tile + inside).rgb,
    texture2D(lut, tileNext + inside).rgb,
    blend
  );
}

// Grades are authored on the values you see on screen, not on linear light, so
// the round trip has to happen around the lookup. Skipping it does not fail
// loudly — it just makes every grade act far more strongly in the shadows than
// whoever built it intended.
vec3 pcGrade(sampler2D lut, vec3 linearColor, float intensity) {
  vec3 display = pow(clamp(linearColor, 0.0, 1.0), vec3(1.0 / 2.2));
  vec3 graded = pow(pcLutLookup(lut, display), vec3(2.2));

  return mix(linearColor, graded, intensity);
}
