# Ràng buộc Toolcraft

> Đây là tài liệu quan trọng nhất trong dự án. Toolcraft không phải component library — nó là framework có **guardrail cứng**, thực thi bằng ~80 test acceptance và một manifest chữ ký. Viết code theo bản năng React thông thường sẽ làm `npm run test` đỏ.

Nguồn gốc: `docs/toolcraft/core/runtime-boundary.md`. File này là bản diễn giải + hệ quả cho dự án của ta.

---

## Tám ràng buộc

### 1. Không thêm được route

`index.html`, `src/main.tsx`, `src/router.tsx`, `src/routes/root.tsx`, `src/routes/index.tsx` đều **bị ký số**. Route duy nhất chỉ host `<ToolcraftApp/>`.

**Hệ quả cho ta:** kế hoạch ban đầu có hai màn `/` (Studio) và `/preview` (3D) — **không làm được**. Chuyển màn phải là **state trong schema**, không phải navigation:

```ts
// src/app/app-schema.ts
{ id: "viewMode", kind: "segmented", options: ["2D Depth", "3D Particles"], defaultValue: "2D Depth" }
```

`src/scene/scene-host.tsx` đọc `viewMode` và mount pass tương ứng. Cùng một canvas, cùng một WebGL context.

Thực ra đây là kết quả **tốt hơn**: giữ nguyên context nghĩa là đổi màn không mất texture đã upload, không phải chạy lại inference, không có flash trắng.

---

### 2. Không render control thủ công

Bị cấm: `SliderControl`, `SelectControl`, `ColorControl`, `FileDropControl` và mọi import từ `src/toolcraft/ui/components/controls/**`. Cũng cấm cả `input type=range`, `input type=file`, `select`, `input type=color`.

**Thay vào đó:** mọi control được **khai báo** trong `src/app/app-schema.ts`, runtime tự dựng UI.

```ts
// SAI — sẽ fail app-acceptance.control-*.test.ts
<input type="range" min={0} max={2} value={depthScale} onChange={...} />

// ĐÚNG
{ id: "depthScale", kind: "slider", min: 0, max: 2, step: 0.01, defaultValue: 0.6 }
```

**Hệ quả:** model picker, depthScale, gridSize, colormap, chế độ chiếu — tất cả là entry trong schema. Không có component form nào do ta viết. Panel bên trái hiện ra miễn phí, kèm sẵn reset, undo/redo, persistence, keyframe.

---

### 3. State phải nằm trong runtime schema

Cấm giữ **thiết lập cuối cùng của sản phẩm** trong `useState` cục bộ, vì nó cần reset / persist / import-export / keyframe / được test đọc.

`useState` vẫn dùng được cho state tạm thời thuần UI (ví dụ "worker đang chạy hay không"), nhưng bất cứ giá trị nào user điều chỉnh được thì thuộc schema.

**Hệ quả:** không cần zustand. Không cần leva. Không gọi `localStorage` hay IndexedDB trực tiếp — runtime đã lo persistence, và binary (ảnh upload) nằm trong IndexedDB repository của nó.

---

### 4. `canvasContent` chỉ chứa output sản phẩm

Trong `scene.canvasContent` chỉ được có: WebGL, Canvas 2D, SVG, text sản phẩm, handle chỉnh sửa. **Không** được có button, upload prompt, câu hướng dẫn, menu, form.

**Hệ quả:** dropzone không phải component của ta — nó là `base.media` + `fileDrop` của runtime. Text sản phẩm vẽ trong canvas phải gắn `data-toolcraft-product-output` để test nhắm được.

---

### 5. Export thuộc runtime, trừ "non-export download"

Runtime sở hữu trọn vẹn export ảnh/SVG/video: nó cấp phát backing, composite background, gọi `scene.rasterFrameRenderer` của ta, encode, download, báo progress. Product code **không** được tạo canvas export, gọi `toBlob`, tạo object URL, hay mở file picker.

Nhưng `docs/toolcraft/core/setup-export.md` dòng 275 nói rõ:

> Async **non-export** download/copy/generate/apply handlers return the real Promise from `actions.onPanelAction` and use `reportProgress(0..1)`.

**Hệ quả:** export JSON point cloud của ta là **non-export download**, đi qua `actions.onPanelAction`, trả Promise thật và báo progress. Export ảnh preview thì dùng `imageExportModule()` + `rasterFrameRenderer`.

> **Cần xác minh ở P0.** Ranh giới giữa "artifact export" (runtime sở hữu) và "non-export download" (ta sở hữu) chưa hoàn toàn rõ. Đọc `docs/toolcraft/core/setup-export.md` mục *Artifact Export Intent* + file `src/app/app-acceptance.artifact-export-intent.test.ts` trước khi viết code export.

---

### 6. `src/toolcraft` bất khả xâm phạm

Bản copy runtime đã ký. Sai gì cũng phải sửa ở monorepo upstream rồi regenerate. Manifest integrity còn bảo vệ cả `AGENTS.md`, `docs/toolcraft/**`, config gốc, và **nội dung các script npm**.

Thêm file mới vào `docs/toolcraft/` → **fail**. Chỉ hai file được phép: `agent-worklog.md` và `workflow-observation.md`.

**Hệ quả:** tài liệu học của ta sống ở `docs/learn/`. Đó là lý do bạn đang đọc file này ở đây chứ không ở `docs/toolcraft/`.

---

### 7. Style chỉ dùng CSS Module, selector phải local

Chỉ `*.module.css` import cục bộ. Mọi selector phải bắt đầu bằng một compound chứa class local. Bị từ chối: `:global`, selector trần, selector theo attribute của host, `@import`, import CSS từ package, inject style toàn cục.

**Hệ quả:** Tailwind có trong dependencies nhưng đó là cho runtime UI. Code sản phẩm của ta dùng CSS Module. Vì UI của ta gần như chỉ là canvas, lượng CSS rất ít.

---

### 8. Đồ thị phụ thuộc phải phi chu trình

Gate code-health giải cả import tương đối, `index.*`, path alias, và in ra **vòng lặp ngắn nhất** khi phát hiện. Ngoài ra module production không được import test hay test-support.

**Hệ quả:** luật 4 tầng trong [STRUCTURE.md](../../STRUCTURE.md#quy-tắc-phụ-thuộc). Tầng 2 không import lẫn nhau; dữ liệu đi ngang qua `shared/types.ts`.

---

## Renderer: vì sao Three.js thuần, không phải R3F

`docs/toolcraft/renderer-technique.md` liệt kê một **catalog đóng** các quyết định backend/provider. Có đúng một dòng cho Three.js:

| Situation | Typed decision |
|---|---|
| Three.js WebGL presentation | `backend: "webgl"`, `provider: "three"` |

React Three Fiber không có trong catalog. Quan trọng hơn, R3F muốn tự sở hữu canvas và render loop, còn Toolcraft đã sở hữu canvas backing, scene frame và export compositing rồi. Hai bên sẽ tranh nhau.

**Cách làm đúng:** Three.js thuần trong `scene.canvasContent`, lấy kích thước và hệ toạ độ từ `useToolcraftProductSceneFrame()`.

```tsx
const frame = useToolcraftProductSceneFrame();
// frame → product rect, backing size, world-to-local translation
// KHÔNG đo DOM. KHÔNG suy ra hình học từ kích thước pixel ảnh gốc.
```

Trước khi viết shader còn phải khai báo `rendererTechnique` (mỗi pass: cost, frequency, lifecycle, execution location, cache key, invalidation) và chạy `assessToolcraftRenderPlan`. Doc nói thẳng: *"Do not write renderer code before the envelope, rendererTechnique, pipeline, and assessment exist."*

---

## Cross-origin isolation

Fallback WASM đa luồng của ONNX Runtime cần `SharedArrayBuffer`, mà `SharedArrayBuffer` cần hai header. Không có → ORT âm thầm rơi về single-thread, chậm 3–4 lần, **không báo lỗi gì**.

`vite.config.ts` bị ký nên không sửa trực tiếp được. Hai đường:

- **Dev:** dùng `configureServer` trong một Vite plugin do sản phẩm sở hữu, nếu điểm cắm này mở. Nếu không — chấp nhận single-thread khi dev, vì WebGPU (đường chính) không cần các header này.
- **Prod:** `public/_headers` (Cloudflare Pages) hoặc `vercel.json`. `public/` là nơi ta ghi được.

```
/*
  Cross-Origin-Opener-Policy: same-origin
  Cross-Origin-Embedder-Policy: credentialless
```

Dùng `credentialless`, **không** dùng `require-corp` — `require-corp` sẽ chặn mọi asset cross-origin, bao gồm việc tải model từ CDN Hugging Face.

Kiểm tra: `crossOriginIsolated === true` trong console.

---

## Gate phải chạy trước khi commit

```bash
npm run ai:check      # code health + kiểm tra vị trí file
npm run typecheck
npm run test          # docs check + integrity check + vitest
npm run files:check   # phát hiện file debug đặt sai chỗ
```

`npm run test` **phải fail** khi bất kỳ file bị ký thay đổi. Nếu nó fail và bạn không hiểu tại sao: kiểm tra xem mình có chạm vào `src/toolcraft`, `src/routes`, `docs/toolcraft`, hoặc đổi nội dung một script npm hay không.

---

## Tóm tắt: thói quen phải đổi

| Phản xạ thông thường | Ở Toolcraft |
|---|---|
| Thêm route cho màn mới | Thêm state `viewMode` vào schema |
| `useState` cho slider | Khai báo control trong `app-schema.ts` |
| `input type=range` | `{ kind: "slider" }` |
| zustand / redux | Runtime schema state + command |
| `URL.createObjectURL` để tải file | `actions.onPanelAction` trả Promise |
| `localStorage.setItem` | Runtime persistence (tự động) |
| React Three Fiber | Three.js thuần + `useToolcraftProductSceneFrame()` |
| Tailwind class trong code sản phẩm | `*.module.css` selector local |
| Viết doc vào `docs/toolcraft/` | `docs/learn/` |
