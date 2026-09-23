# P5.3 · DOF giả trong shader hạt

## Mục tiêu

Xoá phông — nhưng không blur gì cả.

DOF thật ở bước hậu kỳ phải làm mờ cả khung hình, đọc độ sâu, lấy hàng chục mẫu cho mỗi pixel. Đắt. Một đám mây điểm có lối đi tắt: **thu nhỏ hạt và làm nó nhạt đi**. Khe hở mở ra giữa các hạt chính là thứ mắt đọc thành "mờ".

Kết quả: slider **Focus** kéo tiêu điểm qua chiều sâu bức ảnh, từ cỏ tiền cảnh tới dãy núi phía xa.

## Khái niệm

### 1. Vì sao nhỏ đi lại đọc thành mờ

Nghe ngược đời: ống kính thật làm điểm ngoài nét **to ra** thành vòng tròn nhoè (circle of confusion), chứ không nhỏ đi.

Nhưng ta không có blur. Nếu chỉ vẽ hạt to hơn mà không làm mờ, mắt sẽ đọc là **chấm to** — tức là *nhiều* chi tiết hơn, ngược hẳn ý đồ.

Thu nhỏ thì khác. Hạt co lại, khe hở mở ra giữa chúng, nền đen lọt qua, và vùng đó **mất kết cấu**. Mất kết cấu chính là tín hiệu mà mắt dùng để nhận ra "chỗ này không nét".

```
trong nét            ngoài nét
●●●●●●●●             · ·  ·  · ·
●●●●●●●●              ·  ·  ·  ·
●●●●●●●●             ·  · ·   · ·
đặc, có kết cấu      thưa, không đọc được chi tiết
```

Research note ghi bản gốc làm đúng vậy: `gl_PointSize -= gl_PointSize * vFocalTransition² * 1.6`.

### 2. Đo theo chiều sâu của **ảnh**, không phải khoảng cách tới camera

Đây là chỗ bước này lệch khỏi DOF thật, và là một quyết định có chủ ý.

DOF vật lý đo khoảng cách từ camera. Nhưng đám mây của ta là **một bức ảnh có chút bề dày**, dày 0.081 đơn vị nhìn từ khoảng cách 8. Mọi hạt gần như cách camera bằng nhau — chênh lệch chỉ 1%. DOF theo khoảng cách camera sẽ gần như không làm gì cả, trừ khi nghiêng camera thật mạnh.

Thứ *có* ý nghĩa là chiều sâu riêng của bức ảnh: trời ở xa, cỏ ở gần. Và ta đã có sẵn con số đó, chuẩn hoá 0…1, từ [P3.3](p3-3-16-bit-positions.md):

```glsl
vDefocus = smoothstep(0.0, max(uFocalRange, 0.001), abs(normalised.z - uFocalDepth));
```

`normalised.z` là giá trị giải mã trước khi ánh xạ qua bounds — đúng 0 ở mặt sau, 1 ở mặt trước, bất kể bundle to nhỏ ra sao. Slider vì thế có ý nghĩa cố định, và **tiêu điểm không trôi khi xoay camera** — với một công cụ thiết kế thì đó là hành vi đúng: nét là thuộc tính của cái nhìn, không phải của góc nhìn.

### 3. Hai nửa của mẹo, và sàn alpha

Thu nhỏ ở vertex shader:

```glsl
pixels *= 1.0 - vDefocus * vDefocus * 0.5;
```

Làm nhạt ở fragment shader:

```glsl
alpha *= mix(1.0, 0.14, vDefocus * vDefocus);
```

Cả hai dùng `vDefocus²` chứ không phải `vDefocus`: vùng gần nét gần như không đổi, và hiệu ứng dồn về phía ngoài rìa — giống cách ống kính thật hành xử hơn là một dốc tuyến tính.

Con số **0.14** quan trọng hơn vẻ ngoài của nó. Bản đầu để 0.06 và bầu trời không còn "mềm" nữa, nó **biến mất** — thành một lỗ thủng trong bức ảnh chứ không phải chiều sâu trường ảnh. Mờ vẫn phải còn ở đó.

### 4. Giá: hai phép nhân

Đây là toàn bộ chi phí. Không thêm một lần lấy mẫu texture, không thêm một pass, không thêm buffer. `smoothstep` và vài phép nhân, trong một shader vốn đã chạy cho từng hạt.

So với DOF hậu kỳ thật (đọc depth buffer, blur theo bán kính thay đổi, nhiều chục mẫu mỗi pixel) thì chênh lệch cỡ vài bậc. Research note ghi bản gốc **chỉ** blur ở viền khung hình trong pass hậu kỳ, còn toàn bộ cảm giác DOF đến từ chính shader hạt.

## Đi qua code

### `apps/point-cloud/src/shaders/points.vert.glsl`

```glsl
vDefocus = smoothstep(0.0, max(uFocalRange, 0.001), abs(normalised.z - uFocalDepth));
pixels *= 1.0 - vDefocus * vDefocus * 0.5;
```

`max(uFocalRange, 0.001)` tránh chia cho 0 khi slider về tận cùng — `smoothstep` với hai cạnh bằng nhau cho kết quả không xác định.

### `apps/point-cloud/src/scene/particle-field.tsx`

```tsx
focalDepth: 0.45,
focalRange: 0.8,
```

`focalRange` để rộng, và đó là một bài học: chiều sâu ở đây trải khắp bức ảnh — trời ở 0, cỏ ở 1. Range dưới 0.5 nghĩa là **cả hai đầu đều bị ném đi**, chỉ còn một dải nét vắt ngang giữa khung. Hiệu ứng rất ấn tượng, và là một mặc định sai.

## Lỗi đã gặp

1. **Range 0.3 xoá mất trời và cỏ.** Mặc định đầu tiên là `focalDepth 0.42, focalRange 0.3`. Mở app thấy một dải nét ở giữa, trên dưới đen thui — tôi tưởng khung hình sai và đi tính lại khoảng cách camera, tính sai tiếp, mất một lúc. Thủ phạm là DOF đang chạy **rất đúng**, chỉ là quá mạnh. Bài học: khi hai tính năng mới cùng vào một lúc, triệu chứng của cái này rất dễ bị gán cho cái kia.
2. **Sàn alpha 0.06 quá thấp.** "Mờ" mà không còn nhìn thấy gì thì không phải mờ, là thủng. Nâng lên 0.14.
3. **Suýt dùng khoảng cách tới camera.** Đúng về vật lý, và sẽ gần như không có tác dụng gì với một đám mây dày 1% khoảng cách quan sát. Đổi sang chiều sâu chuẩn hoá của ảnh.

## Tự thử

1. **Kéo Focus từ 0 tới 1** với Range khoảng 0.25. Tiêu điểm chạy từ hậu cảnh ra tiền cảnh — đây là cú *focus pull* của điện ảnh, làm bằng một uniform.
2. **Đặt Range 0.1, Focus 0.5.** Chỉ còn một lát mỏng nét. Nó nằm ở đâu trong bức ảnh, và điều đó cho bạn biết gì về bản đồ độ sâu placeholder?
3. **Làm hạt to ra thay vì nhỏ đi.** Đổi `1.0 - vDefocus * vDefocus * 0.5` thành `1.0 + vDefocus * vDefocus * 1.5`. Trông có giống mờ hơn không? Vì sao không?
4. **Bỏ sàn alpha.** Đổi `0.14` thành `0.0`. Vùng ngoài nét trở thành gì?
5. **Đổi sang DOF theo camera.** Thay `normalised.z` bằng `(-mvPosition.z - 7.0) * 0.5` (một khoảng cách thô). Xoay camera. Khác biệt lớn nhất trong cách dùng là gì?

## Đọc thêm

- [Wikipedia — Circle of confusion](https://en.wikipedia.org/wiki/Circle_of_confusion)
- [Khronos — `smoothstep`](https://registry.khronos.org/OpenGL-Refpages/gl4/html/smoothstep.xhtml)
- [research/01-untillabs-method.md §4](../research/01-untillabs-method.md) — `vFocalTransition` của bản gốc
