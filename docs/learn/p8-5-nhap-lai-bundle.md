# P8.5 · Nhập lại bundle — bài kiểm tra thật của định dạng

## Mục tiêu

Thả một file `.zip` vào và nhận lại đúng đám mây đó. Xong khi **xuất → nhập → render giống hệt**.

Bước này tồn tại không phải vì tính năng nhập quan trọng, mà vì nó là **cách duy nhất chứng minh định dạng tự đủ**.

## Khái niệm

### 1. Vì sao round-trip mới là phép thử, chứ không phải "nhìn thấy đẹp"

Xuất rồi tự đọc lại bằng chính hàm của mình sẽ **giấu một lỗi đối xứng**: một encoder và một decoder sai theo cùng một hướng thì khớp nhau hoàn hảo. Nếu ta ghi byte cao vào chỗ byte thấp và đọc lại cũng nhầm y như vậy, mọi test round-trip nội bộ đều xanh.

Cái chặn được chuyện đó ở đây là các PNG sau khi nhập được nạp lên GPU qua **trình nạp texture của trình duyệt**, không phải qua decoder của ta. Trình duyệt không tham gia vào thoả thuận sai nào cả.

Và nếu zip xuất ra ở máy này mở được ở máy khác, thì [`docs/bundle-format.md`](../bundle-format.md) mô tả đủ mọi thứ quan trọng, và không có gì bị tuồn lén qua bộ nhớ của app.

### 2. Kiểm bằng hash, không bằng mắt

Nhìn hai ảnh rồi nói "giống nhau" là một phép thử yếu. Phép thử mạnh là băm pixel.

Cách làm trong lần kiểm thật: chuyển sang chặng **Points** của [P7.6](p7-6-stage-view.md) — vốn vẽ lại vị trí hạt từ dữ liệu đã đóng gói — rồi băm toàn bộ `getImageData` của canvas đó:

```js
let h = 2166136261;
for (let i = 0; i < d.length; i++) { h ^= d[i]; h = Math.imul(h, 16777619); }
```

Trước round-trip: `406510ff`. Sau: `406510ff`. Đó là một câu trả lời, không phải một cảm giác.

(Lần thử đầu tiên so nhầm canvas — `querySelectorAll('canvas[role=img]').pop()` bắt phải preview ảnh gốc trong panel Photo, 1024×683, chứ không phải preview điểm 512×342. Chọn phần tử theo `aria-label` mới đúng.)

### 3. Nhập thì **xoá sạch mọi thứ phía trên**

```ts
set({ status: "empty", source: null, pixels: null, error: null, ...idleDepth });
```

Một đám mây nhập vào **không có** ảnh phía sau, không có bản đồ độ sâu, không có importance map. Thứ tới nơi là **cuối** pipeline.

Giữ lại ảnh cũ trong panel Photo sẽ là một lời nói dối trong giao diện: nó gợi ý rằng đám mây đang hiện được sinh ra từ tấm ảnh đó, và bấm "Rebuild" sẽ thay thế nó bằng một đám mây khác hẳn.

Và renderer thì không phân biệt được — đó chính là điều mà cả định dạng khẳng định.

### 4. Cái look cũng đi qua `setAll`, nên hoàn tác được

```ts
if (params) useParamsStore.getState().setAll(params);
```

Mở một bundle *là* một thao tác chỉnh sửa, nên nó nên đảo ngược được bằng Ctrl+Z, giống mọi thao tác khác ([P7.4](p7-4-undo-redo.md)).

Đối lập với việc **khôi phục** giá trị từ `localStorage` lúc mở app ([P7.5](p7-5-presets.md)), thứ ghi thẳng bằng `setState` vì "quay lại chỗ đang làm dở" không phải một lần sửa.

Hai trường hợp gần giống nhau, hai quyết định ngược nhau, và cả hai đều đúng — phân biệt được chúng là phần khó.

### 5. Chấp nhận cái zip mà người ta thật sự tạo ra

```ts
const files = new Map(
  entries.map((entry) => [entry.name.split("/").pop() ?? entry.name, entry.bytes]),
);
```

Nén một **thư mục** (chuột phải → Send to → Compressed folder) cho ra các entry tên `my-cloud/color.png`, không phải `color.png`. Khớp theo basename tốn một dòng và tiết kiệm một câu hỏi hỗ trợ.

Tương tự, trình đọc zip nhận cả method 8 (deflate), vì một bundle đã đi qua công cụ hệ điều hành sẽ quay về ở dạng đó.

### 6. Kiểm tra chéo giữa metadata và PNG

```ts
if (image.width !== size || image.height !== size) {
  throw new Error(`${name} is ${image.width}×${image.height}, but metadata.json says ${size}×${size}`);
}
```

[P8.4](p8-4-metadata-zod.md) kiểm `metadata.json` **tự nhất quán**. Nó không thể biết các PNG có khớp với những gì metadata tuyên bố hay không — chỉ bước này biết, vì chỉ bước này cầm cả hai.

Thông báo lỗi nêu cả hai con số, vì người đọc nó đang cầm một cái zip do người khác làm ra.

## Đi qua code

### `apps/point-cloud/src/bundle/import-bundle.ts` (mới)

Gọn hơn `export-bundle.ts`, và đó là điều đáng mong đợi: đọc thì ít quyết định hơn ghi.

### `apps/point-cloud/src/store/photo-store.ts`

`loadBundleFile` dùng cùng mẫu token chống đua như `load` ([P6.1](p6-1-anh-vao-app.md)). Thả hai bundle liên tiếp thì chỉ cái mới nhất được quyền ghi.

### `apps/point-cloud/src/app/inspector/export-panel.tsx`

Xuất và nhập ở **chung một panel**, vì đó là cùng một ý nghĩ: "đám mây này ra vào thế nào".

## Lỗi đã gặp

1. **Băm nhầm canvas.** Xem mục 2. Bài học: khi trang có nhiều canvas, `pop()` không phải cách chọn.
2. **Lần kiểm đầu tiên vô nghĩa mà trông như thất bại.** Hai hash khác nhau, hai kích thước khác nhau — suýt đi tìm lỗi trong codec. Kích thước khác nhau lẽ ra phải là manh mối đầu tiên: 1024×683 không phải kích thước mà `pointsPreview` sinh ra bao giờ.
3. **Suýt giữ nguyên ảnh gốc sau khi nhập** vì "để người dùng vẫn thấy ngữ cảnh". Nó là một lời nói dối trong giao diện.

## Tự thử

1. **Round-trip đầy đủ.** Thả một ảnh, đợi xây xong, Download, rồi thả file zip đó vào ô "Open a .zip bundle". Chặng Points có y hệt không?
2. **Băm nó.** Chạy đoạn băm ở mục 2 trước và sau. Có khớp không?
3. **Round-trip qua hệ điều hành.** Giải nén file zip ra một thư mục, rồi nén lại bằng công cụ hệ điều hành, rồi nhập. Vẫn chạy chứ? Vì sao?
4. **Sửa một PNG.** Giải nén, mở `color.png` bằng trình chỉnh ảnh, lưu lại (nó sẽ đi qua một canvas!), zip lại, nhập. Cái gì hỏng — và đó có phải điều [P8.1](p8-1-dinh-dang-bundle.md) cảnh báo không?
5. **Bấm Ctrl+Z ngay sau khi nhập.** Cái gì quay lại, và cái gì không?

## Đọc thêm

- [MDN — `Blob.arrayBuffer()`](https://developer.mozilla.org/en-US/docs/Web/API/Blob/arrayBuffer)
- [Đặc tả bundle format của dự án](../bundle-format.md)
- [P7.6 · Nhìn vào khúc giữa của pipeline](p7-6-stage-view.md) — chặng Points là dụng cụ đo ở đây
