# P2.4 · Vignette, chromatic aberration và grain

## Mục tiêu

Bổ sung bộ ba hiệu ứng hậu kỳ cổ điển vào post shader chạy trên fullscreen quad:
- **Vignette**: làm tối dần rìa khung hình để hướng sự tập trung vào vùng trung tâm.
- **Chromatic aberration (sắc sai)**: tách lệch kênh đỏ (R) và xanh lam (B) theo hướng xuyên tâm khỏi tâm màn hình, mô phỏng quang sai thấu kính máy ảnh.
- **Film grain (hạt nhiễu)**: phủ một lớp nhiễu giả ngẫu nhiên biến thiên theo thời gian (24 fps), giúp giảm hiện tượng color banding và tạo chất ảnh điện ảnh.

Tất cả tham số (`vignette`, `chromaticAberration`, `grain`) đều có thanh trượt tương tác trên panel **Post effects** của Atelier UI, cho phép tinh chỉnh trực tiếp và mượt mà mà không phải biên dịch lại shader.

## Khái niệm

### 1. Vì sao per-pixel post effects lại cực kỳ nhẹ?

Khác với các hiệu ứng cần lấy mẫu nhiều pixel lân cận như Gaussian blur hay Bloom (yêu cầu nhiều bước downsample/upsample và hàng chục texture reads cho mỗi pixel), ba hiệu ứng này là các phép toán **per-pixel / local**:
- Chromatic aberration chỉ tốn thêm 2 lần `texture2D` (thay vì 1 lần đọc cho pixel gốc).
- Vignette chỉ tốn một phép đo khoảng cách Euclid `length(centeredUv)` và một hàm nội suy `smoothstep`.
- Grain chỉ tốn một hàm băm lượng giác toán học trên toạ độ pixel `gl_FragCoord.xy`.

Chỉ chạy trên một tam giác fullscreen duy nhất (1 draw call, 3 đỉnh), toàn bộ phép tính thực hiện hoàn toàn trong ALU của GPU với chi phí tính toán gần như không đáng kể ở 60+ fps.

### 2. Chromatic aberration: tách phổ màu xuyên tâm

Trong quang học thực tế, thấu kính có chiết suất khác nhau đối với từng bước sóng ánh sáng: bước sóng ngắn (xanh lam) bị bẻ cong nhiều hơn bước sóng dài (đỏ). Kết quả là ở rìa ống kính, các dải màu bị tách rời.

Để giả lập hiện tượng này:
1. Đưa toạ độ UV về tâm: `centeredUv = vUv - 0.5`.
2. Tính độ lệch kênh theo hướng từ tâm toả ra: `channelOffset = centeredUv * uChromaticAberration`. Càng xa tâm màn hình, độ lệch càng lớn; ở chính giữa tâm, độ lệch bằng 0.
3. Giữ nguyên toạ độ lấy mẫu cho kênh xanh lục (G), dịch mẫu kênh đỏ (R) ra xa tâm một chút (`vUv + channelOffset`) và kênh xanh lam (B) lại gần tâm một chút (`vUv - channelOffset`):

```glsl
vec4 centerSample = texture2D(uScene, vUv);
vec4 sceneColor = vec4(
  texture2D(uScene, vUv + channelOffset).r,
  centerSample.g,
  texture2D(uScene, vUv - channelOffset).b,
  centerSample.a
);
```

### 3. Vignette: làm tối theo khoảng cách tới tâm

Độ sáng giảm dần khi đi từ tâm ra rìa:
- Khoảng cách tới tâm: `dist = length(centeredUv)`. Tâm có khoảng cách 0, bốn góc có khoảng cách $\approx \sqrt{0.5^2 + 0.5^2} \approx 0.707$.
- Dùng `smoothstep(0.2, 0.72, dist)` để giữ nguyên độ sáng ở vùng trung tâm (bán kính < 0.2) rồi làm tối êm dịu dần về phía góc ngoài.
- Nhân màu RGB với `1.0 - edge * uVignette`: khi `uVignette = 0`, hiệu ứng tắt hoàn toàn.

### 4. Film grain: số ngẫu nhiên trên GPU từ hàm băm

GLSL không có hàm `Math.random()`. Để sinh số ngẫu nhiên cho từng pixel:
1. Dùng hàm giả ngẫu nhiên kinh điển dựa trên hàm sin và tích vô hướng:
   ```glsl
   float random(vec2 position) {
     return fract(sin(dot(position, vec2(12.9898, 78.233))) * 43758.5453);
   }
   ```
2. Đưa toạ độ pixel màn hình `gl_FragCoord.xy` vào hàm để mỗi pixel có một giá trị nhiễu độc lập.
3. Để hạt phim chuyển động như phim nhựa quay ở 24 fps thay vì nhấp nháy ở tốc độ 60/120 fps quá gắt, làm tròn thời gian: `grainFrame = floor(uTime * 24.0)`.
4. Cộng giá trị nhiễu đã được cân bằng về khoảng `[-0.5, 0.5]` vào kênh RGB: `sceneColor.rgb += (noise - 0.5) * uGrain`.

### 5. Cập nhật uniform không gây re-render hay biên dịch lại

Khi người dùng kéo slider:
- Giá trị lưu trong React state `postParams` của `Studio`.
- Component `ScenePass` lắng nghe thay đổi thông qua `useLayoutEffect` và cập nhật trực tiếp `uniforms.<tên>.value` trên ref của `ShaderMaterial`.
- GPU nhận giá trị uniform mới ngay frame tiếp theo mà Three.js không cần compile lại chương trình shader.

## Đi qua code

**`apps/point-cloud/src/shaders/post.frag.glsl`**

Fragment shader nhận các uniform điều khiển và áp dụng cả ba hiệu ứng theo thứ tự tự nhiên: sắc sai $\rightarrow$ tối góc $\rightarrow$ hạt phim:

```glsl
uniform sampler2D uScene;
uniform float uTime;
uniform float uInvert;
uniform float uVignette;
uniform float uChromaticAberration;
uniform float uGrain;

varying vec2 vUv;

float random(vec2 position) {
  return fract(sin(dot(position, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 centeredUv = vUv - 0.5;
  vec2 channelOffset = centeredUv * uChromaticAberration;

  vec4 centerSample = texture2D(uScene, vUv);
  vec4 sceneColor = vec4(
    texture2D(uScene, vUv + channelOffset).r,
    centerSample.g,
    texture2D(uScene, vUv - channelOffset).b,
    centerSample.a
  );

  float edge = smoothstep(0.2, 0.72, length(centeredUv));
  sceneColor.rgb *= 1.0 - edge * uVignette;

  float grainFrame = floor(uTime * 24.0);
  float noise = random(gl_FragCoord.xy + grainFrame) - 0.5;
  sceneColor.rgb += noise * uGrain;

  sceneColor.rgb = mix(sceneColor.rgb, vec3(1.0) - sceneColor.rgb, uInvert);
  gl_FragColor = sceneColor;
}
```

**`apps/point-cloud/src/scene/scene-pass.tsx`**

Định nghĩa kiểu dữ liệu `PostParams` và cấu hình mặc định tinh tế:

```tsx
export interface PostParams {
  vignette: number;
  chromaticAberration: number;
  grain: number;
}

export const defaultPostParams: PostParams = {
  vignette: 0.35,
  chromaticAberration: 0.002,
  grain: 0.025,
};
```

Khai báo uniform trong `useMemo` và cập nhật imperative trong `useLayoutEffect`:

```tsx
useLayoutEffect(() => {
  const postUniforms = postMaterial.current?.uniforms;
  if (!postUniforms) return;

  postUniforms.uInvert!.value = invert ? 1 : 0;
  postUniforms.uVignette!.value = params.vignette;
  postUniforms.uChromaticAberration!.value = params.chromaticAberration;
  postUniforms.uGrain!.value = params.grain;
}, [invert, params.vignette, params.chromaticAberration, params.grain]);
```

Cập nhật `uTime` mỗi frame từ `clock.elapsedTime` trong pass render màn hình:

```tsx
useFrame(({ camera, clock, scene }) => {
  if (postMaterial.current) {
    postMaterial.current.uniforms.uTime!.value = clock.elapsedTime;
  }

  gl.setRenderTarget(null);
  gl.render(scene, camera);
}, SCREEN_RENDER_PRIORITY);
```

**`apps/point-cloud/src/app/studio.tsx`**

Thêm cụm điều khiển `Post effects` cạnh cụm `Particles`:
- Slider `Vignette` (0 → 1, step 0.01)
- Slider `Chromatic` (0 → 0.02, step 0.0005)
- Slider `Grain` (0 → 0.15, step 0.005)
- Nút `Reset` đưa các thông số về `defaultPostParams`.

## Lỗi đã gặp

1. **Grain nhấp nháy quá nhanh nếu dùng trực tiếp `uTime` mà không khoá framerate.** Ở tần số quét màn hình cao (120Hz/144Hz), nếu mỗi frame là một hạt nhiễu mới, mắt người sẽ cảm thấy giật và khó chịu. Khắc phục bằng cách rời rạc hoá thời gian với bước nhảy 24 fps: `floor(uTime * 24.0)`.
2. **Dùng `vUv` thay vì `gl_FragCoord.xy` làm seed cho grain.** Nếu dùng toạ độ `vUv` (vốn nằm trong khoảng `[0, 1]`), hàm `sin` có chu kỳ hẹp dễ để lại các dải hoa văn lặp lại (aliasing / Moire pattern). Dùng toạ độ pixel vật lý `gl_FragCoord.xy` (các số lớn như 1920, 1080) giúp hàm băm phân bố đều và ngẫu nhiên hơn nhiều.
3. **Sắc sai không nên dịch kênh xanh lục.** Mắt người nhạy cảm nhất với bước sóng xanh lục (đóng góp phần lớn độ sáng / luma). Giữ kênh xanh lục cố định và chỉ dịch đối xứng kênh đỏ và lam giúp hình ảnh giữ được độ nét tổng thể của vật thể.

## Tự thử

1. Kéo thanh trượt `Chromatic` lên tối đa (0.02). Quan sát các hạt ở tâm so với các hạt ở sát góc màn hình: hiệu ứng tách màu rõ rệt ở đâu hơn?
2. Trong `post.frag.glsl`, đổi `floor(uTime * 24.0)` thành `uTime * 60.0`. Cảm nhận sự khác biệt về cảm giác của hạt phim.
3. Thử giảm `uVignette` về 0 để thấy cảnh nguyên bản, sau đó tăng dần lên 1.0 để thấy rìa khung hình bị che tối như thế nào.
4. Đổi công thức chromatic aberration từ hướng tâm (`centeredUv`) thành hướng ngang cố định `vec2(uChromaticAberration, 0.0)`. Hiệu ứng trông giống dạng thấu kính nào hơn?

## Đọc thêm

- [GPU Gems — Chapter 24. High-Quality Filtering and Antialiasing](https://developer.nvidia.com/gpugems/gpugems/part-iv-image-processing/chapter-24-high-quality-filtering)
- [The Book of Shaders — Generative Designs: Random](https://thebookofshaders.com/10/)
- [Inigo Quilez — Useful Little Functions](https://iquilezles.org/articles/functions/)
