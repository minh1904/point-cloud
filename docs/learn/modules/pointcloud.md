# Module `src/pointcloud`

> **Công dụng trong một câu:** biến `DepthMap` + pixel ảnh thành point cloud đã lượng tử hoá, rồi serialize thành file JSON nén.

**Tầng:** 2 · **Import:** chỉ `src/shared` · **Chạy ở:** Web Worker · **Test:** bắt buộc, đầy đủ

---

## Đọc code ở đây trước

Nếu bạn mới vào dự án, đây là module nên đọc code đầu tiên. Nó là **toán học thuần**: không GPU, không React, không async, không state. Vào là ra, dễ test, dễ debug. Ba module còn lại đều vướng một loại phức tạp bên ngoài; module này không.

---

## Vì sao module này tồn tại riêng

Vì dữ liệu point cloud **không tồn tại ở đâu cả** cho đến khi module này chạy.

Ở đường render, vị trí hạt được tính on-the-fly trong vertex shader từ hai texture. Không có mảng nào trên CPU chứa nó. Muốn export, phải dựng lại từ đầu bằng TypeScript.

Đó là gánh nặng, nhưng đánh đổi có lý: render không phải giữ 262 000 × 3 float trong RAM, và GPU không phải chờ CPU chuẩn bị buffer.

Xem [02-data-flow.md](../02-data-flow.md#hai-đường-song-song---cạm-bẫy-lớn-nhất) — đây chính là một nửa của "hai đường song song".

---

## File và trách nhiệm

### `build.ts` — depth map → point cloud

Bốn việc, theo thứ tự:

**1. Duyệt lưới.** `gridSize × gridSize` ô, mỗi ô lấy tâm ô làm mẫu:

```ts
const u = (gx + 0.5) / gw;
const v = (gy + 0.5) / gh;
```

`+ 0.5` là lấy tâm pixel, không phải góc. Bỏ nó đi thì point cloud lệch nửa pixel và mép phải/dưới bị thiếu một hàng.

**2. Edge rejection** — xem mục riêng bên dưới, đây là phần quan trọng nhất.

**3. Dựng vị trí**, một trong hai phép chiếu tuỳ `DepthMap.kind`:

```ts
// relief — cho model relative (DA2/DA3)
const x = (u - 0.5) * 2 * aspect;
const y = (0.5 - v) * 2;              // lật y: texture v hướng xuống, world y hướng lên
const z = (d - 0.5) * depthScale;

// perspective — cho model metric (DepthPro), unprojection thật
const z = depthMeters;
const x = (u * imgW - cx) * z / focalLengthPx;
const y = (cy - v * imgH) * z / focalLengthPx;
```

**4. Quantize** về `Uint16Array` theo `bounds`.

### `serialize.ts` — point cloud → Blob

Không dùng `JSON.stringify`. Lý do ở mục *Kích thước* bên dưới.

```ts
function* serialize(pc: PointCloud, meta: Meta) {
  yield '{"format":"pointcloud-json","version":1';
  yield `,"count":${pc.count}`;
  // ...
  yield* arrayField("positions", pc.positions, pc.count * 3);
  yield* arrayField("colors", pc.colors, pc.count * 3);
  yield* arrayField("density", pc.density, pc.count);
  yield "}";
}

function* arrayField(name: string, arr: Uint16Array | Uint8Array, len: number) {
  yield `,"${name}":[`;
  for (let i = 0; i < len; i += CHUNK) {
    const end = Math.min(i + CHUNK, len);
    yield arr.subarray(i, end).join(",");   // native, nhanh
    if (end < len) yield ",";
  }
  yield "]";
}
```

`TypedArray.prototype.join` là native và rất nhanh. Vì mảng đã là số nguyên, không có rủi ro `-0.30000000000000004`.

### `compress.ts` — gzip

Dùng **`fflate`**, đã có sẵn trong dependencies của Toolcraft. Không cần thêm thư viện, và ổn định hơn `CompressionStream` (API này thiếu ở một số môi trường).

### `export-worker.ts`

Chạy `build` + `serialize` + `compress` off main thread. Vòng lặp 262 000 vòng cộng với việc dựng string vài MB sẽ làm đứng UI vài trăm ms nếu để ở main thread.

---

## Edge rejection — phần quan trọng nhất

Depth đơn ảnh **không có mặt sau**. Ở mép một vật thể, depth nhảy đột ngột từ gần sang xa. Các hạt rơi vào vùng nhảy đó bị kéo dài thành một "màng" nối vật thể với hậu cảnh. Nhìn rất bẩn, và bài Codrops gốc **không hề cảnh báo**.

Cách xử lý: đo gradient depth bằng central difference, hạt nào ở vách thì loại hoặc làm mờ.

```ts
const gX = sampleDepth(dx + 1, dy) - sampleDepth(dx - 1, dy);
const gY = sampleDepth(dx, dy + 1) - sampleDepth(dx, dy - 1);
const edge = Math.hypot(gX, gY);

if (edge >= EDGE.hi) continue;                        // loại hẳn
const alpha = 1 - smoothstep(EDGE.lo, EDGE.hi, edge); // mờ dần
```

Ba hệ quả:

1. **`count < gridSize²`.** Đây là lý do `PointCloud.count` là field riêng, không suy ra từ `grid`. Với lưới 512², thường còn ~240 k trong 262 k.
2. **`alpha` được lưu vào `density`.** Shader dùng nó làm độ mờ; file JSON giữ nó để viewer khác tái hiện được.
3. **Công thức này phải khớp từng dòng với shader.** `EDGE.lo` và `EDGE.hi` đến từ `shared/config.ts`, không hardcode ở cả hai nơi.

---

## Vì sao `uint16`

Depth map nguồn chỉ có **8-bit — 256 mức**. Lưu `z` với 6 chữ số thập phân là tự huyễn hoặc: độ chính xác đó không tồn tại ở nguồn.

`uint16` cho 65 536 mức, đã thừa so với 256 mức của depth và 512 bước của lưới. Đổi lại file nhỏ hơn rõ rệt và JSON chỉ chứa số nguyên.

Giải mã: `world = min + (v / 65535) * (max - min)`.

> **Chú ý `65535`, không phải `65536`.** Đây là chỗ bài Codrops gốc nhầm — họ chia cho `uParticleCount` (65536, vì lưới 256×256). Hai con số trùng nhau một cách tình cờ và đó là bug chờ nổ khi đổi kích thước lưới. Hằng số ở `shared/config.ts` tên là `QUANT.positionMax = 65535`.

---

## Kích thước

Quyết định lớn nhất về kích thước là **SoA (structure of arrays)** thay vì array of objects. Nó bỏ được việc lặp `"x":`, `"y":`, `"z":` 240 000 lần.

```jsonc
// SAI — ~60 byte/hạt
[{ "x": -0.123, "y": 0.234, "z": -0.345, "r": 212, "g": 180, "b": 143 }, ...]

// ĐÚNG — ~35 byte/hạt
{ "positions": [32768, 12045, 40122, ...], "colors": [212, 180, 143, ...] }
```

| Lưới | Hạt (sau reject) | JSON quantized | `.json.gz` |
|---|---|---|---|
| 256×256 | ~60 k | ~2.1 MB | **~600 KB** |
| 384×384 | ~135 k | ~4.8 MB | ~1.3 MB |
| 512×512 | ~240 k | ~8.5 MB | ~2.3 MB |

Con số 600 KB ở dòng đầu gần trùng với ~604 KB mà bài Codrops đạt được bằng 4 file PNG — nên JSON + gzip là phương án hoàn toàn cạnh tranh.

**Tại sao không `JSON.stringify`.** Nó dựng một string 8 MB trong RAM rồi mới tạo Blob. Generator + `Blob` từ nhiều mảnh thì bộ nhớ đỉnh thấp hơn nhiều và không jank.

---

## Schema JSON

```jsonc
{
  "format": "pointcloud-json",
  "version": 1,
  "createdAt": "2026-09-22T10:31:00Z",
  "count": 241893,
  "grid": [512, 512],
  "source": { "name": "photo.jpg", "width": 1920, "height": 1080 },
  "model": "onnx-community/depth-anything-v2-small",
  "projection": "relief",          // hoặc "perspective"
  "focalLengthPx": null,           // có giá trị khi projection = perspective
  "params": { "depthScale": 0.6, "aspect": 1.77778, "edgeThreshold": [0.02, 0.12] },
  "bounds": { "min": [-1.77778, -1, -0.3], "max": [1.77778, 1, 0.3] },
  "attributes": {
    "position": { "components": 3, "encoding": "uint16-normalized" },
    "color":    { "components": 3, "encoding": "uint8-srgb" },
    "density":  { "components": 1, "encoding": "uint8" }
  },
  "positions": [/* count * 3 */],
  "colors":    [/* count * 3 */],
  "density":   [/* count */]
}
```

`model`, `projection`, `focalLengthPx`, `params` không phải metadata trang trí — không có chúng thì người mở file sau này không biết dữ liệu mang nghĩa gì, và không tái hiện được.

---

## Hợp đồng vào/ra

```ts
// VÀO
build(input: {
  depth: DepthMap;
  pixels: Uint8ClampedArray;   // RGBA từ getImageData
  imageSize: readonly [number, number];
  grid: number;
  depthScale: number;
  projection: Projection;
}): PointCloud

// RA
serialize(pc: PointCloud, meta: Meta): Blob        // application/json
compress(blob: Blob): Promise<Blob>                // application/gzip
```

Tất cả đều thuần trừ `compress`. Không đọc DOM, không chạm WebGL, không biết React tồn tại.

---

## Ràng buộc Toolcraft áp lên module này

| Ràng buộc | Cách tuân thủ |
|---|---|
| Export thuộc runtime | Module chỉ **tạo Blob**. Không `URL.createObjectURL`, không `<a download>`, không file picker. Việc tải file do `actions.onPanelAction` ở `app` làm |
| Progress phải là Promise thật | `export-worker` báo progress qua Comlink callback → `app` chuyển thành `reportProgress(0..1)` |
| Không import test từ production | `build.test.ts` import `build.ts`, chiều ngược lại không bao giờ |
| Phi chu trình | Chỉ import `shared` |

---

## Cạm bẫy

**Quên `+ 0.5` khi lấy tâm ô.** Point cloud lệch nửa pixel, và hàng/cột cuối bị mất. Khó thấy bằng mắt, nhưng test round-trip bắt được.

**Quên lật `y`.** Texture `v` hướng xuống, world `y` hướng lên. Quên → point cloud bị lật ngược. Dễ thấy, dễ sửa, nhưng hay xảy ra vì shader và TypeScript lật ở hai chỗ khác nhau.

**Lệch công thức với shader.** Cạm bẫy nguy hiểm nhất, vì nó **im lặng**: hạt trên màn hình đẹp, file JSON lại khác. Chống bằng `config.ts` + test đối chiếu render-vs-build.

**`perspective` cần `cx`, `cy` thật.** Mặc định là tâm ảnh (`imgW/2`, `imgH/2`), nhưng nếu ảnh đã bị crop lệch thì principal point không còn ở tâm. Đừng giả định — nếu không biết, dùng `relief`.

**Xuất trạng thái nào?** Mặc định xuất **base state** (`t = 0`, chưa cộng curl noise). Noise tái sinh được từ `uTime` nên không cần lưu. Nếu sau này muốn xuất pose đang animate, phải readback từ GPU (`readRenderTargetPixels` trên một float FBO) — đường hoàn toàn khác, không phải sửa `build.ts`.

---

## Cách kiểm chứng

Đây là module duy nhất **bắt buộc** có test Vitest đầy đủ, vì nó thuần và vì bug ở đây im lặng.

```bash
npx vitest run src/pointcloud
```

Phải cover:

| Test | Bắt được gì |
|---|---|
| Depth phẳng (mọi giá trị = 128) → mọi `z` bằng nhau | Sai công thức z |
| Depth gradient ngang → `z` đơn điệu | Lệch trục, lật sai |
| `quantize(bounds.min)` → 0, `quantize(bounds.max)` → 65535 | Lỗi off-by-one 65535/65536 |
| Round-trip quantize → dequantize | Sai số vượt một bước lượng tử |
| Depth có vách nhân tạo → `count < grid²` | Edge rejection không chạy |
| `serialize` rồi `JSON.parse` → khớp `PointCloud` gốc | Sai dấu phẩy, sai chunk |
| Grid 1×1 và grid lớn nhất | Lỗi biên |
| `projection: "perspective"` không có `focalLengthPx` → throw | State vô nghĩa lọt qua |

Và test giá trị nhất, nằm ở Playwright: **render 8×8 rồi readback pixel, so với output `build.ts` cùng tham số.** Đây là thứ duy nhất chứng minh được hai đường song song không lệch nhau.

---

## Đọc thêm

- [02-data-flow.md](../02-data-flow.md) — vị trí module này trong luồng
- [shared.md](shared.md) — `QUANT`, `EDGE`, `math.ts`
- [scene.md](scene.md) — bản GLSL của cùng công thức
