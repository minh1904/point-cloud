# P6.7 · Nâng ảnh lên 2.5D: vì sao relief phải nông

## Mục tiêu

Sampler cho ra vị trí trên một **tấm ảnh** — phẳng, tính bằng pixel. Bước này biến chúng thành toạ độ thế giới ba chiều.

Và đây là bước **ít tham vọng nhất** của cả phase, một cách có chủ đích: **2.5D**, một mặt phẳng có nổi, không phải một bản dựng lại 3D. Mỗi hạt giữ nguyên x và y nơi nó được lấy mẫu, và nhận thêm z từ bản đồ độ sâu.

Xong khi nghiêng camera thấy khối tin được.

## Khái niệm

### 1. 2.5D là gì

Một mô hình 3D thật có mặt sau, có phần bị che, có thể đi vòng ra sau. 2.5D thì không: nó là **một mặt duy nhất** với độ nổi, giống như bức phù điêu trên tường hơn là một bức tượng.

Điều đó không phải hạn chế của phương pháp, nó là **chính xác những gì dữ liệu cho phép**. Một tấm ảnh không chứa mặt sau của bất cứ thứ gì.

### 2. Vì sao nông

Monocular depth là **tương đối**. Nó biết người đứng trước ngọn núi; nó không biết cách hai mét hay hai trăm mét. Và nó sai một cách rất tự tin ở những chỗ mảnh, ở mặt phản chiếu, và ở bầu trời.

Đưa bản đồ đó một relief sâu thì mọi sai sót biến thành một cái gai xuyên qua bức ảnh.

Ở mức vài phần trăm bề ngang — ghi chú nghiên cứu đo cảnh của UntilLabs ở khoảng **0.6%**, còn ở đây **3%** vẫn đọc ra như một tấm ảnh — sai số nhỏ hơn khoảng cách giữa các hạt, trong khi thị sai khi camera dịch chuyển vẫn thấy rõ.

Relief nông **không phải là nhượng bộ vì model yếu**. Nó là thứ làm cho một model không hoàn hảo dùng được.

### 3. Và ống tele làm nốt phần còn lại

Ghép với ống kính 16° của [P5.6](p5-6-telephoto.md) thì còn một lý do nữa để nó trông giống ảnh chụp: **ống kính dài làm dẹt phối cảnh**, nên một chủ thể vốn dĩ dẹt trông như bị *nén* chứ không phải *phẳng*.

Hai quyết định ở hai phase khác nhau, và chúng chỉ có nghĩa khi đứng cạnh nhau.

### 4. Độ sâu nội suy, màu thì không

Hai phép lấy mẫu, hai lựa chọn ngược nhau — và đó là điểm đáng nhớ nhất của bài.

**Độ sâu: bilinear.** Vị trí lấy mẫu nằm giữa các pixel, và độ sâu là đại lượng trơn — một mặt không có bậc thang. Lấy pixel gần nhất sẽ lượng tử hoá mọi z về lưới pixel, và ở relief 3% thì đó là những bậc thang thấy rõ đúng chỗ độ nổi thoai thoải nhất.

**Màu: nearest.** Nội suy màu **xuyên qua một đường bao** sẽ trộn chủ thể với hậu cảnh và viền mọi đường nét bằng một màu **không tồn tại ở đâu trong tấm ảnh**. Cái quầng đó rất dễ nhận ra khi đã biết nhìn.

Cùng một dữ liệu, hai câu hỏi khác nhau, hai câu trả lời khác nhau.

### 5. Trục y lật, trục z thì không

```ts
positions[i * 3]     = (x / width - 0.5) * fieldWidth;
positions[i * 3 + 1] = (0.5 - y / height) * fieldHeight;
positions[i * 3 + 2] = (0.5 - sampleDepth(…)) * relief;
```

Hàng pixel 0 là **đỉnh** ảnh, còn +y trong thế giới là **lên**, nên trục dọc phải lật. Quên thì cảnh lộn ngược — điều rất dễ thấy.

Trục z cũng lật, vì `depth` chạy 0 = gần và camera nhìn theo chiều −z, nên gần hơn nghĩa là z lớn hơn. Quên **cái này** thì đám mây lộn trong ra ngoài, và nó *không* dễ thấy — mọi thứ trông vẫn hợp lý cho tới khi xoay camera.

`fieldHeight = fieldWidth * height / width` giữ đúng tỉ lệ ảnh. Bundle mẫu của P3 phải mang `aspect` trong metadata vì nó bị ép thành vuông; đám mây dựng trong app thì không cần mẹo đó.

## Đi qua code

### `apps/point-cloud/src/photo/lift.ts` (mới)

`sampleDepth` là bilinear tiêu chuẩn, với một chi tiết dễ sai:

```ts
const px = Math.min(width - 1, Math.max(0, x - 0.5));
```

Trừ 0.5 vì **tâm** của pixel 0 nằm ở toạ độ 0.5, không phải 0. Bỏ qua bước này thì cả bản đồ độ sâu bị lệch nửa pixel — nhỏ, nhưng là loại sai số cộng dồn với những sai số khác.

Kiểu trả về gói cả ba mảng song song:

```ts
export interface PointCloud {
  count: number;
  positions: Float32Array;   // x, y, z
  colors: Uint8ClampedArray; // r, g, b
  density: Float32Array;     // từ 6.6, đi qua nguyên vẹn
}
```

`density` chỉ đi ngang qua bước này. Nó được tính ở [P6.6](p6-6-mat-do-diem.md) trong không gian pixel và không phụ thuộc gì vào việc nâng lên 3D — nhưng nó phải đi cùng hạt của nó, nên nó ngồi cùng struct.

### `apps/point-cloud/src/app/cloud-panel.tsx`

Slider `Relief` để theo **tỉ lệ phần trăm bề ngang**, không phải đơn vị thế giới:

```tsx
format={{ style: "percent", maximumFractionDigits: 1 }}
```

Vì con số có ý nghĩa là cái tỉ lệ, và đó cũng là đơn vị mà ghi chú nghiên cứu dùng. Đưa "0.09 world units" cho người dùng thì họ không có gì để so sánh.

## Lỗi đã gặp

1. **Suýt nội suy cả màu.** Viết bilinear cho depth xong, phản xạ tự nhiên là dùng lại cho màu. Phải dừng lại nghĩ mới thấy đường bao chủ thể sẽ bị viền quầng. Hai phép lấy mẫu giống hệt nhau về code mà ngược nhau về lựa chọn — đúng loại chỗ cần comment.
2. **Test "0.5 ở giữa hai pixel" đỏ lần đầu.** Vì quên `- 0.5`. Test hỏi: điểm ở x = 3.0, giữa pixel 2 (depth 0) và pixel 3 (depth 1), phải ra 0.5. Không trừ nửa pixel thì ra 1.0.
3. **Hai chấm xanh lơ lửng ở rìa trái khung hình.** Tưởng là bug của lift. Thật ra là bokeh mép của [P5.4](p5-4-edge-bokeh.md) đẩy những hạt vượt ngưỡng 0.55 NDC ra ngoài, cộng với việc chúng bị phình to vì nằm ở mép nên "thưa". Hành vi cũ, không phải lỗi mới — nhưng mất mười phút mới kết luận được.

## Tự thử

1. **Kéo `Relief` từ 0.2% lên 12%.** Ở mức nào thì sai sót của model bắt đầu lộ thành gai? Thử với một ảnh có hàng rào hoặc cành cây mảnh.
2. **Kết hợp relief với FOV.** Đặt `Relief` ở 3%, rồi kéo `FOV` từ 16 lên 60. Cùng một hình học, vì sao cảm giác khác hẳn?
3. **Đảo dấu z.** Đổi `(0.5 - sampleDepth(…))` thành `(sampleDepth(…) - 0.5)`. Nhìn thẳng thì gần như không khác. Xoay camera sang bên — giờ thì sao?
4. **Đổi màu sang bilinear.** Viết một `sampleColor` nội suy, dùng nó, rồi zoom vào đường bao giữa chủ thể và nền. Tìm màu không có thật.
5. **Bỏ `- 0.5` trong `sampleDepth`.** Đám mây lệch nửa pixel. Có nhìn thấy không? Thử với relief 12% thì sao?

## Đọc thêm

- [Wikipedia — Bilinear interpolation](https://en.wikipedia.org/wiki/Bilinear_interpolation)
- [Wikipedia — Parallax](https://en.wikipedia.org/wiki/Parallax)
- [Wikipedia — Relief (nghệ thuật phù điêu)](https://en.wikipedia.org/wiki/Relief)
- [Ghi chú nghiên cứu UntilLabs](../research/01-untillabs-method.md) — mục 2.2, đo relief của cảnh gốc
