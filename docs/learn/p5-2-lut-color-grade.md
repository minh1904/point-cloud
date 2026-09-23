# P5.2 · LUT màu 3D

## Mục tiêu

Chỉnh màu bằng **một file ảnh**, không phải bằng code.

Một LUT (lookup table) là bảng tra: với mỗi màu đầu vào, màu nó trở thành. Thay file là thay toàn bộ tông màu, và shader không cần biết chuyện gì đã xảy ra.

Kết quả: nút **LUT** xoay vòng giữa `neutral`, `warm`, `cool`, và slider **Grade** chỉnh cường độ.

## Khái niệm

### 1. Gói một khối lập phương vào một bức ảnh phẳng

Màu có ba chiều, nên bảng tra cũng phải ba chiều: `64 × 64 × 64` = 262.144 màu. WebGL 1 không có texture 3D, nên khối đó bị **cắt lát và trải phẳng**:

```
64 lát 64×64  →  lưới 8×8  →  một ảnh 512×512

┌────┬────┬────┬────┬────┬────┬────┬────┐
│ b0 │ b1 │ b2 │ b3 │ b4 │ b5 │ b6 │ b7 │   trong mỗi ô:
├────┼────┼────┼────┼────┼────┼────┼────┤   đỏ  chạy →
│ b8 │ b9 │ …  │    │    │    │    │    │   lục chạy ↓
└────┴────┴────┴────┴────┴────┴────┴────┘   lam = số thứ tự ô
```

`64 × 8 = 512`. Con số 64 không phải ngẫu nhiên — nó là chuẩn của ngành, và tình cờ chia vừa khít thành ảnh vuông luỹ thừa 2.

### 2. Nội suy: hai chiều miễn phí, chiều thứ ba phải tự làm

Đỏ và lục nằm trong cùng một ô, nên phần cứng lo được: `LinearFilter` tự trộn bốn texel lân cận.

Lam thì không. Hai giá trị lam kề nhau nằm ở **hai ô khác nhau**, có thể ở hai hàng khác nhau của ảnh. Phần cứng không biết chúng liên quan. Nên shader phải đọc hai lát rồi tự trộn:

```glsl
float blue = c.b * 63.0;
float slice = floor(blue);
float next = min(slice + 1.0, 63.0);
float blend = blue - slice;
// …hai lần texture2D rồi mix…
```

Đây cũng là lý do LUT là **ngoại lệ duy nhất** dùng `LinearFilter` trong cả dự án — mọi texture dữ liệu khác đều `NearestFilter` (xem [P3.2](p3-2-color-texture.md)). LUT *muốn* được nội suy: 64 mức mỗi trục là thô, và việc trộn giữa các ô lưới là thứ biến 262.144 màu rời rạc thành một ánh xạ mượt trên toàn bộ không gian màu.

### 3. Nửa texel, một lần nữa

```glsl
vec2 inside = (c.rg * 63.0 + 0.5) / 512.0;
```

Cùng một bài học của [P3.1](p3-1-geometry-without-positions.md), nhưng hậu quả nặng hơn. Ở đây nếu nội suy với ra ngoài biên ô, nó không lấy nhầm một hạt hàng xóm — nó lấy nhầm **một lát lam hoàn toàn khác**, và màu nhảy hẳn sang một chỗ khác trong khối. Nhân với 63 (không phải 64) rồi cộng 0.5 giữ mẫu nằm gọn trong 64 texel của chính ô đó.

### 4. LUT viết cho màu hiển thị, shader làm việc với ánh sáng tuyến tính

Grade được người ta tạo ra trên những giá trị **nhìn thấy trên màn hình** — tức sRGB. Còn `vColor` của ta là ánh sáng tuyến tính (xem [P3.2](p3-2-color-texture.md)). Nên phải đi vòng:

```glsl
vec3 display = pow(clamp(linearColor, 0.0, 1.0), vec3(1.0 / 2.2));
vec3 graded = pow(pcLutLookup(lut, display), vec3(2.2));
```

Bỏ qua bước này **không báo lỗi gì**. Nó chỉ khiến mọi grade tác động mạnh hơn nhiều ở vùng tối so với ý người tạo ra nó — một lỗi trông giống "LUT này hơi quá tay" hơn là lỗi.

### 5. Chạy ở vertex shader, không phải fragment

```glsl
vColor = pcGrade(uLut, vColor, uLutIntensity);
```

Màu là **hằng số trên cả point sprite** — nó đến từ một texel duy nhất. Grade ở fragment shader nghĩa là lặp lại đúng hai lần đọc texture đó cho từng pixel trong hàng chục pixel mà mỗi hạt phủ. Ở vertex là 65.536 lần thay vì hàng triệu.

Và đây là chỗ bài viết gốc nói sai: nó bảo LUT nằm ở bước hậu kỳ. Đọc code production của họ thì LUT được áp **trong shader hạt** (mix 0.8), còn shader hậu kỳ khai báo `uLookup` mà không hề gọi tới (research note §6).

### 6. LUT identity là bài kiểm tra duy nhất đáng tin

`neutral.png` không đổi màu gì cả. Nó có vẻ vô dụng, nhưng nó là **cách duy nhất kiểm chứng code tra bảng**: nếu áp nó ở cường độ 1.0 mà bức ảnh xê dịch dù chỉ chút ít, thì lỗi nằm ở phép tra, không nằm ở grade.

Nó cũng chỉ nặng **1.6 KB** — một dốc màu hoàn hảo thì nén cực tốt, trong khi `warm.png` là 50 KB. Kích thước file tự nó đã nói rằng grade đó thực sự làm gì đó.

## Đi qua code

### `apps/point-cloud/scripts/build-luts.ts` (mới)

`bun run build:luts` nướng ba grade. Điểm đáng nói là **split toning** — mẹo cổ nhất của chỉnh màu: đẩy vùng tối về một hướng, vùng sáng về hướng ngược lại.

```ts
const low = (1 - l) * (1 - l);
const high = l * l;
```

`warm` dùng bóng lạnh / sáng ấm, tổ hợp mà hầu hết mắt người đọc thành "chất phim". `cool` đi hướng ngược: bạc màu, đen bị nâng lên.

Cái hay là **grade thôi không còn là code**. Script này có thể làm gì cũng được — đường cong, tint, hoặc một file vẽ tay xuất từ Photoshop — kết quả vẫn thu về một ảnh 512×512 mà shader đọc bằng hai lần lấy mẫu.

### `apps/point-cloud/src/shaders/lut.glsl` (mới)

Đăng ký làm ShaderChunk thứ hai, `#include <pc_lut>`, cùng cơ chế với noise ở [P4.1](p4-1-value-noise-fbm.md).

### `apps/point-cloud/src/scene/use-particle-bundle.ts`

`useLookupTexture` gần giống bộ nạp bundle, khác đúng một thiết lập: `LinearFilter`. Và vẫn `NoColorSpace` — byte trong file là **bảng tra**, không phải ảnh; việc đổi không gian màu do shader tự làm quanh phép tra.

## Lỗi đã gặp

1. **Suýt áp LUT ở fragment shader.** Phản xạ tự nhiên là "chỉnh màu thì thuộc về pixel". Nhưng với point sprite, màu là hằng trên cả hạt — đặt ở vertex rẻ hơn hàng chục lần mà kết quả giống hệt. Đáng dừng lại hỏi *giá trị này thay đổi ở mức nào* trước khi chọn shader stage.
2. **Suýt bỏ qua vòng sRGB.** Ban đầu định tra thẳng trên màu tuyến tính cho gọn. Nó vẫn chạy, vẫn "trông có grade", chỉ là không phải grade mình nướng ra. Đây là loại sai lệch âm thầm mà `neutral.png` cũng không bắt được — identity thì đúng ở mọi không gian màu.
3. **Cường độ mặc định 0.8, không phải 1.0.** Bản gốc mix 0.8 và lý do lộ ra ngay khi so sánh: grade ở mức tối đa **thay thế** màu của bức ảnh, còn grade giữ lại một phần thì để ảnh gốc hiện xuyên qua nó.

## Tự thử

1. **Bấm LUT cho tới `neutral`, rồi kéo Grade lên 1.0.** Ảnh phải không đổi gì. Nếu có đổi, phép tra sai chứ không phải grade.
2. **So warm và cool ở cùng cường độ.** Cái nào làm chủ thể nổi bật hơn? Vì sao?
3. **Tự nướng một grade.** Thêm một mục vào `GRADES` trong `build-luts.ts` — thử đảo kênh đỏ và lam — rồi `bun run build:luts` và thêm tên vào mảng `GRADES` trong `particle-field.tsx`.
4. **Phá phần nửa texel.** Đổi `c.rg * 63.0 + 0.5` thành `c.rg * 64.0`. Tìm những chỗ màu nhảy đột ngột — chúng ở đâu, và vì sao lại ở đó?
5. **Bỏ vòng sRGB.** Xoá hai phép `pow` trong `pcGrade`. Grade đổi ở vùng nào nhiều nhất: tối, trung tính, hay sáng?
6. **Nhìn kích thước file.** `ls -la public/luts/`. Vì sao `neutral.png` chỉ 1.6 KB còn `cool.png` tới 75 KB?

## Đọc thêm

- [Wikipedia — 3D lookup table](https://en.wikipedia.org/wiki/3D_lookup_table)
- [three.js — `LUTPass` / LUT examples](https://threejs.org/examples/#webgl_postprocessing_3dlut)
- [research/01-untillabs-method.md §6](../research/01-untillabs-method.md) — bài viết nói LUT ở hậu kỳ, code thì không
