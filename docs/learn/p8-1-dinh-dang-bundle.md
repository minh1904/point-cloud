# P8.1 · Chọn định dạng bundle

## Mục tiêu

Đây là bước **quyết định**, không phải bước code — giống [P6.2](p6-2-chon-model-depth.md).

Câu hỏi: một đám mây điểm rời khỏi công cụ này dưới hình dạng gì? Xong khi có một bản đặc tả trong [`docs/bundle-format.md`](../bundle-format.md).

Kết quả: **một file `.zip` chứa đúng thư mục mà renderer đã đọc từ P3.4**.

## Khái niệm

### 1. Hai phương án, và cái gì thật sự quyết định

| | zip nhiều file | một file JSON với PNG base64 |
|---|---|---|
| Kích thước | đúng bằng byte PNG | **+33%** vì base64 |
| Dùng được mà không cần code của ta | có, đó là bốn file bình thường | không |
| Mở xem được | mở PNG bằng bất cứ trình xem nào | không |
| Dán được như văn bản | không | có |

Phương án JSON dễ viết hơn thật: không phải viết định dạng archive nào cả, và dán được vào một khung chat.

Nhưng có một lập luận đè lên tất cả:

> **Giải nén vào `public/particles/my-cloud/` là loader sẵn có đọc được ngay, không cần một dòng code nào.**

`useParticleBundle(baseUrl)` đã fetch đúng bốn cái tên đó, từ đúng bố cục đó, từ P3.4. Một bản xuất **không phải** định dạng mới cần trình nhập — nó **chính là** định dạng, gói lại. Đó là thứ biến component drop-in của [P8.6](p8-6-component-drop-in.md) thành một file nhỏ thay vì một trình phân tích.

Và cái 33% của base64 không phải chuyện lý thuyết: một bundle 65.536 điểm nặng khoảng 680 KB, nên bản JSON sẽ vượt 900 KB để mang đúng ngần ấy dữ liệu.

### 2. Vì sao các entry được **lưu trữ (stored)**, không nén

Zip có method `0` (stored) và `8` (deflate). Bundle ghi bằng **stored**.

PNG đã tự deflate phần pixel của nó rồi. Deflate lại một luồng đã deflate gần như không tiết kiệm được gì, và tốn thời gian hai lần. `metadata.json` với `params.json` cộng lại chưa tới một kilobyte.

Phần **đọc** thì nhận cả hai, vì một bundle đã đi qua một công cụ zip bình thường sẽ quay về ở dạng deflate.

### 3. Bốn file, và vì sao không có file thứ năm

```
my-cloud.zip
├── metadata.json     các con số 0…1 có nghĩa gì
├── color.png         màu RGB · A mang mật độ
├── position_h.png    byte cao của mỗi toạ độ 16-bit
├── position_l.png    byte thấp
└── params.json       cái look (tuỳ chọn)
```

Bản phác trong roadmap có thêm `density.png`. **Không cần nữa** — [P6.6](p6-6-mat-do-diem.md) đã cho mật độ đi nhờ kênh alpha của bản đồ màu, vì alpha là kênh duy nhất sRGB không bẻ cong, và vì một bản đồ màu *không có* alpha đọc về 1.0, nghĩa là "chật nhất", nghĩa là kích thước hạt không bị đụng. Mọi bundle viết trước khi mật độ tồn tại vẫn render y hệt.

Roadmap cũng nhắc `lut.png`. Quyết định: **không đưa vào**. Một LUT đã bake là một PNG 512², tức một phần đáng kể của tổng dung lượng, cho một thứ khôi phục được từ cái tên nằm trong `params.json`. Component drop-in nhận LUT qua một prop riêng.

### 4. `params.json` — cái look đi theo dữ liệu

Một map phẳng từ khoá tham số của [P7.2](p7-2-param-schema.md) sang giá trị. Khoá lạ bị bỏ, khoá thiếu lấy mặc định của schema (`sanitiseValues`), nên một `params.json` viết hôm nay vẫn nạp được sau khi schema lớn lên.

Bundle không có file này thì render bằng thiết lập hiện tại. Đó là lý do nó tuỳ chọn chứ không bắt buộc.

### 5. Ba quy tắc không thương lượng

1. **PNG dữ liệu không bao giờ được đi qua canvas.** Canvas nhân alpha trước (premultiply) và quản lý màu — vô hại với ảnh chụp, chí mạng với một buffer toạ độ. Byte được lắp tay, trong `src/bundle/png-codec.ts`.
2. **Alpha của bản đồ vị trí là 255.** Không phải vì có ai đọc nó, mà vì alpha bằng 0 mời gọi một công cụ tốt bụng nào đó "tối ưu" phần RGB bên dưới.
3. **Texture phải vuông và đầy.** Renderer vẽ một vertex cho mỗi texel; một đám mây thiếu điểm để lại những texel chứa bất cứ thứ gì buffer được khởi tạo bằng — hạt ở gốc toạ độ, màu đen, không cảnh báo.

## Đi qua code

Bước này chỉ sinh ra một file: [`docs/bundle-format.md`](../bundle-format.md).

Đáng chú ý là mục cuối cùng của nó, **Future versions**, dài đúng bốn dòng:

> - Trình nhập tiếp tục nhận v1 và chuyển đổi.
> - `docs/bundle-format.md` **mọc thêm** một mục, không bị viết lại.
> - Trình xuất chỉ bao giờ ghi phiên bản mới nhất.

Con số `version` tồn tại để mục đó được phép ngắn. Nó là lời hứa rằng bản xuất cũ vẫn nạp được, và [P8.4](p8-4-metadata-zod.md) là chỗ lời hứa ấy được thi hành.

## Lỗi đã gặp

1. **Suýt đưa `lut.png` vào vì roadmap có nhắc.** Dừng lại tính dung lượng mới thấy: thêm một phần đáng kể cho thứ mà `params.json` đã ghi tên. Roadmap là kế hoạch, không phải mệnh lệnh — nhưng chệch khỏi nó thì phải viết lý do ra, và lý do nằm trong bản đặc tả.
2. **Bản phác ban đầu có `density.png`.** Chỉ sau khi đọc lại [P6.6](p6-6-mat-do-diem.md) mới nhớ mật độ đã đi nhờ alpha từ lâu. Đọc lại quyết định cũ trước khi lặp lại chúng.

## Tự thử

1. **Tự tính con số base64.** Một bundle 680 KB thành bao nhiêu khi mã hoá base64? Công thức là `ceil(n/3) * 4`.
2. **Giải nén một bản xuất vào `apps/point-cloud/public/particles/test/`** rồi sửa `SAMPLE_BUNDLE` trong `use-particle-bundle.ts` trỏ vào đó. Có phải không cần đổi gì khác không?
3. **Mở `color.png` của một bundle bằng trình xem ảnh.** Bạn thấy gì? Rồi mở `position_h.png` — vì sao nó trông như một bức tranh trừu tượng?
4. **Zip lại bằng công cụ hệ điều hành** (chuột phải → Send to → Compressed folder) rồi thả vào panel Export. Nó có mở được không, và vì sao (gợi ý: method 8)?
5. **Xoá `params.json` khỏi một bundle rồi mở lại.** Cái gì đổi, và cái gì không?

## Đọc thêm

- [Đặc tả bundle format của dự án](../bundle-format.md)
- [P3.4 · Bounds và `metadata.json`](p3-4-bounds-va-metadata.md)
- [Wikipedia — Base64](https://en.wikipedia.org/wiki/Base64) — mục về chi phí 33%
- [Wikipedia — ZIP (file format)](https://en.wikipedia.org/wiki/ZIP_(file_format))
