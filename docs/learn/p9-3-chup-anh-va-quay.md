# P9.3 · Chụp ảnh và quay video chính cái canvas

## Mục tiêu

Một nút lưu PNG, một nút quay webm. Xong khi bấm ra file.

Bài này ngắn, và xoay quanh **một** chi tiết mà ai cũng vấp đúng một lần.

## Khái niệm

### 1. `toBlob()` gọi từ onClick trả về ảnh trắng

Canvas WebGL được tạo với `preserveDrawingBuffer: false` (mặc định của three.js và của R3F). Nghĩa là trình duyệt **được phép vứt pixel đã vẽ đi** ngay khi frame được giao cho compositor.

Gọi `canvas.toBlob()` từ một event handler thì frame đó đã kết thúc từ lâu — và bạn nhận về một ảnh trống, một cách rất đều đặn.

Có hai cách sửa, và cách hiển nhiên là cách sai:

| Cách | Chi phí |
|---|---|
| `preserveDrawingBuffer: true` | **mọi frame** phải giữ một bản sao, mãi mãi |
| Chụp **bên trong** frame | không tốn gì khi không chụp |

Cái nút này được bấm mỗi tuần một lần. Bắt sáu mươi frame mỗi giây trả giá cho nó là một đánh đổi rất tệ.

```ts
useFrame(() => {
  const request = useSessionStore.getState().stillRequest;
  if (request === seen.current) return;
  seen.current = request;
  gl.domElement.toBlob((blob) => { /* tải về */ }, "image/png");
}, CAPTURE_PRIORITY);
```

`CAPTURE_PRIORITY = 2`, tức **ngay sau** `ScenePass` vẽ lên màn hình ở priority 1. Buffer vẫn còn sống.

### 2. Vì sao yêu cầu là một **bộ đếm**, không phải một callback

Frame loop không nghe được sự kiện. Nó chỉ có thể **nhận ra một con số đã đổi so với lần trước nó nhìn**.

Đây là lần thứ ba mẫu này xuất hiện trong dự án: `introRun` ở [P7.3](p7-3-store-to-uniform.md), `introReplay` trước đó, và giờ là `stillRequest`. Khi một vòng lặp đồng bộ cần nhận lệnh từ thế giới bất đồng bộ, một bộ đếm đơn điệu là giao diện đơn giản nhất hoạt động được.

### 3. Quay video thì **không** gặp vấn đề đó

```ts
const media = new MediaRecorder(gl.domElement.captureStream(60), { mimeType, videoBitsPerSecond: 12_000_000 });
```

`captureStream()` cắm thẳng vào nguồn: compositor đưa cho nó từng frame **khi frame được tạo ra**. Không phải sao chép thứ gì ta chưa vẽ, không cần giữ lại gì cả.

Chọn codec theo thứ tự ưu tiên:

```ts
for (const type of ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]) {
  if (MediaRecorder.isTypeSupported(type)) return type;
}
```

VP9 trước, vì nó xử lý **dải chuyển màu phẳng và hạt nhiễu mịn** — đúng hai thứ renderer này sinh ra — tốt hơn hẳn VP8. Và `isTypeSupported` chứ không phải đoán theo trình duyệt.

Bitrate 12 Mbps nghe cao. Với một khung hình gần như toàn hạt nhỏ chuyển động, nó không cao: mọi thuật toán nén video đều đoán chuyển động theo khối, và một đám bụi thì không có khối nào để đoán.

### 4. File được ghi trong hàm dọn dẹp

```ts
media.onstop = () => downloadBlob(new Blob(chunks, { type: mimeType }), captureName("webm"));
media.start();

return () => {
  if (media.state !== "inactive") media.stop();
};
```

Đọc hơi ngược, và nó đúng: **dừng là cách duy nhất một bản ghi kết thúc**, dù là do bấm nút hay do component unmount. Đặt việc ghi file ở đó nghĩa là không có đường nào làm mất bản ghi.

### 5. Tên file sắp xếp được

```
point-cloud-2026-09-24-143207.png
```

Năm-tháng-ngày-giờ. Sắp theo tên là sắp theo thời gian, và nhìn tên là biết nó là gì. Một thư mục Downloads đầy `download (3).png` là một thư mục không ai mở lại.

## Đi qua code

### `apps/point-cloud/src/scene/capture.tsx` (mới)

Nằm **bên trong** `<Canvas>` vì nó cần `gl.domElement` và cần một `useFrame`. Nó không vẽ gì.

### `apps/point-cloud/src/bundle/export-bundle.ts`

`downloadBytes` của [P8.3](p8-3-xuat-va-do-dung-luong.md) được tách thành `downloadBlob` + một lớp mỏng. Ba chỗ tải file giờ dùng chung một cơ chế, và chung một `revokeObjectURL`.

## Lỗi đã gặp

1. **Chưa gặp — vì đã đọc trước.** Cái bẫy `preserveDrawingBuffer` nổi tiếng tới mức đáng tra trước khi viết. Bài học ngược: có những lỗi rẻ hơn khi đọc về chúng trước.
2. **Kiểm bằng cách bọc `URL.createObjectURL`.** Không mở được file để xem, nhưng một blob `image/png` nặng 3,2 MB thì không thể là canvas trắng (ảnh trắng cùng kích thước chỉ vài KB). Đôi khi kích thước là bằng chứng đủ tốt.

## Tự thử

1. **Bấm `PNG`** rồi mở file. Có đúng những gì trên màn hình không — kể cả vignette và hạt nhiễu?
2. **Tắt mẹo frame.** Đổi `useFrame(..., 2)` thành một `useEffect` gọi `toBlob` ngay. Ảnh ra sao?
3. **Bật `preserveDrawingBuffer: true`** trong `<Canvas gl={{...}}>` rồi thử lại cách sai ở trên. Giờ nó chạy — đo fps trước và sau.
4. **Quay 10 giây rồi mở file.** Bao nhiêu MB? Hạ `videoBitsPerSecond` xuống 2 triệu và so chất lượng ở vùng nền trời.
5. **Bấm `Rec` rồi reload trang giữa chừng.** Có file nào không, và vì sao?

## Đọc thêm

- [MDN — `HTMLCanvasElement.toBlob()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toBlob)
- [MDN — `HTMLCanvasElement.captureStream()`](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/captureStream)
- [MDN — `MediaRecorder`](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [three.js — `WebGLRenderer` parameters](https://threejs.org/docs/#api/en/renderers/WebGLRenderer) — mục `preserveDrawingBuffer`
