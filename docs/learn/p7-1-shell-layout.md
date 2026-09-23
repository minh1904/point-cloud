# P7.1 · Bố cục của một công cụ: toolbar, viewport, inspector, status bar

## Mục tiêu

Từ P1 tới P6, giao diện là những tấm thẻ nổi trên một canvas tràn màn hình. Đẹp trong ảnh chụp màn hình, và ngừng hoạt động ở tấm panel thứ tám.

Bước này đưa nó về hình dạng của một công cụ thật: một thanh toolbar, một viewport có hình chữ nhật của riêng nó, một inspector gắn cạnh, một status bar. Xong khi **kéo một slider không bao giờ khiến canvas render lại** — mà điều đó thì phụ thuộc vào [P7.3](p7-3-store-to-uniform.md) nhiều hơn là vào CSS.

## Khái niệm

### 1. Vì sao panel nổi hỏng ở quy mô lớn

Ba vấn đề, và cả ba đều chỉ lộ ra khi số panel tăng:

- **Cột điều khiển cuộn đè lên bức ảnh.** Người dùng đã báo đúng lỗi này: hàng nút sticky trong suốt, panel trượt qua bên dưới và lộ ra ở khe giữa hai nút.
- **Viewport không có tỉ lệ thật.** Một phần của nó luôn bị che, nên "bức ảnh trông thế nào" là câu hỏi không trả lời được.
- **Không có chỗ cho những con số luôn đúng.** fps, draw call, số điểm ngồi ở góc trên bên trái, đè lên trời trong ảnh.

Gắn inspector vào một cột thật giải quyết cả ba cùng lúc, và cho canvas một hình chữ nhật mà nó sở hữu.

### 2. Bố cục bằng flex, ba tầng

```tsx
<main className="flex h-dvh w-full flex-col overflow-hidden">
  <Toolbar />
  <div className="relative flex min-h-0 flex-1">
    <div className="relative min-w-0 flex-1"><Stage /></div>
    {inspectorOpen && <aside className="… sm:w-56 lg:w-64">…</aside>}
  </div>
  <StatusBar />
</main>
```

Hai class dễ quên mà thiếu là hỏng:

- **`min-h-0`** trên hàng giữa. Mặc định một flex item có `min-height: auto`, nghĩa là nó **không chịu co nhỏ hơn nội dung**. Inspector cuộn được bên trong, nên nội dung của nó rất cao, nên hàng giữa phình ra và đẩy status bar xuống dưới màn hình. `min-h-0` cho phép nó co lại, và khi đó `overflow-y-auto` bên trong mới có tác dụng.
- **`min-w-0`** trên viewport, vì lý do y hệt theo chiều ngang.

### 3. Ba màn, ba bố cục — nhưng không phải ba đoạn code

```
inset-x-0 bottom-0 max-h-[58dvh]        ← điện thoại: sheet đè lên đáy viewport
sm:static sm:w-56 sm:border-l           ← tablet: cột gắn cạnh, viewport nhường chỗ
lg:w-64                                 ← bàn làm việc: cột rộng hơn
```

Dưới `sm` thì gắn cột là vô nghĩa: 224px cạnh một màn 360px thì chẳng còn viewport nào. Nên ở đó inspector quay lại làm **sheet đè lên**, nhưng lần này nó có nền đặc và header không cuộn — hai thứ sửa đúng lỗi mà bản panel nổi mắc phải.

`sm:static` là mấu chốt: nó gỡ `position: absolute` để phần tử quay lại dòng chảy bình thường và **chiếm chỗ**, khiến viewport co lại.

### 4. Mấu chốt hiệu năng nằm ở chỗ component này **không** làm gì

```tsx
export function AppShell() {
  const controls = useRef<OrbitControlsHandle>(null);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  // …
}
```

`AppShell` đăng ký (subscribe) đúng **một** thứ. Không param nào, không stats nào, không trạng thái panel nào.

Vì sao quan trọng: `Stage` được bọc `memo` và chỉ nhận một prop là ref. Chừng nào `AppShell` không render lại thì phần tử `<Stage>` giữ nguyên identity và **React không bao giờ bước vào trong scene**. Kéo slider chạm tới GPU mà React không hề biết chuyện đó xảy ra.

Đó chính là tiêu chí "xong khi" của bước này, và lý do các tham số không được phép sống trong component này.

### 5. Ai đăng ký cái gì

| Thành phần | Đăng ký | Render lại khi |
|---|---|---|
| `AppShell` | `inspectorOpen` | bấm Hide/Controls |
| `Toolbar` | `playing`, `inspectorOpen`, `past.length > 0` | bấm nút |
| `StatusBar` | `stats`, tên file | hai lần mỗi giây |
| `ParamControl` | **đúng một giá trị của nó** | slider đó bị kéo |
| `Stage` | không gì cả | không bao giờ |

Chú ý dòng toolbar: nó chọn `past.length > 0` chứ không phải `past`. Một boolean thì toolbar render lại khi undo **trở nên khả dụng**, không phải mỗi lần một bước được đẩy vào lịch sử.

## Đi qua code

### `apps/point-cloud/src/app/shell/app-shell.tsx` (mới)

Thay thế `studio.tsx`, file đã tích tụ toàn bộ trạng thái của app từ P1.

### `apps/point-cloud/src/store/ui-store.ts` (mới)

Panel nào đang gập, inspector có hiện không, đang xem chặng nào, help có mở không. Không cái nào là tham số, không cái nào được xuất ra, không cái nào vào lịch sử undo.

Để trong store thay vì trong component vì cùng lý do với tham số: chỉ phần nào quan tâm mới đăng ký, nên gập một panel thì render lại inspector và để yên viewport.

### `apps/point-cloud/src/app/inspector/inspector.tsx` (mới)

Phần header **không cuộn**:

```tsx
<div className="flex h-full min-h-0 flex-col">
  <div className="flex shrink-0 items-center justify-between … border-b">…</div>
  <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">…</div>
</div>
```

`shrink-0` cho header, `min-h-0 flex-1 overflow-y-auto` cho thân. Header nằm ngoài vùng cuộn nên không có gì trượt qua dưới nó được — vấn đề trước đây được giải bằng cấu trúc chứ không bằng một cái nền đục.

### `apps/point-cloud/src/scene/stage.tsx`

```tsx
export const Stage = memo(function Stage({ controlsRef }: StageProps) { … });
```

Trước đây nó nhận bảy prop. Giờ nhận một, và đó là ref.

## Lỗi đã gặp

1. **Quên `min-h-0` ở lần thử đầu.** Status bar bị đẩy xuống dưới đáy cửa sổ và inspector không cuộn. Đây là cái bẫy flexbox kinh điển: `min-height: auto` mặc định khiến flex item từ chối co nhỏ hơn nội dung.
2. **Bỏ lỡ chỗ sửa lỗi thật.** Lỗi người dùng báo (panel trượt dưới hàng nút sticky) suýt được vá bằng cách thêm nền cho thanh đó. Bản vá ấy đúng và nông. Gỡ hẳn header ra khỏi vùng cuộn thì lỗi không còn *có thể* xảy ra nữa.
3. **Tab Chrome bị ẩn làm mọi phép đo fps vô nghĩa** — lần thứ ba trong dự án. Đã ghi vào `status.md` từ P6 mà vẫn mất mấy phút mỗi lần.

## Tự thử

1. **Kiểm tiêu chí "xong khi".** Mở React DevTools, bật "Highlight updates", rồi kéo slider Size. Cái gì nhấp nháy? Sau đó thêm `const values = useParamsStore((s) => s.values);` vào `AppShell` và thử lại.
2. **Bỏ `min-h-0`** khỏi hàng giữa. Status bar đi đâu, và inspector còn cuộn được không?
3. **Bỏ `memo`** khỏi `Stage`. Bấm Pause vài lần và xem DevTools — có gì khác không? Vì sao gần như không?
4. **Đổi `sm:static` thành `sm:absolute`.** Viewport có co lại nữa không? So sánh hai cách ở bề rộng 900px.
5. **Đếm số component render** khi kéo một slider: thêm `console.count` vào `AppShell`, `Toolbar`, `Inspector` và `ParamControl`. Con số nào là con số đúng?

## Đọc thêm

- [MDN — `min-height`](https://developer.mozilla.org/en-US/docs/Web/CSS/min-height) — mục `auto` giải thích cái bẫy flexbox
- [MDN — CSS Flexible Box Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout)
- [React — `memo`](https://react.dev/reference/react/memo)
- [P7.3 · Từ store thẳng vào uniform](p7-3-store-to-uniform.md) — nửa còn lại của tiêu chí "xong khi"
