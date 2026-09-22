varying vec2 vUv;

void main() {
  // ScreenQuad is one oversized triangle in clip space. Deriving UVs from
  // those positions gives 0..1 across the visible part of the triangle.
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
