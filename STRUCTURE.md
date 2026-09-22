# Cấu trúc thư mục

Ba loại quyền sở hữu. Nhầm lẫn giữa chúng là nguyên nhân số một làm `npm run test` đỏ.

| Ký hiệu | Nghĩa |
|---|---|
| 🔒 | **Bị ký số (signed).** Toolcraft kiểm tra hash. Sửa → `npm run test` fail. Không bao giờ chạm vào. |
| 🤖 | **Do generator tạo.** Sửa được nhưng sẽ bị ghi đè khi regenerate. |
| ✍️ | **Của chúng ta.** Toàn quyền. |

---

## Cây đầy đủ

```
point-cloud/
├─ 🔒 index.html
├─ 🔒 vite.config.ts            ← COOP/COEP header cắm ở đây (xem 01-toolcraft-constraints)
├─ 🔒 tsconfig.json
├─ 🔒 playwright.config.ts
├─ 🔒 AGENTS.md                 ← hợp đồng cho AI agent, Toolcraft sở hữu
├─ 🔒 LICENSE.md · NOTICE.md
├─ ✍️ README.md                 ← điểm vào cho người đọc
├─ ✍️ STRUCTURE.md              ← file này
├─ 🤖 package.json              ← scripts bị ký, dependencies thì sửa được
│
├─ docs/
│  ├─ 🔒 toolcraft/             ← docs hợp đồng của framework. THÊM FILE VÀO ĐÂY = FAIL
│  │                               (ngoại lệ duy nhất: agent-worklog.md, workflow-observation.md)
│  ├─ ✍️ learn/                 ← tài liệu học của dự án  ◀── ĐỌC Ở ĐÂY
│  │   ├─ 00-reading-order.md
│  │   ├─ 01-toolcraft-constraints.md
│  │   ├─ 02-data-flow.md
│  │   ├─ 03-why-these-choices.md
│  │   ├─ glossary.md
│  │   └─ modules/{shared,depth,pointcloud,scene,app}.md
│  ├─ ✍️ assets/                ← ảnh cho tài liệu (vị trí durable duy nhất cho ảnh docs)
│  └─ 🤖 agent-journal/         ← lịch sử thao tác, text-only
│
├─ 🔒 src/toolcraft/            ← BẢN COPY RUNTIME ĐÃ KÝ. Bất khả xâm phạm.
│  │                               Đọc để học thì rất nên; sửa thì không bao giờ.
│  ├─ runtime/
│  │  ├─ modules/built-ins/     ← layers, timeline, masks, media-source,
│  │  │                            model-3d, spatial-view, image/svg/video-export
│  │  ├─ modules/contract/      ← protocol: definition, command, persistence, surface
│  │  ├─ composition/           ← ghép module → app
│  │  └─ export/ · model-import/
│  ├─ ui/                       ← control components (Slider, Select, Color, FileDrop...)
│  │                               ⚠️ KHÔNG import trực tiếp từ đây
│  ├─ renderer-providers/       ← three / native-webgl / vgpu(webgpu)
│  └─ integrations/vgpu/
│
├─ 🔒 src/main.tsx · router.tsx · styles.css
├─ 🔒 src/routes/{root,index}.tsx   ← CHỈ host <ToolcraftApp/>. Không thêm route được.
│
├─ src/app/                     ← BỀ MẶT CÔNG KHAI của sản phẩm
│  ├─ ✍️ app-schema.ts          ← khai báo MỌI control (model picker, slider, action)
│  ├─ ✍️ app-composition.tsx    ← nối port: canvasContent, rasterFrameRenderer,
│  │                               sceneBoundsProvider, onPanelAction
│  ├─ 🤖 app-identity.ts        ← generator sở hữu, đặt tên bằng cờ --name
│  ├─ 🤖 app-defaults.json      ← snapshot trạng thái mặc định
│  ├─ 🤖 acceptance/            ← catalog capability proof
│  └─ 🔒 app-acceptance.*.test.ts  ← ~80 test enforce design system
│
├─ ✍️ src/shared/               ── MODULE: hằng số + kiểu + toán thuần
│  ├─ README.md                    (bản copy của docs/learn/modules/shared.md)
│  ├─ config.ts                    ⭐ NGUỒN SỰ THẬT DUY NHẤT cho tham số
│  ├─ types.ts                     hợp đồng dữ liệu giữa các module
│  └─ math.ts                      smoothstep, clamp, remap, quantize
│
├─ ✍️ src/depth/                ── MODULE: AI depth estimation
│  ├─ README.md
│  ├─ registry.ts                  metadata 4 model (id, size, dtype, kind, inputSize)
│  ├─ depth-worker.ts              transformers.js pipeline, chạy off main thread
│  ├─ depth-client.ts              Comlink proxy + quản lý vòng đời worker
│  └─ colormap.ts                  grayscale / turbo / inferno cho preview
│
├─ ✍️ src/pointcloud/           ── MODULE: depth map → point cloud → file
│  ├─ README.md
│  ├─ build.ts                     relief + perspective, edge rejection, quantize
│  ├─ serialize.ts                 generator theo chunk → Blob (không dựng string 8MB)
│  ├─ compress.ts                  gzip qua fflate (đã có sẵn trong deps)
│  ├─ export-worker.ts             build + serialize off main thread
│  └─ *.test.ts                    Vitest — module duy nhất bắt buộc có unit test
│
├─ ✍️ src/scene/                ── MODULE: Three.js product output
│  ├─ README.md
│  ├─ renderer-technique.ts        khai báo pass/cost/cache cho assessToolcraftRenderPlan
│  ├─ scene-host.tsx               mount vào scene.canvasContent, đọc useToolcraftProductSceneFrame
│  ├─ depth-preview.ts             pass 2D: ảnh gốc ↔ depth map, split slider
│  ├─ particle-cloud.ts            pass 3D: GL_POINTS, orbit
│  ├─ raster-frame.ts              scene.rasterFrameRenderer cho export ảnh
│  └─ shaders/
│     ├─ particles.vert.glsl · particles.frag.glsl
│     └─ lib/noise.glsl             random → value noise → fBM → curlNoise
│
├─ 🤖 public/models/depth-anything-v2-small/   ← self-host model default (gitignore)
├─ 🤖 public/toolcraft-defaults/               ← binary của app-defaults.json
├─ 🔒 e2e/                      ← Playwright: acceptance + performance + kernel benchmark
├─ 🔒 scripts/                  ← gate: ai:check, files:check, verify:*
└─ 🤖 .toolcraft/               ← scratch, artifact, journal, receipt (gitignore)
   ├─ scratch/                     file tạm của agent
   └─ browser-artifacts/           screenshot, trace
```

---

## Quy tắc phụ thuộc

Toolcraft **bắt buộc** đồ thị phụ thuộc của product phải phi chu trình (acyclic) và sẽ in ra vòng lặp ngắn nhất khi vi phạm. Ta ép nó bằng một luật 4 tầng đơn giản:

```
        ┌─────────────┐
        │  src/app    │  tầng 3 — import được tất cả
        └──────┬──────┘
     ┌─────────┼─────────┐
     ▼         ▼         ▼
 ┌───────┐ ┌────────┐ ┌───────┐
 │ depth │ │pointcl.│ │ scene │  tầng 2 — chỉ import shared
 └───┬───┘ └───┬────┘ └───┬───┘
     └─────────┼──────────┘
               ▼
         ┌──────────┐
         │  shared  │  tầng 1 — không import gì của ta
         └──────────┘
```

**Luật:**

1. `shared` không import bất kỳ module nào của ta. Nếu thấy muốn import → thứ đó không thuộc `shared`.
2. Tầng 2 (`depth`, `pointcloud`, `scene`) **chỉ** import `shared` — không import lẫn nhau.
3. Dữ liệu đi ngang giữa tầng 2 phải qua kiểu khai báo trong `shared/types.ts`, do `app` làm trung gian truyền.
4. `app` là nơi duy nhất biết cả 3 module tồn tại.

Ví dụ: `pointcloud` cần `DepthMap` — nhưng **không** import từ `depth`. Kiểu `DepthMap` sống ở `shared/types.ts`; `depth` sinh ra nó, `app` chuyển nó sang `pointcloud`. Đổi lấy một chút gián tiếp, nhận lại: không bao giờ có chu trình, test module độc lập được, và luật đủ đơn giản để nhớ.

---

## Nơi được đặt file

| Loại file | Nơi đặt |
|---|---|
| Source sản phẩm | bất kỳ đâu dưới `src/` (trừ `src/toolcraft`, `src/routes`) |
| Tài liệu học | `docs/learn/` |
| Ảnh cho tài liệu | `docs/assets/` |
| Test fixture | `e2e/fixtures/` |
| File tạm, thí nghiệm | `.toolcraft/scratch/<task>/` |
| Screenshot, trace debug | `.toolcraft/browser-artifacts/` |
| Style | `*.module.css` cạnh component, **selector phải local** |

Đặt sai chỗ → `npm run files:check` báo. Đặt file mới vào `docs/toolcraft/` → `npm run test` fail.
