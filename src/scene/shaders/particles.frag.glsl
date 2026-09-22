precision mediump float;

varying vec3  vColor;
varying float vAlpha;

void main() {
  // Hình tròn mềm từ gl_PointCoord. pow(..., 1.5) làm rìa tắt nhanh hơn tuyến
  // tính, cho cảm giác hạt phát sáng thay vì đĩa phẳng.
  float dist = length(gl_PointCoord - 0.5);
  float falloff = pow(1.0 - smoothstep(0.0, 0.5, dist), 1.5);

  float alpha = falloff * vAlpha;
  if (alpha < 0.01) discard;

  gl_FragColor = vec4(vColor, alpha);
}
