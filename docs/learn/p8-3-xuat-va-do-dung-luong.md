# P8.3 · Xuất ra file, và con số kilobyte nói thật

## Mục tiêu

Một nút Download, và trước nó là dung lượng thật của bundle. Xong khi giao diện hiện số KB.

## Khái niệm

### 1. **Đo**, không phải **ước lượng**

Roadmap viết "show bundle size before export" và gợi ý một con số ước lượng. Bản này xây hẳn file zip rồi hiện kích thước của nó, và nút Download sau đó chỉ ghi ra những byte đã có sẵn.

Lý do: một phép ước lượng ở đây sẽ sai theo một hệ số **phụ thuộc hoàn toàn vào tấm ảnh**. Nén PNG của một bản đồ toạ độ thay đổi theo độ trơn của đám mây, và [P6.9](p8-3-xuat-va-do-dung-luong.md#3-xáo-trộn-làm-nén-kém-đi--và-đó-là-một-đánh-đổi-thật) còn xáo trộn thứ tự, làm nó khó đoán hơn nữa. Một con số sai 40% thì tệ hơn là không có con số.

Cái giá là vài trăm mili-giây mỗi lần đám mây đổi. Nên nó chỉ chạy **khi panel đang mở**:

```tsx
const collapsed = useUiStore((state) => state.collapsed["Export"] ?? false);
useEffect(() => {
  if (!bundle || collapsed) return;
  // …
}, [bundle, collapsed, withParams]);
```

Xây một file nửa megabyte cho người chưa bao giờ cuộn xuống đây là việc không ai yêu cầu.

### 2. Con số thật, trên một ảnh 1024px

| file | dung lượng |
|---|---|
| `color.png` | 254 KB |
| `position_l.png` | 214 KB |
| `position_h.png` | 209 KB |
| `metadata.json` | 464 B |
| `params.json` | 403 B |
| **zip** | **679 KB** |

Ghi chú nghiên cứu đo cảnh gốc của UntilLabs ở khoảng 600 KB cho 65k điểm. Ta ở cùng một khoảng.

### 3. Xáo trộn làm nén kém đi — và đó là một đánh đổi thật

Nhìn kỹ bảng trên: `position_h.png` (byte **cao**, lẽ ra phải rất mượt) nặng 209 KB, gần bằng `position_l.png` (byte **thấp**, gần như nhiễu thuần).

Vì sao? Vì [P6.9](p6-9-xao-thu-tu.md) **xáo thứ tự điểm trước khi đóng gói**. Sau khi xáo, hai texel cạnh nhau là hai điểm không liên quan gì nhau trong không gian — nên byte cao của chúng cũng không liên quan, nên filter scanline của PNG không còn gì để khai thác.

Đây là một chi phí có thật mà bước 6.9 không nhắc tới: **xáo trộn đổi dung lượng file lấy chất lượng hình ảnh**. Nếu không xáo, `position_h.png` sẽ nhỏ hơn nhiều, và intro sẽ hiện thành từng dải quét. Đánh đổi đáng, nhưng đáng được ghi ra.

### 4. Tải file về: một thẻ `<a>` và một object URL

```ts
const url = URL.createObjectURL(new Blob([bytes], { type: "application/zip" }));
const anchor = document.createElement("a");
anchor.href = url;
anchor.download = filename;
anchor.click();
URL.revokeObjectURL(url);
```

`revokeObjectURL` quan trọng hơn vẻ ngoài của nó: không có nó, blob sống tới hết vòng đời của document, và vài lần xuất nửa megabyte cộng lại thành một chỗ rò mà không ai quy cho một cái link tải.

Gọi `revoke` **ngay sau** `click()` nghe như quá sớm, nhưng trình duyệt đã bắt đầu đọc blob trong lúc xử lý click; URL chỉ cần sống qua thời điểm đó.

### 5. Ngân sách hạt = kích thước texture

Nút `Points:` trong panel Cloud vòng qua 128² / 192² / 256² / 512² — tức 16.384 / 36.864 / 65.536 / **262.144** điểm. P8.3 thêm 512 vào danh sách.

Đó là một núm vặn ngân sách thật: 512² gấp bốn 256², nên sampler chạy lâu hơn bốn lần và bundle to hơn khoảng bốn lần. Vì nó chạy trong worker ([P6.3](p6-3-worker-va-huy.md)) nên giao diện vẫn mượt trong lúc chờ.

## Đi qua code

### `apps/point-cloud/src/bundle/export-bundle.ts` (mới)

Ba PNG được mã hoá **song song**:

```ts
const [color, positionHigh, positionLow] = await Promise.all([
  encodePng({ width: size, height: size, channels: 4, data: bundle.color }),
  // …
]);
```

Mỗi cái là một megapixel lọc scanline rồi một lượt deflate qua stream, nên gối chúng lên nhau đáng một dòng code.

`bundleFilename` biến `my photo.JPG` thành `my-photo.zip` — chi tiết nhỏ, nhưng một file tên `download.zip` trong thư mục Downloads là một file sẽ không bao giờ được mở lại.

### `apps/point-cloud/src/app/inspector/export-panel.tsx` (mới)

Một chỗ đáng học về React. Bản đầu viết:

```tsx
useEffect(() => {
  if (!bundle || collapsed) {
    setPrepared(null);   // ← lint chặn
    return;
  }
```

`react-hooks/set-state-in-effect` chặn `setState` **đồng bộ** trong effect. Cách sửa hay hơn bản vá: giữ kết quả **cùng với đám mây đã sinh ra nó**.

```tsx
const [built, setBuilt] = useState<{ from: PackedBundle; result: ExportedBundle } | null>(null);
const prepared = built && built.from === bundle ? built.result : null;
```

Giờ một kết quả cũ đơn giản là **không phải cái hiện tại**, chứ không phải thứ cần xoá đi. Effect chỉ còn gọi setState bất đồng bộ, trong `.then`.

## Lỗi đã gặp

1. **Không nhận ra 6.9 làm phồng file** cho tới khi nhìn bảng dung lượng thật. `position_h.png` nặng ngang `position_l.png` là một con số bất thường đáng dừng lại hỏi.
2. **`setState` đồng bộ trong effect** — lần thứ ba trong dự án (xem [P6.8](p6-8-dong-goi-texture.md)). Mỗi lần, cách sửa đúng đều là **đổi cấu trúc dữ liệu**, không phải né luật.
3. **Suýt để effect phụ thuộc vào giá trị tham số.** Zip sẽ được dựng lại ở mỗi frame của một cú kéo slider. Nó phụ thuộc vào `bundle`, `collapsed`, `withParams` — và `params.json` được ghi từ giá trị tại thời điểm chuẩn bị.

## Tự thử

1. **Xuất cùng ảnh ở 128², 256², 512².** Dung lượng có tỉ lệ với số điểm không? Nếu không, vì sao?
2. **Tắt xáo trộn** (trong `worker.ts` bỏ `shuffleCloud`), xây lại, và so `position_h.png`. Nhỏ đi bao nhiêu?
3. **Bấm "Data only"** rồi xuất. Bớt được bao nhiêu byte, và bạn mất gì?
4. **Bỏ `revokeObjectURL`** rồi tải 20 lần. Mở tab Memory — thấy gì?
5. **Ước lượng thử.** Viết một công thức đoán dung lượng chỉ từ số điểm, rồi so với sáu tấm ảnh khác nhau. Sai bao nhiêu phần trăm?

## Đọc thêm

- [MDN — `URL.createObjectURL()`](https://developer.mozilla.org/en-US/docs/Web/API/URL/createObjectURL_static)
- [MDN — thuộc tính `download`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#download)
- [P6.9 · Xáo thứ tự điểm](p6-9-xao-thu-tu.md) — cái giá của nó lộ ra ở đây
