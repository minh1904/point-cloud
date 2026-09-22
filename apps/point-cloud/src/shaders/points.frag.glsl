// P1.2 — runs once per pixel covered by each point (a square sprite for now).

uniform vec3 uColor; // linear-space color (THREE.Color converts from sRGB)

void main() {
  gl_FragColor = vec4(uColor, 1.0);

  // Convert linear -> the renderer's output color space (sRGB). Without this
  // chunk the same color looks darker than it does with PointsMaterial.
  #include <colorspace_fragment>
}
