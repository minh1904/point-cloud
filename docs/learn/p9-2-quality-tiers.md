# P9.2 · Chia tầng chất lượng, và một con bug dạy nhiều hơn cả bước này

## Mục tiêu

Máy yếu thì làm ít việc đi. Xong khi máy yếu vẫn chạy được mà không phải hỏi người dùng.

Bước này ngắn. Con bug nó gây ra thì đáng cả bài.

## Khái niệm

### 1. Pixel là phần đắt, không phải số hạt

Trực giác đầu tiên là "giảm số hạt". Sai thứ tự.

Một hạt được vẽ thành một sprite nhỏ, và chi phí của sprite là **diện tích** của nó. Ở `devicePixelRatio` 3 — một chiếc điện thoại bình thường — cùng đám mây phủ **gấp chín lần** số pixel so với dpr 1.

Một con số đó át tất cả những thứ khác renderer làm. Nên nó là cần gạt thứ nhất chứ không phải thứ cuối.

```tsx
<Canvas dpr={[1, profile.maxDpr]}>
```

`renderScale` của [P2.5](p2-5-render-scale.md) làm đúng việc đó và **cố tình không bị đụng tới**: nó thuộc về người dùng công cụ. Cái này là sàn nằm dưới nó.

### 2. Octave fBM: một `#define`, không phải một `if`

Cần gạt thứ hai là số octave của fBM ([P4.1](p4-1-value-noise-fbm.md)). Bốn octave là cái nhìn đã chỉnh; hai thì mềm hơn thấy rõ.

GLSL ES 1.00 **không cho vòng lặp có biên là biến**, nên không thể viết `for (i < uOctaves)`. Và kể cả có `break` thì cũng chẳng tiết kiệm gì nếu GPU vẫn chạy mọi nhánh.

Cách đúng là **hằng số lúc biên dịch**:

```glsl
#ifndef PC_FBM_OCTAVES
#define PC_FBM_OCTAVES 4
#endif
```

three.js chèn `defines` của material lên **trên mọi include**, nên chỉ cần:

```tsx
defines: { PC_FBM_OCTAVES: octaves }
```

Chi phí là **một lần biên dịch lại shader** khi tier đổi — một sự kiện, không phải mỗi frame. Và cái `#ifndef` bảo vệ component drop-in của [P8.6](p8-6-component-drop-in.md), vốn ship chunk mà không có define nào.

### 3. Đoán, chứ không đo

Đo frame rate rồi tự điều chỉnh thì chính xác hơn và **dùng khó chịu hơn nhiều**: bức ảnh sẽ đổi ngay dưới mắt người xem, và vài giây đầu tiên — tức phần intro, phần dễ bị quay video nhất — lại là phần được render tệ nhất.

Một lần đoán, có thể ghi đè trong inspector, là đánh đổi tốt hơn.

```ts
const cores = navigator.hardwareConcurrency ?? 4;
const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
const coarse = window.matchMedia("(pointer: coarse)").matches;

if (coarse && (cores <= 4 || memory <= 4)) return "low";
if (coarse || cores <= 4 || memory <= 4) return "medium";
return "high";
```

Mỗi tín hiệu đều là proxy và mỗi cái đều nói dối đôi lúc: một chiếc tablet tám nhân cũng báo `pointer: coarse`, một laptop cảm ứng cũng vậy, và `deviceMemory` chỉ có trên Chromium và bị làm tròn về luỹ thừa của 2.

Để ý **hai giá trị mặc định ngược chiều nhau**, và đó là chủ ý:

- `deviceMemory ?? 8` — **rộng rãi**, vì Firefox và Safari không báo, và phạt mọi người dùng hai trình duyệt đó là sai.
- `hardwareConcurrency ?? 4` — **dè dặt**, vì thiếu nó nghĩa là trình duyệt rất cũ.

Và thứ **không** được dùng: chuỗi user agent. Nó là tín hiệu duy nhất đã bị nói dối có chủ đích suốt ba mươi năm.

### 4. Không đoán trong lúc render

`navigator` không tồn tại trên server, và một tier đoán lúc render sẽ không sống sót qua hydration ([P7.5](p7-5-presets.md) đã gặp đúng lớp lỗi này với `localStorage`).

Nên tier được phát hiện **trong một effect**, cất vào session store, và mọi nơi đọc từ đó. Trước khi effect chạy, giá trị là `null` và `resolveProfile` trả về `medium` — không phải `high`, để một máy yếu không phải trả giá đầy đủ dù chỉ một frame.

## Con bug: 65.536 hạt chồng lên một chấm

Phần đáng học nhất của bước này không nằm trong thiết kế mà trong hậu quả của nó.

Ngay sau khi thêm `defines`, viewport thành đen. Bật `Show noise field` và kéo `Size` lên hết cỡ mới thấy sự thật: **một đĩa trắng duy nhất ở giữa màn hình**. Mọi hạt đang ở cùng một chỗ.

### Suy luận

- HUD vẫn báo `65,536 points` → draw call vẫn chạy với đủ vertex.
- Đĩa nằm **đúng tâm** → `home` ≈ (0,0,0) cho mọi hạt.
- Nếu texture vị trí là null, three thay bằng texture trắng → `normalised = 1` → `home = uBoundsMax` → đĩa sẽ ở **góc trên phải**, không phải tâm.
- `home = 0` với `mix(min, max, n)` xảy ra khi **`uBoundsMin` và `uBoundsMax` đều bằng 0**.

### Nguyên nhân

```tsx
const materialArgs = useMemo(() => [{ ..., defines: { PC_FBM_OCTAVES: octaves } }], [octaves]);
```

`octaves` đổi (từ mặc định sang tier vừa phát hiện) → `materialArgs` đổi identity → **R3F dựng lại material**. Material mới có `uBoundsMin: { value: new Vector3() }` — tức (0,0,0).

Còn effect ghi bounds thì:

```tsx
useEffect(() => { /* ghi bounds, textures */ }, [bundle]);
```

`bundle` **không đổi**, nên effect **không chạy lại**. Material mới không bao giờ được nói cho biết đám mây nằm ở đâu.

### Bài học

> Một effect gắn với *dữ liệu* sẽ lệch pha khi *thứ nhận dữ liệu* bị thay mà dữ liệu thì không.

Cách sửa là chuyển việc ghi uniform của bundle vào frame loop, cạnh mọi uniform khác:

```tsx
current.uniforms.uColorMap!.value = bundle.color;
(current.uniforms.uBoundsMin!.value as Vector3).fromArray(bundle.metadata.bounds.min);
```

Bình luận trong code cũ nói "chúng đến cùng dữ liệu và chỉ đổi khi dữ liệu đổi, nên effect là chỗ đúng". Lý lẽ đó **nghe vẫn hợp lý và vẫn sai**, vì nó bỏ qua vế thứ hai: material cũng có vòng đời riêng. Frame loop là chỗ duy nhất không thể lệch pha với material nào đang hiện hành.

Đây cũng là một lập luận nữa cho [P7.3](p7-3-store-to-uniform.md): đọc mọi thứ trong frame loop không chỉ nhanh hơn, nó còn **ít trạng thái ngầm hơn**.

## Đi qua code

### `apps/point-cloud/src/scene/quality.ts` (mới)

Ba profile, mỗi cái kèm một dòng `note` hiện trong inspector — để lựa chọn không vô hình.

### `apps/point-cloud/src/scene/quality.test.ts` (mới)

Test giả lập từng loại máy bằng `vi.stubGlobal`, kể cả trường hợp trình duyệt im lặng:

```ts
it("does not punish Firefox and Safari for hiding deviceMemory", () => {
  vi.stubGlobal("navigator", { hardwareConcurrency: 12 });
  // …
  expect(detectTier()).toBe("high");
});
```

Lần đầu viết, test này tên là "assumes the middle" và assert `high`. Nó đỏ — và **tên test sai, không phải code sai**. Đọc lại mới thấy hai giá trị mặc định cố ý ngược chiều nhau, nên tách thành hai test nói đúng điều đó.

## Tự thử

1. **Ép tier thấp.** Bấm `Quality:` cho tới `low` và nhìn kỹ nền trời — mềm hơn thấy được không? Status bar đổi thế nào?
2. **Xem shader biên dịch lại.** Mở DevTools → Performance, ghi trong lúc đổi Quality. Tìm cái spike.
3. **Giả làm điện thoại.** DevTools → Device toolbar → chọn một iPhone → reload. Status bar báo `auto:` gì?
4. **Tái tạo con bug.** Đưa phần ghi uniform của bundle về lại một `useEffect` phụ thuộc `[bundle]`, rồi đổi Quality. Bạn có tự chẩn đoán ra không nếu chưa đọc bài này?
5. **Đo cần gạt thứ nhất.** Ở `high`, ghi lại fps. Rồi `low`. Rồi quay lại `high` và kéo `Scale` xuống 50%. Cái nào ảnh hưởng nhiều hơn?

## Đọc thêm

- [MDN — `Navigator.hardwareConcurrency`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/hardwareConcurrency)
- [MDN — `Navigator.deviceMemory`](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/deviceMemory)
- [MDN — `pointer` media feature](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/pointer)
- [three.js — `Material.defines`](https://threejs.org/docs/#api/en/materials/ShaderMaterial)
