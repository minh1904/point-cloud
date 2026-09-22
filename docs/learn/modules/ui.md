# Module `src/ui` + `src/store`

> **Công dụng trong một câu:** bộ control và khung canvas tự viết, cộng với state dùng chung giữa panel và code vẽ.

**Tầng:** 2 (ui) và 2.5 (store) · **Chạy ở:** main thread

---

## Vì sao module này tồn tại

Dự án từng dùng [Toolcraft](https://github.com/pixel-point/toolcraft) cho toàn bộ phần này — nó cho sẵn panel, slider, canvas pan/zoom, persistence. Ta đã bỏ vì hai tính năng cốt lõi của app (Web Worker cho AI, export JSON) bị framework chặn bằng gate không lách được. Lý do đầy đủ ở [03-why-these-choices.md](../03-why-these-choices.md#q11--bỏ-toolcraft).

Nhưng **hệ thống thị giác của Toolcraft thì giữ nguyên** (MIT, © 2026 Pixel Point — xem [NOTICE.md](../../../NOTICE.md)). Token và kích thước không phải tự nghĩ ra mà lấy từ source của nó:

| | Giá trị |
|---|---|
| Nền | `oklch(0 0 0)` — **đen tuyệt đối**, không phải xám đậm |
| Chữ | Inter Variable, control 13px/1.125rem, nhãn section 11px |
| Accent | `#0c8ce9` · primary `oklch(0.546 0.215 262.88)` |
| Button | `h-7` · `px-2` · `rounded-lg` |
| Khoảng cách control | 14px |
| Slider | track **1px**, thumb **9px vuông** bo 2px, cả hai màu `--foreground` |
| Bố cục | canvas `inset-0` trải kín, panel + toolbar **nổi** lên trên |
| Bề mặt nổi | `popover` 75% + `backdrop-blur(40px) saturate(1.5)`, viền `border` 12% |
| Vách ngăn section | `border` **8%** — gần như chỉ gợi ý |
| Panel | `w-[300px]`, `rounded-lg`, `max-h-[calc(100dvh-1.25rem)]` |

Chi tiết cuối dễ làm sai nhất: trực giác bảo "track 4px, thumb tròn, tô màu accent". Toolcraft làm ngược lại — hairline trắng — và kết quả nhìn tĩnh hơn hẳn khi panel có nhiều slider xếp dọc. Tôi đã làm theo trực giác ở bản đầu và phải sửa lại.

Các luật bố cục cũng giữ:

1. **Control cao 28px, đồng nhất.** Chiều cao khác nhau làm panel nhìn lộn xộn ngay cả khi không nói được vì sao.
2. **Nhãn ở trên, giá trị hiện bên phải nhãn — không phải tooltip.** Người dùng cần thấy số hiện tại mà không phải trỏ chuột.
3. **Nhãn nút là động từ, nhãn control là ngữ cảnh.** Không trùng nhau.
4. **Trạng thái rỗng giữ trung tính.** Không artwork giả, không CTA, không "kéo ảnh vào!" to đùng giữa canvas.
5. **Section xếp theo độ gắn kết, không theo tần suất dùng.**

---

## File và trách nhiệm

### `store/studio.ts` — state

zustand, không Context. Lý do cụ thể: state này phải đọc được từ **cả** cây React (panel) **và** code không-React (render loop Three.js ở P2). `useSyncExternalStore` bên dưới zustand cho phép cả hai; React Context thì không đi qua ranh giới đó êm.

Phân tách quan trọng nhất trong file:

```ts
type Params  = { modelId, viewMode, colormap, depthScale, ... }  // user chỉnh → nên persist
type Derived = { pixels, depth, progress, error, fileName }      // tính lại được → KHÔNG persist
```

Gộp chung là cách nhanh nhất để lỡ ghi 8 MB pixel vào localStorage.

`setParam` có một luật nghiệp vụ: đổi sang model relative thì `projection: "perspective"` thành vô nghĩa (không có focal length), nên tự đưa về `relief`. State sai không được phép tồn tại rồi sửa sau.

### `ui/primitives.tsx` — bộ control

Gom vào một file thay vì một file mỗi component, vì chúng dùng chung một ngôn ngữ thị giác và giữ cạnh nhau làm việc lệch nhau khó xảy ra hơn. Tách khi vượt ~400 dòng, và tách **theo nhóm** chứ không theo component.

`Slider` đáng chú ý: track và núm vẽ bằng `div` để tô được phần đã đi qua, còn `<input type="range">` thật nằm đè lên với `opacity-0`. Giữ nguyên toàn bộ hành vi bàn phím và kéo chuột của native mà vẫn tự do tạo hình.

### `ui/Dropzone.tsx` — nhận ảnh

Ba đường vào vì người dùng mong đợi cả ba: bấm chọn file, kéo thả, và **dán Ctrl+V**. Đường thứ ba hay bị bỏ qua nhưng là cách nhanh nhất khi ảnh vừa được chụp hoặc copy từ web. Listener paste gắn ở `window` vì người dùng bấm Ctrl+V khi focus ở bất kỳ đâu.

### `ui/CanvasStage.tsx` — khung canvas

Nó **không vẽ gì**. Nó cấp một `<canvas>` đã khớp devicePixelRatio và một transform pan/zoom cho pass vẽ ở trên. Tách như vậy để pass 2D và pass 3D (P2) dùng chung đúng một context, không phải hai canvas.

Hai chi tiết đáng học:

**Zoom quanh con trỏ.** Giữ điểm dưới chuột đứng yên khi zoom:
```ts
const factor = Math.exp(-deltaY * 0.0015);   // exp → mỗi notch đổi cùng TỈ LỆ
x = pointerX - (pointerX - x) * applied;
```
Dùng `exp()` chứ không cộng/trừ tuyến tính, nếu không zoom sẽ nhanh dần ở mức cao và chậm dần ở mức thấp.

**Clamp DPR ở 2.** Màn 3x làm số pixel phải tô tăng 2.25 lần so với 2x mà mắt gần như không thấy khác. Với particle system, fill rate mới là bottleneck — đây là tối ưu đáng giá nhất và tốn đúng một dòng.

**ResizeObserver chứ không `window.resize`:** panel có thể đổi rộng mà window thì không.

### Bố cục nổi

Điểm khác biệt lớn nhất so với bản đầu: Toolcraft **không dùng sidebar phẳng**.
Canvas là `absolute inset-0` trải kín cửa sổ; panel và toolbar là những tấm nổi
lên trên với backdrop blur. Lớp phủ chứa chúng để `pointer-events-none` để kéo
và zoom xuyên xuống canvas, từng tấm tự bật lại `pointer-events-auto`.

Một cạm bẫy khi đổi sang bố cục này: `CanvasStage` dùng `flex-1`, nên vùng bọc
nó phải là flex container. Bọc bằng `absolute inset-0` thuần thì canvas cao 0 và
màn hình trắng trơn — mọi thứ khác vẫn chạy nên rất khó đoán.

### `ui/ControlsPanel.tsx` — lắp ráp

Chỉ lắp primitives theo `store`. Không có logic riêng ngoài việc chọn danh sách `projection` theo `kind` của model.

---

## Hợp đồng vào/ra

```ts
// store
useStudio()        → toàn bộ state + actions
useActiveModel()   → DepthModel đã giải quyết id lạ về default

// CanvasStage
onFrame(canvas: HTMLCanvasElement, frame: StageFrame) => void
// frame: { width, height, dpr, viewport } — backing size đã nhân DPR
```

---

## Cạm bẫy

**Đọc cả store bằng `useStudio()` trong component lớn.** Nó re-render mọi lần bất kỳ field nào đổi. Dùng selector: `useStudio((s) => s.depthScale)`. `ControlsPanel` cố tình đọc cả store vì nó hiển thị gần hết state; `App` thì đọc từng field.

**Tạo lại `onFrame` mỗi render.** `CanvasStage` dùng nó làm dependency của effect vẽ. Không bọc `useCallback` thì vẽ lại mỗi render — với pass 3D ở P2 sẽ tốn thật.

**Quên `dpr` khi tính toạ độ.** `viewport.x/y` tính theo pixel CSS, còn `canvas.width` là backing pixel. Nhân `dpr` khi dùng chung, nếu không pan sẽ lệch trên màn retina.

**Persist nhầm `Derived`.** Khi thêm persistence (chưa có), chỉ ghi `Params`.

---

## Cách kiểm chứng

Chưa có test tự động cho phần này — nó là UI, và ở giai đoạn này kiểm bằng mắt rẻ hơn. Những thứ đáng viết test khi UI ổn định:

| Test | Bắt được gì |
|---|---|
| Kéo `depthScale` → không có request mạng | Chạy lại inference oan |
| Đổi model giữa lúc inference → chỉ kết quả mới thắng | Race condition |
| Model metric → relative → `projection` tự về `relief` | State vô nghĩa |
| Zoom rồi pan → điểm dưới chuột đứng yên | Sai công thức zoom |

Kiểm tay bắt buộc trước khi commit UI: `crossOriginIsolated === true` trong console. Thiếu nó thì fallback WASM chậm 3–4 lần mà không báo gì.

---

## Đọc thêm

- [02-data-flow.md](../02-data-flow.md) — luồng dữ liệu
- [depth.md](depth.md) — nguồn của `DepthMap` mà UI hiển thị
- [03-why-these-choices.md](../03-why-these-choices.md) — vì sao bỏ Toolcraft
