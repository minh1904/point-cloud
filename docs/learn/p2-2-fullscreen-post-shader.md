# P2.2 · Fullscreen post-processing shader

## Mục tiêu

Biến bước chép texture của FBO thành một **post-processing pass** thật sự: vertex shader và fragment shader nằm trong các file `.glsl` riêng, fragment shader đọc toàn bộ ảnh scene rồi có thể đảo màu từng pixel.

Để kiểm tra đường ống, `ScenePass` nhận prop `invert`. Khi bật, nền đen thành trắng và màu hạt bị đảo, còn UI HTML vẫn giữ nguyên. Cấu hình cuối để `invert=false`, nên hình ảnh mặc định không đổi so với P2.1.

## Khái niệm

### 1. Post-processing là xử lý một ảnh 2D

Sau P2.1, cảnh 3D đã nằm trong `target.texture`. Post-processing không cần biết ảnh đó được tạo bởi 60.000 points, một mesh hay nhiều ánh sáng. Nó chỉ thấy một lưới pixel 2D:

```text
scene 3D ─▶ FBO texture ─▶ fullscreen fragment shader ─▶ canvas
                                đọc và sửa từng pixel
```

Fullscreen triangle tạo đúng một fragment cho mỗi pixel trên canvas. Vì vậy một phép màu đơn giản trong fragment shader có thể tác động lên cả khung hình.

### 2. UV nối pixel màn hình với pixel texture

Texture được đọc bằng toạ độ **UV** chuẩn hoá. `vUv=(0,0)` trỏ tới một góc texture, `vUv=(1,1)` trỏ tới góc đối diện.

Vertex shader nhận ba đỉnh của fullscreen triangle và tính UV từ clip-space:

```glsl
vUv = position.xy * 0.5 + 0.5;
```

Phép nhân `0.5` và cộng `0.5` đổi miền `-1..1` của phần màn hình sang `0..1` của texture. Rasterizer nội suy `vUv` cho mọi fragment ở giữa.

### 3. Sampling: đọc ảnh cũ để tạo ảnh mới

Fragment shader dùng sampler và UV để đọc màu của scene:

```glsl
vec4 sceneColor = texture2D(uScene, vUv);
```

`uScene` là `target.texture` do TypeScript truyền vào. Kết quả là `vec4(r, g, b, a)` của đúng pixel tương ứng trong FBO.

### 4. Uniform bật/tắt mà không biên dịch lại shader

Đảo một kênh màu chuẩn hoá rất đơn giản: `1.0 - color`. Shader dùng `mix` để chọn giữa ảnh gốc và ảnh đảo:

```glsl
sceneColor.rgb = mix(sceneColor.rgb, vec3(1.0) - sceneColor.rgb, uInvert);
```

- `uInvert = 0`: `mix` lấy 100% màu gốc.
- `uInvert = 1`: `mix` lấy 100% màu đảo.
- Giá trị ở giữa còn có thể tạo hiệu ứng chuyển dần.

Uniform chỉ là dữ liệu đầu vào. Đổi nó không làm GPU biên dịch lại shader, nên cùng một material phục vụ cả sanity test và đường chạy mặc định.

### 5. Đảo màu trong linear color

FBO lưu màu linear. Phép đảo chạy trên màu linear trước, rồi `colorspace_fragment` đổi kết quả sang output color space của màn hình:

```glsl
gl_FragColor = sceneColor;
#include <colorspace_fragment>
```

Giữ chuyển đổi màu ở cuối pass giúp mọi phép hậu kỳ sau này làm toán trong cùng một không gian màu, tránh sai gamma.

## Đi qua code

**`apps/point-cloud/src/shaders/post.vert.glsl`**

Vertex shader không dùng camera hay ma trận 3D. Nó đặt đỉnh trực tiếp vào clip-space và chuyển UV sang fragment shader:

```glsl
vUv = position.xy * 0.5 + 0.5;
gl_Position = vec4(position.xy, 0.0, 1.0);
```

**`apps/point-cloud/src/shaders/post.frag.glsl`**

Shader đọc `uScene`, trộn màu gốc với màu đảo theo `uInvert`, rồi mới đổi màu để hiển thị:

```glsl
vec4 sceneColor = texture2D(uScene, vUv);
sceneColor.rgb = mix(sceneColor.rgb, vec3(1.0) - sceneColor.rgb, uInvert);
gl_FragColor = sceneColor;
```

Tách GLSL khỏi TSX giúp editor tô cú pháp đúng, shader không làm component React bị nhiễu, và P2.4 có thể thêm vignette, chromatic aberration, grain ngay trong file post shader.

**`apps/point-cloud/src/scene/scene-pass.tsx`**

Hai shader được import như chuỗi thông qua rule `raw-loader` đã có trong `next.config.ts`:

```tsx
import postFragmentShader from "@/shaders/post.frag.glsl";
import postVertexShader from "@/shaders/post.vert.glsl";
```

Uniform texture ổn định theo render target. Uniform invert bắt đầu ở `0`, nên mặc định luôn là copy nguyên trạng:

```tsx
const uniforms = useMemo(
  () => ({
    uScene: { value: target.texture },
    uInvert: { value: 0 },
  }),
  [target.texture],
);
```

Khi prop `invert` đổi, code cập nhật uniform qua ref của `ShaderMaterial`. Đây là mutation imperative có chủ đích, không làm React render lại mỗi frame:

```tsx
useLayoutEffect(() => {
  const invertUniform = postMaterial.current?.uniforms.uInvert;
  if (invertUniform) invertUniform.value = invert ? 1 : 0;
}, [invert]);
```

**`apps/point-cloud/src/scene/stage.tsx`**

Stage dùng `<ScenePass>` không truyền `invert`, nên giá trị mặc định là `false`. Trong sanity test, tạm đổi thành `<ScenePass invert>` làm nền đen thành trắng; sau khi xác nhận, code được trả về cấu hình mặc định.

## Lỗi đã gặp

1. **Turbopack có một khoảng HMR ngắn chưa thấy file shader mới.** Khi TSX đổi trước lúc hai file `.glsl` được watcher nhận diện, console ghi lỗi `Module not found`. Sau khi file xuất hiện và reload, import qua alias `@/shaders/*` hoạt động bình thường.
2. **HMR giữ lại trạng thái uniform sau khi bỏ prop test.** Ảnh vẫn đảo trong lần chụp ngay sau edit. Full reload dựng lại material với `uInvert=0` và xác nhận cấu hình cuối cho ảnh gốc. Với uniform GPU, reload sạch là bước QA đáng tin hơn chỉ nhìn hot update.
3. **Không mutate object trả về từ hook/memo trong render.** Uniform được cập nhật qua `ShaderMaterial` ref trong `useLayoutEffect`, cùng mẫu đã dùng cho particle material, nên vượt qua rule immutability của React ESLint.
4. **Prettier không có parser cho `.glsl`.** Hai shader được giữ format thủ công; Prettier chỉ chạy trên file TSX liên quan.

## Tự thử

1. Tạm truyền `<ScenePass invert>` trong `stage.tsx`. Nền và hạt đổi thế nào? Vì sao panel điều khiển không đổi màu?
2. Đặt `uInvert` thành `0.5`. Theo công thức `mix`, mọi kênh màu sẽ tiến về giá trị nào?
3. Đổi `vUv` thành `vec2(1.0 - vUv.x, vUv.y)`. Ảnh bị lật theo trục nào?
4. Bỏ `texture2D` và xuất `vec4(vUv, 0.0, 1.0)`. Gradient trên màn hình cho biết UV chạy theo hướng nào?
5. Chuyển `colorspace_fragment` lên trước phép invert và so sánh. Vì sao kết quả khác dù cùng công thức `1.0 - color`?

## Đọc thêm

- [three.js manual — Post Processing](https://threejs.org/manual/en/post-processing.html)
- [three.js — ShaderMaterial](https://threejs.org/docs/pages/ShaderMaterial.html)
- [The Book of Shaders — Textures](https://thebookofshaders.com/15/)
