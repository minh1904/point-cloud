// Value noise, fBM and 2D curl noise (P4.1, P4.2).
//
// Registered as a three.js ShaderChunk in scene/shader-chunks.ts, so
// points.vert.glsl pulls it in with `#include <pc_noise>` — the same mechanism
// three.js uses for its own chunks, and the only way a .glsl file loaded
// through raw-loader can be shared between shaders.

// A pseudo-random number for one lattice corner. The multipliers are large so
// that inputs sitting right next to each other (cell 4 and cell 5) land on
// completely unrelated values — which is the entire job of a noise hash.
float pcHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Value noise: a random number at every integer lattice point, smoothly
// interpolated in between. Cheaper than gradient (Perlin) noise, and once
// several octaves are stacked the difference stops being visible.
float pcValueNoise(vec2 p) {
  vec2 cell = floor(p);
  vec2 f = fract(p);

  // Smoothstep the blend weights. Interpolating linearly would leave visible
  // creases along every lattice line, because the slope changes abruptly there
  // even though the value does not.
  vec2 w = f * f * (3.0 - 2.0 * f);

  float a = pcHash(cell);
  float b = pcHash(cell + vec2(1.0, 0.0));
  float c = pcHash(cell + vec2(0.0, 1.0));
  float d = pcHash(cell + vec2(1.0, 1.0));

  return mix(mix(a, b, w.x), mix(c, d, w.x), w.y);
}

// Fractal Brownian motion: the same noise summed at doubling frequencies and
// halving amplitudes. One octave is soft blobs and reads as artificial; four
// carries both large shapes and fine detail, which is what natural texture
// looks like — coastlines, clouds and mountains all behave this way.
//
// Each octave is also rotated. Skip that and every octave shares the same
// lattice directions, so their sum shows a faint grid aligned to the axes: the
// noise looks subtly square. Half a radian per octave is enough to break it.
#define PC_FBM_OCTAVES 4

float pcFbm(vec2 p) {
  // cos(0.5), sin(0.5) — mat2 takes its arguments column by column.
  const mat2 rotate = mat2(0.8775826, 0.4794255, -0.4794255, 0.8775826);

  float sum = 0.0;
  float amplitude = 0.5;

  for (int i = 0; i < PC_FBM_OCTAVES; i++) {
    sum += amplitude * pcValueNoise(p);
    p = rotate * p * 2.0;
    amplitude *= 0.5;
  }

  return sum;
}

// The 2D curl of the fBM field, by central difference.
//
// Take the gradient of a scalar field and rotate it by 90°. The result is
// divergence-free: as much flows out of any small region as flows into it.
// That property is the whole reason to bother. Follow a plain gradient and
// every particle slides downhill into the same few basins and stays there;
// follow its curl and particles circulate forever without ever piling up.
//
// Four fBM evaluations per particle is the cost, and it is the most expensive
// thing in the frame. P9.2 drops an octave for mobile.
vec2 pcCurl(vec2 p) {
  const float e = 0.08;

  float dx = pcFbm(p + vec2(e, 0.0)) - pcFbm(p - vec2(e, 0.0));
  float dy = pcFbm(p + vec2(0.0, e)) - pcFbm(p - vec2(0.0, e));

  // (∂ψ/∂y, −∂ψ/∂x)
  return vec2(dy, -dx) / (2.0 * e);
}
