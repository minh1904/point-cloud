# P6.9 · Xáo thứ tự điểm: texture là một cái túi, không phải một tấm bản đồ

## Mục tiêu

Trước khi đóng gói vào texture 256², trộn ngẫu nhiên thứ tự các hạt.

Nghe như một dòng code thừa. Thực ra nó sửa một lỗi hình ảnh mà nếu không biết trước thì rất khó lần ra — và nó làm sáng tỏ một chi tiết đã treo từ [P3.1](p3-1-geometry-without-positions.md).

Xong khi intro hiện ra đều khắp ảnh, không thành từng dải.

## Khái niệm

### 1. Thứ tự lấy mẫu là thứ tự **không gian**

Sampler đặt hạt theo thứ tự nó nghĩ ra. Mà nó bốc ứng viên từ bản đồ importance, nên những hạt được đặt gần nhau về **thời gian** thường cũng gần nhau trên **tấm ảnh**.

Đóng gói theo thứ tự đó thì texel `(x, y)` và các texel cạnh nó là những hạt nằm gần nhau trong ảnh. Texture trở thành một tấm bản đồ thô của bức ảnh.

### 2. Ba chỗ trong renderer đọc theo texel

Đó mới là vấn đề. Shader không dùng texel chỉ để đọc dữ liệu — nó **băm** toạ độ texel để sinh số ngẫu nhiên:

```glsl
vec2 texel = aParticleUv * uTextureSize;
vec3 randomness = hash32(texel);
```

Ba chỗ dùng nó:

| Chỗ | Dùng làm gì | Hỏng ra sao nếu texel có tính không gian |
|---|---|---|
| [P4.2](p4-2-curl-noise.md) | seed cho trường chảy | seed tương quan theo vùng → "scatter" hết ngẫu nhiên |
| [P4.4](p4-4-breathing.md) | pha của nhịp thở | cả một vùng thở cùng nhịp |
| [P5.5](p5-5-intro-reveal.md) | thời điểm hạt xuất hiện | cả vùng hiện cùng lúc, thành dải quét ngang |

Cái thứ ba là cái nhìn thấy rõ nhất. Intro lẽ ra phải tan ra đều khắp bức ảnh; nếu texel mang tính không gian thì nó hiện theo đúng trình tự mà sampler tình cờ làm việc — không phải một hiệu ứng nghệ thuật, mà là một lỗi trông như hiệu ứng.

Sau khi xáo, texture là một **cái túi**: texel cạnh nhau là những hạt không liên quan, các hàm băm độc lập, intro tan đều.

### 3. Fisher-Yates, và vì sao `sort(() => Math.random() - 0.5)` là sai

```ts
for (let i = count - 1; i > 0; i--) {
  const j = Math.floor(random() * (i + 1));
  [order[i], order[j]] = [order[j], order[i]];
}
```

Đi từ cuối về đầu, đổi chỗ mỗi phần tử với một phần tử ở vị trí **bằng hoặc trước** nó. Mọi hoán vị có xác suất **bằng nhau chính xác**.

Cách "tiện tay" hay gặp — đưa một comparator ngẫu nhiên cho `sort` — thì **lệch**, và mức lệch còn phụ thuộc vào thuật toán sort mà engine đang dùng. Nó lệch vì comparator không nhất quán: `sort` giả định nếu `a < b` và `b < c` thì `a < c`, và một comparator ngẫu nhiên phá vỡ giả định đó.

### 4. `aIndex` — nửa vấn đề được giải

`aIndex` được upload từ P3.1 và **chưa bao giờ được shader đọc**. P4.2 và P5.5 đều muốn một seed cho mỗi hạt và cả hai đều dùng hàm băm toạ độ texel thay vì nó.

Có hai lý do khiến nó không dùng được, và xáo thứ tự chỉ giải quyết **một**:

1. ~~Thứ tự mang tính không gian, nên số thứ tự cũng chỉ là một con số tương quan nữa.~~ → xáo xong thì số thứ tự không còn nghĩa gì, đúng như một seed cần.
2. Băm một số nguyên năm chữ số trong shader **cạn độ chính xác float**. `fract()` của một số lớn mất hết phần lẻ có ý nghĩa. → vẫn còn nguyên.

Nên shader vẫn băm toạ độ texel. Trạng thái trung thực: xáo thứ tự bỏ được phản đối thứ nhất, không bỏ được phản đối thứ hai. `aIndex` vẫn là 256 KB buffer chưa ai đọc — và vẫn đáng gỡ bỏ nếu không tìm ra việc cho nó.

### 5. Hoán vị áp cho **mọi** mảng song song

```ts
for (let to = 0; to < cloud.count; to++) {
  const from = order[to]!;
  positions[to * 3] = cloud.positions[from * 3]!;
  // … y, z, r, g, b, density
}
```

Vị trí, màu và mật độ là ba mảng riêng được đánh chỉ số song song. Xáo một mảng mà quên mảng kia là loại lỗi cho ra một bức ảnh nhiễu hoàn toàn — dễ thấy — hoặc, nếu chỉ quên `density`, một bức ảnh gần đúng với kích thước hạt sai ở những chỗ ngẫu nhiên, thứ rất khó chẩn đoán.

Test trong repo bắt đúng chuyện đó bằng một mẹo: dựng đám mây sao cho `x` **chính là** chỉ số gốc, rồi đòi mọi trường khác phải khớp với `x` của nó.

## Đi qua code

### `apps/point-cloud/src/photo/shuffle.ts` (mới)

`shuffledOrder(count, seed)` tách riêng khỏi `shuffleCloud` để test được hoán vị mà không cần dựng cả đám mây. Nó dùng lại `mulberry32` của [P6.5](p6-5-blue-noise-sampling.md) — cùng một seed cho cả sampler và shuffle, nên **một số duy nhất tái tạo được toàn bộ đám mây**.

### `apps/point-cloud/src/photo/worker.ts`

```ts
const packed = packCloud(shuffleCloud(cloud, request.seed), { … });
```

Xáo ngay trước khi đóng gói, không sớm hơn. `pointDensity` (6.6) và `liftToCloud` (6.7) không quan tâm thứ tự, nên xáo sớm chỉ làm mọi thứ khó debug hơn: trong lúc dò lỗi, thứ tự lấy mẫu là thứ tự dễ đối chiếu nhất.

### `apps/point-cloud/src/app/cloud-panel.tsx`

Nút `Seed:` tăng seed lên một. Một đám mây khác hẳn từ cùng một tấm ảnh — vì sampler, phép xáo, và do đó mọi hàm băm phía sau đều dịch chuyển.

## Lỗi đã gặp

1. **Suýt xáo trước khi tính mật độ.** Thứ tự xuất hiện sớm hơn trong pipeline thì "gọn" hơn về mặt đọc code, nhưng khi dò lỗi mật độ thì mất hẳn khả năng đối chiếu chỉ số với thứ tự đặt hạt. Đặt ngay trước `packCloud` là chỗ muộn nhất mà vẫn đúng.
2. **Chưa kiểm được hiệu ứng thật trên ảnh 256×256.** Với ảnh thử nhỏ, mọi texel đều "gần" nhau nên dải quét của intro không lộ. Phải dựng một ảnh 1024px mới thấy rõ sự khác biệt — cùng bài học với [P6.4](p6-4-importance-map.md).

## Tự thử

1. **Tắt phép xáo.** Trong `worker.ts` đổi thành `packCloud(cloud, { … })`, xây lại, rồi bấm `Replay Intro`. Nhìn kỹ thứ tự hạt xuất hiện — có thành dải không?
2. **Tắt xáo rồi bật `Show noise field`.** Trường fBM trông thế nào khi seed tương quan theo vùng?
3. **Đổi seed nhiều lần.** Bấm `Seed:` năm lần liên tiếp. Bức ảnh có giữ nguyên không? Cái gì thay đổi và cái gì không?
4. **Thử comparator ngẫu nhiên.** Trong console: xáo `[0..9]` một nghìn lần bằng `sort(() => Math.random() - 0.5)`, đếm số lần phần tử `0` nằm ở mỗi vị trí. Có đều không? Làm lại bằng Fisher-Yates.
5. **Gỡ `density` khỏi `shuffleCloud`** (giữ nguyên thứ tự cũ cho riêng nó). Triệu chứng nhìn thấy là gì, và bạn có tự chẩn đoán ra không nếu không biết trước?

## Đọc thêm

- [Wikipedia — Fisher–Yates shuffle](https://en.wikipedia.org/wiki/Fisher%E2%80%93Yates_shuffle)
- [Wikipedia — Random permutation](https://en.wikipedia.org/wiki/Random_permutation)
- [P5.5 · Intro: hạt hiện dần](p5-5-intro-reveal.md) — nơi lỗi này lộ ra rõ nhất
- [P3.1 · Geometry không có vị trí](p3-1-geometry-without-positions.md) — nơi `aIndex` ra đời
