# P6.2 · Chọn model depth (và cái lưới an toàn bên dưới)

## Mục tiêu

Đây là bước **quyết định**, không phải bước code. Câu hỏi: lấy độ sâu của một tấm ảnh phẳng ở đâu ra?

Từ P3 tới giờ, độ sâu trong bundle mẫu là **giả** — `scripts/build-sample-bundle.ts` đoán nó từ hai mẹo hội hoạ. Bước này chốt cách làm thật, và đồng thời biến cái mẹo hội hoạ ấy từ "chỗ tạm" thành một **lớp dự phòng có vai trò rõ ràng**.

Kết quả: Depth Anything V2 Small chạy qua transformers.js, WebGPU với dự phòng WASM. Và `heuristicDepth` ở lại, vì nó chạy trong vài mili-giây khi model còn đang tải.

## Khái niệm

### 1. Monocular depth là gì, và nó **không** cho ta cái gì

Một tấm ảnh là phép chiếu của thế giới 3D xuống 2D. Thông tin chiều sâu bị mất — theo đúng nghĩa toán học, một pixel có thể là bất cứ điểm nào trên một tia. Stereo (hai mắt) hay LiDAR lấy lại được; một tấm ảnh thì không.

Mạng neural monocular depth không "lấy lại" thông tin đó. Nó **đoán**, từ những gì đã học trên hàng triệu ảnh: người thường cao chừng này, bầu trời thì xa, vật bị che thì ở sau vật che nó, kết cấu càng mịn càng xa.

Hai hệ quả phải nhớ, vì cả hai đều ảnh hưởng tới code:

- **Độ sâu là tương đối, không có đơn vị.** Không có mét, không có gốc. Chỉ thứ tự và tỉ lệ là có nghĩa. May thay, [P6.7](p6-7-nang-len-2-5d.md) cũng chỉ cần đúng ngần ấy.
- **Nhiều model xuất *inverse depth*** — số càng **lớn** nghĩa là càng **gần**. Đảo dấu nhầm thì được một đám mây lộn ngược trong ngoài, trông vẫn hợp lý cho tới khi xoay camera.

### 2. Chọn cái nào, và giá bao nhiêu

Ứng viên mặc định trong roadmap là **Depth Anything V2 Small** qua transformers.js. Số đo thật của repo `onnx-community/depth-anything-v2-small` (đo bằng `Content-Length`):

| Bản | Dung lượng | Chạy ở đâu |
|---|---|---|
| fp32 | 99.1 MB | đâu cũng chạy, chậm nhất |
| fp16 | 49.6 MB | WebGPU (fp16 là kiểu gốc ở đó) |
| q8 (uint8) | 27.3 MB | WASM, nhỏ hơn fp32 gần 4 lần |

Cộng thêm khoảng 2 MB thư viện. Vậy lần dùng đầu tiên tốn **28–50 MB** tuỳ máy, sau đó trình duyệt cache lại.

Nhiều cho một trang web. Rất ít cho việc nó làm.

Các lựa chọn khác và lý do loại:

- **MidaS small** — cũ hơn, cùng cỡ, cạnh vật thể tệ hơn thấy rõ. Depth Anything V2 là hậu duệ của nó.
- **Depth Pro / Marigold** — metric depth, tốt hơn hẳn, và nặng 1–4 GB. Không phải thứ để tải về trình duyệt.
- **Gọi server** — không phải tải gì, nhưng phải **gửi ảnh của người dùng đi đâu đó**, mà dự án này không có backend. Giữ ảnh ở lại trên máy đáng giá mấy chục megabyte.

### 3. WebGPU trước, WASM sau

`transformers.js` cho chọn `device` và `dtype`. Code thử theo thứ tự:

```ts
const attempts = [
  { device: "webgpu", dtype: "fp16" },
  { device: "wasm",   dtype: "q8"   },
];
```

WebGPU nhanh hơn vài lần và lấy bản fp16 — vốn chỉ bằng nửa bản fp32. Nhưng một máy có thể **khai báo có WebGPU rồi vẫn dựng session thất bại**, nên `try/catch` bao rộng: hỏng thì trả giá bằng một lần tải nữa, chứ không phải bằng một tính năng chết.

### 4. Vì sao mẹo hội hoạ vẫn ở lại

`heuristicDepth` dùng hai quy tắc mà hoạ sĩ đã dùng từ thời Phục Hưng:

- **Phối cảnh không khí** (*aerial perspective*): không khí tán xạ ánh sáng, nên vật ở xa **sáng hơn và nhạt màu hơn**. Công thức `luma * (1 - saturation)` lên cao ở bầu trời mù và xuống thấp ở chiếc áo xanh đậm tiền cảnh.
- **Mặt đất**: với máy ảnh nhìn ngang tầm mắt, đáy khung hình là chỗ ta đứng, đỉnh khung hình là đường chân trời. Chỉ chỉ số hàng đã mang thông tin khoảng cách.

Cả hai sai theo những cách rất dễ đoán — áo trắng thành ở xa, ảnh chụp chúi xuống thì không có mặt đất nào. Nhưng nó ở lại vì ba lý do thật:

1. Chạy vài mili-giây, nên **cả pipeline có bản đồ để làm việc ngay** trong lúc model đang tải.
2. Không cần mạng, không cần WebGPU, không cần 27 MB trọng số.
3. Nó chính là code mà `scripts/build-sample-bundle.ts` đã dùng từ P3. Dùng chung nghĩa là **một chỗ để sai, không phải hai**.

Và thứ cứu cả hai đường là **relief nông** ở [P6.7](p6-7-nang-len-2-5d.md): ở mức 3% bề ngang, một độ sâu sai vẫn là một độ sâu sai nhỏ.

## Đi qua code

### `apps/point-cloud/src/photo/depth/depth-map.ts` (mới)

File này gần như chỉ có một interface, và đó là lý do nó tồn tại:

```ts
export interface DepthMap {
  width: number;
  height: number;
  /** 0 = gần nhất, 1 = xa nhất, một giá trị mỗi pixel, hàng 0 ở trên cùng. */
  data: Float32Array;
  kind: DepthModelId;
}
```

Chốt quy ước ở một chỗ. Mọi nguồn độ sâu phải quy về **0 là gần, 1 là xa** — và chính quy ước này là thứ mà model vi phạm.

### `apps/point-cloud/src/photo/depth/heuristic-depth.ts` (mới)

Chuyển từ script sang, thêm chuẩn hoá và bán kính blur theo kích thước ảnh:

```ts
raw[y * width + x] = HAZE_WEIGHT * (luma * (1 - saturation)) + (1 - HAZE_WEIGHT) * far;
// …
const radius = Math.max(1, Math.round(Math.min(width, height) / 128));
return { …, data: normalise(boxBlur(raw, width, height, radius, 2)), kind: "heuristic" };
```

Blur trước khi dùng là bắt buộc: màu từng pixel là một ước lượng khoảng cách rất nhiễu, và một chiếc lá đen lọt vào nền trời sẽ thành một cái gai relief.

### `apps/point-cloud/src/photo/depth/model-depth.ts` (mới)

Chỗ đảo quy ước nằm ở cuối:

```ts
const relative = normalise(predicted);
const data = new Float32Array(pixels);
for (let i = 0; i < pixels; i++) data[i] = 1 - relative[i]!;
```

`predicted_depth` mà pipeline trả về đã được nội suy về đúng kích thước ảnh đầu vào (đọc `src/pipelines/depth-estimation.js` trong package để chắc), nên không còn phép resample nào phải tự làm. Chỉ chuẩn hoá rồi lật.

Và `env.allowLocalModels = false` — không có thư mục `/models` nào được phục vụ, thiếu dòng này thì việc đầu tiên thư viện làm là 404 hàng loạt vào chính origin của mình.

### `apps/point-cloud/src/photo/filters.ts` (mới)

Hai hàm dùng chung cho cả 6.2 và 6.4. `boxBlur` viết **tách biến** (separable):

> Trung bình một ô vuông (2r+1)² bằng trung bình theo hàng rồi trung bình theo cột. Với r = 4 đó là 18 phép đọc thay vì 81.

Và lặp nhiều lượt box blur thì tiến gần Gaussian — theo đúng định lý giới hạn trung tâm, cùng lý do tổng nhiều con xúc xắc ra hình chuông. Ba lượt rẻ thắng một Gaussian đắt.

## Lỗi đã gặp

1. **Suýt chọn `output.depth` thay vì `output.predicted_depth`.** Pipeline trả cả hai: `depth` là `RawImage` 8-bit tiện xem, `predicted_depth` là tensor float32. Với relief 3%, 256 mức của 8-bit đủ để sinh banding. Đọc source của package mới thấy `predicted_depth` đã được nội suy về đúng cỡ ảnh — nghĩa là không có lý do gì để lấy bản 8-bit.
2. **Quên mất model xuất inverse depth.** Không có dòng `1 - relative[i]` thì preview ra nền trời đen và người sáng — nhìn preview là biết ngay, và đó chính là lý do [P6.3](p6-3-worker-va-huy.md) bỏ công vẽ preview.
3. **Tưởng phải cấu hình bundler cho onnxruntime.** Hoá ra transformers.js mặc định trỏ `wasmPaths` vào CDN jsdelivr, nên chạy được mà không cần đụng vào `next.config.ts`. Đổi lại: cần mạng lúc chạy.

## Tự thử

1. **So hai nguồn trên cùng một ảnh.** Bấm nút `Model:` trong panel Depth để về `Painter's cues`, xem preview, rồi bấm lại sang Depth Anything V2. Chỗ nào mẹo hội hoạ sai nhiều nhất? Thử một ảnh có áo trắng, và một ảnh chụp chúi xuống mặt đất.
2. **Đảo dấu cho biết mặt.** Bỏ phép `1 - relative[i]` trong `model-depth.ts`. Preview đổi thế nào, và đám mây trong 3D trông ra sao khi xoay camera?
3. **Đổi `HAZE_WEIGHT`.** Đặt về 0 (chỉ còn mặt đất) rồi về 1 (chỉ còn sương mù). Ảnh phong cảnh hợp cái nào, ảnh chân dung hợp cái nào?
4. **Bỏ blur trong heuristic.** Đổi `passes` thành 0 rồi xây lại đám mây. Nhìn relief ở vùng cỏ — đó là nhiễu màu biến thành nhiễu hình học.
5. **Đo giá thật.** Mở tab Network, lọc `onnx`, xoá cache rồi thả ảnh. Máy bạn tải bản nào, mất bao lâu? So với bảng ở trên.

## Đọc thêm

- [Hugging Face — `onnx-community/depth-anything-v2-small`](https://huggingface.co/onnx-community/depth-anything-v2-small)
- [Tài liệu transformers.js](https://huggingface.co/docs/transformers.js/index)
- [Wikipedia — Aerial perspective](https://en.wikipedia.org/wiki/Aerial_perspective)
- [Wikipedia — Box blur](https://en.wikipedia.org/wiki/Box_blur)
- [Ghi chú nghiên cứu UntilLabs](../research/01-untillabs-method.md) — mục 2.2 về relief nông
