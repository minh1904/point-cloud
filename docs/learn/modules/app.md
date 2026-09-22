# Module `src/app`

> **Công dụng trong một câu:** khai báo toàn bộ UI dưới dạng schema, và nối ba module tầng 2 vào các port của Toolcraft runtime.

**Tầng:** 3 (đỉnh) · **Import:** tất cả · **Đọc cuối cùng**

---

## Vì sao đọc module này cuối

Nó gần như không có logic. Nó là **bản đồ dây nối**. Đọc trước khi hiểu `depth`, `pointcloud`, `scene` thì chỉ thấy một danh sách tên hàm vô nghĩa.

Đây cũng là module duy nhất biết cả ba module tầng 2 tồn tại. Nhờ vậy tầng 2 không cần biết về nhau, và đồ thị phụ thuộc không có chu trình.

---

## Hai file quan trọng

Toolcraft quy định: *"Generated applications keep their public entry surface in `src/app/app-composition.tsx` and `src/app/app-schema.ts`."*

### `app-schema.ts` — toàn bộ UI, dưới dạng dữ liệu

Đây là chỗ khiến Toolcraft khác mọi framework React bạn từng dùng. **Không có component form nào.** Bạn khai báo control là dữ liệu, runtime dựng UI.

```ts
export const appSchema = {
  sections: [
    {
      id: "source",
      label: "Source",
      controls: [
        { id: "fileDrop", kind: "file-drop", accept: "image/*" },
        {
          id: "modelId",
          kind: "select",
          label: "Depth model",
          // options sinh từ src/depth/registry.ts — một nguồn sự thật
          options: MODELS.map((m) => ({
            value: m.id,
            label: `${m.label} · ${m.sizeMB} MB`,
            badge: m.badge,
          })),
          defaultValue: MODELS[0].id,
        },
      ],
    },
    {
      id: "view",
      label: "View",
      controls: [
        {
          id: "viewMode",
          kind: "segmented",
          options: ["2D Depth", "3D Particles"],
          defaultValue: "2D Depth",
        },
        { id: "colormap", kind: "select", options: ["grayscale", "turbo", "inferno"] },
        { id: "splitPosition", kind: "slider", min: 0, max: 1, step: 0.01, defaultValue: 0.5 },
      ],
    },
    {
      id: "geometry",
      label: "Geometry",
      controls: [
        { id: "gridSize", kind: "select", options: PARTICLE.gridSizes, defaultValue: PARTICLE.defaultGrid },
        { id: "depthScale", kind: "slider", min: DEPTH.scaleMin, max: DEPTH.scaleMax, step: 0.01, defaultValue: DEPTH.scaleDefault },
        { id: "depthCurve", kind: "curve" },     // curve editor của Toolcraft
        { id: "projection", kind: "segmented", options: ["relief", "perspective"] },
      ],
    },
  ],
  panelActions: [
    { id: "exportJson", label: "Export JSON", kind: "generate" },
  ],
} as const;
```

**Điều bạn nhận miễn phí** khi khai báo thay vì tự viết: reset từng section, undo/redo, persistence qua reload, import/export settings dưới dạng JSON, keyframe cho animation, và ~80 test acceptance kiểm tra label/thứ tự/nhóm của bạn có hợp lý không.

**Điều bạn mất:** quyền tự do bố cục. Runtime quyết định control trông thế nào. Với app này thì đó là đánh đổi tốt — UI của ta gần như chỉ là canvas.

`options` của model picker sinh từ `MODELS` trong `src/depth/registry.ts`. Đừng viết tay danh sách ở hai chỗ.

### `app-composition.tsx` — nối port

```tsx
export const composition = composeToolcraftApp(appSchema, {
  scene: {
    canvasContent: SceneHost,              // ← src/scene
    rasterFrameRenderer: { renderFrame },  // ← src/scene, cho export ảnh
    sceneBoundsProvider,                   // ← src/scene
  },
  actions: {
    onPanelAction: async (action, { reportProgress }) => {
      if (action.id === "exportJson") {
        // Promise THẬT, progress THẬT — xem 01-toolcraft-constraints mục 5
        return exportPointCloud({ onProgress: reportProgress });
      }
    },
  },
  modules: [
    mediaSourceModule(),
    imageExportModule(),
  ],
});
```

---

## Vai trò trung gian: chống chu trình

`pointcloud` cần `DepthMap`, nhưng **không** import `depth`. `app` là nơi dữ liệu đi ngang:

```
depth.estimate()  ──►  DepthMap  ──►  app  ──►  scene   (upload texture)
                                        └────►  pointcloud (khi export)
```

Kiểu `DepthMap` khai báo ở `shared/types.ts`, nên cả `depth` và `pointcloud` cùng nhìn xuống tầng 1, không nhìn ngang nhau. Chi tiết: [STRUCTURE.md](../../../STRUCTURE.md#quy-tắc-phụ-thuộc).

Cái giá là một chút gián tiếp. Cái nhận được là gate code-health không bao giờ đỏ vì chu trình, và test được từng module độc lập.

---

## Điều phối: khi nào chạy lại cái gì

Đây là logic thật duy nhất trong module. Nó trả lời: control nào đổi thì phải làm lại việc gì?

| Control đổi | Chạy lại inference? | Upload lại texture? | Vẽ lại? | Build lại point cloud? |
|---|---|---|---|---|
| ảnh mới | ✅ | ✅ | ✅ | khi export |
| `modelId` | ✅ | chỉ depth | ✅ | khi export |
| `viewMode` | ❌ | ❌ | ✅ | ❌ |
| `colormap` | ❌ | ❌ | ✅ | ❌ |
| `depthScale` | ❌ | ❌ | ✅ | khi export |
| `gridSize` | ❌ | ❌ | ✅ (tạo lại geometry) | khi export |
| `projection` | ❌ | ❌ | ✅ | khi export |

Ba điều quan trọng đọc ra từ bảng:

1. **Inference chỉ chạy lại khi ảnh hoặc model đổi.** Kéo `depthScale` mà chạy lại AI thì app không dùng được.
2. **Point cloud chỉ build khi bấm export.** Không build sẵn — đó là vòng lặp 262 k vô ích mỗi lần kéo slider.
3. **`viewMode` không làm gì ngoài vẽ lại.** Đây là lợi ích của việc không có route: đổi màn không mất gì.

### Xử lý `projection` không hợp lệ

Khi user đổi từ DepthPro (metric) sang DA2 (relative), `projection: "perspective"` không còn hợp lệ. `app` phải tự đưa về `"relief"` và cho user biết, không để state vô nghĩa tồn tại:

```ts
const model = MODELS.find((m) => m.id === modelId)!;
const effectiveProjection = model.kind === "metric" ? projection : "relief";
```

---

## Hợp đồng vào/ra

```ts
export const composition: ToolcraftComposition   // duy nhất
```

Route đã ký (`src/routes/index.tsx`) host `<ToolcraftApp/>` và đọc composition này. Ta không chạm vào route.

---

## Ràng buộc Toolcraft áp lên module này

Module này chịu **nhiều ràng buộc nhất**, vì nó là bề mặt công khai.

| Ràng buộc | Cách tuân thủ |
|---|---|
| Chỉ dùng extension point được phép | `scene.*`, `actions.onPanelAction`, `controls.renderers`, `modules` — không tự dựng panel |
| Không hand-compose `ToolcraftRoot`, `CanvasShell`, `ControlsPanel`... | Chỉ `composeToolcraftApp` + `ToolcraftApp` |
| Mọi control hiện ra phải bind vào schema state hoặc runtime command | Không `useState` cho giá trị sản phẩm |
| `defaultValue` cho control reset được | Có ở mọi control |
| Dùng runtime command | `controls.reset`, `media.import`, `history.undo`... — không tự viết |
| `app-identity.ts` do generator sở hữu | Không sửa. Đặt tên bằng cờ `--name` lúc scaffold |
| Export ảnh/SVG/video thuộc runtime | `imageExportModule()` + `rasterFrameRenderer` |
| Non-export download được phép | `exportJson` qua `onPanelAction`, trả Promise thật |
| `app-acceptance.*.test.ts` bị ký | Không sửa test để làm nó xanh. Sửa schema cho đúng |

Dòng cuối là điều dễ gây bực nhất khi mới vào. Test acceptance sẽ bắt lỗi những thứ như label control không nhất quán, thứ tự section không theo cohesion, thiếu reset. Đó là **thiết kế có chủ đích** — nó ép design system nhất quán. Đọc `docs/toolcraft/core/layout.md` và `core/control-selection.md` khi bị chặn.

---

## Cạm bẫy

**Định viết một component form.** Phản xạ tự nhiên khi thấy "cần model picker" là viết `<ModelPicker/>`. Sai. Đó là một entry trong schema.

**Duplicate danh sách model.** `options` phải sinh từ `MODELS`. Viết tay ở `app-schema.ts` là tạo nguồn sự thật thứ hai.

**Chạy inference trong React render.** Phải trong effect, có huỷ, có cờ "kết quả đã lỗi thời". User kéo slider 20 lần trong một giây là chuyện thường.

**Build point cloud mỗi lần state đổi.** Chỉ build khi bấm export.

**Quên trả Promise thật từ `onPanelAction`.** Trả `void` thì runtime tưởng xong ngay, progress ở footer biến mất trong khi worker còn chạy.

**Sửa `app-acceptance.*.test.ts` để nó xanh.** File bị ký. `npm run test` sẽ fail vì integrity, không phải vì test.

---

## Cách kiểm chứng

```bash
npm run typecheck
npm run test        # gồm ~80 test acceptance kiểm schema
npm run ai:check    # code health + vị trí file
```

Test acceptance đã cover phần lớn module này sẵn. Phần ta cần thêm ở Playwright là hành vi điều phối:

| Test | Bắt được gì |
|---|---|
| Kéo `depthScale` → không có network request | Chạy lại inference oan |
| Đổi `modelId` giữa lúc inference → chỉ kết quả mới thắng | Race condition |
| Đổi `viewMode` → không upload lại texture | Tạo lại tài nguyên oan |
| Model metric → relative → `projection` tự về `relief` | State vô nghĩa |
| Bấm Export JSON → progress ở footer chạy tới 100% | `onPanelAction` không trả Promise thật |
| Reload trang → mọi control giữ giá trị | Persistence không hoạt động |

---

## Đọc thêm

- [01-toolcraft-constraints.md](../01-toolcraft-constraints.md) — 8 ràng buộc, đọc trước
- `docs/toolcraft/schema-reference.md` — danh sách đầy đủ `kind` của control
- `docs/toolcraft/core/layout.md` — luật về section, label, thứ tự
- `docs/toolcraft/core/control-selection.md` — chọn control nào cho việc gì
- [depth.md](depth.md) · [pointcloud.md](pointcloud.md) · [scene.md](scene.md) — ba thứ module này nối
