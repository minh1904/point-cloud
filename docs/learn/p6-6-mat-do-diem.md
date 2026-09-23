# P6.6 · Mật độ điểm — và món nợ P5.1 cuối cùng cũng trả

## Mục tiêu

[P6.5](p6-5-blue-noise-sampling.md) cố tình đặt hạt dày trên chủ thể và thưa trên nền. Đó là phân bố đúng, và nó đẻ ra một vấn đề: với **một** kích thước hạt, vùng thưa sẽ thủng lỗ.

Bước này đo xem mỗi hạt "chật chội" bao nhiêu, rồi đưa con số đó cho shader để nó **phình to những hạt cô đơn**. Đó chính là toàn bộ nội dung của bước 5.1 — bước bị chặn từ P5 vì một đám mây trên lưới đều thì không có gì để đo.

Xong khi bản đồ mật độ có ý nghĩa và slider `Fill sparse` khép được nền trời lại.

## Khái niệm

### 1. Đo mật độ bằng hàng xóm thứ k

Mật độ là "số điểm trên một đơn vị diện tích". Cách trung thực để đo cục bộ là nhìn **khoảng cách tới hàng xóm thứ k**.

Nếu hàng xóm thứ k nằm cách `d`, thì có khoảng `k` điểm nằm trong hình tròn bán kính `d`, nên mật độ cục bộ vào khoảng `k / πd²`. Các hằng số triệt tiêu khi chuẩn hoá, nên thứ thật sự tính là `1/d²`.

Vì sao k = 6 chứ không phải 1: với k = 1, chỉ cần một hàng xóm tình cờ nằm sát là ước lượng nhảy gấp đôi. Sáu thì lấy trung bình trên cả một vòng hàng xóm — và sáu cũng đúng là số điểm bao quanh một điểm trong cách sắp xếp đều nhất trên mặt phẳng.

### 2. Vì sao phải lấy logarit

Giữa một cạnh dày đặc và bầu trời trống, khoảng cách có thể chênh mười lần, nên mật độ chênh **một trăm** lần.

Chuẩn hoá tuyến tính sẽ dồn gần như mọi hạt xuống sát 0 và để một nhúm ở 1. Lấy log trước biến **tỉ lệ thành hiệu**, và đó là thứ khiến con số 0…1 dùng được như đầu vào của một núm vặn thay vì một cái gai.

### 3. Vì sao **không** chuẩn hoá min–max — bài học của một test đỏ

Cách hiển nhiên là kéo giá trị nhỏ nhất về 0 và lớn nhất về 1. Nó sai ở đây, và sai theo kiểu chỉ lộ ra trong **trường hợp dễ**.

Một đám mây hoàn toàn đều **không có biến thiên thật nào** — chỉ có một chút nhiễu ở mép, nơi các hạt có ít hàng xóm hơn. Kéo giãn cái nhiễu đó ra toàn dải sẽ biến *không có gì* thành một bản đồ nói rằng mép ảnh trống rỗng, và P5.1 sẽ ngoan ngoãn thổi phồng chúng lên.

Test bắt được đúng chuyện này: trên một lưới đều, `max - min` ra đúng **1.0**.

Nên thang đo được đổi thành **tuyệt đối**:

```ts
const median = sorted[Math.floor(count / 2)]!;
const halfSpan = 2 * Math.log(SPREAD);
out[i] = clamp(0.5 + (logDensity[i]! - median) / (2 * halfSpan));
```

- `0.5` = "cách nhau như hạt trung vị của đám mây này"
- `1` = chặt hơn `SPREAD` lần (SPREAD = 3)
- `0` = thưa hơn `SPREAD` lần

Một đám mây đều trả về một cánh đồng toàn 0.5, nhân kích thước hạt với một hằng số — tức là không làm gì, đúng như phải thế.

Dùng **trung vị** chứ không phải trung bình: hai hạt rơi chồng lên nhau sinh ra một giá trị rất lớn sẽ kéo lệch trung bình, và ảnh có một cạnh cực dày chính là trường hợp đó.

### 4. Bù một đại lượng logarit thì phải dùng luỹ thừa

Đây là chỗ hay của bước này, và nó nằm trong shader.

`crowding` là **thang log** của khoảng cách: mỗi 0.5 nó giảm nghĩa là hàng xóm xa gấp ba. Muốn kích thước hạt bám theo khoảng cách thì phải **undo** cái log đó — tức là một hàm mũ, không phải `mix`:

```glsl
pixels *= pow(9.0, (1.0 - crowding) * uDensityBoost);
```

Vì sao là 9: khoảng cách tỉ lệ với `3^(1-2c)`. Chuẩn hoá để `c = 1` cho hệ số 1 thì được `3^(2-2c) = 9^(1-c)`. Ở `uDensityBoost = 1`, kích thước bám khoảng cách **chính xác**; ở 0 thì mọi hạt bằng nhau.

Viết theo dạng này còn có một tính chất quý: **bằng 1.0 khi crowding bằng 1**. Xem mục sau.

### 5. Chở mật độ trong kênh alpha

Con số này phải tới được vertex shader. Một texture thứ tư cộng một uniform thứ tư là khá nhiều bộ máy cho một byte mỗi hạt.

Mà bản đồ màu đang có một kênh alpha ngồi chơi. Và **alpha không nằm trong hàm truyền sRGB** — GPU giải mã RGB qua đường cong rồi cho A đi thẳng — nên một con số cất ở đó về tới nơi vẫn là con số đó.

Nó còn **suy biến đúng hướng**: một bundle đọc từ `color.png` không có alpha sẽ trả về 1.0, nghĩa là "chật nhất có thể", nghĩa là kích thước không bị đụng tới. Mọi bundle viết ra trước khi 6.6 tồn tại vẫn render y hệt như cũ.

## Đi qua code

### `apps/point-cloud/src/photo/density.ts` (mới)

`kthDistanceSquared` giữ một danh sách tăng dần cố định `k` phần tử và chèn kiểu insertion sort. Với k khoảng sáu, chèn vào mảng nhanh hơn dựng một heap.

Vòng ngoài nới dần bán kính tìm:

```ts
for (let rings = 2; rings <= 8; rings *= 2) {
  // …
  if (found >= k) return best[k - 1]!;
}
```

Một hạt trong vùng cực thưa có thể không có đủ 6 hàng xóm trong 2 vòng ô. Nới ra rồi thử lại, tối đa 8 vòng.

### `apps/point-cloud/src/shaders/points.vert.glsl`

```glsl
vec4 colorSample = texture2D(uColorMap, aParticleUv);
vColor = colorSample.rgb;
float crowding = colorSample.a;
```

Một lần fetch cho cả hai, không phải hai.

### `apps/point-cloud/src/scene/particle-field.tsx`

`densityBoost` mặc định **0.9**, chỉnh bằng mắt trên một ảnh 1024px: ở 0.5 nền trời còn lỗ, ở 1.5 mọi hạt thành một vệt mờ và chủ thể mất viền. 0.9 khép nền lại thành một mặt phẳng mà vẫn giữ được chi tiết mà sampler đã trả giá để đặt.

Và với bundle mẫu (lưới đều, alpha = 1) thì slider này **không làm gì cả**, dù kéo tới đâu — đúng thiết kế.

## Lỗi đã gặp

1. **Chuẩn hoá min–max, và một test đỏ cứu.** Đã viết min–max trước, thấy `max - min = 1` trên lưới đều mới nhận ra vấn đề. Nếu chỉ thử bằng ảnh thật thì mãi không phát hiện — ảnh thật luôn có biến thiên để che.
2. **`mix()` thay vì `pow()` ở lần đầu.** Dùng `mix(1.0 + boost, 1.0, crowding)` thì tỉ lệ lớn nhất giữa hạt thưa nhất và hạt trung bình bị chặn ở khoảng 2.85, kéo slider tới đâu cũng vậy. Phải nhận ra `crowding` là thang log mới thấy `pow` là câu trả lời.
3. **Hạt ở mép ảnh luôn bị coi là thưa.** Chúng chỉ có hàng xóm ở một phía nên khoảng cách thứ k lớn hơn thật. Hiệu ứng nhỏ nhưng bị hàm mũ khuếch đại lên. Chưa sửa; sửa đúng thì phải tính phần hình tròn bán kính d còn nằm trong ảnh. Ghi lại ở đây để không quên.

## Tự thử

1. **Kéo `Fill sparse` từ 0 tới 1.5** trên một ảnh có nhiều trời. Ghi lại giá trị mà nền vừa kín. Nó có phụ thuộc vào số hạt (nút `Points:`) không?
2. **Chứng minh bundle cũ không bị ảnh hưởng.** Bấm `Clear` trong panel Photo để về bundle mẫu, rồi kéo `Fill sparse` hết cỡ. Không gì xảy ra — vì sao?
3. **Đổi `SPREAD` từ 3 thành 10.** Xây lại và kéo `Fill sparse`. Núm vặn "mạnh" hơn hay "yếu" hơn, và vì sao?
4. **Đổi `neighbours` từ 6 thành 1.** Bản đồ mật độ nhiễu hơn — nó hiện ra thế nào trong đám mây?
5. **Thay `pow(9.0, …)` bằng `mix(1.0 + uDensityBoost, 1.0, crowding)`.** Kéo slider hết cỡ. Nền trời có kín được không? Đo tỉ lệ kích thước lớn nhất bạn đạt được.

## Đọc thêm

- [Wikipedia — k-nearest neighbors (ước lượng mật độ)](https://en.wikipedia.org/wiki/K-nearest_neighbors_algorithm)
- [Wikipedia — Median](https://en.wikipedia.org/wiki/Median)
- [Wikipedia — Logarithmic scale](https://en.wikipedia.org/wiki/Logarithmic_scale)
- [P5.3 · DOF giả trong shader hạt](p5-3-fake-dof.md) — một mẹo cùng họ: đổi kích thước hạt thay vì làm mờ khung hình
