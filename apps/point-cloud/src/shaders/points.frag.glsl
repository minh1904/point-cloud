// Runs once per pixel covered by each point.

uniform vec3 uColor;      // linear-space color (THREE.Color converts from sRGB)
uniform float uSoftness;  // 0 = hard disc, 1 = fades all the way from the center

varying float vCoverage; // < 1 for points smaller than a pixel (P1.4)

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

  gl_FragColor = vec4(uColor, alpha * vCoverage);

  // Convert linear -> the renderer's output color space (sRGB). Without this
  // chunk the same color looks darker than it does with PointsMaterial.
  #include <colorspace_fragment>
}
