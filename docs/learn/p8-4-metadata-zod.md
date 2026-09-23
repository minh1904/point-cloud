# P8.4 · `metadata.json` v1, và khi nào thì đáng dùng một thư viện

## Mục tiêu

Một schema có đánh số phiên bản, kiểm tra lúc nhập, báo lỗi nói rõ trường nào sai.

Bước này ngắn, và điều đáng học không phải cú pháp zod mà là **thời điểm** một bộ kiểm tra viết tay không còn đủ.

## Khái niệm

### 1. Mô hình đe doạ đổi, nên công cụ đổi theo

Từ P3.4 tới hết P7, thứ duy nhất từng tạo ra `metadata.json` là chính repo này. Một bộ kiểm tra viết tay là **cân xứng** với rủi ro:

```ts
if (typeof raw.version !== "number") throw new TypeError("metadata.version must be a number");
if (typeof raw.width !== "number" || typeof raw.height !== "number") { … }
// …mười dòng nữa
```

[P8.5](p8-5-nhap-lai-bundle.md) đổi hẳn mô hình đe doạ: file tới trong một cái zip mà **người khác có thể đã sửa**, và nó là mô tả **duy nhất** về ý nghĩa của ba tấm PNG.

Và hậu quả của việc bỏ lọt thì im lặng: một `bounds` hỏng không ném lỗi, nó đặt mọi hạt ở NaN — mà một đám mây không vẽ ra gì trông y hệt cả tá bug khác.

Đó là chỗ một thư viện schema trả tiền vé: nó biến lỗi thành **một câu có tên trường trong đó**.

> Bài học khái quát: chọn công cụ theo *ai sinh ra dữ liệu*, không theo *dữ liệu trông thế nào*. Cùng một object, do code của ta sinh ra, chỉ cần `interface`; do người lạ sinh ra thì cần một parser.

### 2. Kiểm liên trường mới là phần khó

Kiểu của từng trường là phần dễ. Những cách một file có thể **nhất quán như JSON mà vô nghĩa như bundle** mới là phần đáng viết:

```ts
.refine((v) => v.width === v.height, {
  message: "the data texture must be square",
  path: ["height"],
})
.refine((v) => v.particleCount === v.width * v.height, {
  message: "particleCount must equal width * height — one particle per texel",
  path: ["particleCount"],
})
.refine((v) => [0, 1, 2].every((axis) => v.bounds.max[axis]! > v.bounds.min[axis]!), {
  message: "bounds is empty on at least one axis: decoding would divide by zero",
  path: ["bounds"],
})
```

Ba luật, ba cách chết khác nhau:

- không vuông → renderer vẽ sai số vertex
- `particleCount` lệch → có texel không ai đọc, hoặc có hạt không có dữ liệu
- `bounds` rỗng trên một trục → `(max - min)` bằng 0 → chia cho 0 → NaN

`path` là thứ biến thông báo lỗi thành thứ dùng được. Không có nó, người nhận được câu "validation failed" và một cái zip 680 KB.

### 3. `.default()` là cách một schema lớn lên

```ts
precision: z.number().int().positive().default(16),
```

Một bundle viết trước khi `precision` tồn tại không có trường đó. Với `.default()`, nó vẫn nạp được và nhận 16. Không có `.default()`, mọi bản xuất cũ chết.

Đây là cùng một ý với `sanitiseValues` ở [P7.2](p7-2-param-schema.md): **điền phần thiếu, bỏ phần thừa**, và schema được phép tiếp tục thay đổi.

### 4. `z.literal(1)` — vì sao version không phải `z.number()`

```ts
version: z.literal(1),
```

Nếu khai `z.number()` thì một file ghi `"version": 2` sẽ đi qua bộ kiểm và rồi hỏng ở một chỗ khó hiểu hơn nhiều. Với `literal`, thông báo là "version — invalid literal", nghĩa là "bản này tôi không đọc được", đó đúng là sự thật.

Khi có v2, hàm `parseBundleMetadata` **mọc thêm một nhánh**: thử v2 trước, không thì thử v1 rồi chuyển đổi. Nó không bị viết lại.

### 5. Chép ra, đừng cho mượn

```ts
return {
  ...parsed,
  bounds: {
    min: [...parsed.bounds.min] as [number, number, number],
    max: [...parsed.bounds.max] as [number, number, number],
  },
};
```

zod trả về dữ liệu đã kiểm, nhưng với `.tuple()` nó vẫn là mảng tham chiếu tới cùng bộ nhớ đầu vào. Sao chép ra làm hai việc: đổi kiểu `[number, number, number]` cho khớp `Bounds`, và cắt đứt mối liên hệ với object mà người gọi có thể còn giữ. Có một test cho đúng chuyện đó.

## Đi qua code

### `apps/point-cloud/src/bundle/metadata.ts`

Đổi hẳn từ kiểm tay sang zod, giữ nguyên phần JSDoc giải thích **vì sao** `bounds` nằm trong metadata chứ không bake vào pixel — lý do ấy không đổi từ P3.4.

### `apps/point-cloud/src/bundle/metadata.test.ts` (mới)

Loại test đáng chú ý là loại kiểm **thông báo lỗi**, không chỉ kiểm có ném hay không:

```ts
it("names the field that is wrong", () => {
  expect(() => parseBundleMetadata({ ...valid, width: 0 })).toThrow(/width/);
  expect(() => parseBundleMetadata({ ...valid, height: 128 })).toThrow(/height/);
  expect(() => parseBundleMetadata({ ...valid, particleCount: 10 })).toThrow(/particleCount/);
});
```

Nếu thông báo lỗi là lý do dùng thư viện, thì thông báo lỗi là thứ phải được test.

## Lỗi đã gặp

1. **Thêm một dependency cho một file 80 dòng nghe như thừa** — và suýt bỏ qua. Thứ làm đổi ý là câu hỏi "ai sẽ viết file này?". Câu trả lời đổi ở P8.5.
2. **`z.tuple` trả về mảng chia sẻ bộ nhớ.** Phát hiện lúc viết test `structuredClone` rồi sửa đầu vào.
3. **Suýt dùng `z.number()` cho version** vì nó "là một số". Nó không phải một số, nó là một cái tên.

## Tự thử

1. **Làm hỏng một bundle.** Giải nén một bản xuất, sửa `"width": 256` thành `255` trong `metadata.json`, zip lại, thả vào panel Export. Thông báo nói gì?
2. **Xoá `bounds`** khỏi file rồi thử lại. Rồi đổi nó thành `{"min": [0,0], "max": [1,1,1]}`.
3. **Bỏ `.default(16)`** khỏi `precision` rồi nạp một bundle không có trường đó. Lỗi gì?
4. **Viết nhánh v2.** Thêm `z.literal(2)` với một trường mới, rồi sửa `parseBundleMetadata` chấp nhận cả hai. Bao nhiêu dòng?
5. **So chi phí.** `bun run build` rồi xem kích thước bundle JS trước và sau khi thêm zod. Đáng không?

## Đọc thêm

- [zod — tài liệu](https://zod.dev/)
- [Đặc tả bundle format của dự án](../bundle-format.md)
- [P3.4 · Bounds và `metadata.json`](p3-4-bounds-va-metadata.md)
- [P7.2 · Khai báo mỗi núm vặn đúng một lần](p7-2-param-schema.md) — `sanitiseValues` cùng một ý
