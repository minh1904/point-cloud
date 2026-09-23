# P8.2 · Viết PNG và ZIP bằng tay, trong trình duyệt

## Mục tiêu

Ghi bốn file của bundle từ bên trong một trang web. Xong khi round-trip đúng từng byte.

Hai việc: PNG (đã có từ [P3.5](p3-5-test-cho-decoder.md), nhưng chỉ chạy được trong Node) và ZIP (chưa có gì).

## Khái niệm

### 1. Vì sao không dùng canvas — nhắc lại, vì nó là gốc của cả file

`canvas.toBlob('image/png')` viết PNG trong một dòng. Và nó **hỏng dữ liệu**:

- Canvas **nhân alpha trước** (premultiply): RGB bị nhân với alpha khi vẽ, và chia ngược khi đọc. Với ảnh chụp thì sai số vài phần nghìn không ai thấy. Với một buffer toạ độ, byte cao của trục x bị nhân với mật độ rồi chia lại — mỗi toạ độ lệch một chút, không đều, không đảo ngược được.
- Canvas **quản lý màu**: nó có quyền chuyển không gian màu khi vẽ và khi đọc.

Cách duy nhất an toàn để nhét số vào PNG là **tự lắp byte**.

### 2. Tách "cấu trúc" khỏi "nén"

Encoder của P3.5 nén bằng `node:zlib`, thứ trình duyệt không có. Thay vì viết lại cả bộ, mọi thứ trừ bước deflate chuyển sang `src/bundle/png-codec.ts`:

```
filterScanlines ──▶ [deflate] ──▶ buildPng
unfilterScanlines ◀── [inflate] ◀── readPngChunks
```

Script Node điền vào ngoặc bằng `zlib`; trình duyệt điền bằng `CompressionStream`. Chữ ký, CRC, bố cục chunk, filter scanline — dùng chung, nên bộ test byte-exact của P3.5 phủ **cả hai** đường.

Đây là một mẫu tái cấu trúc đáng nhớ: khi cùng một logic phải chạy ở hai môi trường, **cái khác nhau thường là một hàm nhỏ ở giữa**, không phải cả thuật toán.

### 3. `CompressionStream` — zlib vẫn luôn nằm sẵn trong trình duyệt

Trình duyệt có DEFLATE từ lâu, chỉ là không ở chỗ người ta hay tìm. `CompressionStream` là API **luồng**, sinh ra cho body của fetch, và tình cờ là zlib duy nhất trong một trang web mà không phải thư viện bạn tự mang theo.

Điều duy nhất phải làm cho đúng là chọn đúng biến thể:

| format | là gì | ai dùng |
|---|---|---|
| `"deflate"` | DEFLATE trong vỏ **zlib** (RFC 1950) | IDAT của PNG |
| `"deflate-raw"` | DEFLATE trần, không vỏ (RFC 1951) | method 8 của zip |
| `"gzip"` | DEFLATE trong vỏ gzip | HTTP, file `.gz` |

PNG cần vỏ zlib — hai byte header và một checksum Adler-32. Dùng `"deflate-raw"` thì mọi trình xem ảnh trên đời từ chối file, vì sáu byte.

Cách chạy bytes qua stream gọn hơn ta tưởng:

```ts
const written = new Blob([bytes]).stream().pipeThrough(stream);
return new Uint8Array(await new Response(written).arrayBuffer());
```

`Response` chịu trách nhiệm gom cả luồng thành một `ArrayBuffer`, tiết kiệm hẳn đoạn đọc từng chunk rồi ghép.

### 4. ZIP đơn giản hơn tiếng đồn của nó

Phần lớn tiếng đồn thuộc về những thứ bundle không dùng: archive trải nhiều đĩa, mã hoá, zip64, cả tá method nén không ai dùng từ 1993.

Còn lại là một hình dạng đơn giản:

```
[local header][file 1][local header][file 2] … [central dir][EOCD]
                                                    ▲          │
                                                    └──────────┘
```

Mỗi file: một **local header** rồi tới byte của nó. Sau tất cả: một **central directory** lặp lại thông tin đó kèm offset ngược về local header. Cuối cùng là bản ghi **EOCD** nói directory bắt đầu ở đâu và có mấy entry.

Sự dư thừa là cố ý: trình đọc có thể đi tới qua các local header, hoặc nhảy tới cuối đọc directory. Bản này nhảy, vì directory mới là danh sách có thẩm quyền.

### 5. EOCD phải **dò ngược** mới tìm ra

```ts
const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
for (let i = view.byteLength - 22; i >= earliest; i--) {
  if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) return i;
}
```

Nó là thứ **cuối cùng** trong file, nhưng không ở một offset cố định, vì sau nó có thể còn một comment dài tới 65.535 byte. Nên cách duy nhất là dò ngược tìm chữ ký — điều mọi trình đọc zip từng viết đều làm, và là lý do một file zip vẫn sống khi bị nối vào đuôi một thứ khác (đó chính là cách các file tự giải nén hoạt động).

### 6. Little-endian, ngược với PNG

Zip ra đời từ MS-DOS, nên mọi trường nhiều byte là **little-endian**. PNG ra đời từ internet, nên nó **big-endian** xuyên suốt.

Hai định dạng nằm trong cùng một file, bất đồng về thứ tự byte. Đó đúng là loại chi tiết tốn một giờ nếu đoán thay vì tra.

### 7. Bỏ timestamp để bản xuất tái tạo được

```ts
localView.setUint16(10, 0, true); // time
localView.setUint16(12, 0, true); // date
```

Zip lưu thời gian kiểu MS-DOS. Để nguyên 0 là có chủ ý: xuất cùng một đám mây hai lần phải ra **file giống hệt nhau từng byte**, còn timestamp sẽ khiến mỗi lần xuất khác lần trước mà chẳng ai dùng được điều đó.

Test kiểm đúng chuyện này, và bản chạy thật trong trình duyệt xác nhận: hai lần xuất, cùng 694.957 byte.

## Đi qua code

### `apps/point-cloud/src/bundle/png-codec.ts` (mới)

Phần thú vị nhất là `unfilterScanlines`, với một lời cảnh báo trong comment:

> Mỗi byte được dự đoán từ hàng xóm trái (a), byte phía trên (b) và byte trên-trái (c) — và quan trọng là từ **bản đã khôi phục** của chúng, không phải từ byte đã lọc. Đọc nhầm buffer ở đây cho ra một ảnh hợp lý ở phía trên và rác ở phía dưới, một buổi chiều khó quên.

### `apps/point-cloud/scripts/png.ts`

Từ 209 dòng còn 38. Tất cả những gì còn lại là hai lời gọi vào zlib.

### `apps/point-cloud/src/bundle/zip.ts` (mới)

Một chi tiết mà trình đọc zip hay viết sai:

```ts
// Local header có độ dài tên và extra field **riêng của nó**, và extra field
// thường khác kích thước so với bên central — trình đọc nào dùng lại độ dài
// của central ở đây sẽ đọc rác.
const localNameLength = view.getUint16(localOffset + 26, true);
const localExtraLength = view.getUint16(localOffset + 28, true);
```

## Lỗi đã gặp

1. **`CompressionStream` không khớp kiểu `TransformStream<Uint8Array, Uint8Array>`.** Phía `writable` của nó nhận `BufferSource`, rộng hơn `Uint8Array`, nên TypeScript từ chối — và nó đúng. Sửa bằng cách khai đúng kiểu DOM: `CompressionStream | DecompressionStream`.
2. **Suýt dùng `"deflate-raw"` cho PNG** vì nghe "raw" có vẻ đúng cho dữ liệu thô. Tra RFC mới thấy IDAT cần vỏ zlib.
3. **Heredoc của shell nuốt file test.** Không liên quan tới code, nhưng đáng ghi: viết file test dài chứa nhiều dấu nháy qua `cat <<'EOF'` trong một số shell là cách tốt để mất nửa tiếng.

## Tự thử

1. **Kiểm tính tái tạo.** Xuất cùng một đám mây hai lần và so kích thước. Rồi bỏ hai dòng `setUint16(10/12, 0)` và thử lại.
2. **Đổi `"deflate"` thành `"deflate-raw"`** trong `png-browser.ts`, xuất, rồi mở `color.png` bằng trình xem ảnh. Thông báo lỗi nói gì?
3. **Dò EOCD bằng tay.** Trong console: tải một bundle, tìm chuỗi byte `50 4B 05 06` từ cuối file. Nó cách cuối bao xa?
4. **Bỏ `localExtraLength`** và dùng `extraLength` của central thay vào. Zip do ta viết vẫn đọc được (vì cả hai bằng 0) — nhưng zip do Windows tạo thì sao?
5. **Đo phần filter.** Bọc `filterScanlines` bằng `performance.now()` cho một texture 256². Bao nhiêu mili-giây, và nó chạy ở đâu — main thread hay không?

## Đọc thêm

- [MDN — `CompressionStream`](https://developer.mozilla.org/en-US/docs/Web/API/CompressionStream)
- [Đặc tả PNG — Filter Algorithms](https://www.w3.org/TR/png-3/#9Filters)
- [Wikipedia — ZIP (file format)](https://en.wikipedia.org/wiki/ZIP_(file_format)) — mục cấu trúc file
- [Wikipedia — Endianness](https://en.wikipedia.org/wiki/Endianness)
