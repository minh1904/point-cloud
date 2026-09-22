# Module `src/depth`

> **Công dụng trong một câu:** biến một `ImageBitmap` thành `DepthMap` bằng model AI chạy hoàn toàn trong browser, và cho user chọn model nào.

**Tầng:** 2 · **Import:** chỉ `src/shared` · **Chạy ở:** Web Worker

---

## Vì sao module này tồn tại riêng

Inference là thứ duy nhất trong app **không đồng bộ, nặng, và có thể thất bại vì lý do ngoài tầm kiểm soát** (không có WebGPU, mạng chết khi tải model, máy hết RAM). Cô lập nó ra nghĩa là ba module còn lại không cần biết gì về ONNX, WebGPU, hay quantization.

Ngoài ra nó hoàn toàn không liên quan đến đồ hoạ. Có thể đọc, test, thay thế module này mà không mở một file GLSL nào.

---

## File và trách nhiệm

### `registry.ts` — trái tim của tính năng chọn model

Thêm model mới = thêm một object. Không sửa code ở đâu khác.

```ts
export const MODELS = [
  {
    id: "onnx-community/depth-anything-v2-small",
    label: "Depth Anything V2 Small",
    badge: "default",
    dtype: "fp16",
    sizeMB: 50,
    kind: "relative",
    inputSize: 518,
    selfHosted: true,          // nằm trong public/models/
  },
  {
    id: "en970/depth-anything-v3-small-onnx",
    label: "Depth Anything V3 Small",
    badge: "experimental",
    dtype: "q8",
    sizeMB: 29,
    kind: "relative",
    inputSize: 322,
  },
  {
    id: "onnx-community/depth-anything-v2-base",
    label: "Depth Anything V2 Base",
    badge: "quality",
    dtype: "fp16",
    sizeMB: 190,
    kind: "relative",
    inputSize: 518,
  },
  {
    id: "onnx-community/DepthPro-ONNX",
    label: "Apple Depth Pro (metric)",
    badge: "metric",
    dtype: "q4",
    sizeMB: 480,
    kind: "metric",
    inputSize: 1536,
  },
] as const;
```

`kind` là field quan trọng nhất: nó quyết định phép chiếu nào khả dụng ở [pointcloud](pointcloud.md). `relative` → chỉ `relief`. `metric` → thêm `perspective`.

**Vì sao 4 model chứ không 10?** Có hơn 30 model depth trên Hugging Face tương thích transformers.js. Nhưng mỗi model là một bộ quirk riêng: input size khác, output shape khác, cách normalize khác. Ship 10 model là ship 10 đường code chưa test. Bốn model đã cover đủ trục đánh đổi: nhẹ / mới / chất lượng / metric.

**Vì sao DA2-small là default mà không phải DA3?** DA3 tốt hơn về chất lượng (vượt DA2 hơn 10% trên ETH3D) nhưng bản ONNX là community upload với ~229 downloads. DA2-small có 73.4k downloads. Với một feature mà lỗi sẽ khiến app trắng xoá, số downloads là tín hiệu quan trọng hơn điểm benchmark.

### `depth-worker.ts` — chạy inference

```ts
import { pipeline, env } from "@huggingface/transformers";

env.allowRemoteModels = true;        // model không self-host tải từ HF CDN
env.localModelPath = "/models/";     // model self-host đọc từ public/

let cached: { id: string; fn: unknown } | null = null;

async function getEstimator(modelId: string, dtype: string) {
  if (cached?.id === modelId) return cached.fn;   // đổi ảnh không nạp lại model
  cached?.fn && await dispose(cached.fn);
  const fn = await pipeline("depth-estimation", modelId, {
    device: await pickDevice(),   // "webgpu" nếu có, ngược lại "wasm"
    dtype,
    progress_callback: (p) => postProgress(p),
  });
  cached = { id: modelId, fn };
  return fn;
}
```

Hai điều đáng chú ý:

- **Cache theo `modelId`.** Đổi ảnh thì không nạp lại model. Đổi model thì dispose cái cũ trước — nếu không, hai session ONNX cùng giữ VRAM và máy yếu sẽ chết.
- **`progress_callback`** là cách duy nhất để hiện progress tải model. 50 MB trên mạng chậm là vài chục giây; không có progress thì user tưởng app treo.

### `depth-client.ts` — vòng đời worker phía main thread

Bọc worker bằng Comlink, và quan trọng hơn: **quản lý huỷ**. User đổi model giữa lúc đang inference là chuyện thường. Không huỷ được thì kết quả cũ sẽ ghi đè kết quả mới.

```ts
let currentRun = 0;
export async function estimate(bitmap: ImageBitmap, model: ModelEntry) {
  const run = ++currentRun;
  const result = await proxy.estimate(transfer(bitmap, [bitmap]), model);
  if (run !== currentRun) return null;   // đã có yêu cầu mới hơn, bỏ kết quả này
  return result;
}
```

### `colormap.ts` — tô màu depth map để xem

Depth map thô là ảnh xám, mắt người rất khó đọc gradient xám. `turbo` và `inferno` làm sự khác biệt depth nhìn rõ hơn nhiều.

Đây là hàm thuần, không GPU: nhận `Uint8Array` 1 kênh, trả `Uint8ClampedArray` RGBA để `scene` upload làm texture preview.

---

## Hợp đồng vào/ra

```ts
// VÀO
estimate(bitmap: ImageBitmap, model: ModelEntry): Promise<DepthMap | null>

// RA — kiểu khai báo ở shared/types.ts
type DepthMap = {
  data: Uint8Array;        // width * height, 1 kênh, 0 = xa, 255 = gần
  width: number;
  height: number;
  kind: "relative" | "metric";
  focalLengthPx?: number;  // chỉ model metric
  modelId: string;
}
```

Trả `null` nghĩa là "kết quả này đã lỗi thời, bỏ đi" — không phải lỗi. Lỗi thật thì throw.

**Module này không biết** point cloud là gì, không biết Three.js tồn tại, không import `src/pointcloud` hay `src/scene`.

---

## Ràng buộc Toolcraft áp lên module này

| Ràng buộc | Cách tuân thủ |
|---|---|
| Không render control thủ công | Model picker là `{ kind: "select" }` trong `app-schema.ts`, options sinh từ `MODELS` |
| State sản phẩm thuộc schema | `selectedModelId` ở schema. Trạng thái worker (`idle`/`loading`/`running`) là `useState` — nó thuần UI, không cần persist |
| `canvasContent` chỉ chứa output | Progress bar tải model **không** vẽ trong canvas. Nó thuộc panel, qua cơ chế progress của runtime |
| Dependency phi chu trình | Chỉ import `shared` |

---

## Cạm bẫy

**WebGPU không phải lúc nào cũng có.** Chrome/Edge tốt, Safari 18+ có, Firefox mới có. Luôn phải có nhánh `device: "wasm"`. Đừng phát hiện bằng user-agent — thử `navigator.gpu?.requestAdapter()` rồi bắt lỗi.

**Fallback WASM chậm âm thầm.** Nếu thiếu header COOP/COEP, ORT rơi về single-thread, chậm 3–4 lần và **không báo gì**. Xem [01-toolcraft-constraints.md](../01-toolcraft-constraints.md#cross-origin-isolation). Kiểm tra `crossOriginIsolated`.

**Depth là *tương đối* và *nghịch đảo*.** Model relative trả disparity chuẩn hoá riêng cho từng ảnh. Cùng một `depthScale`, hai ảnh khác nhau sẽ cho độ dày rất khác. **Đừng cố auto-calibrate** — cho user một slider và để họ quyết định.

**Đổi model là đổi cả `kind`.** Nếu user đang ở chế độ `perspective` với DepthPro rồi đổi sang DA2, `perspective` không còn hợp lệ. Phải tự động fallback về `relief` và cho user biết, đừng để state vô nghĩa.

**Model 480 MB trên điện thoại.** DepthPro tải 480 MB rồi inference ở 1536² — máy yếu sẽ hết RAM. Registry có `sizeMB` chính để cảnh báo trước khi bấm, không phải để hiển thị cho đẹp.

**`dispose` trước khi nạp model mới.** Bỏ qua bước này là nguyên nhân số một của "app chạy được 3 lần rồi crash".

---

## Cách kiểm chứng

```bash
npx vitest run src/depth        # registry: id hợp lệ, không trùng, kind đúng
```

Test Vitest cho module này chỉ cover được `registry.ts` và `colormap.ts` — hai thứ thuần. Inference thật cần browser, nên thuộc Playwright:

- Tải model default → có `DepthMap` với `width/height > 0`
- Đổi model giữa lúc đang chạy → không có kết quả cũ ghi đè
- Buộc `device: "wasm"` → vẫn ra kết quả (chỉ chậm hơn)
- Model không tồn tại → báo lỗi có thể đọc được, không phải trắng màn

Một test rẻ mà giá trị cao: ảnh gradient đơn giản (trái đen, phải trắng) → depth map phải đơn điệu theo trục ngang. Nếu không, đường pre/post-process đang sai.

---

## Đọc thêm

- [pointcloud.md](pointcloud.md) — người tiêu thụ `DepthMap`, và chỗ `kind` quyết định phép chiếu
- [Transformers.js — depth estimation](https://huggingface.co/docs/transformers.js/en/index)
- [onnx-community/depth-anything-v2-small](https://huggingface.co/onnx-community/depth-anything-v2-small)
- [en970/depth-anything-v3-small-onnx](https://huggingface.co/en970/depth-anything-v3-small-onnx)
- [onnx-community/DepthPro-ONNX](https://huggingface.co/onnx-community/DepthPro-ONNX)
