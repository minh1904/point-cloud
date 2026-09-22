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
uniform float uSpread;
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
  // uSpread đẩy các hạt ra xa nhau mà không đổi số hạt.
  vec3 p = vec3(
    (st.x - 0.5) * 2.0 * uAspect * uSpread,
    (0.5 - st.y) * 2.0 * uSpread,
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

  // Curl trong BA CHIỀU.
  //
  // curlNoise là hàm 2D nên một lần gọi chỉ xoáy được trong một mặt phẳng. Bản
  // trước chỉ gọi một lần cho mặt phẳng xy, nên trục z gần như đứng yên và đám
  // hạt trôi dẹt như tờ giấy.
  //
  // Gọi ba lần trên ba mặt phẳng trực giao rồi cộng hai đóng góp cho mỗi trục:
  // kết quả trôi tự do theo mọi hướng. Mỗi mặt phẳng có thang thời gian và độ
  // lệch miền riêng nên chúng không khoá pha với nhau.
  float tc = uTime * uFbmSpeed;
  vec2 curlXY = curlNoise(scaledCoord * 1.5, tc * 0.40, 4, uEps);
  vec2 curlXZ = curlNoise(scaledCoord * 1.3 + vec2(31.7, 11.3), tc * 0.55, 4, uEps);
  vec2 curlYZ = curlNoise(scaledCoord * 1.7 + vec2(-19.1, 47.9), tc * 0.31, 4, uEps);

  // curlNoise chia cho (2 * eps) nên độ lớn của nó gấp ~1/(2*eps) lần chênh
  // lệch fbm bên dưới. Nhân lại (2 * eps) để `uCurlStrength` mang đơn vị world,
  // cùng thang với các slider khác.
  float k = 2.0 * uEps * uCurlStrength;

  // Mỗi trục nhận đóng góp từ hai mặt phẳng chứa nó. 0.5 để tổng hai đóng góp
  // không mạnh gấp đôi một trục đơn.
  p.x += organicX * 0.5 + (curlXY.x + curlXZ.x) * k * 0.5;
  p.y += organicY * 0.5 + (curlXY.y + curlYZ.x) * k * 0.5;
  // Trục z nhân thêm 1.6: depth chỉ trải ±depthScale/2 (mặc định ±0.3) trong khi
  // xy trải ±2, nên cùng một biên độ tuyệt đối sẽ gần như không thấy ở z.
  p.z += organicZ * 0.4 + (curlXZ.y + curlYZ.y) * k * 0.5 * 1.6;

  // Lệch pha nhẹ theo từng hạt để chúng không trôi đồng loạt như một khối.
  // Biên độ rất nhỏ (0.35 rad) nên hạt lân cận vẫn gần đồng pha và bề mặt không
  // tan — khác hẳn việc lấy pha ngẫu nhiên toàn phần, thứ đã từng làm hỏng hình.
  float jitter = sin(aIndex * 137.5 + uTime * uFbmSpeed * 0.7) * 0.35;

  // Thở: phình/co theo chu kỳ. Pha biến thiên MƯỢT theo khoảng cách tới tâm —
  // dùng hash per-particle thì hai hạt cạnh nhau ngược pha và bề mặt tan thành
  // nhiễu.
  p *= 1.0 + sin(uTime * uBreathSpeed - length(p.xy) * 1.5 + jitter) * uBreathAmp;

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

  // min(..., 64) là chặn an toàn, không phải thẩm mỹ. Tổ hợp tham số cực đại
  // (spread lớn + fbm biên độ lớn + hạt to) đẩy một số hạt sát camera và cỡ hạt
  // bùng lên hàng trăm pixel — nhân với hàng chục nghìn hạt là đủ treo GPU. Đã
  // gặp thật khi thử. 64 cũng là trần của ALIASED_POINT_SIZE_RANGE trên nhiều
  // GPU, nên vượt qua nó vốn đã không có tác dụng.
  gl_PointSize = min(
    uPointSize * uDpr * densityScale * sizeVariation * perspectiveScale,
    64.0
  );

  // Hạt bị loại hẳn thì đẩy ra sau camera thay vì vẽ rồi bỏ ở fragment —
  // tiết kiệm fill rate, vốn là bottleneck thật của particle system.
  if (vAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
