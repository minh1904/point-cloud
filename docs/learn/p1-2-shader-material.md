# P1.2 · Tự viết shader thay cho PointsMaterial

## Mục tiêu

Thay `PointsMaterial` có sẵn bằng `ShaderMaterial` do mình viết. **Hình trên màn hình không đổi** — và đó chính là mục tiêu: chứng minh ta hiểu và tái tạo đúng những gì hộp đen kia làm, trước khi mở rộng nó.

## Khái niệm

### 1. Hai loại shader

| | Vertex shader | Fragment shader |
|---|---|---|
| Chạy bao nhiêu lần | 1 lần / mỗi **đỉnh** (= mỗi hạt) | 1 lần / mỗi **pixel** hạt phủ lên |
| Đầu vào | attribute (riêng từng hạt), uniform | varying (từ vertex shader), uniform |
| Đầu ra bắt buộc | `gl_Position` (vị trí), `gl_PointSize` (cỡ) | `gl_FragColor` (màu RGBA) |
| Với 60.000 hạt cỡ 2px | ~60.000 lần | ~240.000 lần |

Hàng trăm nghìn lần chạy mỗi frame — nhưng GPU chạy **song song** hàng nghìn luồng một lúc, nên vẫn nhẹ.

### 2. Ba loại dữ liệu vào shader

- **attribute** — *mỗi hạt một giá trị*: `position`. (P1.4 thêm `aScale`.)
- **uniform** — *cả draw call dùng chung*: `uSize`, `uColor`, ma trận camera.
- **varying** — vertex shader tính, fragment shader đọc. (Gặp ở P1.4.)

**Uniform là "núm vặn"**: đổi giá trị chỉ là upload vài byte ở lần vẽ sau, không phải biên dịch lại shader. Sau này mọi slider trong inspector sẽ vặn chính các uniform này.

### 3. Hành trình của một đỉnh qua các không gian toạ độ

```
position (object space)
   │  × modelViewMatrix        — xoay/di chuyển vật + đặt camera vào gốc
   ▼
mvPosition (view space)        — camera ở (0,0,0), nhìn theo hướng −z
   │  × projectionMatrix       — phối cảnh
   ▼
gl_Position (clip space)
   │  GPU tự chia cho w        — "perspective divide": xa → nhỏ
   ▼
toạ độ màn hình (pixel)
```

Vì camera nhìn theo **−z**, một điểm trước mặt camera có `z` âm. `-mvPosition.z` là **khoảng cách** từ camera tới điểm.

### 4. Size attenuation — phối cảnh cho point

Tam giác ở xa tự nhỏ lại nhờ perspective divide. Nhưng point **không có hình học**: `gl_PointSize` là số pixel cố định. Muốn hạt xa nhỏ đi, phải tự chia cho khoảng cách:

```glsl
gl_PointSize = uSize * (uScale / -mvPosition.z);
```

- `uSize`: kích thước tính bằng đơn vị thế giới (world unit).
- `uScale`: nửa chiều cao drawing buffer (pixel). Đây là hệ số đổi "world unit ở khoảng cách 1" ra pixel.

### 5. Color space — chỗ dễ sai nhất

Mã màu `#dfe6ff` là **sRGB** (không gian màu của màn hình). Nhưng để trộn/cộng màu cho đúng, GPU tính trong **linear**. three.js tự đổi:

```
new Color("#dfe6ff")  →  lưu dạng linear
     shader tính toán  →  linear
#include <colorspace_fragment>  →  đổi linear → sRGB trước khi xuất ra màn hình
```

`PointsMaterial` tự có dòng include đó. `ShaderMaterial` thì **không** — thiếu nó, màu trông tối hơn hẳn.

## Đi qua code

**`apps/point-cloud/src/shaders/points.vert.glsl`**

```glsl
vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);   // → view space
gl_Position = projectionMatrix * mvPosition;               // → clip space
gl_PointSize = uSize * (uScale / -mvPosition.z);           // cỡ theo khoảng cách
```

`position`, `modelViewMatrix`, `projectionMatrix` không khai báo mà vẫn dùng được: `ShaderMaterial` tự chèn chúng vào đầu shader. (Muốn tự khai báo hết thì dùng `RawShaderMaterial`.)

**`shaders/points.frag.glsl`**

```glsl
gl_FragColor = vec4(uColor, 1.0);
#include <colorspace_fragment>
```

**`scene/particle-field.tsx`** — khai báo material bằng JSX, cập nhật uniform qua `ref`:

```tsx
<shaderMaterial ref={material} args={materialArgs} />

useEffect(() => {
  material.current.uniforms.uScale.value = height * dpr * 0.5;
}, [height, dpr]);
```

**So sánh với shader thật của `PointsMaterial`** (trong `node_modules/three/src/renderers/shaders/ShaderLib/points.glsl.js`): lõi giống hệt — `gl_PointSize = size; gl_PointSize *= scale / -mvPosition.z;` — cộng thêm ~20 dòng `#include` cho fog, morph target, clipping, texture… mà ta không dùng.

## Lỗi đã gặp

1. **Màn hình đen, build vẫn qua.** Turbopack có module type `raw` sẵn, nhưng nó **không có default export** → `import src from "./x.glsl"` âm thầm thành `undefined`. Phát hiện bằng cách đọc bundle production: thấy `vertexShader: void 0`. Sửa: dùng `raw-loader` (xuất `export default "<nội dung>"`). Bài học: build xanh không có nghĩa là chạy đúng — luôn kiểm tra trên trình duyệt.
2. **Lint chặn sửa giá trị trả về từ `useMemo`.** Rule mới của React (compiler-aware) coi giá trị từ hook là bất biến. Cách chuẩn trong R3F: khai báo `<shaderMaterial>` bằng JSX, sửa uniform qua `ref`. Được thêm lợi ích: R3F tự `dispose` material khi unmount.

## Tự thử

1. Xoá dòng `#include <colorspace_fragment>`. Màu thay đổi thế nào? Giải thích bằng linear/sRGB.
2. Đổi `gl_PointSize = uSize * (uScale / -mvPosition.z);` thành `gl_PointSize = 3.0;`. Hạt gần và xa còn khác nhau không? Khối cầu còn cảm giác chiều sâu không?
3. Trong fragment shader, thử `gl_FragColor = vec4(gl_FragCoord.x / 1000.0, 0.3, 0.8, 1.0);`. `gl_FragCoord` là gì? *(Gợi ý: toạ độ pixel trên màn hình.)*

## Đọc thêm

- [The Book of Shaders](https://thebookofshaders.com/) — nhập môn shader tốt nhất, có nhiều bản dịch
- [three.js — ShaderMaterial](https://threejs.org/docs/#api/en/materials/ShaderMaterial) (mục "Built-in attributes and uniforms")
- [WebGL Fundamentals — How it works](https://webglfundamentals.org/webgl/lessons/webgl-how-it-works.html)
- [three.js — Color management](https://threejs.org/manual/#en/color-management)
