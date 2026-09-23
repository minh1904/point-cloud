# P3.4 · Bounds và `metadata.json`

## Mục tiêu

Ở 3.3, hai file PNG cho ra 65.536 con số nằm giữa 0 và 1. Chỉ vậy thôi — không đơn vị, không gốc toạ độ, không biết đám mây to nhỏ ra sao. Bước này bổ sung mảnh còn thiếu: **bounds**, và tệp mang nó là `metadata.json`.

Kết quả: đám hạt có kích thước và hướng đúng, và hai con số tôi hard-code ở 3.2 (`fieldWidth = 3` và `aspect = 1200/800`) biến mất khỏi code — chúng giờ đến từ dữ liệu.

## Khái niệm

### 1. Lưu chuẩn hoá + bounds = vừa gọn vừa chính xác

PNG chỉ chứa được 0…1. Toạ độ thật thì tuỳ ý. Cầu nối là một phép nội suy:

```glsl
vec3 home = mix(uBoundsMin, uBoundsMax, normalised);
```

Điều đáng nghĩ là **vì sao bounds phải lưu riêng cho từng bundle** thay vì cố định một lần cho mọi ảnh.

Giả sử chọn cứng khoảng `[-10, 10]` cho mọi trục. Đám mây của ta chỉ chiếm `x ∈ [-1.49, 1.49]`, tức 15% khoảng đó. Vậy là 85% trong số 65.536 mức bị phí cho vùng trống, và độ phân giải thực tế rơi từ 65.536 xuống còn ~9.800 mức.

Tệ nhất là trục z. Relief chỉ dày 0.081 đơn vị — **0.4%** của khoảng cố định. Toàn bộ chiều sâu sẽ nằm gọn trong 265 mức, và ta vừa mất đúng cái mà 3.3 vất vả giành được.

Lưu bounds riêng thì mỗi trục được cấp trọn 65.536 mức cho đúng phần nó chiếm:

```
bounds min  -1.4941, -0.9961, -0.0372
bounds max   1.4941,  0.9961,  0.0441
```

Để ý trục z lệch tâm (−0.037 đến +0.044). Đó không phải lỗi — bản đồ độ sâu đơn giản là không dùng hết dải, và bounds bám sát dữ liệu thật chứ không bám vào con số tròn trịa mà ta kỳ vọng.

### 2. `metadata.json` là bản hợp đồng

```json
{
  "version": 1,
  "width": 256,
  "height": 256,
  "particleCount": 65536,
  "precision": 16,
  "bounds": { "min": [...], "max": [...] },
  "source": { "image": "color.png", "aspect": 1.5 },
  "depth": { "kind": "placeholder-heuristic", "relief": 0.09 }
}
```

Mỗi trường là một điều renderer **không thể tự đoán ra** từ các file PNG:

| Trường | Vì sao PNG không nói được |
|---|---|
| `bounds` | PNG chỉ có 0…1 |
| `precision` | Nhìn hai file PNG không biết chúng là một cặp 16-bit hay hai ảnh rời |
| `particleCount` | Suy từ `width × height` được, nhưng ghi ra thì kiểm tra chéo được |
| `version` | Lời hứa rằng bundle cũ vẫn mở được sau này |

`version` là trường nhìn có vẻ thừa nhất và lại quan trọng nhất. Mục tiêu số 3 của dự án là **xuất bundle rồi nhúng vào dự án thật**. Bundle xuất hôm nay có thể được mở bởi bản code sáu tháng sau. Không có số version thì không có cách nào xử lý chuyện đó ngoài việc đoán.

### 3. Sai dữ liệu phải nổ ngay, đừng chết lặng

`parseBundleMetadata` kiểm tra trước khi renderer tin:

```ts
if (bounds.max[axis]! <= bounds.min[axis]!) {
  throw new TypeError(`metadata.bounds is empty on axis ${axis}: decoding would divide by zero`);
}
```

Nếu không kiểm, một mảng `bounds` hỏng sẽ không ném lỗi gì cả — nó lặng lẽ đặt mọi hạt vào `NaN`, và **một đám mây không vẽ ra gì trông y hệt cả chục con bug khác**: shader biên dịch lỗi, texture 404, camera sai chỗ, culling bật nhầm. Nổ sớm với một câu nói rõ trục nào hỏng rẻ hơn nhiều so với nửa giờ đi dò.

Cùng lý do đó, `computeBounds` nới những trục không có bề dày:

```ts
if (max[axis]! - min[axis]! < Number.EPSILON) {
  min[axis] -= 0.5;
  max[axis] += 0.5;
}
```

Đây không phải tình huống giả tưởng — đó đúng là lưới phẳng của 3.2, nơi mọi hạt có `z = 0`. Không nới thì `(v - min) / (max - min)` chia cho 0.

### 4. Những thứ bounds xoá bỏ

Đáng so sánh trước và sau:

```glsl
// 3.2 — hai con số hard-code cộng một phép lật trục bằng tay
vec2 plane = vec2(aParticleUv.x - 0.5, 0.5 - aParticleUv.y);
vec3 home = vec3(plane * uFieldSize, 0.0);

// 3.4 — không còn con số nào của riêng ảnh này
vec3 home = mix(uBoundsMin, uBoundsMax, normalised);
```

Phép lật `0.5 - uv.y` của 3.2 cũng biến mất. Nó tồn tại vì `flipY = false` khiến hàng 0 của texture là hàng **trên cùng** của ảnh, trong khi `+y` hướng lên. Giờ hướng đã được **nung vào dữ liệu** ngay lúc encode:

```ts
positions[i * 3 + 1] = (0.5 - (y + 0.5) / size) * fieldHeight;
```

Shader không còn biết gì về hướng của ảnh nữa. Đó mới là chỗ nên đặt: encoder chỉ chạy một lần, shader chạy 65.536 lần mỗi frame.

Tương tự, `aspect` vẫn còn nhưng đã chuyển vai — trong `metadata.source` nó chỉ còn là ghi chú về ảnh gốc, còn hình dạng thật của đám mây nằm trong bounds.

### 5. Renderer thôi không biết mình đang vẽ gì

Đây là hệ quả lớn nhất, và là toàn bộ lý do P3 tồn tại. `ParticleField` giờ nhận đúng một prop về dữ liệu:

```tsx
<ParticleField bundleUrl="/particles/sample" … />
```

Nó không biết bức ảnh là cái gì, to bao nhiêu, có bao nhiêu hạt, độ sâu từ đâu ra. Đưa cho nó bundle khác thì nó vẽ bundle đó. **P6 sẽ không phải sửa một dòng nào trong renderer** — nó chỉ cần sinh ra đúng format này từ ảnh người dùng upload.

## Đi qua code

### `apps/point-cloud/src/bundle/metadata.ts` (mới)

Kiểu dữ liệu và bộ kiểm tra. Roadmap 8.4 sẽ thay bằng schema zod; bản viết tay này là hình dạng mà nó lớn lên từ đó.

Một kiểm tra đáng nói:

```ts
if (raw.width !== raw.height) {
  throw new TypeError(`the data texture must be square, got ${raw.width}x${raw.height}`);
}
```

Texture phải vuông vì nó là lưới địa chỉ của `aParticleUv` (xem [P3.1](p3-1-geometry-without-positions.md)). Tỉ lệ của *bức ảnh* thì không liên quan gì tới hình dạng cái hộp chứa nó.

### `apps/point-cloud/src/scene/use-particle-bundle.ts` (mới)

Nạp `metadata.json` rồi ba texture song song:

```tsx
const [color, positionHigh, positionLow] = await Promise.all([
  load("color.png", SRGBColorSpace),
  load("position_h.png", NoColorSpace),
  load("position_l.png", NoColorSpace),
]);
```

Chú ý dòng `colorSpace` khác nhau — đây là cái bẫy nguy hiểm nhất của cả bước. `color.png` là **ảnh**: byte của nó mã hoá sRGB và GPU phải giải mã sang tuyến tính. `position_*.png` là **con số**: byte 128 nghĩa đúng là 128. Áp giải mã sRGB lên toạ độ sẽ bẻ cong mọi vị trí theo một đường cong gamma — và **không có lỗi nào được báo**, chỉ là đám mây méo đi.

Hàm `configureDataTexture` nhận `colorSpace` làm tham số chính vì lẽ đó: mọi thiết lập khác giống hệt nhau, chỉ riêng chỗ này phải nghĩ.

### `apps/point-cloud/src/scene/particle-field.tsx`

Bounds đi vào uniform:

```tsx
(uniforms.uBoundsMin!.value as Vector3).fromArray(bundle.metadata.bounds.min);
(uniforms.uBoundsMax!.value as Vector3).fromArray(bundle.metadata.bounds.max);
uniforms.uTextureSize!.value = bundle.metadata.width;
```

Và lưới hạt giờ cũng lấy kích thước từ metadata, không còn hằng số:

```tsx
const textureSize = bundle?.metadata.width;
const grid = useMemo(
  () => (textureSize === undefined ? undefined : createParticleGrid(textureSize)),
  [textureSize],
);
```

Đổi bundle sang texture 512² thì geometry tự dựng lại với 262.144 hạt, không cần sửa gì.

## Lỗi đã gặp

1. **Suýt để position map ở `SRGBColorSpace`.** Lúc gom hàm `configureDataTexture` ở 3.2, tôi mới chỉ có texture màu nên đặt sẵn `SRGBColorSpace` bên trong. Đến 3.3 thì đó là một quả mìn: toạ độ bị giải mã như màu, đám mây méo, không lỗi nào báo. Sửa bằng cách đưa `colorSpace` lên thành tham số bắt buộc, để mỗi lần gọi đều phải trả lời câu hỏi "byte này là màu hay là số?".
2. **`computeBounds` chia cho 0 trên lưới phẳng.** Bản đầu không xử lý trục không bề dày. Lưới của 3.2 có `z = 0` cho mọi hạt → `max - min = 0` → `NaN` → màn hình đen. Đã nới trục suy biến ra và thêm test cho đúng tình huống đó.
3. **Bounds không đối xứng trông như bug.** `z` chạy từ −0.0372 đến +0.0441 chứ không phải ±0.045 như tôi kỳ vọng từ `RELIEF = 0.09`. Đi tìm lỗi một lúc mới nhận ra: `estimateDepth` cộng với làm mờ không bao giờ chạm tới 0 và 1, nên bề dày thật nhỏ hơn relief danh nghĩa. Bounds đúng — kỳ vọng của tôi mới sai. `computeBounds` bám sát dữ liệu, đó là việc của nó.

## Tự thử

1. **Phá bounds.** Sửa `metadata.json`, nhân `bounds.max` lên 10 lần. Đám mây phình to nhưng **hình dạng không đổi** — vì sao? Rồi thử đặt `max` bằng `min` trên một trục: bạn thấy lỗi gì trong console?
2. **Đo cái giá của bounds cố định.** Trong `build-sample-bundle.ts`, thay `computeBounds(positions)` bằng bounds cứng `{min: [-10,-10,-10], max: [10,10,10]}`, chạy lại script, nhìn kỹ bề mặt lúc xoay camera. Độ sâu còn lại bao nhiêu mức?
3. **Bỏ kiểm tra.** Xoá phần validate trong `parseBundleMetadata`, rồi sửa `bounds.min` trong JSON thành `"hỏng"`. Triệu chứng là gì, và bạn sẽ mất bao lâu để lần ra nguyên nhân nếu không biết trước?
4. **Đổi kích thước texture.** Sửa `color.png` thành 128×128 (hoặc 512×512), chạy `bun run build:sample`, mở app. HUD phải báo đúng số hạt mới mà không cần sửa một dòng code nào.
5. **Đọc lại lịch sử của một dòng.** Xem `git log -p` cho `points.vert.glsl` từ 3.1 đến 3.4 và theo dõi riêng biến `home`: từ hằng số, sang toạ độ lưới, rồi thành phép giải mã từ dữ liệu. Ba bước đó là cả phase P3.

## Đọc thêm

- [three.js — `Vector3.fromArray`](https://threejs.org/docs/#api/en/math/Vector3.fromArray)
- [three.js — Color management](https://threejs.org/docs/#manual/en/introduction/Color-management)
- [research/01-untillabs-method.md §2.3](../research/01-untillabs-method.md) — `metadata2.json` của bản gốc
- [MDN — `fetch`](https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch)
