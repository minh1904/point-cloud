#include ./lib/noise.glsl

uniform sampler2D uColor;
uniform sampler2D uDepth;
uniform vec2  uDepthTexel;   // 1.0 / vec2(depthWidth, depthHeight)
uniform float uAspect;
uniform float uDepthScale;
uniform float uPointSize;
uniform float uTime;
uniform float uEdgeLo;       // từ shared/config.ts — KHÔNG hardcode
uniform float uEdgeHi;
uniform float uFbmAmp;
uniform float uFbmFreq;
uniform float uFbmSpeed;
uniform float uCurlStrength;
uniform float uBreathAmp;
uniform float uBreathSpeed;
uniform float uEps;
uniform float uDpr;
uniform float uRefDistance;  // khoảng cách camera hiện tại

attribute vec2  aGridUv;     // toạ độ ô trong lưới, 0..1
attribute float aIndex;      // chỉ số hạt, để hai hạt cạnh nhau không đồng pha

varying vec3  vColor;
varying float vAlpha;

float valueRemap(float v, float inMin, float inMax, float outMin, float outMax) {
  return outMin + (v - inMin) * (outMax - outMin) / (inMax - inMin);
}

void main() {
  vec2 st = aGridUv;
  float d = texture2D(uDepth, st).r;

  // Edge rejection — PHẢI khớp từng dòng với src/pointcloud/build.ts.
  // Depth đơn ảnh không có mặt sau, nên ở mép vật thể depth nhảy đột ngột và
  // hạt bị kéo thành "màng" nối vật thể với hậu cảnh.
  float dx = texture2D(uDepth, st + vec2(uDepthTexel.x, 0.0)).r
           - texture2D(uDepth, st - vec2(uDepthTexel.x, 0.0)).r;
  float dy = texture2D(uDepth, st + vec2(0.0, uDepthTexel.y)).r
           - texture2D(uDepth, st - vec2(0.0, uDepthTexel.y)).r;
  float edge = length(vec2(dx, dy));
  vAlpha = 1.0 - smoothstep(uEdgeLo, uEdgeHi, edge);

  // Lật y: texture v hướng xuống, world y hướng lên.
  vec3 p = vec3(
    (st.x - 0.5) * 2.0 * uAspect,
    (0.5 - st.y) * 2.0,
    (d - 0.5) * uDepthScale
  );

  // ─── Chuyển động hữu cơ: BA tầng fBM ───────────────────────────────────
  //
  // Đây là chỗ khác biệt lớn nhất so với bản một tầng trước đó. Mỗi trục nhận
  // một HỖN HỢP KHÁC NHAU của ba tầng, nên các trục không dao động đồng pha và
  // chuyển động đọc ra "hữu cơ" thay vì một cái lắc đều.
  //
  // Miền lấy mẫu là toạ độ hạt (0..1) chứ không phải world position: nhờ vậy
  // hành vi không đổi khi ảnh có aspect khác nhau. `aIndex` lệch nhẹ để hai hạt
  // cạnh nhau không lấy đúng cùng một mẫu noise.
  vec2 particleCoord = vec2(st.x + aIndex * 0.001, st.y + aIndex * 0.0005);
  vec2 scaledCoord = particleCoord * uFbmFreq;

  float fbmSlow   = fbm(scaledCoord * 0.5 + uTime * 0.1 * uFbmSpeed, 4);  // trôi lớn, chậm
  float fbmMedium = fbm(scaledCoord * 2.0 + uTime * 0.3 * uFbmSpeed, 3);  // nhiễu động vừa
  float fbmFast   = fbm(scaledCoord * 4.0 + uTime * 1.5 * uFbmSpeed, 2);  // chi tiết nhanh

  float organicX = ((fbmSlow - 0.5) * 0.8 + (fbmMedium - 0.5) * 0.3) * uFbmAmp;
  float organicY = ((fbmMedium - 0.5) * 0.6 + (fbmFast - 0.5) * 0.2) * uFbmAmp;
  float organicZ = ((fbmSlow - 0.5) * 0.4 + (fbmFast - 0.5) * 0.3) * uFbmAmp;

  // Curl có thang thời gian RIÊNG (0.4) khác ba tầng trên — dòng chảy trôi theo
  // nhịp của nó, không khoá pha với chuyển động gợn.
  vec2 curl = curlNoise(scaledCoord * 1.5, uTime * 0.4 * uFbmSpeed, 4, uEps);

  // curlNoise chia cho (2 * eps) nên độ lớn của nó gấp ~1/(2*eps) lần chênh lệch
  // fbm bên dưới. Nhân lại (2 * eps) để `uCurlStrength` mang đơn vị world, cùng
  // thang với các slider khác.
  curl *= 2.0 * uEps;

  p.x += organicX * 0.5 + curl.x * uCurlStrength;
  p.y += organicY * 0.5 + curl.y * uCurlStrength;
  p.z += organicZ * 0.4;

  // Thở: phình/co theo chu kỳ. Pha biến thiên MƯỢT theo khoảng cách tới tâm —
  // dùng hash per-particle thì hai hạt cạnh nhau ngược pha và bề mặt tan thành
  // nhiễu.
  p *= 1.0 + sin(uTime * uBreathSpeed - length(p.xy) * 1.5) * uBreathAmp;

  vColor = texture2D(uColor, st).rgb;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // ─── Cỡ hạt ────────────────────────────────────────────────────────────
  //
  // Ba hệ số nhân, mỗi cái sửa một vấn đề:
  //
  // densityScale  — hạt ở vùng "đặc" (không gần vách depth) to hơn. Biến mật độ
  //                 thành thông tin thị giác thay vì chỉ là độ mờ.
  // sizeVariation — dao động ±15% theo fbmFast, phá cái đều tăm tắp của lưới.
  // perspectiveScale — thu nhỏ theo khoảng cách, CÓ KẸP BIÊN. Kẹp là phần quan
  //                 trọng: không có nó, zoom sâu làm hạt phình ra che kín màn.
  float densityScale = valueRemap(vAlpha, 0.0, 1.0, 0.8, 1.5);
  float sizeVariation = 1.0 + (fbmFast - 0.5) * 0.3;
  float perspectiveScale = clamp(uRefDistance / max(0.001, -mv.z), 0.3, 2.5);

  gl_PointSize = uPointSize * uDpr * densityScale * sizeVariation * perspectiveScale;

  // Hạt bị loại hẳn thì đẩy ra sau camera thay vì vẽ rồi bỏ ở fragment —
  // tiết kiệm fill rate, vốn là bottleneck thật của particle system.
  if (vAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
