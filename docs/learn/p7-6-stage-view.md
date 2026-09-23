# P7.6 · Nhìn vào khúc giữa của pipeline

## Mục tiêu

P6 sâu năm phép biến đổi và chỉ phép cuối cùng nhìn thấy được. Bước này cho từng chặng cả viewport: ảnh gốc, depth, importance, và **nơi các điểm đã rơi xuống**.

Xong khi chuyển qua lại giữa các chặng được.

## Khái niệm

### 1. Thumbnail đủ để bắt lỗi thô, không đủ để đánh giá

Mỗi chặng đã có một thumbnail trong panel của nó từ P6. Cái đó đủ để bắt hai lỗi chết người:

- depth lộn ngược (gần phải tối, xa phải sáng)
- importance sáng ở bầu trời thay vì ở chủ thể

Nhưng "importance có đang tiêu điểm đúng chỗ không" thì cần diện tích. Ở 208px bề ngang, chênh lệch giữa một bản đồ tốt và một bản đồ tạm được là vài chục pixel.

### 2. `cloud` không render gì cả

```tsx
if (stage === "cloud") return null;
```

Chặng mặc định **không phải một ảnh** — nó là canvas đang nằm sẵn ở dưới. Mọi chặng khác phủ lên trên nó.

Và canvas **vẫn chạy** phía sau lớp phủ. Tạm dừng scene để đi xem depth map sẽ gây khựng lúc quay lại, mà renderer không phải chỗ tốn kém ở đây.

### 3. Chỉ dựng ảnh của chặng đang xem

```tsx
const image = useMemo(() => {
  if (stage === "photo") return pixels;
  if (stage === "depth") return depth ? greyPreview(…) : null;
  if (stage === "importance") return components ? heatPreview(mixImportance(…), …) : null;
  if (stage === "points") return bundle ? pointsPreview(bundle) : null;
  return null;
}, [stage, pixels, depth, components, weights, bundle]);
```

Mỗi cái là một megapixel công việc và một buffer 4 MB. `stage` nằm trong mảng dependency, nên chuyển sang chặng khác thì chặng cũ được thả, và ở lại một chặng thì nó không dựng lại cho tới khi **đầu vào của nó** đổi.

### 4. Chặng "points": đọc ngược đầu ra

Đây là preview duy nhất đọc **đầu ra** của pipeline chứ không phải đầu vào, và nó xứng đáng có mặt vì nó cho thấy sampler thật sự đã làm gì: điểm đi đâu, khoảng cách đều tới mức nào, và chủ thể có nhận được phần ngân sách mà importance map hứa hẹn không.

```ts
const x = decode(bundle.positionHigh[i * 4]!, bundle.positionLow[i * 4]!, bounds.min[0], bounds.max[0]);
```

Nó giải mã vị trí **đúng cách vertex shader giải mã** — cùng hàm `decode` mà [P3.5](p3-5-test-cho-decoder.md) viết ra để kiểm shader. Nên nó cũng là một phép kiểm round-trip chạy bằng mắt: nếu ảnh ra méo, lệch hay lộn, thì mã hoá hỏng.

Trục y lật lại ở đây đúng như nó đã lật ở [P6.7](p6-7-nang-len-2-5d.md):

```ts
const py = Math.round((1 - (y - bounds.min[1]) / spanY) * (height - 1));
```

Không depth, không ống kính, không chuyển động — đó là việc của canvas.

### 5. `image-rendering: pixelated`

```tsx
className="max-h-full max-w-full object-contain … [image-rendering:pixelated]"
```

Đây **là dữ liệu**. Phóng to một bản đồ depth 512px lên 1200px với phép nội suy của trình duyệt sẽ bịa ra những giá trị trung gian không có trong bản đồ — và nếu đang đi tìm một cạnh bị răng cưa thì đó đúng là thứ làm mất dấu.

`object-contain` giữ tỉ lệ và không bao giờ cắt.

### 6. Phím số theo đúng thứ tự pipeline

```ts
const STAGE_KEYS = ["cloud", "photo", "depth", "importance", "points"];
```

1 tới 5, theo đúng thứ tự dữ liệu chảy qua. Bấm 2-3-4-5 liên tiếp là đi bộ qua cả pipeline — và đó là cách nhanh nhất để thấy một chặng đang phá hỏng chặng sau nó.

## Đi qua code

### `apps/point-cloud/src/photo/preview.ts`

`pointsPreview` chọn kích thước từ **bounds**, không phải từ ảnh gốc:

```ts
const spanX = bounds.max[0] - bounds.min[0];
const spanY = bounds.max[1] - bounds.min[1];
```

Đám mây mang theo tỉ lệ của chính nó trong metadata, nên preview khớp với thứ canvas vẽ chứ không khớp với ảnh đã bị thu nhỏ.

Nền được tô alpha 255 trước:

```ts
for (let i = 3; i < data.length; i += 4) data[i] = 255;
```

Không có dòng đó, khoảng trống giữa các điểm sẽ trong suốt và hiện ra thứ gì nằm dưới canvas — khiến các lỗ hổng trông như không phải lỗ hổng.

### `apps/point-cloud/src/app/shell/stage-view.tsx` (mới)

Hai export: `StageTabs` (hàng nút nổi trên viewport) và `StageOverlay` (lớp phủ). Tách ra vì chúng nằm ở hai vị trí khác nhau trong cây và có z-index khác nhau — tab phải nằm **trên** lớp phủ.

## Lỗi đã gặp

1. **Suýt tạm dừng scene khi rời chặng `cloud`.** Nghe như tiết kiệm; thực tế là quay lại sẽ thấy khựng vì R3F phải khởi động lại vòng lặp, còn tiền tiết kiệm thì gần bằng không.
2. **Quên tô alpha nền trong `pointsPreview`.** Ảnh đầu tiên ra trong suốt loang lổ, trông như một lỗi của sampler chứ không phải của preview.
3. **`z-[5]` cho lớp phủ và `z-10` cho tab.** Bản đầu để cùng z-index, tab biến mất sau lớp phủ và không có cách nào quay về chặng cloud ngoài phím số.

## Tự thử

1. **Đi bộ qua pipeline.** Thả một ảnh, rồi bấm 2, 3, 4, 5 lần lượt. Ở chặng nào bạn hiểu ra điều gì đó mà thumbnail không cho thấy?
2. **Kéo slider Floor ở panel Detail** trong lúc đang ở chặng 4. Bản đồ đổi ngay chứ? Vì sao được (gợi ý: `mixImportance` rẻ, [P6.4](p6-4-importance-map.md))?
3. **Bỏ `image-rendering: pixelated`** rồi xem lại chặng depth ở khổ lớn. Cạnh vật thể trông khác thế nào?
4. **Phá phép lật trục y** trong `pointsPreview` (bỏ `1 -`). So chặng 5 với chặng 1 — cái nào nói cho bạn biết có gì đó sai?
5. **Đo chi phí.** Bọc `pointsPreview` bằng `performance.now()`. 65.536 điểm mất bao lâu, và con số đó có biện minh cho `useMemo` không?

## Đọc thêm

- [MDN — `image-rendering`](https://developer.mozilla.org/en-US/docs/Web/CSS/image-rendering)
- [MDN — `object-fit`](https://developer.mozilla.org/en-US/docs/Web/CSS/object-fit)
- [P6.4 · Bản đồ tầm quan trọng](p6-4-importance-map.md)
- [P6.5 · Blue noise](p6-5-blue-noise-sampling.md) — thứ mà chặng 5 cho bạn thấy
