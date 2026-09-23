# P5.4 · Bokeh mép

## Mục tiêu

Đóng khung chủ thể mà không vẽ cái khung nào.

Hạt ở hai rìa trái phải được **phóng to, làm nhạt, và đẩy ra ngoài thêm một chút** — gần đúng những gì một ống kính khẩu lớn làm với mọi thứ nằm xa tâm.

## Khái niệm

### 1. Ống kính không đều từ tâm ra rìa

Một ống kính lý tưởng thì đều. Ống kính thật thì không: càng ra xa trục quang, hình càng nhoè, tối đi (vignetting), và bị kéo giãn nhẹ.

Trong nhiếp ảnh đó là **khuyết điểm**. Trong dựng hình, ta thêm vào có chủ ý, vì nó làm được một việc: **dồn sự chú ý vào giữa** mà không cần bất kỳ đường viền hay lớp phủ nào.

Ta đã có vignette từ [P2.4](p2-4-post-effects.md), nhưng vignette chỉ làm tối pixel. Bokeh mép đụng vào **chính các hạt** — chúng đổi hình dạng, không chỉ đổi độ sáng. Khác biệt ấy đọc được.

### 2. Đo trong NDC, không phải trong thế giới

```glsl
vEdge = smoothstep(0.55, 1.0, abs(gl_Position.x / gl_Position.w)) * uEdgeBokeh;
```

`gl_Position.x / gl_Position.w` chính là phép chia phối cảnh mà GPU sắp làm — thực hiện sớm để có toạ độ NDC ngay tại đây. Kết quả nằm trong −1…1 theo chiều ngang màn hình.

Nghĩa là hiệu ứng bám vào **khung hình**, không bám vào đám mây. Xoay camera thì rìa vẫn là rìa màn hình. Đúng, vì đây là hiệu ứng ống kính — nó thuộc về mặt phẳng ảnh, giống lập luận đã dùng ở [P4.3](p4-3-clip-space-offset.md).

Chỉ tính theo `x`, không theo `y`. Đó là lựa chọn của bản gốc (research note §4) và nó hợp với khung hình ngang: hai cạnh dài là nơi mắt chạy ra khỏi ảnh.

### 3. Ba tác động, cùng một hệ số

```glsl
gl_Position.x *= 1.0 + vEdge * 0.3;   // đẩy ra ngoài
pixels *= 1.0 + vEdge * 1.4;          // to ra
alpha *= 1.0 - vEdge * 0.55;          // nhạt đi
```

Phép đẩy ra ngoài là phần tinh tế nhất và cũng dễ bỏ sót nhất. Nó **kéo giãn** vùng rìa, đúng như quang sai thật, và làm hai mép loãng ra thay vì chỉ mờ đi.

Nó cũng có hệ quả thực tế: đám mây trở nên rộng hơn bounds của nó **13%**. Đó là lý do camera ở khoảng cách 8.0 chứ không phải con số vừa khít khung — nếu khít, phần mép mềm rơi khỏi màn hình. Một hiệu ứng thị giác kéo theo một ràng buộc của cảnh.

### 4. Vì sao to ra ở đây mà nhỏ đi ở 5.3

[P5.3](p5-3-fake-dof.md) làm hạt ngoài nét **nhỏ** đi; ở đây hạt rìa **to** ra. Nghe mâu thuẫn, nhưng hai thứ muốn hai điều khác nhau.

| | Mục tiêu | Cách |
|---|---|---|
| DOF | *mất chi tiết* | nhỏ + thưa → hở khe → hết kết cấu |
| Bokeh mép | *loãng ra* | to + nhạt → chồng lấn → thành vệt nhoè |

Ở rìa, hạt to mà rất nhạt sẽ chồng lên nhau thành một lớp màu mờ. Ở vùng ngoài nét, hạt nhỏ sẽ để lộ nền. Hai cách cho hai cảm giác khác nhau, và cả hai đều không hề blur một pixel nào.

## Đi qua code

### `apps/point-cloud/src/shaders/points.vert.glsl`

```glsl
vEdge = smoothstep(0.55, 1.0, abs(gl_Position.x / gl_Position.w)) * uEdgeBokeh;
gl_Position.x *= 1.0 + vEdge * 0.3;
```

Ngưỡng 0.55 nghĩa là hiệu ứng bắt đầu ở khoảng 27% bề ngang tính từ mỗi cạnh — đủ sớm để làm mềm khung, đủ muộn để không chạm vào chủ thể ở giữa.

### `apps/point-cloud/src/shaders/points.frag.glsl`

```glsl
alpha *= 1.0 - vEdge * 0.55;
```

Nhạt tối đa còn 45%. Đẩy xuống 0 thì hai mép **mất hẳn** và bức ảnh có cạnh cứng — ngược đúng mục đích.

## Lỗi đã gặp

1. **Đám mây tràn khỏi khung và tôi đổ lỗi nhầm chỗ.** Sau khi thêm bokeh mép, hai cạnh ảnh bị cắt. Tôi đi kiểm tra khoảng cách camera, FOV, bounds — trong khi thủ phạm là `gl_Position.x *= 1.0 + vEdge * 0.3` đang làm đúng việc của nó. Cách sửa không phải là bỏ phép đẩy mà là lùi camera ra. **Một hiệu ứng thay đổi kích thước biểu kiến của cảnh là một ràng buộc về khung hình, không phải một lỗi.**
2. **Ba hiệu ứng vào cùng một lúc là quá nhiều.** 5.6, 5.3 và 5.4 được viết trong một lượt, và khi màn hình trông sai thì không có cách nào biết cái nào gây ra. Nếu làm lại, tôi sẽ bật từng cái một (đặt hệ số về 0) trước khi ghép.

## Tự thử

1. **Kéo Edge từ 0 lên 1.** Ở mức nào thì nó chuyển từ "đóng khung" sang "hỏng"?
2. **Bỏ phép đẩy ra ngoài.** Xoá `gl_Position.x *= 1.0 + vEdge * 0.3;`. Hiệu ứng còn lại thiếu cái gì so với bokeh thật?
3. **Thêm chiều dọc.** Đổi `abs(gl_Position.x / gl_Position.w)` thành `length(gl_Position.xy / gl_Position.w)`. Giờ nó là một vignette tròn tác động lên hạt. Bạn thích cái nào hơn cho khung ngang, và vì sao bản gốc chỉ làm theo `x`?
4. **Chồng với vignette.** Đặt Edge 0 và Vignette 0.8, rồi đổi ngược lại. Hai cách làm tối rìa này khác nhau ở chỗ nào?
5. **Tìm ngưỡng.** Đổi 0.55 thành 0.2. Hiệu ứng bắt đầu ăn vào chủ thể ở đâu?

## Đọc thêm

- [Wikipedia — Bokeh](https://en.wikipedia.org/wiki/Bokeh)
- [Wikipedia — Vignetting](https://en.wikipedia.org/wiki/Vignetting)
- [research/01-untillabs-method.md §4](../research/01-untillabs-method.md) — `vEdgeFactor` của bản gốc
