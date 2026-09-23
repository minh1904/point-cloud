# P6.4 · Bản đồ tầm quan trọng: "chi tiết" là con số nào?

## Mục tiêu

Một tấm ảnh không đều nhau về mức thú vị. 65.536 hạt rải đều sẽ tiêu gần hết vào nền trời phẳng mà vẫn không giữ nổi viền một khuôn mặt.

Bước này trả lời câu hỏi "pixel này đáng bao nhiêu hạt" bằng một con số 0…1 cho mỗi pixel. [P6.5](p6-5-blue-noise-sampling.md) biến con số đó thành vị trí.

Xong khi heat map nhìn **đúng trực giác**: chủ thể sáng, trời phẳng tối.

## Khái niệm

### 1. "Thú vị" không phải một thứ, nên đo bằng ba thứ

| Số hạng | Đo cái gì | Cao ở đâu | Thấp ở đâu |
|---|---|---|---|
| **Edges** | gradient độ sáng | viền áo, đường chân trời | tường phẳng, trời |
| **Texture** | tương phản cục bộ | cỏ, vải dệt, sỏi | tường phẳng **và cả một cạnh sạch** |
| **Depth edges** | gradient bản đồ độ sâu | ranh giới giữa hai mặt | bên trong một mặt phẳng |

Hai hàng đầu **bất đồng với nhau khá thường xuyên** — một cạnh sắc nét đơn độc có gradient rất cao nhưng tương phản cục bộ thấp — và đó chính là lý do phải có cả hai.

Hàng thứ ba là hàng dễ quên nhất mà lại quan trọng nhất với point cloud: nó tìm **ranh giới che khuất**. Thiếu hạt ở đó thì chủ thể nhoè vào nền, dù màu có sắc nét tới đâu.

### 2. Sobel: hỏi "có cạnh ở đây không", không hỏi "cạnh quay hướng nào"

Toán tử Sobel là một cặp nhân chập 3×3. Theo trục x:

```
-1  0  +1
-2  0  +2
-1  0  +1
```

Đọc từ trái sang phải: đó là phép **trừ** qua pixel (`-1 … +1`), có tính thêm hàng trên và hàng dưới với trọng số nhỏ hơn. Việc tính hai hàng kia vừa làm mượt nhiễu vừa khiến toán tử đối xứng.

Lấy `√(gx² + gy²)` là vứt **hướng** đi và giữ lại **độ lớn**. Ở đây đúng là thứ ta cần: câu hỏi duy nhất là "có cạnh không".

### 3. Tương phản cục bộ tính bằng hai lần blur

Tương phản cục bộ là **độ lệch chuẩn** của độ sáng trong một cửa sổ nhỏ. Cách ngây thơ là với mỗi pixel, duyệt cửa sổ của nó — tốn.

Có một đồng nhất thức quen thuộc:

> phương sai = trung bình của bình phương − bình phương của trung bình

Mà "trung bình trong cửa sổ" chính là **box blur**, thứ ta đã có:

```ts
const mean = boxBlur(values, width, height, radius);
const meanOfSquares = boxBlur(squares, width, height, radius);
// …
const variance = meanOfSquares[i]! - mean[i]! * mean[i]!;
out[i] = Math.sqrt(Math.max(0, variance));
```

Hai lần blur và một phép trừ, thay vì một lượt duyệt cửa sổ nữa.

Chú ý `Math.max(0, …)`: hai số thực gần nhau trừ nhau có thể ra âm một chút do sai số float, và `Math.sqrt` của số âm là `NaN` — một `NaN` sẽ lan âm thầm qua mọi bước sau.

### 4. Chuẩn hoá từng số hạng **trước** khi trộn

Mỗi số hạng có thang riêng: gradient của một ảnh tương phản cao lớn hơn hẳn gradient của một ảnh mù sương.

Nên mỗi cái được `normalise()` về 0…1 **một mình**, rồi mới trộn. Nhờ vậy một slider ở mức 0.55 có cùng ý nghĩa với mọi tấm ảnh.

### 5. Trọng số là **tỉ lệ**, không phải khuếch đại

```ts
const total = weights.edges + weights.texture + weights.depthEdges;
const mixed = (wE*e + wT*t + wD*d) / total;
out[i] = floor + (1 - floor) * clamp(mixed);
```

Chia cho tổng của chính chúng, nên kéo cả ba slider lên hết cho ra **đúng bản đồ** như để cả ba ở 1. Không có bước chia này, các slider kiêm luôn nhiệm vụ tăng âm lượng và `floor` mất hết ý nghĩa.

`floor` là phần nhỏ nhất mà mọi pixel giữ lại, dù chán tới đâu. Ở 0 thì nền trời không được hạt nào và đám mây thủng lỗ. Đây là núm quyết định **bao nhiêu phần của tấm ảnh còn sống sót như một phông nền**.

### 6. Tách phần đắt khỏi phần rẻ — đó là lý do slider mượt

Ba phép nhân chập trên một megapixel mất hàng chục mili-giây. Phép tổng có trọng số mất ba phép nhân mỗi pixel.

Nên chúng được tách hẳn:

- **Worker** tính ba *component* — **một lần mỗi tấm ảnh**.
- **Main thread** trộn chúng — **mỗi khi slider nhúc nhích**.

Nếu gộp chung, mỗi lần kéo slider sẽ chạy lại toàn bộ phân tích và cảm giác sẽ là một giao diện chết.

### 7. Vì sao heat map chứ không phải ảnh xám

Mắt người đọc **độ sáng** rất tệ ở khoảng giữa dải — 0.45 và 0.55 trông y hệt nhau — nhưng đọc **thay đổi màu sắc** thì rất nhạy. Đó là lý do bản đồ thời tiết và camera nhiệt đều dùng màu.

Mà khoảng giữa chính là chỗ bản đồ đang phân vân giữa "có chút chi tiết" và "rất nhiều chi tiết" — đúng khoảng cần nhìn rõ nhất.

## Đi qua code

### `apps/point-cloud/src/photo/importance.ts` (mới)

Hàm đắt tiền:

```ts
const spread = Math.max(1, Math.round(Math.min(width, height) / 256));
const luma = luminanceField(pixels, width, height);
return {
  edges: normalise(boxBlur(sobelMagnitude(luma, …), …, spread)),
  texture: normalise(boxBlur(localContrast(luma, …, spread * 2), …, spread)),
  depthEdges: normalise(boxBlur(sobelMagnitude(depth, …), …, spread)),
};
```

Vì sao lại blur **sau** Sobel: một cạnh Sobel rộng đúng một pixel, còn sampler ở 6.5 đặt các hạt cách nhau vài pixel. Một cạnh không blur là cái đích mà sampler cứ trượt hoài. Trải nó thành một dải rộng vài pixel mới biến "có cạnh ở đây" thành "đặt hạt quanh đây".

### `apps/point-cloud/src/photo/filters.ts` — `luminance`

```ts
return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
```

Trọng số Rec. 709. Màu lục chiếm gần ba phần tư vì mắt có nhiều tế bào nón nhạy lục hơn hẳn nhạy lam. Lấy trung bình cộng thay vào thì một màu lam bão hoà và một màu lục bão hoà sẽ sáng như nhau, và mọi cạnh giữa chúng **biến mất khỏi gradient**.

Và đây là byte sRGB, không phải ánh sáng tuyến tính — đúng thứ cần ở đây, vì importance map nói về cái mà **người xem** để ý. Xem lại [P6.1](p6-1-anh-vao-app.md).

### `apps/point-cloud/src/app/detail-panel.tsx` (mới)

```tsx
const preview = useMemo(() => {
  if (!components) return null;
  const mixed = mixImportance(components, weights);
  return heatPreview(mixed, components.width, components.height);
}, [components, weights]);
```

`useMemo` phụ thuộc vào `components` và `weights` thôi, nên panel không vẽ lại một megapixel mỗi khi có thứ khác trong store thay đổi.

## Lỗi đã gặp

1. **Test "Sobel không quan tâm hướng" suýt viết sai.** Dùng `step(...).map(v => 1 - v)` trên `Float32Array` trả về `Float32Array` — may. Nhưng `.map` trên typed array giữ nguyên kiểu, còn trên mảng thường thì không; phải ép kiểu để TS chịu, và đó là dấu hiệu nên viết rõ ràng hơn.
2. **Cỏ trong ảnh test không sáng lên ở heat map.** Tưởng `localContrast` hỏng. Hoá ra ảnh mẫu chỉ 256×256, sau khi thu nhỏ thì hoạ tiết cỏ không còn gì để đo. Với ảnh 1024px thì thấy rõ. Bài học: kiểm một bộ lọc bằng ảnh quá nhỏ là tự lừa mình.
3. **Quên mất `Math.max(0, variance)` ở lần viết đầu.** Không `NaN` nào xuất hiện với dữ liệu test đẹp; chỉ lộ ra khi nghĩ tới trường hợp vùng gần như phẳng. Đã thêm test riêng cho nó.

## Tự thử

1. **Tắt từng số hạng một.** Kéo `Edges` về 0 rồi nhìn heat map: cái gì biến mất? Rồi tới `Texture`, rồi `Depth edges`. Cái nào thiếu thì đám mây ở 6.5 xấu nhất?
2. **Kéo `Floor` về 0.** Xây lại đám mây và nhìn nền trời. Rồi kéo lên 0.5 — chi tiết trên chủ thể mất đi bao nhiêu?
3. **Bỏ blur sau Sobel.** Trong `importanceComponents`, bỏ `boxBlur` quanh `sobelMagnitude`. Heat map sắc nét hơn hẳn — nhưng đám mây thì sao?
4. **Đổi trọng số luminance thành trung bình cộng** (`(r+g+b)/3/255`). Tìm một ảnh có vùng lục cạnh vùng lam và xem cạnh đó biến mất khỏi heat map.
5. **Đo phần đắt và phần rẻ.** Bọc `importanceComponents` và `mixImportance` bằng `performance.now()`. Tỉ lệ là bao nhiêu, và nó biện minh cho việc tách hai bên chứ?

## Đọc thêm

- [Wikipedia — Sobel operator](https://en.wikipedia.org/wiki/Sobel_operator)
- [Wikipedia — Variance (computational formula)](https://en.wikipedia.org/wiki/Variance)
- [Wikipedia — Relative luminance](https://en.wikipedia.org/wiki/Relative_luminance)
- [Wikipedia — Kernel (image processing)](https://en.wikipedia.org/wiki/Kernel_(image_processing))
