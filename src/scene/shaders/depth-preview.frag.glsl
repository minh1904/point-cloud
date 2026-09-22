precision mediump float;

uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform sampler2D uColormap;  // LUT 256×1 sinh từ src/depth/colormap.ts
uniform float uSplit;         // 0..1, trái là ảnh gốc, phải là depth
uniform float uHasDepth;      // 0 hoặc 1 — tránh nhánh if trên uniform
uniform float uLineWidth;     // bề rộng đường chia, tính theo uv

varying vec2 vUv;

void main() {
  vec3 source = texture2D(uColor, vUv).rgb;

  // Tra colormap trên GPU thay vì dựng ImageBitmap trên CPU. Nhờ vậy đổi
  // colormap hay kéo thanh split là tức thì, không phải duyệt hàng triệu pixel.
  float d = texture2D(uDepth, vUv).r;
  vec3 mapped = texture2D(uColormap, vec2(d, 0.5)).rgb;

  float showDepth = step(uSplit, vUv.x) * uHasDepth;
  vec3 color = mix(source, mapped, showDepth);

  // Đường chia. smoothstep hai phía cho cạnh mượt ở mọi mức zoom.
  float line = 1.0 - smoothstep(0.0, uLineWidth, abs(vUv.x - uSplit));
  color = mix(color, vec3(1.0), line * uHasDepth * 0.85);

  gl_FragColor = vec4(color, 1.0);
}
