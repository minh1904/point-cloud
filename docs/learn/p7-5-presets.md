# P7.5 · Preset, và cái bẫy hydration của `localStorage`

## Mục tiêu

Lưu một bộ giá trị, đặt tên, nạp lại sau. Kèm vài look dựng sẵn. Và quan trọng nhất: **sống sót qua reload**.

Phần preset thì dễ — một preset chỉ là một bộ giá trị, tức là đúng thứ `setAll` nhận. Phần đáng học là hai cái bẫy của việc lưu trữ trong một app có server-side rendering.

## Khái niệm

### 1. Preset viết dưới dạng **một phần**, nạp dưới dạng đầy đủ

```ts
preset("Dream", {
  focalRange: 0.18,
  edgeBokeh: 0.8,
  grade: "cool",
  noiseAmplitude: 0.045,
  // …
})
```

Điều thú vị của một look là **nhúm con số nó đổi**, không phải mười tám con số nó để yên. Viết đầy đủ thì không đọc được, và tệ hơn: mỗi lần schema đổi default, mọi preset dựng sẵn sẽ âm thầm giữ giá trị cũ.

`sanitiseValues` điền phần còn lại từ schema, nên một preset viết hôm nay vẫn nạp được sau khi schema lớn lên. Cùng một hàm bảo vệ dữ liệu người dùng ở [P7.2](p7-2-param-schema.md) cũng làm việc này.

### 2. Cái bẫy hydration

Trang này được render ở server. `localStorage` **không tồn tại** ở đó.

Nếu đọc nó trong lúc render:

- Server dựng HTML với giá trị mặc định.
- Trình duyệt dựng lại với giá trị đã lưu.
- React thấy hai cây khác nhau và báo hydration mismatch.

Đúng cùng một lớp lỗi với `Date.now()` hay `Math.random()` trong component: bất cứ thứ gì server không thể biết.

Cách giải là **không đọc gì cho tới khi effect chạy**, tức là sau lần paint đầu:

```tsx
const hydrate = usePresetsStore((state) => state.hydrate);
useEffect(() => hydrate(), [hydrate]);
```

Cái giá là app mở ra với giá trị mặc định trong một frame. Cái được là app mở ra được.

### 3. Ghi vào `localStorage` là **đồng bộ**

`localStorage.setItem` chặn main thread. Không nhiều — nhưng store tham số đổi sáu mươi lần mỗi giây trong lúc kéo, và main thread thông thoáng là đúng thứ [P7.3](p7-3-store-to-uniform.md) vừa mất công giành lại.

Nên ghi được điều tiết:

```ts
const unsubscribe = useParamsStore.subscribe((state) => {
  if (timer) return;              // đã có hẹn giờ rồi, để nó làm
  timer = setTimeout(() => {
    timer = null;
    writeJson(VALUES_KEY, state.values);
  }, SAVE_DELAY_MS);
});
```

Đây là **throttle** (chốt một lần mỗi 500ms) chứ không phải debounce (chờ im lặng 500ms rồi mới ghi). Khác biệt quan trọng: với debounce, một cú kéo dài mười giây không ghi gì cả cho tới khi dừng. Với throttle, nó ghi đều đặn. Mất nửa giây vị trí slider vì trình duyệt sập không phải mất mát thật.

### 4. Mọi thứ trong storage đều do một **bản build cũ** viết ra

```ts
function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
```

`try/catch` ở đây không phải cho cẩn thận thừa. `localStorage` **ném lỗi thật**:

- Safari ở chế độ riêng tư từng ném khi `setItem`.
- Hết quota thì ném `QuotaExceededError`.
- Một giá trị ghi dở do trình duyệt sập thì `JSON.parse` ném.

Không cái nào đáng để làm hỏng cả ứng dụng. Mặc định là một câu trả lời tốt.

Và cấu trúc đọc về cũng phải kiểm:

```ts
function parsePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((entry): entry is { name: string; values: unknown } => /* … */)
    .map((entry) => ({ name: entry.name, values: sanitiseValues(entry.values) }));
}
```

### 5. Khôi phục **không phải** một lần sửa

```ts
useParamsStore.setState({ values: sanitiseValues(storedValues) });
```

`setState` thẳng, không qua `setAll`. Quay lại chỗ bạn đang làm dở không phải một thao tác chỉnh sửa, và nó **không được** là thứ đầu tiên Ctrl+Z hoàn tác. Mở app lên rồi bấm undo mà nhảy về mặc định thì đó là một bất ngờ khó chịu.

Ngược lại, nạp một preset *là* một lần sửa, nên nó đi qua `setAll` và undo được.

## Đi qua code

### `apps/point-cloud/src/params/presets.ts` (mới)

Bốn look. Đáng chú ý là `Photographic` — chính là mặc định, được đặt tên, để lúc nào cũng có một đường quay về bằng một cú bấm thay vì bốn lần Reset.

Và `Graphic` tắt gần hết: không grade, không bokeh, không hạt nhiễu, hạt cứng và nhỏ. Nó hữu dụng thật — đó là cách xem **sampler đã làm gì** mà không có lớp trang điểm của P5 che lên.

### `apps/point-cloud/src/store/presets-store.ts` (mới)

`hydrate()` trả về một hàm huỷ đăng ký, nên effect gọi nó dọn dẹp được theo đúng lối thường:

```tsx
useEffect(() => hydrate(), [hydrate]);
```

### `apps/point-cloud/src/app/inspector/presets-panel.tsx` (mới)

Ô nhập tên là một `<input>` thường, không phải `prompt()`. Một hộp thoại modal **chặn cả trang** — bao gồm vòng lặp render phía sau nó — và panel này ngồi cạnh một canvas đáng lẽ phải tiếp tục chuyển động.

Một chi tiết nhỏ:

```tsx
if (event.key === "Escape") event.stopPropagation();
```

Không có nó, Escape sẽ nổi lên tới listener trên `window` và đóng help overlay từ bên trong một ô văn bản.

## Lỗi đã gặp

1. **Suýt đọc `localStorage` trong `create()` của store.** Store được tạo lúc module nạp, mà module đó cũng chạy trên server — sẽ là `ReferenceError: localStorage is not defined` ngay lúc build.
2. **Viết debounce trước, rồi đổi sang throttle.** Với debounce, kéo slider liên tục ba mươi giây thì không có gì được lưu trong ba mươi giây đó. Throttle giữ storage luôn cách thực tại tối đa nửa giây.
3. **Khôi phục ban đầu đi qua `setAll`**, làm bước đầu tiên của lịch sử là "mở app lên". Ctrl+Z ngay sau khi mở nhảy về mặc định — đúng kiểu bug mà chỉ người thật dùng thật mới gặp.

## Tự thử

1. **Kiểm tiêu chí "xong khi".** Chỉnh vài slider, lưu preset tên "Test", F5. Preset còn không? Giá trị còn không?
2. **Xem dữ liệu thật.** Console: `JSON.parse(localStorage.getItem('point-cloud:params:v1'))`. Rồi thử `localStorage.setItem('point-cloud:params:v1', '{"size": "rất to"}')` và reload. Có hỏng không, và vì sao không?
3. **Đổi throttle thành debounce.** Kéo slider liên tục 10 giây rồi (không nhả) mở tab Application xem storage. Khi nào nó cập nhật?
4. **Bỏ `stopPropagation` trên Escape.** Mở help, bấm vào ô "Save as…", bấm Escape. Điều gì xảy ra?
5. **Viết một preset mới.** Thêm entry vào `BUILT_IN_PRESETS` chỉ với hai override. Chạy test — cái nào đỏ, và vì sao test đó tồn tại?

## Đọc thêm

- [MDN — `Window.localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
- [MDN — `JSON.parse()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/JSON/parse)
- [React — `useEffect`](https://react.dev/reference/react/useEffect)
- [P0 · Monorepo, Next.js và vòng lặp render của R3F](p0-scaffold.md) — nơi SSR và hydration xuất hiện lần đầu
