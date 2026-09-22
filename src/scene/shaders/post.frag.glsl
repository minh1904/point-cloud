precision mediump float;

uniform sampler2D uScene;
uniform sampler2D uLut;
uniform float uLutIntensity;
uniform float uVignette;
uniform float uAberration;
uniform vec2  uResolution;

varying vec2 vUv;

/**
 * Tra LUT 3D nhồi trong texture 2D 512×512.
 *
 * Bố cục: 64 lát cắt xanh lam xếp thành lưới 8×8, mỗi tile 64×64 ứng với
 * (đỏ, lục). Lấy mẫu HAI lát kề nhau rồi mix theo phần lẻ của kênh lam —
 * không có bước này sẽ thấy dải màu rõ ở vùng chuyển.
 *
 * Các hằng số 0.125 (= 1/8) và 0.5/512 là nửa texel, để lấy đúng tâm ô chứ
 * không rơi vào biên giữa hai ô.
 */
vec4 lookup(vec4 textureColor, sampler2D lut) {
  textureColor = clamp(textureColor, 0.0, 1.0);

  float blueColor = textureColor.b * 63.0;

  vec2 quad1;
  quad1.y = floor(floor(blueColor) / 8.0);
  quad1.x = floor(blueColor) - (quad1.y * 8.0);

  vec2 quad2;
  quad2.y = floor(ceil(blueColor) / 8.0);
  quad2.x = ceil(blueColor) - (quad2.y * 8.0);

  vec2 texPos1;
  texPos1.x = (quad1.x * 0.125) + 0.5 / 512.0 + ((0.125 - 1.0 / 512.0) * textureColor.r);
  texPos1.y = (quad1.y * 0.125) + 0.5 / 512.0 + ((0.125 - 1.0 / 512.0) * textureColor.g);

  vec2 texPos2;
  texPos2.x = (quad2.x * 0.125) + 0.5 / 512.0 + ((0.125 - 1.0 / 512.0) * textureColor.r);
  texPos2.y = (quad2.y * 0.125) + 0.5 / 512.0 + ((0.125 - 1.0 / 512.0) * textureColor.g);

  vec4 newColor1 = texture2D(lut, texPos1);
  vec4 newColor2 = texture2D(lut, texPos2);

  return mix(newColor1, newColor2, fract(blueColor));
}

void main() {
  vec2 uv = vUv;
  vec2 fromCenter = uv - 0.5;
  float dist = length(fromCenter);

  // Quang sai màu: tách ba kênh dọc theo hướng TOẢ RA TỪ TÂM, mạnh dần về rìa.
  // Đây là cách ống kính thật sai — tách đều toàn khung sẽ nhìn ra giả ngay.
  vec3 color;
  if (uAberration > 0.0) {
    vec2 offset = fromCenter * uAberration * dist * 0.02;
    color.r = texture2D(uScene, uv + offset).r;
    color.g = texture2D(uScene, uv).g;
    color.b = texture2D(uScene, uv - offset).b;
  } else {
    color = texture2D(uScene, uv).rgb;
  }

  // LUT trước vignette: grading là thuộc tính của hình ảnh, vignette là thuộc
  // tính của ống kính. Đảo thứ tự sẽ làm bốn góc bị grading theo độ tối giả.
  if (uLutIntensity > 0.0) {
    vec4 graded = lookup(vec4(color, 1.0), uLut);
    color = mix(color, graded.rgb, uLutIntensity);
  }

  // Vignette. Nhân theo tỉ lệ khung để nó tròn chứ không bị kéo dẹt ở màn rộng.
  float aspect = uResolution.x / uResolution.y;
  vec2 scaled = vec2(fromCenter.x * aspect, fromCenter.y);
  float v = 1.0 - smoothstep(0.35, 0.95, length(scaled) * uVignette * 0.65);
  color *= mix(1.0, v, min(1.0, uVignette));

  gl_FragColor = vec4(color, 1.0);
}
