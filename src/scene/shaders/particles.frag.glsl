precision mediump float;

varying vec3  vColor;
varying float vAlpha;

void main() {
  // Đĩa tròn VIỀN CỨNG, ĐỤC hoàn toàn — không phải đốm sáng mờ.
  //
  // Đây là chi tiết quyết định vẻ ngoài. Bản trước dùng
  // `pow(1.0 - smoothstep(0.0, 0.5, d), 1.5)` cho ra falloff mềm: mỗi hạt là
  // một quầng sáng, và khi các hạt chồng lên nhau chúng TAN VÀO NHAU thành vệt
  // mờ. Demo gốc dùng `step()` — đĩa đặc, alpha = 1 — nên hạt chồng nhau vẫn
  // đọc ra từng cái một, như những nét cọ đè lên nhau.
  //
  // Khác biệt duy nhất so với demo: dải smoothstep hẹp (0.46–0.5) thay cho
  // `step()` thuần, chỉ để khử răng cưa ở viền. Với hạt 14px đó là ~0.3px —
  // thực chất vẫn là viền cứng, nhưng không bị vỡ hạt.
  float distanceToCenter = length(gl_PointCoord - vec2(0.5));
  float alpha = 1.0 - smoothstep(0.46, 0.5, distanceToCenter);

  // Hạt ở vách depth đã bị đẩy ra sau camera trong vertex shader, nên ở đây chỉ
  // cần loại phần ngoài hình tròn. Mật độ ảnh hưởng CỠ hạt, không ảnh hưởng độ
  // mờ — giống demo.
  if (alpha < 0.01 || vAlpha <= 0.0) discard;

  gl_FragColor = vec4(vColor, alpha);
}
