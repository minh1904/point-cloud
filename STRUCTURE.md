# Cấu trúc thư mục

```
point-cloud/
├─ index.html
├─ vite.config.ts              ← plugin + alias + header cross-origin (dev)
├─ tsconfig.app.json           ← strict, noUnusedLocals, alias @/
├─ package.json
│
├─ public/
│  ├─ _headers                 ← header cross-origin (prod, Cloudflare Pages)
│  └─ models/                  ← model self-host, gitignore (npm run models:fetch)
│
├─ tools/fetch-model.mjs       ← tải model default về public/models/
│
├─ docs/learn/                 ← tài liệu học  ◀── ĐỌC Ở ĐÂY
│  ├─ 00-reading-order.md
│  ├─ 02-data-flow.md
│  ├─ 03-why-these-choices.md
│  ├─ glossary.md
│  └─ modules/{shared,depth,scene,ui,pointcloud}.md
│
└─ src/
   ├─ main.tsx · index.css     ← entry + design tokens
   ├─ App.tsx                  ── TẦNG 3: shell + điều phối
   │
   ├─ store/studio.ts          ── TẦNG 2.5: state (zustand)
   │
   ├─ ui/                      ── TẦNG 2: giao diện
   │  ├─ primitives.tsx           Slider, Select, Segmented, Button, Badge,
   │  │                           Progress, Notice, Panel, Section
   │  ├─ Dropzone.tsx             nhận ảnh: bấm / kéo thả / Ctrl+V
   │  ├─ CanvasStage.tsx          khung canvas pan/zoom + DPR
   │  └─ ControlsPanel.tsx        lắp primitives thành panel trái
   │
   ├─ depth/                   ── TẦNG 2: AI depth estimation
   │  ├─ registry.ts              danh sách model đã kiểm chứng
   │  ├─ protocol.ts              kiểu message + type guard
   │  ├─ worker-bridge.ts         nơi DUY NHẤT chạm tới Worker
   │  ├─ depth-worker.ts          transformers.js + ONNX (chạy trong worker)
   │  ├─ depth-client.ts          huỷ run lỗi thời, API callback
   │  └─ colormap.ts              grayscale / turbo / inferno
   │
   ├─ scene/                   ── TẦNG 2: vẽ
   │  └─ depth-preview.ts         pass 2D: ảnh gốc ↔ depth, split slider
   │
   └─ shared/                  ── TẦNG 1: nền
      ├─ config.ts               ⭐ NGUỒN SỰ THẬT DUY NHẤT cho tham số
      ├─ types.ts                hợp đồng dữ liệu giữa các module
      └─ math.ts                 smoothstep, quantize, remap
```

---

## Quy tắc phụ thuộc

```
        ┌─────────────┐
        │   App.tsx   │  tầng 3 — import được tất cả
        └──────┬──────┘
               │
        ┌──────▼──────┐
        │    store    │  tầng 2.5 — import shared + registry
        └──────┬──────┘
     ┌─────────┼─────────┐
     ▼         ▼         ▼
 ┌──────┐ ┌───────┐ ┌───────┐
 │  ui  │ │ depth │ │ scene │  tầng 2
 └───┬──┘ └───┬───┘ └───┬───┘
     └────────┼─────────┘
              ▼
        ┌──────────┐
        │  shared  │  tầng 1 — không import gì của ta
        └──────────┘
```

**Luật:**

1. `shared` không import module nào của ta. Muốn import → thứ đó không thuộc `shared`.
2. Tầng 2 chỉ import `shared` (và `store` khi cần đọc state).
3. Tầng 2 **không import lẫn nhau**. Dữ liệu đi ngang qua kiểu khai báo ở `shared/types.ts`, do `App.tsx` làm trung gian.
4. `App.tsx` là nơi duy nhất biết cả ba module tồn tại.

Ví dụ: `scene/depth-preview.ts` cần `DepthMap` nhưng **không** import `depth/`. Kiểu đó sống ở `shared/types.ts`.

> Luật này vốn sinh ra để thoả gate phi-chu-trình của Toolcraft. Toolcraft đã bỏ,
> nhưng luật thì giữ — nó vẫn là cách rẻ nhất để test module độc lập và để biết
> chắc sửa một chỗ không làm hỏng chỗ khác.

---

## Nơi đặt file

| Loại | Nơi |
|---|---|
| Source | `src/` |
| Tài liệu học | `docs/learn/` |
| Script tiện ích | `tools/` |
| Asset tĩnh | `public/` |
| Test | cạnh file nó test, `*.test.ts` |
| Shader | `src/scene/shaders/*.glsl` (P2) |

## Lệnh

```bash
npm run dev           # Vite, port 5173, có header cross-origin isolation
npm run models:fetch  # tải model default ~47 MB về public/models/
npm run typecheck     # tsc -b
npm run test          # vitest
npm run build         # tsc -b && vite build
npm run lint          # oxlint
```
