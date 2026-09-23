# P4.1 · Value noise và fBM

## Mục tiêu

Từ P1.5 tới giờ, hạt chuyển động bằng `sin`/`cos` — ba dao động điều hoà, mỗi hạt một pha riêng. Nó *động*, nhưng không *sống*: mọi hạt đi đúng một quỹ đạo tuần hoàn, nhìn lâu sẽ thấy nhịp.

Bước này dựng nền toán học cho chuyển động thật: **value noise** và **fBM**. Chưa có gì chuyển động khác đi — 4.2 mới dùng nó — nhưng có một nút **Show noise field** vẽ thẳng trường nhiễu lên chính đám hạt để nhìn thấy nó.

## Khái niệm

### 1. Noise là gì, và không phải là gì

`Math.random()` cho số ngẫu nhiên **rời rạc**: giá trị kề nhau không liên quan gì tới nhau. Nhiễu tivi.

Thứ ta cần là ngẫu nhiên **liên tục**: một hàm `f(x, y)` sao cho hai điểm gần nhau cho giá trị gần nhau, và hai điểm xa nhau thì không liên quan. Mây, núi, vân gỗ, sóng — tự nhiên trông như vậy.

**Value noise** là cách rẻ nhất để có nó:

```
 1. Gán một số ngẫu nhiên cho mỗi điểm nguyên của lưới
 2. Giữa các điểm đó thì nội suy mượt

  giá trị
    │   ●                 ●
    │  ╱ ╲              ╱
    │ ╱   ╲    ●      ╱
    │╱     ╲  ╱ ╲   ╱
    ●       ●╱   ╲ ╱
    └───┴───┴───┴───┴──── x
        1   2   3   4
```

### 2. Vì sao phải làm mượt bằng smoothstep

Nội suy tuyến tính giữa các điểm lưới **trông sai**, dù giá trị liên tục:

```glsl
vec2 w = f * f * (3.0 - 2.0 * f);   // smoothstep
```

Lý do: tuyến tính thì **giá trị** liên tục nhưng **đạo hàm** thì không — độ dốc đổi đột ngột tại mỗi điểm lưới. Mắt người cực nhạy với chỗ gãy của độ dốc, nên kết quả hiện ra những nếp gấp chạy dọc theo đường lưới, lộ ngay cái lưới vuông bên dưới. `f²(3−2f)` có đạo hàm bằng 0 ở hai đầu, nên các mảnh nối vào nhau mượt.

### 3. fBM: chồng nhiều tầng

Một tầng noise là những cục mềm đều nhau — vẫn nhân tạo. Tự nhiên có **chi tiết ở mọi cỡ**: dãy núi có đỉnh lớn, sườn nhỏ, đá vụn, hạt cát.

**fBM** (fractional Brownian motion) mô phỏng điều đó bằng cách cộng cùng một hàm noise ở **tần số gấp đôi, biên độ một nửa**:

```glsl
for (int i = 0; i < PC_FBM_OCTAVES; i++) {
  sum += amplitude * pcValueNoise(p);
  p = rotate * p * 2.0;
  amplitude *= 0.5;
}
```

| Octave | Tần số | Biên độ | Đóng góp |
|---|---|---|---|
| 1 | ×1 | 0.5 | hình dáng lớn |
| 2 | ×2 | 0.25 | gợn vừa |
| 3 | ×4 | 0.125 | chi tiết |
| 4 | ×8 | 0.0625 | hạt mịn |

Tên gọi "Brownian" là ví von thôi — research note cũng chỉ ra rằng bài viết của UntilLabs dùng chữ "Brownian motion" theo nghĩa bóng, không có chuyển động Brown thật nào cả.

### 4. Vì sao phải **xoay** mỗi octave

Đây là chi tiết dễ bỏ qua nhất và là lý do bước này ghi rõ "rotated octaves".

Mọi octave đều dùng chung một lưới, chỉ khác tỉ lệ. Nếu chỉ nhân đôi toạ độ, **tất cả các octave đều thẳng hàng theo trục x và y**. Tổng của chúng thừa hưởng thiên lệch đó: nhiễu trông hơi vuông, có những đường ngang dọc mờ mờ.

Xoay nửa radian mỗi octave là các lưới lệch nhau, thiên lệch bị phá:

```glsl
// cos(0.5), sin(0.5) — mat2 nhận tham số theo từng cột
const mat2 rotate = mat2(0.8775826, 0.4794255, -0.4794255, 0.8775826);
```

Nửa radian (≈28.6°) được chọn vì nó không phải ước của 90° — xoay 45° thì cứ hai octave lại trùng trục trở lại.

### 5. `#include` trong GLSL — nhờ three.js

GLSL **không có** cơ chế import. Mà raw-loader thì trả về một chuỗi. Vậy làm sao chia sẻ hàm noise giữa các shader?

three.js resolve `#include <tên>` bằng cách tra `THREE.ShaderChunk` trước khi biên dịch **bất kỳ** material nào — kể cả `ShaderMaterial` của ta. Đó chính là cơ chế đang cho `points.frag.glsl` viết `#include <colorspace_fragment>`.

Nên ta tự đăng ký một chunk:

```ts
(ShaderChunk as unknown as Record<string, string>).pc_noise = noise;
```

rồi trong shader:

```glsl
#include <pc_noise>
```

Tiền tố `pc_` vì `ShaderChunk` là **một không gian tên toàn cục dùng chung** với hơn 130 chunk có sẵn của three.

## Đi qua code

### `apps/point-cloud/src/shaders/noise.glsl` (mới)

Hash cho một góc lưới:

```glsl
float pcHash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
```

Hệ số lớn là cố ý: ô số 4 và ô số 5 phải cho hai giá trị **không liên quan gì nhau**. Đây cũng là lý do không dùng lại `hash32` của P3.1 — hàm đó cần đầu vào cỡ hàng chục đến hàng trăm, còn toạ độ lưới noise thường chỉ 0…10 và sẽ bị thoái hoá (xem [P3.1 §5](p3-1-geometry-without-positions.md)).

### `apps/point-cloud/src/scene/shader-chunks.ts` (mới)

Đăng ký chunk. Là **side effect của module**, nên chỉ cần `import "./shader-chunks";` là bật.

### `apps/point-cloud/src/shaders/points.vert.glsl`

Debug view — vẽ thẳng trường fBM lên hạt:

```glsl
float field = clamp((pcFbm(flowSeed) - 0.2) / 0.55, 0.0, 1.0);
vColor = mix(vColor, vec3(pow(field, 2.2)), uDebugNoise);
```

Hai phép hiệu chỉnh, cả hai đều cần (xem *Lỗi đã gặp*): kéo giãn tương phản, và luỹ thừa 2.2 để bù lại phép mã hoá sang sRGB ở cuối đường ống.

## Lỗi đã gặp

1. **Debug view ra một mảng trắng bệch.** Lần đầu viết thẳng `vColor = vec3(pcFbm(...))` và màn hình gần như trắng xoá. Hai nguyên nhân chồng nhau: (a) fBM là **trung bình của trung bình**, nên giá trị dồn quanh 0.5 và trường gần như phẳng — cần kéo giãn tương phản; (b) `vColor` là **ánh sáng tuyến tính**, mà fragment shader mã hoá sang sRGB ở bước cuối, đẩy xám 0.5 lên gần trắng. Luỹ thừa 2.2 trước triệt tiêu đúng phép mã hoá đó.
2. **Trường vẫn lốm đốm sau khi sửa tương phản.** Vì mỗi hạt có cỡ ngẫu nhiên 0.5–1 (P1.4), nên trường bị lấy mẫu bằng những chấm nặng nhẹ khác nhau. Trong debug mode cho mọi hạt cùng cỡ thì mây hiện ra rõ ràng. Bài học: khi debug view không đọc được, hỏi xem vấn đề nằm ở **dữ liệu** hay ở **cách lấy mẫu** dữ liệu.
3. **`ShaderChunk` không nhận key mới theo kiểu TypeScript.** three khai báo nó với đúng danh sách chunk của mình, nên thêm `pc_noise` thì `tsc` báo TS2339. Bản thân object thì nhận mọi tên; chỉ cần cast một lần và ghi comment giải thích.

## Tự thử

1. **Bấm Show noise field**, rồi kéo **Frequency** từ 0.2 lên 12. Ở giá trị nào thì bạn hết thấy "mây" và bắt đầu thấy "nhiễu"?
2. **Bỏ smoothstep.** Trong `noise.glsl` đổi `vec2 w = f * f * (3.0 - 2.0 * f);` thành `vec2 w = f;`. Những nếp gấp chạy theo đường lưới hiện ra — đó chính là chỗ đạo hàm bị gãy.
3. **Bỏ xoay octave.** Đổi `p = rotate * p * 2.0;` thành `p = p * 2.0;`. Thiên lệch theo trục rất tinh tế — so sánh hai ảnh chụp màn hình cạnh nhau sẽ dễ thấy hơn là nhìn suông.
4. **Đếm octave.** Đổi `PC_FBM_OCTAVES` xuống 1 rồi lên 6. Một octave trông thế nào? Từ octave thứ mấy trở đi bạn không còn phân biệt được nữa? (Câu trả lời ấy chính là thứ P9.2 dùng để tiết kiệm trên mobile.)
5. **Đổi hash.** Thay `pcHash` bằng `hash32` của P3.1 (lấy `.x`). Vì sao trường trở nên trơn tuột và có hướng?

## Đọc thêm

- [The Book of Shaders — Noise](https://thebookofshaders.com/11/)
- [The Book of Shaders — Fractal Brownian Motion](https://thebookofshaders.com/13/)
- [Inigo Quilez — Value noise derivatives](https://iquilezles.org/articles/morenoise/)
- [three.js — `ShaderChunk`](https://threejs.org/docs/#api/en/renderers/shaders/ShaderChunk)
