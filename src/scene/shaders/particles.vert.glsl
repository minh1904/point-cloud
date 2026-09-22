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
uniform float uNoiseFreq;
uniform float uNoiseAmp;
uniform int   uNoiseOctaves;
uniform float uNoiseEps;
uniform float uDpr;
uniform float uRefDistance;  // khoảng cách camera hiện tại

attribute vec2 aGridUv;      // toạ độ ô trong lưới, 0..1

varying vec3  vColor;
varying float vAlpha;

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

  // Chuyển động analytic: position = f(uv, time). Không có velocity buffer,
  // không ping-pong FBO — nên không tích luỹ sai số và scrub được theo thời gian.
  p.xy += curlNoise(p.xy * uNoiseFreq, uTime, uNoiseOctaves, uNoiseEps) * uNoiseAmp;

  vColor = texture2D(uColor, st).rgb;

  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;

  // Thu nhỏ theo khoảng cách, chuẩn hoá theo khoảng cách camera: nhờ vậy
  // `uPointSize` mang nghĩa "bao nhiêu pixel ở khoảng cách hiện tại" thay vì một
  // số vô nghĩa phụ thuộc scale của scene.
  //
  // gl_PointSize bị cap bởi ALIASED_POINT_SIZE_RANGE (~64px trên Safari và một
  // số GPU) — muốn hạt to hơn phải chuyển sang instanced quad.
  gl_PointSize = uPointSize * uDpr * (uRefDistance / max(0.001, -mv.z));

  // Hạt bị loại hẳn thì đẩy ra sau camera thay vì vẽ rồi bỏ ở fragment —
  // tiết kiệm fill rate, vốn là bottleneck thật của particle system.
  if (vAlpha <= 0.0) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
}
