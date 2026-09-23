# P3.5 · Test cho decoder

## Mục tiêu

Shader là hộp đen. Không `console.log` được, không đặt breakpoint được, không kiểm tra được giá trị trung gian. Giải mã sai một chút thì triệu chứng là "hình hơi kỳ kỳ" — và bạn sẽ đi tìm lỗi ở camera, ở bounds, ở texture, ở mọi chỗ trừ chỗ sai.

Bước này viết **đúng phép toán đó bằng TypeScript**, rồi test nó.

Và phần ăn tiền: bản TS ấy không chỉ để test. Nó **chính là encoder mà P8.2 cần** để xuất bundle. Viết 3.5 là viết sẵn một nửa của P8 — nửa ghi — trong lúc đang kiểm chứng nửa đọc.

Kết quả: 43 test chạy qua, trong đó 22 test mới cho `position-codec` và `png`.

## Khái niệm

### 1. Vì sao bản soi gương trên CPU lại đáng tin

Nghe có vẻ vòng vo: viết lại đúng một công thức lần thứ hai thì chứng minh được gì? Nếu chép sai cả hai bên thì test vẫn xanh.

Đúng, nhưng nó bắt được đúng loại lỗi hay xảy ra nhất ở đây:

| Loại lỗi | Test có bắt được không |
|---|---|
| Chia 65536 thay vì 65535 | ✅ có test riêng cho đúng chỗ này |
| `floor` thay vì `round` khi lượng tử hoá | ✅ sai số vượt nửa bước |
| Đảo hi/lo | ✅ round-trip lệch hẳn |
| Bounds ngược hoặc suy biến | ✅ có test |
| Sai số float32 của GPU | ✅ mô phỏng được bằng `Math.fround` |
| Hiểu sai *ý nghĩa* của format | ❌ không |

Bốn dòng đầu là nơi bug thật sự sống. Dòng cuối thì không test nào cứu được — đó là việc của [research note](../research/01-untillabs-method.md).

### 2. Sai số phải chặn bằng con số, không bằng cảm giác

Test round-trip yếu là kiểu "mã hoá rồi giải mã ra gần giống". Gần là bao nhiêu?

Lượng tử hoá có sai số **biết trước**: làm tròn về mức gần nhất nên lệch tối đa **nửa bước**.

```ts
const step = quantisationStep(BOUNDS.min[axis]!, BOUNDS.max[axis]!);
expect(Math.abs(decoded[i]! - positions[i]!)).toBeLessThanOrEqual(step * 0.5 + 1e-7);
```

Chặn bằng nửa bước, không phải bằng một hằng số tự nghĩ ra. Nếu ai đó đổi `round` thành `floor`, sai số thành cả bước và test đỏ ngay.

### 3. Mô phỏng số học của GPU bằng `Math.fround`

Shader không làm toán như JavaScript. JS dùng float64; GLSL dùng float32. Và shader đi một đường vòng lạ: texture trả về `byte / 255` dưới dạng float, rồi shader nhân ngược lại `* 255.0`.

`byte / 255` **không biểu diễn chính xác được** bằng float32. Vậy đường vòng đó có sống sót không?

`Math.fround` cho câu trả lời — nó làm tròn một số về float32 gần nhất:

```ts
function decodeLikeGlsl(high: number, low: number, min: number, max: number): number {
  const hi = Math.fround(Math.fround(high / 255) * 255);
  const lo = Math.fround(Math.fround(low / 255) * 255);
  const n = Math.fround((hi * 256 + lo) / MAX_16_BIT);
  return min + n * (max - min);
}
```

Test chạy qua 256 mức rải đều và đòi hai bên lệch nhau **dưới 1% một bước lượng tử**. Nhờ vậy dòng `* 255.0` trong shader không còn là niềm tin, nó là điều đã kiểm.

### 4. Test byte-exact cho PNG

Với codec vị trí, "gần đúng" là chấp nhận được. Với PNG thì không — **phải đúng từng byte**, vì đó là toàn bộ lý do tự viết encoder thay vì dùng canvas.

Dữ liệu test được chọn có chủ đích:

```ts
const image = { width: 64, height: 64, channels: 3 as const, data: noise(64 * 64 * 3, 7) };
```

Nhiễu, không phải ảnh. Byte thấp của toạ độ 16-bit gần như là nhiễu, và nhiễu là thứ tàn nhẫn nhất với một encoder: nếu có bất kỳ chỗ nào làm tròn, nhân alpha hay quản lý màu, nó lộ ra ngay. Ảnh gradient đẹp đẽ có thể che giấu khuyết tật.

Có thêm một test đòi bản mã hoá của dốc toạ độ **nhỏ hơn 1/20 dữ liệu thô** — biến "filter làm file nhỏ đi" (xem [P3.3](p3-3-16-bit-positions.md)) thành một điều kiện có thể hỏng.

### 5. Test cũng là nơi ghi lại tri thức

Vài test ở đây không bảo vệ chống hồi quy mà **ghi lại một kết luận**:

```ts
it("falls short of it with the original shader's 65536", () => {
  const original = (0 * 1) + ((255 * 256 + 255) / 65536) * 100;
  expect(original).toBeLessThan(100);
  expect(100 - original).toBeCloseTo(100 / 65536, 10);
});
```

Test này không bảo vệ code của ta — nó chứng minh rằng công thức của UntilLabs sai, và sai đúng bao nhiêu. Sáu tháng nữa, khi ai đó (có thể là chính mình) nhìn thấy `65535.0` trong shader và định "sửa" cho khớp bản gốc, test này trả lời hộ.

## Đi qua code

### `apps/point-cloud/src/bundle/position-codec.test.ts` (mới, 13 test)

Chia theo bốn nhóm: `computeBounds`, round-trip, phép tách 16-bit, và mẫu số 65535 vs 65536, cộng nhóm cuối mô phỏng GLSL.

Test tôi thích nhất là test nói rõ **vì sao phải tồn tại 16-bit**:

```ts
it("resolves detail that a single byte would flatten", () => {
  const spacing = 3 / 256;
  const positions = new Float32Array([0, 0, 0, spacing / 3, 0, 0]);

  const eightBit = positions.map(/* lượng tử hoá 8-bit */);
  expect(eightBit[0]).toBe(eightBit[3]); // hai hạt dồn vào cùng một mức

  const { high, low } = encodePositions(positions, BOUNDS);
  expect([high[0], low[0]]).not.toEqual([high[3], low[3]]);
});
```

Hai hạt cách nhau một phần ba ô lưới. Với 8 bit chúng **biến thành một**. Với 16 bit chúng vẫn là hai. Cả bước 3.3 gói gọn trong một assertion.

### `apps/point-cloud/scripts/png.test.ts` (mới, 6 test)

Round-trip RGB và RGBA, ảnh một hàng (trường hợp biên không có hàng phía trên cho filter tham chiếu), dốc toạ độ phải nén tốt, và hai test từ chối đầu vào hỏng.

Test một hàng nhỏ mà đáng: filter Up và Paeth đọc hàng phía trên, mà hàng 0 thì không có. Code coi như toàn số 0 — đúng theo đặc tả, và dễ viết sai.

### Chạy

```bash
bun run test          # 43 test
bun x vitest run src/bundle
```

Test `scripts/` chạy được vì `vitest.config.ts` khai báo `projects: ["apps/*", "packages/*"]` và mặc định quét mọi `*.test.ts` trong project, không chỉ trong `src/`.

## Lỗi đã gặp

1. **Test rơi đúng biên làm tròn.** Test "tăng một bước thì chỉ byte thấp đổi" lấy gốc ở giữa dải, mà giữa dải là `0.5 × 65535 = 32767.5` — đúng chỗ `Math.round` lưỡng lự, và float64 quyết định hộ theo hướng không đoán được. Đỏ ngay lần chạy đầu. Sửa bằng cách đặt gốc lên đúng mức 12345, nơi không có nửa bước nào. Bài học: **đừng chọn dữ liệu test rơi vào biên của chính phép toán mình đang test** — trừ khi biên đó mới là thứ cần test, và khi đó hãy test nó một cách tường minh.
2. **`toBeCloseTo` không như mình tưởng.** Viết `expect(100 - original).toBeCloseTo(0.00152, 5)` và nó đỏ: giá trị thật là `0.00152587890625`, còn `5` chữ số nghĩa là sai lệch phải dưới `0.5e-5`, mà lệch thật là `5.9e-6`. Thay bằng biểu thức chính xác `100 / 65536` với 10 chữ số. Chép một con số từ màn hình vào test là cách tốt để test trở nên mong manh; viết ra công thức sinh ra nó thì không.
3. **Hai lỗi này đều là của test, không phải của code.** Đáng ghi lại: lần chạy đầu tiên đỏ 2/13, và cả hai đều do test viết ẩu. Khi một test mới đỏ, khả năng nó sai cũng cao ngang code.

## Tự thử

1. **Phá decoder rồi xem test nào đỏ.** Trong `position-codec.ts` đổi `Math.round` thành `Math.floor`. Đoán trước test nào đỏ rồi chạy. Sau đó đổi `MAX_16_BIT` thành 65536 — lần này test nào?
2. **Phá encoder PNG.** Trong `png.ts` ép `bestFilter` luôn bằng 2 (Up). Test round-trip vẫn xanh — vì sao? Test nào bắt được?
3. **Thêm test cho một thứ chưa được bảo vệ.** Hiện chưa có test nào kiểm rằng byte **cao** ứng với chữ số lớn. Viết một test làm nó hỏng nếu ai đó đảo `high` và `low` khi ghi file.
4. **Đo sai số thật.** Viết một script nhỏ: mã hoá rồi giải mã 65.536 vị trí thật của bundle, in ra sai số lớn nhất và trung bình. So với `quantisationStep` — có khớp lý thuyết không?
5. **Thử `Math.fround`.** Trong console: `Math.fround(128/255) * 255`. Kết quả có đúng bằng 128 không? Lệch bao nhiêu, và vì sao lệch đó không quan trọng sau khi chia cho 65535?

## Đọc thêm

- [Vitest — `expect`](https://vitest.dev/api/expect.html)
- [MDN — `Math.fround`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Math/fround)
- [Đặc tả PNG — Filter Algorithms](https://www.w3.org/TR/png-3/#9Filters)
- [The Book of Shaders](https://thebookofshaders.com/) — vì sao shader khó debug đến thế
