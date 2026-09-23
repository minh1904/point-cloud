// Runs once per pixel covered by each point.

uniform float uSoftness;  // 0 = hard disc, 1 = fades all the way from the center

varying float vCoverage; // < 1 for points smaller than a pixel (P1.4)
varying vec3 vColor;     // linear-space color read from the data texture (P3.2)
varying float vDefocus;  // 0 = sharp, 1 = fully outside the focal slice (P5.3)
varying float vEdge;     // 0 mid-frame, up to 1 at the sides (P5.4)
varying float vReveal;   // 0 before this particle arrives, 1 once it has (P5.5)

void main() {
  // P1.3 — a point is rasterised as a square sprite. gl_PointCoord is this
  // pixel's position inside that square, (0,0) top-left to (1,1) bottom-right.
  // Distance from the center: 0 in the middle, 0.5 at the edge midpoints,
  // ~0.707 in the corners.
  float d = length(gl_PointCoord - 0.5);

  // Throw away the corners: discard skips this pixel entirely (no color, no
  // depth write), which is what turns the square into a disc.
  if (d > 0.5) discard;

  // Fade the rim instead of cutting it: full alpha inside, down to 0 at the
  // edge. The fade band starts at 0.5 * (1 - softness).
  float alpha = 1.0 - smoothstep(0.5 * (1.0 - uSoftness), 0.5, d);

  // P5.3 / P5.4 — the other half of the cheat. Shrinking a point opens gaps;
  // fading it is what turns those gaps into softness rather than sparseness.
  // The floor matters: drop it much below this and a defocused sky stops
  // being soft and simply disappears, which is a hole in the picture rather
  // than depth of field.
  alpha *= mix(1.0, 0.14, vDefocus * vDefocus);
  alpha *= 1.0 - vEdge * 0.55;
  alpha *= vReveal;

  gl_FragColor = vec4(vColor, alpha * vCoverage);

  // Convert linear -> the renderer's output color space (sRGB). Without this
  // chunk the same color looks darker than it does with PointsMaterial.
  #include <colorspace_fragment>
}
