# P6.5 · Blue noise: rải hạt theo tầm quan trọng mà vẫn đều

## Mục tiêu

Đặt 65.536 hạt lên một tấm ảnh, sao cho hai điều cùng đúng — và hai điều đó kéo ngược nhau:

1. **Nhiều hạt ở chỗ importance cao.** Đó là thứ làm chủ thể sắc nét và nền trời rẻ tiền.
2. **Khoảng cách đều ở bất cứ chỗ nào ta nhìn.** Không phải mật độ đều — mật độ *phải* thay đổi — mà là không có cục vón, không có lỗ hổng, ở đúng mật độ đang có tại chỗ đó.

Xong khi hạt dày trên chủ thể, đều trên nền.

## Khái niệm

### 1. Vì sao random có trọng số là chưa đủ

Cách hiển nhiên: bốc ngẫu nhiên một pixel với xác suất tỉ lệ importance, lặp 65.536 lần. Đúng yêu cầu (1), sai yêu cầu (2) rất nặng.

Các lần bốc **độc lập** nhau thì vón cục. Khoảng cách giữa hai điểm ngẫu nhiên có xác suất rơi vào "rất nhỏ" đúng bằng xác suất rơi vào "vừa phải". Kết quả là những búi hạt chồng lên nhau nằm cạnh những khoảng trống. Trên point cloud, cái đó đọc ra là nhiễu — và không kích thước hạt nào cứu được.

### 2. Blue noise

**Blue noise** là phân bố mà phổ Fourier không có tần số thấp — nói thường là "ngẫu nhiên, nhưng không có hai điểm nào ở quá gần nhau".

Mắt người cực giỏi phát hiện cục vón của white noise và gần như mù với cấu trúc của blue noise. Đó là lý do dithering, stippling và sampling đều hội tụ về nó.

### 3. Thuật toán best-candidate của Mitchell

Poisson-disk thực thụ với bán kính thay đổi thì lằng nhằng. Mitchell lấy được gần hết lợi ích trong hai mươi dòng:

> Để đặt một hạt, sinh ra `candidates` ứng viên, và giữ lại cái **có nhiều chỗ nhất** so với những hạt đã đặt.

Một ứng viên = random thuần. Khoảng tám ứng viên thì mắt thường không phân biệt được với Poisson-disk thật.

### 4. "Xa nhất" hoá ra là câu hỏi sai

Đây là phần thú vị nhất của bước này, và nó được phát hiện **nhờ một test đỏ**.

Bốc ứng viên theo phân bố importance thì mật độ đúng; lấy cái xa nhất thì khoảng cách đúng. Nhưng chúng đánh nhau: một ứng viên ngoài nền trời trống thì **gần như theo định nghĩa** là xa mọi thứ, nên nó thắng những ván lẽ ra phải thua.

Đo thật, với bản đồ nửa trái trọng số 1 và nửa phải 0.1:

| Cách chấm điểm | Tỉ lệ hạt trái : phải |
|---|---|
| bản đồ yêu cầu | 10 : 1 |
| lấy `d²` (xa nhất) | **2.3 : 1** |
| lấy `d² · w` | **10.0 : 1** |

Cách sửa là hỏi đúng câu. Cái đáng quan tâm không phải "xa hàng xóm bao nhiêu" mà là "**xa so với mức đáng lẽ phải xa ở chỗ này**".

Chỗ importance là `w`, các hạt muốn cách nhau chừng `1/√w`. Vậy khoảng cách tương đối là `d·√w`, và cực đại hoá bình phương của nó — `d²·w` — tốn đúng **một phép nhân**.

Với nó, một khe hẹp trên chủ thể thắng một khoảng trống rộng trên trời. Số ứng viên từ đó chỉ còn mua khoảng cách đều, đúng việc của nó.

### 5. Bốc theo phân bố: rejection sampling

Cách chính quy là dựng bảng luỹ tích rồi tìm nhị phân. Với ảnh một megapixel đó là 8 MB và một lần tìm nhị phân mỗi lần bốc.

**Rejection sampling** không cần bảng nào:

```ts
const index = Math.floor(random() * pixels);
if (random() * max <= importance[index]!) return index;   // nhận
// không thì bốc lại
```

Sau nhiều lần bốc, những pixel được nhận tuân theo đúng phân bố importance. Cái giá là số lần bốc lại: tỉ lệ chấp nhận bằng `trung bình / lớn nhất`. Một bản đồ chỉ có một đốm sáng trên nền đen sẽ bốc rất lâu — và `floor` ở [P6.4](p6-4-importance-map.md) chính là thứ giữ cho trung bình không tụt.

`MAX_REJECTION_TRIES = 64` chặn trường hợp xấu nhất, đổi lấy một hạt hơi-quá-đều ở một góc hiếm hoi.

### 6. Lưới không gian: linked list trong hai mảng số nguyên

Câu hỏi "cái gì ở gần đây" được hỏi nửa triệu lần. Trả lời bằng cách duyệt hết là O(n²) — bốn tỉ phép so sánh.

`PointGrid` chia ảnh thành ô sao cho mỗi ô chứa trung bình **một** hạt. Chín ô quanh một vị trí là gần như đủ mọi hàng xóm đáng kể.

Cách lưu các ô là mẹo đáng mang đi:

```ts
insert(index) {
  this.next[index] = this.head[cell];
  this.head[cell] = index;
}
```

`head[cell]` là hạt mới nhất trong ô đó, `next[point]` là hạt trước nó, `-1` là hết danh sách. Không mảng con, không cấp phát khi chèn, không có giới hạn sức chứa nào để tràn. Hai mảng typed cấp phát đúng một lần, và một ô có bốn mươi hạt cũng không tốn thêm gì.

### 7. Jitter dưới mức pixel

```ts
const x = (pixel % width) + random();
const y = Math.floor(pixel / width) + random();
```

Nếu bỏ `random()` thì mọi hạt rơi vào tâm pixel, tức là quay lại **một mạng lưới đều** — đúng thứ mà [P3.1](p3-1-geometry-without-positions.md) và cả P6 này mất công thoát ra khỏi.

### 8. PRNG có hạt giống

`Math.random()` không gieo hạt được. Một đám mây không gieo hạt là một đám mây không tái tạo được: một bug chỉ xuất hiện với vài cách đặt hạt sẽ không lặp lại được, và bản xuất của P8 sẽ khác nhau mỗi lần chạy mà không vì lý do gì.

`mulberry32` là một PRNG 32-bit gọn, nhanh, phân bố tốt — 6 dòng, không dependency.

## Đi qua code

### `apps/point-cloud/src/photo/spatial-grid.ts` (mới)

`nearestDistanceSquared` trả **bình phương** khoảng cách. So sánh khoảng cách thì không bao giờ cần căn bậc hai, và `Math.sqrt` trong vòng lặp trong của nửa triệu truy vấn không hề miễn phí.

### `apps/point-cloud/src/photo/sample-points.ts` (mới)

```ts
const rings = 2;
const reach = ((rings + 1) * cellSize) ** 2;
// …
const distance = Math.min(reach, grid.nearestDistanceSquared(x, y, rings));
const score = distance * importance[pixel]!;
```

Hai vòng ô chứ không phải một: một ứng viên sát mép ô sẽ bỏ sót hàng xóm ngay bên kia mép và trông trống hơn thực tế.

`Math.min(reach, …)` xử lý trường hợp vùng lân cận rỗng, khi hàm trả `Infinity`. Không thấy gì ngoài hộp đã quét, nên chấm điểm như thể hạt gần nhất nằm đúng trên mép hộp — điểm số hữu hạn, và **số hạng importance được quyền phân định**.

## Lỗi đã gặp

1. **Test đỏ mới lộ ra thiết kế sai.** Test "bám theo bản đồ importance" đòi trên 80% hạt ở nửa nặng, và chỉ đạt 69.4%. Phản xạ đầu tiên là hạ ngưỡng test. May là đã dừng lại hỏi *vì sao* — và câu trả lời là cả cách chấm điểm sai chứ không phải con số kỳ vọng sai. Test yếu đi thì sẽ giấu luôn khuyết tật đó.
2. **Ứng viên đầu tiên với `Infinity`.** Khi lưới rỗng, mọi ứng viên có `d² = Infinity`, và `Infinity * w` vẫn là `Infinity`, nên ứng viên đầu luôn thắng — importance không có tiếng nói. Kẹp về `reach` sửa được, và cũng là lý do hạt đầu tiên chỉ bốc **một** ứng viên.
3. **Lưới ban đầu đọc toạ độ sai một nhịp.** `insert(index)` đọc từ chính mảng `points` đang được điền, nên phải gọi **sau** khi ghi toạ độ vào mảng. Viết ngược thứ tự thì mọi hạt nằm ở (0,0) và blue noise biến thành một cục.

## Tự thử

1. **Nhìn thấy blue noise.** Kéo slider `Spacing` (số ứng viên) về 1, bấm Rebuild, nhìn nền trời. Rồi kéo lên 8. Sau đó lên 16 — có khác 8 không?
2. **Kiểm lại con số 10:1.** Viết một script nhỏ như trong test: bản đồ nửa 1 nửa 0.1, đếm hạt mỗi bên với `candidates` bằng 1, 4, 8, 16. Rồi bỏ `* importance[pixel]` trong `score` và đếm lại.
3. **Bỏ jitter.** Đổi `+ random()` thành `+ 0.5` rồi Rebuild. Zoom vào chỗ nền trời — mạng lưới hiện ra ở đâu?
4. **Đổi `MAX_REJECTION_TRIES` thành 2.** Bản đồ nào làm việc đó lộ ra rõ nhất? (Gợi ý: kéo `Floor` về 0 trước.)
5. **Đo tác dụng của lưới.** Thay `grid.nearestDistanceSquared` bằng một vòng lặp duyệt hết các hạt đã đặt. Với 128² hạt thì mất bao lâu? Đừng thử với 256².

## Đọc thêm

- [Wikipedia — Colors of noise (mục *Blue noise*)](https://en.wikipedia.org/wiki/Colors_of_noise)
- [Wikipedia — Rejection sampling](https://en.wikipedia.org/wiki/Rejection_sampling)
- [Wikipedia — Supersampling (mục *Poisson disc*)](https://en.wikipedia.org/wiki/Supersampling)
- [Wikipedia — Nearest neighbor search](https://en.wikipedia.org/wiki/Nearest_neighbor_search)
