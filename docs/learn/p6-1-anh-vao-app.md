# P6.1 · Ảnh vào app: decode, thu nhỏ, không gian màu

## Mục tiêu

Từ đây trở đi dự án không còn dựng lại renderer của UntilLabs nữa. P6 làm **tự động trong trình duyệt** cái mà họ làm tay trong Houdini: đưa một tấm ảnh vào, đoán độ sâu, chọn chỗ đặt hạt, rồi đóng gói thành đúng ba texture mà renderer P3 đã đọc từ lâu.

Bước 6.1 chỉ lo khúc đầu: kéo-thả (hoặc bấm chọn) một file ảnh, giải mã, thu nhỏ về cạnh dài 1024px, và đặt buffer pixel vào store. Xong khi preview 2D hiện ra và mọi bước sau có dữ liệu để đọc.

Ba API làm hết việc: `createImageBitmap`, `OffscreenCanvas`, `getImageData`. Mỗi cái có một lý do riêng, và cái thứ ba có một cái bẫy.

## Khái niệm

### 1. `createImageBitmap` — giải mã ngoài main thread

Cách cũ là `new Image()` rồi chờ `onload`. Nó chạy **trên main thread**: một tấm JPEG 12 megapixel mất vài trăm mili-giây để giải nén, và trong ngần ấy thời gian canvas 3D đứng hình, vì `requestAnimationFrame` và code JS dùng chung một hàng đợi.

`createImageBitmap(blob)` trả về một `Promise`, giải mã ở luồng khác, và cho ra `ImageBitmap` — một đối tượng ảnh "đã sẵn sàng vẽ", không gắn vào DOM.

```ts
const bitmap = await createImageBitmap(source);
```

Cuối hàm phải gọi `bitmap.close()`. `ImageBitmap` giữ pixel đã giải mã (vài chục MB với ảnh điện thoại) và bộ thu gom rác không vội vàng vì ta.

### 2. `OffscreenCanvas` — canvas không có DOM

`OffscreenCanvas` là canvas không gắn vào trang. Không CSS chạm tới được, không `devicePixelRatio` can thiệp, không stylesheet nào bất ngờ scale ảnh. Với dữ liệu, đó chính xác là điều ta muốn: kích thước ta khai là kích thước ta nhận.

```ts
const canvas = new OffscreenCanvas(size.width, size.height);
const context = canvas.getContext("2d", { willReadFrequently: true });
```

`willReadFrequently: true` báo cho trình duyệt biết ta sẽ `getImageData`, nên nó giữ backing store ở RAM thay vì đẩy lên GPU rồi phải kéo ngược về.

### 3. Thu nhỏ **cũng là một bộ lọc**

Thu nhỏ về 1024px nghe như chuyện tiết kiệm CPU. Nó còn hơn thế.

Ảnh chụp mang theo nhiễu cảm biến và vệt ringing của JPEG ở mức từng pixel. Mà mọi số hạng của importance map ở [P6.4](p6-4-importance-map.md) đều là **hiệu giữa các pixel cạnh nhau** — đúng thứ mà nhiễu trông giống hệt. Gộp 16 pixel nguồn thành 1 là một bộ lọc thông thấp mà ta khỏi phải tự viết.

Một chi tiết dễ bỏ: chất lượng nội suy.

```ts
context.imageSmoothingEnabled = true;
context.imageSmoothingQuality = "high";
```

Mặc định là `"low"`, mà `"low"` khi thu nhỏ mạnh gần như là nearest-neighbour: giữ 1 pixel trong 16, vứt 15 cái còn lại. Mọi cạnh trong ảnh bị răng cưa — và răng cưa thì Sobel ở 6.4 sẽ tưởng là chi tiết.

### 4. Cái bẫy: `getImageData` trả về byte **sRGB**, không phải ánh sáng tuyến tính

Đây là phần quan trọng nhất của bài.

Byte đọc về **đã mã hoá sRGB**. Pixel giá trị 128 không sáng bằng một nửa pixel 255 — nó sáng khoảng **22%**, vì sRGB dành nhiều bước hơn cho vùng tối, nơi mắt nhạy hơn.

Chuyện đó ảnh hưởng hai lần trong P6, và theo hai hướng ngược nhau:

| Dùng vào đâu | Muốn gì | sRGB byte có đúng không |
|---|---|---|
| Luminance cho importance map (6.4) | độ sáng **cảm nhận được** | ✅ đúng — chuyển sang tuyến tính là sai |
| Màu gửi cho GPU (6.8) | ánh sáng **tuyến tính** để blend | ❌ phải khai `SRGBColorSpace` để GPU giải mã |

Cả hai đều chạy được, miễn là **ghi rõ mình đang cầm loại nào**. Hàm `decodePhoto` luôn trả byte sRGB, và JSDoc của nó nói đúng câu đó.

Nhắc lại [P3.2](p3-2-color-texture.md): `configureDataTexture()` bắt truyền colour space như tham số **bắt buộc** cũng vì lý do này.

## Đi qua code

### `apps/point-cloud/src/photo/decode-image.ts` (mới)

`workingSize` tính kích thước làm việc:

```ts
const scale = Math.min(1, longSide / Math.max(width, height));
return {
  width: Math.max(1, Math.round(width * scale)),
  height: Math.max(1, Math.round(height * scale)),
};
```

`Math.min(1, …)` nghĩa là **không bao giờ phóng to**: phóng to một ảnh nhỏ không sinh thêm chi tiết, chỉ nhân chi phí của mọi bước sau. `Math.max(1, …)` chặn trường hợp ảnh panorama 4000×3: cạnh ngắn sẽ ra 0.77px và làm tròn thành 0 — một canvas không có pixel nào.

`decodePhoto` ghép ba API lại, và `finally { bitmap.close() }` chạy kể cả khi ở giữa có lỗi.

### `apps/point-cloud/src/store/photo-store.ts` (mới)

Store dùng zustand — dependency đã có trong `package.json` từ P0 mà tới giờ mới dùng.

Vì sao là store chứ không phải state của component: buffer pixel sống lâu hơn bất kỳ panel nào. Bước depth (6.3), importance (6.4) và sampler (6.5) đều đọc **cùng một buffer**. Nếu để trong React state thì hoặc là truyền một megabyte qua props xuống nhiều tầng, hoặc là giải mã lại nhiều lần.

Chi tiết đáng chú ý — chống đua:

```ts
let token = 0;
load: async (file) => {
  const mine = ++token;
  // …
  const pixels = await decodePhoto(file);
  if (mine !== token) return;   // đã có ảnh mới hơn, im lặng bỏ qua
```

Thả hai ảnh liên tiếp: ảnh đầu có thể giải mã xong **sau** ảnh thứ hai và ghi đè lên nó. Token đảm bảo chỉ lần chạy mới nhất được quyền ghi. Cùng một mẫu này lặp lại cho depth ở [P6.3](p6-3-worker-va-huy.md).

### `packages/ui/src/file-drop.tsx` (mới)

Component Atelier đầu tiên mà P6 kéo vào. Điểm đáng học là nó dựng quanh một `<input type="file">` thật nằm trong `<label>`, chứ không phải một `div` có `onClick`:

```tsx
<label onDragEnter={…} onDrop={…}>
  <input type="file" accept={accept} aria-label={label} className="sr-only" />
  {children ?? label}
</label>
```

Một lựa chọn đó kéo theo: bấm-để-chọn, bàn phím (Tab rồi Space), tên cho screen reader, và role đúng — không cái nào có sẵn với `div`.

Chỗ dễ sai là highlight khi kéo qua. Sự kiện drag **cũng nổ cho con**, nên một boolean sẽ tắt ngay khi con trỏ đi qua dòng chữ bên trong. Đếm `dragenter` trừ `dragleave` mới đúng:

```ts
onDragEnter: depth.current += 1; setDragging(true);
onDragLeave: depth.current -= 1; if (depth.current <= 0) setDragging(false);
```

Vì `dragenter` của con luôn tới **trước** `dragleave` của cha, bộ đếm không bao giờ về 0 giữa chừng.

Và một dòng nhỏ nhưng thật:

```ts
event.target.value = "";
```

Không có nó, chọn lại **đúng file vừa chọn** sẽ không sinh sự kiện `change` nào — vì giá trị không đổi.

## Lỗi đã gặp

1. **TypeScript từ chối `new ImageData(data, w, h)`.** Từ TS 5.7, typed array có generic theo buffer, và `Uint8ClampedArray` chung chung *có thể* nằm trên `SharedArrayBuffer` — thứ `ImageData` không nhận. Phải khai rõ `Uint8ClampedArray<ArrayBuffer>`; repo đặt alias `RgbaBytes` cho đỡ lặp.
2. **Comment `//` đặt giữa các thuộc tính JSX là lỗi cú pháp.** Trong thẻ mở JSX chỉ có `{/* … */}` là hợp lệ. Viết `// …` ngay trên `aria-label` làm cả file không parse được.
3. **Canvas đen, không lỗi nào trong console.** Mất một lúc mới hiểu: tab Chrome đang ở background nên `requestAnimationFrame` bị bóp về gần 0. `document.visibilityState` là `"hidden"` — đúng cái bẫy đã ghi trong [status.md](../status.md). Không liên quan gì tới code vừa viết.

## Tự thử

1. **Thấy tận mắt cái bẫy colour space.** Thả một ảnh vào, rồi trong console: `const c = document.querySelector('canvas[role=img]').getContext('2d'); c.getImageData(10,10,1,1).data`. So con số đó với giá trị pixel mà một trình chỉnh ảnh báo. Giống nhau chứ? Giờ thử đoán: nếu chia cho 255 rồi coi là ánh sáng tuyến tính thì sai bao nhiêu ở vùng tối?
2. **Tắt `imageSmoothingQuality`.** Đổi `"high"` thành `"low"` trong `decode-image.ts`, thả lại một ảnh lớn, nhìn kỹ preview ở vùng có hoạ tiết nhỏ (cỏ, tóc). Sau đó xem heat map ở [P6.4](p6-4-importance-map.md) thay đổi ra sao.
3. **Đổi `WORKING_LONG_SIDE` thành 256 rồi 2048.** Đo thời gian mỗi bước (tab Performance). Cạnh dài gấp đôi thì số pixel gấp bốn — chi phí có tăng gấp bốn thật không?
4. **Bỏ `bitmap.close()`.** Thả 20 ảnh liên tiếp rồi xem tab Memory. Rác có dọn không, và mất bao lâu?
5. **Phá bộ đếm drag.** Đổi `onDragLeave` thành `setDragging(false)` không điều kiện, rồi kéo một file chầm chậm qua dòng chữ trong vùng thả. Nhìn viền nhấp nháy — đó là lý do bộ đếm tồn tại.

## Đọc thêm

- [MDN — `createImageBitmap()`](https://developer.mozilla.org/en-US/docs/Web/API/createImageBitmap)
- [MDN — `OffscreenCanvas`](https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas)
- [MDN — `getImageData()`](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData)
- [MDN — Using files from web applications](https://developer.mozilla.org/en-US/docs/Web/API/File_API/Using_files_from_web_applications)
- [MDN — HTML Drag and Drop API](https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API)
