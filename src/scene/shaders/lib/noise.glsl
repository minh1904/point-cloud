// Chuỗi noise: hash → value noise → fBM → curl noise.
//
// Lấy từ bài Codrops "Simulating Life in the Browser" (Bautista Berto,
// basement.studio). Đây là phần đáng lấy nhất của bài đó.
//
// Xây từ dưới lên, mỗi tầng dùng tầng dưới. Đọc theo thứ tự.

// 1. Hash — pseudo-random tất định từ toạ độ.
//    Hằng số 12.9898 / 78.233 / 43758.5453 là hash kinh điển của GLSL; chúng
//    không có ý nghĩa toán học, chỉ là những số đủ "xấu" để fract(sin(...)) trải
//    đều. Ở float thấp (mobile) hash này có thể tạo dải, nhưng với chuyển động
//    hạt thì không nhìn ra.
float hash(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 2. Value noise — gán số random cho 4 góc ô lưới rồi nội suy.
//    Dùng smoothstep (f*f*(3-2f)) chứ không nội suy tuyến tính, nếu không sẽ
//    thấy rõ cạnh ô.
float valueNoise(vec2 st) {
  vec2 i = floor(st);
  vec2 f = fract(st);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

// 3. fBM — cộng nhiều octave, mỗi tầng tần số gấp đôi và biên độ giảm nửa.
//    Cho ra cấu trúc fractal: có chi tiết ở nhiều thang độ, giống thứ tự nhiên
//    tạo ra.
//
//    Phép XOAY domain mỗi octave (mat2 góc ~0.5 rad) là chi tiết quan trọng:
//    không có nó, các octave thẳng hàng theo trục và noise trông như lưới.
//    Công thức của Inigo Quilez.
//
//    Vòng lặp cap cứng ở 6 vì GLSL cần biên hằng số; `octaves` cắt sớm hơn.
float fbm(vec2 st, int octaves) {
  float value = 0.0;
  float amplitude = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));

  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * valueNoise(st);
    st = rot * st * 2.0 + vec2(100.0);
    amplitude *= 0.5;
  }
  return value;
}

// 4. Curl noise — lấy gradient của fBM rồi QUAY 90 ĐỘ.
//
//    `vec2(dy, -dx)` là toàn bộ bí mật. Quay gradient 90° cho ra trường
//    divergence-free (∇·v = 0): không có nguồn, không có giếng. Hạt đi theo nó
//    thì xoáy và cuộn, bảo toàn thể tích — không bị hút dồn về một điểm hay bắn
//    tán ra như khi dùng gradient trực tiếp.
//
//    Đây là lý do TOÁN HỌC khiến particle system nhìn "sống", không phải số
//    lượng hạt.
vec2 curlNoise(vec2 st, float time, int octaves, float eps) {
  vec2 t = vec2(time * 0.1);

  float n1 = fbm(st + vec2(eps, 0.0) + t, octaves);
  float n2 = fbm(st - vec2(eps, 0.0) + t, octaves);
  float n3 = fbm(st + vec2(0.0, eps) + t, octaves);
  float n4 = fbm(st - vec2(0.0, eps) + t, octaves);

  float dx = (n1 - n2) / (2.0 * eps);
  float dy = (n3 - n4) / (2.0 * eps);

  return vec2(dy, -dx);
}
