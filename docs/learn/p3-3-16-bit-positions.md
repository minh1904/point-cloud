# P3.3 · Vị trí 16-bit trong hai file PNG

## Mục tiêu

Ảnh hết phẳng. Ở 3.2 `z` bị gán cứng bằng `0.0`; bước này thay dòng đó bằng một phép đọc texture, và toạ độ của từng hạt được giải mã từ **hai** file PNG.

Kết quả nhìn thấy được: xoay camera thì đám hạt không còn là tấm bìa dán ảnh — nó có bề dày.

Nhưng nội dung thật của bước này không phải là độ sâu. Nó là câu hỏi: **làm sao nhét một con số cần nhiều hơn 8 bit vào một file ảnh 8 bit?**

## Khái niệm

### 1. 256 mức là không đủ

Một kênh PNG có **8 bit = 256 mức**. Trường hạt rộng 3.0 đơn vị thế giới, nên lưu toạ độ x bằng một kênh:

```
3.0 / 255 = 0.0118 đơn vị mỗi mức
```

Con số đó nghe nhỏ, cho tới khi so với bước lưới: `3.0 / 256 = 0.0117`. **Chúng bằng nhau.** Lưu 8 bit nghĩa là mọi hạt bị nắn về đúng cái lưới 256×256 mà nó đang nằm trên.

Bây giờ thì vô hại — hạt của ta *đang* nằm trên lưới. Nhưng P6.5 sẽ lấy mẫu theo tầm quan trọng: hạt dày trên chủ thể, thưa trên nền, ở những vị trí **tuỳ ý** do blue-noise quyết định. Nắn chúng về lưới đều là ném đi đúng thứ làm bức ảnh đẹp. Research note gọi đó là bài học số 2: *"65k điểm đặt đúng chỗ đẹp hơn 500k điểm rải đều."*

Ghép hai kênh:

```
(hi × 256 + lo) / 65535  →  65.536 mức  →  3.0 / 65535 = 0.000046 đơn vị
```

Mịn hơn bước lưới khoảng 250 lần. Đó là `position_h.png` (byte cao) và `position_l.png` (byte thấp).

### 2. Sao không dùng float texture cho xong?

Câu hỏi đúng, và câu trả lời là: **sẽ dùng, nhưng không phải ở đây.**

Research note §8 bài học 4 nói thẳng: tách hi/lo **chỉ cần khi ship dữ liệu tĩnh**. P6.8 sinh dữ liệu ngay trong trình duyệt và sẽ nhét thẳng vào `DataTexture` kiểu Float, không cần tách gì cả.

Khác biệt nằm ở chỗ dữ liệu phải **đi qua một file**:

| | Float texture | PNG 8-bit ×2 |
|---|---|---|
| Byte mỗi toạ độ | 4 | 2 |
| Nén được không | không | có, rất tốt |
| Là file ảnh không | không | có |

Cả ngân sách ~600 KB cho 65k hạt sống nhờ việc PNG nén được. Tách hi/lo không phải trò khéo tay — nó là **cái giá phải trả để con số đi lọt qua một file ảnh**.

### 3. 65535, không phải 65536

Shader gốc của UntilLabs chia cho `65536.0` (qua đường vòng `uTextureSize - 1.` và `/ uParticleCount`, chỉ khớp vì texture tình cờ là 256²). Sai, dù rất nhẹ.

Hai byte biểu diễn được các giá trị **0 … 65535, bao gồm cả hai đầu**. Muốn `255,255` ánh xạ thành đúng `1.0` thì mẫu số phải là 65535:

```
65535 / 65535 = 1.0      ✓
65535 / 65536 = 0.999985 ✗ thiếu 15 phần triệu
```

15 ppm thì mắt không thấy. Nhưng nó không phải nhiễu ngẫu nhiên — nó là một phép **co toàn bộ đám mây về phía `min`**, có hệ thống. Và nghiêm trọng hơn: công thức của họ chỉ đúng khi texture là 256². Đổi sang 512² là vị trí sai hẳn. Research note §2.3 đã đánh dấu chỗ này; ta hard-code 255, 256, 65535.

### 4. PNG filter: vì sao file chỉ 26 KB

Bản đầu tiên tôi ghi PNG với filter 0 ("none") và `position_h.png` nặng **175 KB** trên tổng 196 KB dữ liệu thô — gần như không nén được gì.

Lý do: byte cao của x là một **dốc tăng đều** chạy ngang mỗi hàng (0, 0, 1, 1, 2, 2…). Deflate không giỏi với dốc.

PNG có sẵn lời giải: mỗi hàng quét được gắn một **filter**, thay mỗi byte bằng hiệu của nó với một byte lân cận (trái, trên, trung bình, hoặc Paeth). Một dốc đều trở thành một dãy hiệu **giống hệt nhau**, và deflate nuốt chửng nó.

| | filter 0 | filter thích ứng |
|---|---|---|
| `position_h.png` | 175 KB | **26 KB** |
| `position_l.png` | 186 KB | 92 KB |

Byte thấp vẫn to vì nó gần như là nhiễu — đúng như kỳ vọng, không nén nổi cái ngẫu nhiên.

Quan trọng: **filter của PNG là biến đổi thuận nghịch, không hề mất mát.** Chúng không phải thứ mà roadmap 8.2 cảnh báo. Cái 8.2 cấm là ghi dữ liệu qua **canvas**, vì canvas nhân sẵn alpha và quản lý màu — đó là mất mát thật.

### 5. Ba lần đọc texture trong vertex shader

Giờ mỗi hạt đọc ba texture: màu, byte cao, byte thấp. 65.536 hạt × 3 = gần 200.000 lượt đọc mỗi frame, chạy song song, và GPU không hề hấn gì.

## Đi qua code

### `apps/point-cloud/src/bundle/position-codec.ts` (mới)

Lượng tử hoá và tách byte:

```ts
const t = normalise(positions[i]!, bounds.min[axis]!, bounds.max[axis]!);
const quantised = Math.round(t * MAX_16_BIT);

high[i] = quantised >> 8;
low[i] = quantised & 0xff;
```

`Math.round` chứ không phải `Math.floor`: cắt cụt làm lệch **mọi** toạ độ về phía thấp nửa bước, và nửa bước nhân với 65.536 hạt là cả đám mây bị dịch đi.

Giải mã là đường ngược lại, và đây là bản CPU soi gương GLSL — 3.5 sẽ kiểm tra hai bên khớp nhau:

```ts
export function decode(high: number, low: number, min: number, max: number): number {
  const quantised = high * 256 + low;
  return min + (quantised / MAX_16_BIT) * (max - min);
}
```

### `apps/point-cloud/src/shaders/points.vert.glsl`

Dòng `z = 0.0` của 3.2 biến mất:

```glsl
vec3 high = texture2D(uPositionHigh, aParticleUv).rgb * 255.0;
vec3 low = texture2D(uPositionLow, aParticleUv).rgb * 255.0;
vec3 normalised = (high * 256.0 + low) / 65535.0;
vec3 home = mix(uBoundsMin, uBoundsMax, normalised);
```

`* 255.0` để đưa giá trị texture (0…1) về lại byte (0…255). Sai số float ở đây cỡ 1e-5, sau khi chia 65535 còn 4e-8 — không đáng kể, và 3.5 có test chứng minh điều đó.

### `apps/point-cloud/scripts/png.ts` (mới)

Bộ đọc/ghi PNG 8-bit, không phụ thuộc thư viện nào. Repo không có `sharp`, và quan trọng hơn: **dữ liệu không được đi qua canvas**. Cách duy nhất an toàn là tự lắp byte.

Phần chọn filter:

```ts
for (let filter = 0; filter <= 4; filter++) {
  // …tính hiệu theo filter này…
  // Treat the byte as signed: both 1 and 255 are a difference of one.
  score += value < 128 ? value : 256 - value;
}
```

Thử cả năm, giữ cái có tổng gần 0 nhất — đúng heuristic mà chính đặc tả PNG gợi ý.

### `apps/point-cloud/scripts/build-sample-bundle.ts` (mới)

Chạy bằng `bun run build:sample`. Đọc `color.png`, dựng vị trí, ghi ra hai PNG vị trí và `metadata.json`.

> ⚠️ **Độ sâu trong bundle này là placeholder, không phải đo đạc.** Depth thật đến từ model đơn ảnh chạy trong trình duyệt — đó là P6.2–6.3 và vẫn đang là quyết định bỏ ngỏ. Tạm thời `estimateDepth` dùng hai quy tắc hội hoạ cổ điển hợp với ảnh phong cảnh: **phối cảnh không khí** (càng xa càng sáng và càng bạc màu) và **mặt đất** (càng thấp trong khung càng gần). Nó đủ để đường giải mã có dữ liệu thật để nhai, và relief nông che được phần lớn sai số của nó.

```ts
const haze = luma * (1 - saturation);   // trời và núi mờ → xa
const far = 1 - rowFraction;            // đáy khung → gần
return 0.55 * haze + 0.45 * far;
```

Relief đặt ở 3% bề rộng. Research note §2.2 đo bản gốc chỉ **0.6%** — relief nông cộng FOV hẹp chính là bí quyết làm một bản đồ độ sâu không hoàn hảo vẫn trông như ảnh chụp thay vì như model 3D hỏng.

## Lỗi đã gặp

1. **Filter 0 làm bundle phình gấp 7 lần.** Tôi viết encoder với filter "none" và tự biện minh trong comment rằng "giữ nguyên byte là điều làm encoder an toàn cho dữ liệu". Sai cả về sự kiện lẫn lập luận: filter PNG là **thuận nghịch**, không mất mát, và cái 8.2 cấm là canvas chứ không phải filter. Đổi sang chọn filter thích ứng: `position_h.png` từ 175 KB xuống **26 KB**.
2. **Một dòng "thông minh" hỏng.** Trong lúc gom bước chọn filter tốt nhất, tôi viết `[best, candidate.set(best)] = [candidate.slice(), undefined as never]` — một phép destructuring có lời gọi hàm ở vế trái, tức là vô nghĩa. Thay bằng `best = candidate.slice()`. Bài học cũ: viết cho rõ trước, tối ưu sau.
3. **Test rơi đúng biên làm tròn.** Test "tăng một bước thì chỉ byte thấp đổi" lấy điểm gốc là giữa dải, mà giữa dải rơi vào `0.5 × 65535 = 32767.5` — đúng chỗ `Math.round` lưỡng lự, và sai số float đẩy nó về phía nào là tuỳ. Sửa bằng cách đặt điểm gốc lên đúng mức 12345, nơi không có nửa bước nào để mà làm tròn sai.
4. **Bản thân bước này không sinh ra độ sâu.** Đây là ghi chú thành thật, không phải lỗi: `position_*.png` trong repo mang một bản đồ độ sâu suy đoán. Đường ống giải mã thì thật và đã kiểm chứng; con số độ sâu thì chưa.

## Tự thử

1. **Tắt byte thấp.** Trong shader đổi `(high * 256.0 + low)` thành `(high * 256.0)`. Hạt sẽ nhảy về lưới 256 mức — nhìn kỹ mép cỏ và vai áo sẽ thấy bậc. Đó chính là bức ảnh nếu ta chỉ dùng một PNG.
2. **Dùng nhầm mẫu số.** Đổi `65535.0` thành `65536.0`. Sai lệch 15 ppm — bạn có thấy gì không? Rồi đổi `textureSize` sang 512 trong `build-sample-bundle.ts` và thử lại: sai số nào xuất hiện?
3. **Xem hình dạng của dữ liệu.** Mở `position_h.png` bằng trình xem ảnh. Kênh đỏ (x) là dốc ngang, kênh lục (y) là dốc dọc, kênh lam (z) là bản đồ độ sâu. Rồi mở `position_l.png` — vì sao nó trông như nhiễu tivi?
4. **Đổi relief.** Sửa `RELIEF` trong script thành `FIELD_WIDTH * 0.15`, chạy lại `bun run build:sample`, xoay camera. Quá nhiều độ nổi làm lộ ra điều gì về chất lượng bản đồ độ sâu?
5. **Đo lại kích thước file.** Đổi `filter` trong `png.ts` thành cố định 0, chạy lại script, so sánh `ls -la`. Rồi thử cố định filter 1 (Sub) — với dữ liệu này nó gần bằng bản thích ứng, vì sao?

## Đọc thêm

- [Đặc tả PNG — Filter Algorithms](https://www.w3.org/TR/png-3/#9Filters)
- [three.js — `Texture.colorSpace`](https://threejs.org/docs/#api/en/textures/Texture.colorSpace)
- [research/01-untillabs-method.md §2.3](../research/01-untillabs-method.md) — công thức gốc và cái quirk 256²
- [MDN — `TypedArray`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/TypedArray)
