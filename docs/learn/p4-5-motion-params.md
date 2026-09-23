# P4.5 · Biến chuyển động thành núm vặn

## Mục tiêu

Bốn bước trước cài chuyển động bằng các hằng số nằm rải rác trong shader. Bước này kéo chúng ra thành **uniform**, nối vào panel **Motion**, và kết thúc Phase 4.

Nghe như việc lặt vặt. Nhưng đây là bước đầu tiên dự án cư xử như một **công cụ** chứ không phải một demo — và roadmap đặt nó ở đây có lý do: sang P7, đúng những tham số này sẽ được điều khiển bởi một schema duy nhất sinh ra cả UI, cả uniform, cả preset lẫn dữ liệu export.

## Khái niệm

### 1. Hằng số nào nên thành núm, hằng số nào không

Shader sau P4.4 có rất nhiều con số. Không phải con số nào cũng xứng đáng lên UI:

| Con số | Thành uniform? | Vì sao |
|---|---|---|
| Biên độ curl | ✅ | Thay đổi cảm giác của cả cảnh |
| Tần số noise | ✅ | Gợn lớn hay gợn nhỏ — lựa chọn thẩm mỹ |
| Scatter | ✅ | Ranh giới giữa "tấm vải" và "lấp lánh" |
| Biên độ thở | ✅ | Bao nhiêu chiều sâu là vừa, tuỳ ảnh |
| Hệ số thời gian | ✅ | Cần cho cả Pause |
| `0.12` (tốc độ trôi trường) | ❌ | Đã có Speed; hai núm cùng điều khiển thời gian là bẫy |
| `0.25` / `0.5` (tần số sin) | ❌ | Quan hệ giữa chúng mới quan trọng, không phải giá trị tuyệt đối |
| `3.2` / `1.2` (ngưỡng gần) | ❌ | Thuộc về tỉ lệ cảnh, không phải gu thẩm mỹ |
| `0.08` (epsilon của curl) | ❌ | Chi tiết cài đặt; vặn sai thì chỉ hỏng |
| 4 octave | ❌ | Đòn bẩy hiệu năng, thuộc về P9.2 |

Nguyên tắc: **núm vặn là để chọn, không phải để cấu hình.** Con số chỉ có một giá trị đúng thì không phải núm — nó là hằng số có comment.

### 2. Đơn vị của một núm phải có nghĩa

`noiseAmplitude` đo bằng **đơn vị NDC** (màn hình rộng 2 đơn vị), nhờ quyết định clip space của [P4.3](p4-3-clip-space-offset.md). Nên 0.012 nghĩa là "khoảng 0.6% chiều rộng màn hình" — một câu có nghĩa.

So với phương án cộng trong world space: cùng con số ấy sẽ mang nghĩa khác nhau tuỳ camera đang đứng đâu. Núm vặn mà ý nghĩa trôi theo trạng thái khác thì không dùng được.

`breathe` đo bằng **đơn vị thế giới**, và điều đó cũng đúng: nó là chuyện của đám mây (relief dày 0.081), không phải của màn hình.

### 3. Dải và bước nhảy cũng là thiết kế

| Núm | Dải | Bước | Vì sao |
|---|---|---|---|
| Amplitude | 0 – 0.15 | 0.001 | Trên 0.05 ảnh đã rã; để rộng cho thấy rõ |
| Frequency | 0.2 – 12 | 0.1 | Dưới 0.2 là gần như phẳng, trên 12 là nhiễu |
| Scatter | 0 – 4 | 0.05 | Cả hai thái cực đều đáng xem |
| Breathe | 0 – 0.08 | 0.001 | Relief chỉ 0.081, nên đây đã là hết cỡ |
| Speed | 0 – 3 | 0.1 | 0 để đóng băng và ngắm kỹ |

Sai lầm hay gặp là để dải quá rộng "cho chắc". Slider có chừng 200 pixel; dải rộng gấp mười lần vùng hữu ích nghĩa là vùng hữu ích chỉ còn 20 pixel, và núm trở nên vô dụng. Chính lỗi này đã xảy ra ở [P3.2](p3-2-color-texture.md) với slider Drift, phải sửa dải từ 0.3 xuống 0.1.

### 4. Speed vẫn nằm ở phía CPU

```tsx
material.current.uniforms.uTime!.value += delta * speed;
```

Thời gian được cộng dồn trên CPU rồi mới đẩy lên, chứ không phải nhân `uTime * speed` trong shader. Lý do đã ghi từ [P1.5](p1-5-gpu-drift.md): nhân trong shader thì đổi tốc độ sẽ **nhảy** mọi hạt sang pha khác, còn cộng dồn thì chuyển động **uốn** mượt sang nhịp mới.

Và Pause chỉ là ngừng cộng — không cần cờ riêng trong shader.

### 5. Debug view dùng Button thay cho Toggle

Bảng P-UI của roadmap ghi `Toggle` thuộc nhóm "cần cho P4–P5". Bước này cần một công tắc bật/tắt trường noise, nhưng dùng `Button` có sẵn với `variant` đổi theo trạng thái:

```tsx
<Button variant={params.debugNoise ? "outline" : "ghost-muted"} …>
  {params.debugNoise ? "Showing noise field" : "Show noise field"}
</Button>
```

Đúng luật "không có component nếu chưa có người dùng": một công tắc chưa đủ để biện minh cho một component mới với story và test riêng. Khi P5 cần cái thứ hai và thứ ba thì `Toggle` mới xứng đáng ra đời.

### 6. Nhắc lại: không có trạng thái nào cả

Panel Motion có năm núm, và **không núm nào cần khởi động lại cái gì**. Kéo Frequency giữa chừng thì trường đổi ngay ở frame sau; không có vận tốc tích luỹ để làm mới, không có bộ đệm mô phỏng để xoá.

Đó là món quà của thiết kế stateless ở [P4.2](p4-2-curl-noise.md). Chuyển động dựa trên mô phỏng sẽ phải quyết định xem đổi tham số giữa chừng thì làm gì với trạng thái đang có — và mọi câu trả lời đều xấu.

Nó cũng là điều làm cho P7.4 (undo/redo) và P7.5 (preset) trở nên dễ: một preset chỉ là năm con số.

## Đi qua code

### `apps/point-cloud/src/scene/particle-field.tsx`

```tsx
export interface ParticleParams {
  size: number;
  softness: number;
  noiseAmplitude: number;
  noiseFrequency: number;
  noiseScatter: number;
  breathe: number;
  speed: number;
  debugNoise: boolean;
}
```

`driftAmplitude` và `driftSpeed` của P1.5 biến mất — curl noise thay thế hẳn chúng.

### `apps/point-cloud/src/app/studio.tsx`

`setParticle` trước đây nhận `keyof ParticleParams`, nhưng giờ có một trường boolean nên phải lọc:

```tsx
type NumericParticleParam = {
  [K in keyof ParticleParams]: ParticleParams[K] extends number ? K : never;
}[keyof ParticleParams];
```

Một mapped type nhỏ chỉ giữ lại các khoá có giá trị `number`. Nhờ vậy `setParticle("debugNoise")` là lỗi biên dịch chứ không phải bug lúc chạy.

## Lỗi đã gặp

1. **Hai núm cùng điều khiển thời gian.** Bản nháp có cả `uNoiseSpeed` (tốc độ trôi trường trong shader) lẫn `speed` (hệ số thời gian trên CPU). Cả hai làm "chuyển động nhanh hơn", nhưng theo cách hơi khác nhau, và không có cách nào giải thích sự khác biệt ấy trên một cái nhãn slider. Bỏ `uNoiseSpeed`, để hằng số `0.12` trong shader.
2. **`keyof ParticleParams` hỏng ngay khi có trường boolean.** `setParticle` nhận `(value: number)`, nên thêm `debugNoise: boolean` làm TypeScript báo lỗi ở `setParams`. Cám dỗ là ép kiểu cho xong; đúng hơn là thu hẹp kiểu khoá. Đây chính là lớp lỗi mà schema tham số của P7.2 sẽ xử lý tận gốc.
3. **Giá trị mặc định chọn trên lý thuyết, sửa lại bằng mắt.** Lần đầu đặt amplitude 0.02 và scatter 0.6 vì "nghe hợp lý". Nhìn màn hình thì ảnh rã ra và debug view thành confetti. Hạ xuống 0.012 và 0.15. Không có cách nào chọn đúng mấy con số này ngoài việc nhìn.

## Tự thử

1. **Dựng một preset.** Tìm bộ năm giá trị cho cảm giác "gió rất nhẹ" và một bộ cho "bão tuyết". Ghi lại — P7.5 sẽ lưu chúng thật.
2. **Đặt Speed về 0** rồi vặn Frequency. Đóng băng thời gian làm hình dạng của trường dễ đọc hẳn. Vì sao đây là cách tốt nhất để hiểu một tham số noise?
3. **Đưa một hằng số lên UI.** Chọn `0.25` (tần số thở) trong shader, biến nó thành uniform và thêm slider. Vặn thử một lúc — bạn có giữ nó lại không? Bảng ở mục 1 nói gì về nó?
4. **Phá dải slider.** Đổi `max` của Amplitude thành 5. Vặn thử. Slider giờ dùng được không? Đây chính là lỗi đã xảy ra thật ở P3.2.
5. **Kiểm tra tính stateless.** Vặn qua lại thật nhanh cả năm núm trong vài giây, rồi bấm Reset. Cảnh có trở về **chính xác** như lúc đầu không (trừ thời gian đã trôi)? Với một hệ mô phỏng thì câu trả lời sẽ là không.

## Đọc thêm

- [research/01-untillabs-method.md §3](../research/01-untillabs-method.md) — bản gốc phơi tham số nào ra Leva
- [TypeScript — Mapped Types](https://www.typescriptlang.org/docs/handbook/2/mapped-types.html)
- [Bret Victor — Inventing on Principle](https://vimeo.com/36579366) — vì sao thấy ngay kết quả lại đổi cách ta làm việc
