# P7.2 · Khai báo mỗi núm vặn đúng một lần

## Mục tiêu

Thêm một tham số mới vào công cụ, trước bước này, phải viết ra **bốn lần**:

1. một field trong `interface ParticleParams`
2. một giá trị trong `defaultParticleParams`
3. một `<Slider>` trong `studio.tsx`, với min/max/step/format gõ tay
4. một dòng trong `useEffect` chép nó vào uniform, cộng một mục trong mảng dependency

Bốn chỗ để thêm, bốn chỗ phải giữ đồng bộ, và trình biên dịch chỉ bắt được hai. Quên dòng thứ tư thì slider chạy mượt mà không làm gì cả — không lỗi, không cảnh báo.

Sau bước này: **một entry trong một mảng**. Xong khi thêm một tham số = thêm một entry.

## Khái niệm

### 1. Dữ liệu có nhiều người tiêu thụ thì phải mô tả một lần

Giá trị của schema không nằm ở chỗ "ít gõ hơn". Nó nằm ở chỗ tham số này có **bốn người đọc** và họ không được phép bất đồng:

| Người đọc | Cần gì từ entry |
|---|---|
| Inspector | `label`, `group`, `min`, `max`, `step`, `format` |
| Shader | `uniform`, `stage` |
| Preset (7.5) | `key`, `default` |
| Xuất bundle (P8) | `key`, `default` |

Khi mô tả bị chia ra bốn chỗ, "đồng bộ" là kỷ luật của con người. Khi nó là một object, đồng bộ là điều không thể phá.

Ý tưởng không mới — leva, tweakpane, và Toolcraft đều làm vậy. Điều đáng hiểu là **vì sao nó đáng ở đây**, chứ không phải nó là gì.

### 2. Union có tag, chứ không phải một hình dạng cho tất cả

```ts
export type Param = NumberParam | ToggleParam | EnumParam;
```

Cám dỗ là làm một interface duy nhất với `min?`, `max?`, `options?` cho mọi loại. Rồi `param.min` thành `number | undefined` ở mọi chỗ, và mỗi chỗ dùng phải tự bảo vệ.

Với union có tag, `param.kind === "number"` **thu hẹp kiểu**, và bên trong nhánh đó `param.min` là `number`. Không `?.`, không `!`, không mặc định bịa ra.

```tsx
if (param.kind === "number") {
  return <Slider min={param.min} max={param.max} step={param.step} … />;
}
```

### 3. `stage` là chỗ ghi lại "tham số này đi tới đâu"

```ts
export type ParamStage = "points" | "post" | "scene";
```

Phần lớn tham số là một uniform trên material hạt hoặc material hậu kỳ. Vài cái thì không: `fov` điều khiển camera, `renderScale` quyết định kích thước render target, `grade` đặt tên một file để tải.

Đánh dấu điều đó trong dữ liệu có nghĩa là vòng lặp ghi uniform tự lọc được danh sách của nó:

```ts
export const UNIFORM_PARAMS = {
  points: PARAMS.filter((p) => p.stage === "points" && p.uniform),
  post: PARAMS.filter((p) => p.stage === "post" && p.uniform),
};
```

Lọc **một lần lúc nạp module**, không phải mỗi frame.

### 4. Chuẩn hoá đầu vào: preset và localStorage đều không đáng tin

Hai hàm nhỏ mà quan trọng:

```ts
export function coerce(param: Param, value: unknown): ParamValue
export function sanitiseValues(raw: unknown): ParamValues
```

`sanitiseValues` nhận bất cứ object nào và trả về một bộ giá trị **đầy đủ và hợp lệ**: key nào schema không còn thì bỏ, key nào schema mới thêm thì lấy default. Đó là thứ cho phép schema tiếp tục thay đổi mà preset cũ vẫn nạp được.

### 5. Một lỗi mà test bắt được, và nó dạy về `Number()`

Bản đầu của `coerce`:

```ts
const number = typeof value === "number" ? value : Number(value);
if (!Number.isFinite(number)) return param.default;
return Math.min(param.max, Math.max(param.min, number));
```

Trông ổn. Test hỏi: `coerce(size, null)` ra gì?

`Number(null)` là **0**. Số 0 hữu hạn, nên nó không rơi vào nhánh default — nó bị **kẹp vào khoảng** và thành `min`. Một preset hỏng sẽ âm thầm ghim mọi tham số xuống giá trị nhỏ nhất thay vì trả chúng về mặc định.

`Number([])`, `Number("")`, `Number(false)` cũng đều là 0.

Bản sửa chỉ nhận số thật và chuỗi:

```ts
const number =
  typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
```

## Đi qua code

### `apps/point-cloud/src/params/schema.ts` (mới)

Mỗi entry mang theo cả **lý do con số là con số đó**, ngay cạnh con số:

```ts
{
  key: "densityBoost",
  label: "Fill sparse",
  group: "particles",
  stage: "points",
  uniform: "uDensityBoost",
  kind: "number",
  // Chỉnh bằng mắt trên ảnh 1024px: ở 0.5 nền trời còn lỗ, ở 1.5 mọi hạt
  // thành vệt mờ và chủ thể mất viền.
  default: 0.9,
  min: 0, max: 1.5, step: 0.05,
}
```

Trước đây comment ấy nằm trong file component tình cờ render nó. Giờ nó ở cạnh dữ liệu mà nó giải thích.

### `apps/point-cloud/src/params/apply.ts` (mới)

```ts
function writeDeclared(uniforms, values, stage) {
  for (const param of UNIFORM_PARAMS[stage]) {
    const uniform = uniforms[param.uniform!];
    if (!uniform) continue;
    uniform.value = param.kind === "toggle" ? (booleanValue(values, param.key) ? 1 : 0) : values[param.key];
  }
}
```

Toggle được đổi thành 0/1 vì shader nhận float. Shader dùng `mix()` với số đó thay vì `if`, và nhánh rẽ trong vertex shader thì không rẻ.

Vài uniform vẫn phải tính tay — `uScale` gộp cả FOV lẫn render scale, `uLut` là một texture. Chúng nằm ngay dưới vòng lặp, và việc chúng là **ngoại lệ được viết ra** chứ không phải quy tắc là điều đáng giá.

### `apps/point-cloud/src/app/inspector/param-control.tsx` (mới)

Một component cho mọi loại núm vặn. Và `src/app/inspector/inspector.tsx` dựng panel từ group:

```tsx
{paramsInGroup(group).map((param) => <ParamControl key={param.key} param={param} />)}
```

Không còn file "Motion panel" liệt kê năm slider nữa.

### `apps/point-cloud/src/params/schema.test.ts` (mới)

Loại test đáng chú ý ở đây là **test về chính schema**, không phải về code đọc nó:

```ts
it("only declares a uniform on parameters that write one", () => {
  for (const param of PARAMS) {
    if (param.stage === "scene") expect(param.uniform).toBeUndefined();
    else expect(param.uniform).toBeTruthy();
  }
});
```

Khi dữ liệu trở thành nguồn sự thật, dữ liệu cũng trở thành thứ cần kiểm.

## Lỗi đã gặp

1. **`Number(null) === 0`** — mục 5 ở trên. Test viết trước khi đọc kỹ `Number()`, và nó thắng.
2. **Định gộp mọi loại vào một interface** với `min?`, `max?`, `options?`. Viết được vài dòng ParamControl là thấy mỗi chỗ dùng đều phải `?? 0`. Union có tag xoá sạch chuyện đó.
3. **Quên rằng `grade` không phải uniform.** Nó đặt tên một file PNG để tải, tức là một side effect có vòng đời. Nó phải ở `stage: "scene"` và là tham số **duy nhất** mà `ParticleField` còn đăng ký qua React.

## Tự thử

1. **Kiểm tiêu chí "xong khi".** Thêm một entry mới vào `PARAMS` — ví dụ một `uSoftness` thứ hai với key khác — rồi mở app. Nó xuất hiện chứ? Với đúng label, đúng khoảng, đúng định dạng số chứ?
2. **Phá một uniform.** Đổi `uniform: "uSize"` thành `"uSizee"`. Chuyện gì xảy ra, và vì sao `if (!uniform) continue;` lại là quyết định đúng ở đây?
3. **Thử `coerce` trong console.** `Number(null)`, `Number([])`, `Number([5])`, `Number("")`, `Number(" 12 ")`. Cái nào làm bạn bất ngờ?
4. **Bỏ phép chia cho `total`** trong `mixImportance`… nhầm file — thử thay vào đó: bỏ `sanitiseValues` trong preset và nạp một preset thiếu key. Cái gì thành `undefined`, và nó hiện ra ở đâu?
5. **Đếm chỗ phải sửa.** Tìm trong lịch sử git commit thêm `densityBoost` (P6.6) và đếm số file phải đụng vào. So với một entry.

## Đọc thêm

- [TypeScript — Discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)
- [MDN — `Number()`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/Number)
- [MDN — `Intl.NumberFormat`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat) — nguồn của trường `format`
- [P7.3 · Từ store thẳng vào uniform](p7-3-store-to-uniform.md)
