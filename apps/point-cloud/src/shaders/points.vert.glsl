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
//
// P4 — on top of that fixed home position sits the motion: curl noise in clip
// space (4.2, 4.3) plus a slow breathing in depth (4.4). None of it is
// simulated. Every frame recomputes the whole offset from time alone, so
// there is no state to keep, no error to accumulate, and no cost per particle
// beyond the arithmetic itself.

#include <pc_noise>
#include <pc_lut>
#include <pc_decode>

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
uniform float uNoiseAmplitude; // curl offset, in normalised device units
uniform float uNoiseFrequency; // how many noise cells span the cloud
uniform float uNoiseScatter;   // how far apart neighbours sample the field
uniform float uBreathe;        // depth breathing, in world units
uniform float uViewportAspect; // width / height, to keep the wobble round
uniform float uDebugNoise;     // 1 = show the fBM field instead of the photo
uniform float uFocalDepth;     // which depth slice is sharp, 0..1 across bounds
uniform float uFocalRange;     // how much depth stays sharp around it
uniform float uEdgeBokeh;      // how strongly the left and right edges soften
uniform sampler2D uLut;        // colour grade, a 64^3 cube flattened to 512x512
uniform float uLutIntensity;   // 0 = ungraded, 1 = the grade in full
uniform float uProgress;       // intro progress, 0 -> 1 (P5.5)
uniform float uDensityBoost;   // how much the loneliest points grow (P5.1)
uniform sampler2D uDisplacement; // per-particle shove from the pointer (P9.1)

varying float vCoverage; // how much of the 1px minimum the point really fills
varying vec3 vColor;     // this particle's colour, fetched from uColorMap
varying float vDefocus;  // 0 = sharp, 1 = fully outside the focal slice (P5.3)
varying float vEdge;     // 0 in the middle of frame, up to 1 at the sides (P5.4)
varying float vReveal;   // 0 before this particle arrives, 1 once it has (P5.5)

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
  // 65,536 levels and a step 250x finer. P9.1 moved the arithmetic into the
  // `pc_decode` chunk, because the pointer simulation needs the same answer.
  //
  // P3.4 — the PNGs only ever hold 0..1. metadata.json says what range that
  // stands for, which is how the format stays both small and precise: every
  // one of the 65,536 levels is spent on ground the cloud actually covers.
  vec3 home = pcDecodePosition(
    uPositionHigh, uPositionLow, aParticleUv, uBoundsMin, uBoundsMax
  );

  // Still needed further down: P5.3 measures the focal slice along the cloud's
  // own depth rather than distance from the camera.
  vec3 normalised = (home - uBoundsMin) / max(uBoundsMax - uBoundsMin, vec3(0.0001));

  // P9.1 — and the one piece of state in the whole shader. Everything else is
  // recomputed from uTime; this is read back from a texture the simulation
  // pass wrote last frame. Zero when nothing is pushing, so it costs one fetch
  // and an add when the feature is off.
  home += texture2D(uDisplacement, aParticleUv).xyz;

  // Three vertex texture fetches, 65,536 particles, all in parallel. These are
  // the lines the whole P3 phase exists to make possible.
  vec4 colorSample = texture2D(uColorMap, aParticleUv);
  vColor = colorSample.rgb;

  // P5.1/P6.6 — the alpha channel of the colour map carries how crowded this
  // particle is: 1 where points are packed tight, 0 out in the sparse
  // background. It rides in alpha because alpha is the one channel sRGB does
  // not put through a transfer curve, so the number arrives as the number —
  // and because a bundle whose colour map has no alpha reads back 1.0, which
  // means "densest", which leaves the size alone. Every pre-6.6 bundle keeps
  // rendering exactly as it did.
  float crowding = colorSample.a;

  // P5.2 — the colour grade. It runs here, once per particle, rather than in
  // the fragment shader: the colour is constant across a point sprite, so
  // grading per pixel would repeat the same two texture fetches for every one
  // of the dozens of pixels a point covers.
  //
  // The article describing the original puts the LUT in the post-processing
  // pass. Reading their shipped code shows it applied in the particle shader
  // instead, with the post shader declaring a LUT uniform it never uses.
  vColor = pcGrade(uLut, vColor, uLutIntensity);

  vec3 randomness = hash32(texel);

  // Per-particle size variation reads as depth and texture (P1.4), but it also
  // means the field below is sampled by dots of differing weight. The debug
  // view flattens them so what you see is the noise, not the sampling.
  float scale = mix(mix(0.5, 1.0, hash32(texel + 91.7).y), 0.8, uDebugNoise);

  // P4.2 — where this particle samples the flow field. The scatter term is
  // what decides whether neighbours move together or apart: at 0 the cloud
  // behaves like a sheet in a breeze, and as it grows each particle wanders
  // its own way. It comes from the texel hash rather than aIndex directly,
  // because hashing a five-digit integer runs out of float precision (P3.1).
  vec2 flowSeed = aParticleUv * uNoiseFrequency
                + randomness.xy * uNoiseScatter
                + uTime * 0.12;

  // P4.1 — the debug view. Painting the fBM field onto the same particles is
  // the cheapest way to see what the motion is actually being driven by.
  //
  // Two corrections make it legible. fBM is an average of averages, so its
  // values crowd around 0.5 and the raw field is nearly flat grey — hence the
  // contrast stretch. And vColor is linear light that the fragment shader
  // encodes to sRGB at the end, which lifts mid grey to near white; raising it
  // to 2.2 first cancels that out, so what reaches the screen is the field.
  float field = clamp((pcFbm(flowSeed) - 0.2) / 0.55, 0.0, 1.0);
  vColor = mix(vColor, vec3(pow(field, 2.2)), uDebugNoise);

  // P4.4 — breathing. A slow sine in depth, with a per-particle phase so the
  // surface undulates instead of sliding back and forth as one slab.
  home.z += sin(uTime * 0.25 + randomness.z * 6.2831) * uBreathe;

  // Object space -> camera (view) space. The camera looks down -z,
  // so -mvPosition.z is the distance in front of it.
  vec4 mvPosition = modelViewMatrix * vec4(home, 1.0);

  // P4.4 — and a faster wobble that only wakes up close to the camera, where
  // there are enough pixels for it to register. Far away it would be motion
  // nobody can see, paid for at full price.
  float nearness = smoothstep(3.2, 1.2, -mvPosition.z);
  mvPosition.z += sin(uTime * 0.5 + randomness.x * 6.2831) * nearness * uBreathe * 0.6;

  // View space -> clip space; the GPU then divides by w for perspective.
  gl_Position = projectionMatrix * mvPosition;

  // P4.3 — the curl offset is added *after* the projection, in clip space.
  // Multiplying by w cancels the perspective divide that follows, so the
  // displacement is a fixed distance on screen no matter how far away the
  // particle is. Offsetting in world space instead would make near particles
  // swing wildly while distant ones barely twitched.
  vec2 flow = pcCurl(flowSeed);
  flow.x /= uViewportAspect; // NDC is square; the viewport usually is not
  gl_Position.xy += flow * uNoiseAmplitude * gl_Position.w;

  // P5.5 — the intro. One uniform counts from 0 to 1, and every particle reads
  // its own arrival out of it. No timeline, no per-particle state, no CPU work
  // that scales with the count: 65,536 independent animations from one float.
  //
  // The delay mixes two kinds of randomness on purpose. Pure per-particle noise
  // makes the cloud fade up as an even haze; pure fBM makes whole regions
  // arrive together in slabs. Four parts grain to six parts clump gives
  // patches that materialise at their own pace with ragged edges.
  float grain = hash32(texel + 41.3).z;
  float clump = pcFbm(aParticleUv * 2.0);
  float delay = mix(grain, clump, 0.4) * 0.62;

  // And a focus ring opening out of the centre, its edge chewed up by noise so
  // it never reads as a circle — a lens hunting for focus rather than a wipe.
  vec2 fromCentre = aParticleUv - 0.5;
  float radius = length(fromCentre);
  float angle = atan(fromCentre.y, fromCentre.x);
  float ragged = pcFbm(vec2(angle * 1.7, radius * 5.0)) * 0.13 + sin(angle * 6.0) * 0.025;
  float ring = smoothstep(radius + ragged - 0.09, radius + ragged + 0.09, uProgress * 0.92);

  vReveal = min(smoothstep(delay, delay + 0.34, uProgress), ring);

  // P5.4 — edge bokeh. Particles near the left and right edges are blown up,
  // faded, and pushed a little further out, which is roughly what a fast lens
  // does to anything away from its centre. It frames the subject without
  // drawing a frame.
  //
  // Measured in NDC, so it follows the screen rather than the cloud: dividing
  // clip x by w is the perspective divide the GPU is about to do anyway.
  vEdge = smoothstep(0.55, 1.0, abs(gl_Position.x / gl_Position.w)) * uEdgeBokeh;
  gl_Position.x *= 1.0 + vEdge * 0.3;

  // Points have no geometry for the projection to shrink, so perspective is
  // applied by hand: a world-sized point covers fewer pixels further away.
  // uScale is in device pixels and carries the 1/tan(fov/2) of the lens, so
  // the apparent size is right at any devicePixelRatio, viewport or focal
  // length — zooming in with the FOV slider grows the points with the scene.
  float pixels = uSize * scale * (uScale / -mvPosition.z);

  // P5.1 — grow the lonely points. The sampler puts far fewer points on flat
  // background than on the subject, which is the whole idea, and at one size
  // that background shows through as holes.
  //
  // The exponent is not arbitrary. Crowding is a *logarithmic* measure of
  // spacing (P6.6): every 0.5 it drops means the neighbours are three times
  // further away. Undoing a logarithm takes an exponential, so pow() with the
  // square of that three is what makes point size track spacing exactly at a
  // boost of 1. Written this way it is also 1.0 when crowding is 1, so a
  // bundle whose colour map has no alpha is left alone.
  pixels *= pow(9.0, (1.0 - crowding) * uDensityBoost);

  // P5.3 — fake depth of field. Real DOF spreads an out-of-focus point into a
  // disc, which post-processing does by blurring the whole frame at great
  // expense. A point cloud can cheat: shrink the point and fade it instead.
  // The gaps that opens between neighbours read as softness, and it costs two
  // multiplies inside a shader that was already running.
  //
  // The slice is measured along the cloud's own depth (`normalised.z`, 0..1
  // across the bundle's bounds) rather than distance from the camera. For a
  // photograph lifted into shallow relief that is the meaningful axis — and
  // it means the focus does not drift while you orbit.
  vDefocus = smoothstep(0.0, max(uFocalRange, 0.001), abs(normalised.z - uFocalDepth));
  pixels *= 1.0 - vDefocus * vDefocus * 0.5;
  pixels *= 1.0 + vEdge * 1.4;
  // Arriving particles grow into place rather than blinking on.
  pixels *= 0.4 + 0.6 * vReveal;

  // The GPU cannot draw less than one pixel: a 0.3px point would be drawn as
  // a full pixel and look too bright. Draw 1px but let the fragment shader
  // dim it by the area the point should have covered (0.3² = 9%).
  vCoverage = min(pixels * pixels, 1.0);

  // Past the hardware limit the GPU clamps silently; clamping here keeps the
  // behavior explicit and identical across devices.
  gl_PointSize = clamp(pixels, 1.0, uMaxPointSize);
}
