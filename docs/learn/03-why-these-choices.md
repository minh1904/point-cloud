# Nhật ký quyết định

Mỗi quyết định ghi lại **cái gì đã chọn, cái gì đã loại, và vì sao**. Đọc để hiểu ràng buộc; nếu ràng buộc đổi, quyết định nên xem lại.

---

## Q1 — Framework: Toolcraft, không phải Vite thuần

**Loại:** Vite + React tự setup · Next.js

**Vì sao Toolcraft:** app này là **design tool**, và Toolcraft là starter kit cho đúng thể loại đó. Nó cho sẵn canvas pan/zoom, image uploader, slider, curve editor, persistence, undo/redo, image export, và một bộ test acceptance enforce design system. Tự viết lại những thứ này là vài tuần.

**Vì sao không Next.js:** app 100% client-side, không có gì để SSR. Next chỉ thêm ma sát khi bundle Worker + WASM.

**Cái giá:** Toolcraft ràng buộc rất chặt — không thêm được route, không render control thủ công, không tự sở hữu canvas. Xem [01-toolcraft-constraints.md](01-toolcraft-constraints.md). Đây là đánh đổi có ý thức: mất tự do bố cục, được tính nhất quán và ~80 test miễn phí.

**Xem lại khi:** cần nhiều hơn một màn thật sự độc lập, hoặc cần server (share link, gallery).

---

## Q2 — Renderer: Three.js thuần, không R3F

**Loại:** React Three Fiber · WebGPURenderer + TSL

**Vì sao:** catalog provider của Toolcraft là **catalog đóng**, và Three.js có đúng một dòng: `backend: "webgl"`, `provider: "three"`. R3F không có trong đó. Sâu hơn: R3F muốn sở hữu canvas + render loop, Toolcraft đã sở hữu canvas backing + scene frame + export compositing. Hai bên tranh nhau thì thua.

**Vì sao không WebGPU/TSL:** ta đã cần WebGPU cho ONNX inference. Để Three.js cũng tranh GPU adapter là thêm một biến số chưa biết. Giữ WebGL cho render, WebGPU cho inference — hai thế giới tách biệt.

**Xem lại khi:** cần compute shader thật (ví dụ chuyển sang simulation có state).

---

## Q3 — Chuyển động: analytic, không simulation

**Loại:** GPGPU ping-pong với velocity buffer

**Vì sao:** `position = f(uv, uTime)` không tích luỹ sai số, scrub được theo thời gian, và giữ `state: "stateless"` trong `rendererTechnique` — theo doc Toolcraft, pass feedback tạo áp lực chọn WebGPU, mà ta muốn ở WebGL (xem Q2).

**Cái mất:** không có va chạm, không flocking, hạt không né chuột được.

**Ghi chú:** bài Codrops gốc tên là "Simulating Life in the Browser" nhưng cũng dùng analytic motion — không có simulation có state nào trong đó. Tiêu đề hơi quá so với nội dung.

**Xem lại khi:** tương tác chuột trở thành yêu cầu thật. Lúc đó cần ping-pong FBO và có thể cần WebGPU.

---

## Q4 — Model AI: 4 model, default là DA2-small

**Loại:** ship cả 10+ model tương thích · chỉ 1 model · DA3 làm default

**Vì sao 4:** có hơn 30 model depth trên HF tương thích transformers.js. Nhưng mỗi model là một bộ quirk riêng (input size, output shape, cách normalize) phải test. Bốn model cover đủ trục đánh đổi:

| Model | Vai trò |
|---|---|
| `depth-anything-v2-small` (fp16 ~50 MB) | default — 73.4k downloads, battle-tested |
| `depth-anything-v3-small-onnx` (q8 ~29 MB) | experimental — DA3 mới, ~101 ms @322px |
| `depth-anything-v2-base` (fp16 ~190 MB) | quality — desktop + WebGPU |
| `DepthPro-ONNX` (q4) | metric — trả `focallength_px`, mở ra perspective mode |

**Vì sao DA2-small là default, không phải DA3:** DA3 tốt hơn về chất lượng (vượt DA2 hơn 10% trên ETH3D). Nhưng bản ONNX là community upload với ~229 downloads, chỉ có q8, test ở 322px. DA2-small có 73.4k downloads và bản chính thức từ `onnx-community`. Với một feature mà lỗi làm app trắng màn, số downloads quan trọng hơn điểm benchmark.

**Đã loại nhưng đáng nhớ:** `metric3d-vit-small` (metric nhẹ hơn DepthPro), `distill-any-depth-base-onnx` (tỉ lệ sharp/size tốt), `dinov3-vitl16-chmv2-dpt-head-ONNX` (backbone DINOv3 mới), `dpt-hybrid-midas` (baseline so sánh phong cách), `depth-anything-v2-large` (~660 MB, quá nặng).

**Xem lại khi:** `onnx-community` ra bản DA3 chính thức → đổi default.

---

## Q5 — Self-host model default, lazy-fetch phần còn lại

**Loại:** self-host cả 4 · tải cả 4 từ HF CDN

**Vì sao:** 4 model = 700 MB+, không self-host hết được. Nhưng nếu tải hết từ CDN thì lần chạy đầu phụ thuộc HF còn sống và phải xử lý CORS + COEP cùng lúc.

Nên: **model default nằm trong `public/models/`** (lần đầu luôn chạy, không phụ thuộc bên ngoài), 3 model còn lại lazy-fetch từ HF CDN với `COEP: credentialless`.

50 MB không commit vào repo — script `predev`/`prebuild` tải về, `.gitignore` chặn.

**Sửa lại lời khuyên cũ:** ở bản plan đầu tôi nói self-host tất cả. Với 4 model thì không khả thi.

---

## Q6 — Xuất JSON, dù bài Codrops đã bỏ JSON

**Loại:** chỉ bake PNG như Codrops · chỉ `.ply`

**Vì sao vẫn JSON:** yêu cầu sản phẩm là JSON, và JSON là định dạng web-to-web dễ dùng nhất. Cái sai của bài Codrops không phải "dùng JSON" mà là **viết JSON naive** — array of objects, full float precision, 20 MB.

**Cách tránh lặp lại:** SoA + quantize uint16 + serialize theo chunk + gzip. Kết quả ở lưới 256²: ~600 KB, gần trùng với ~604 KB mà Codrops đạt được bằng 4 file PNG. JSON + gzip cạnh tranh hoàn toàn.

**Đang cân nhắc:** thêm nút export `.ply` binary — nhỏ hơn ~2 lần, mở được trong Blender/CloudCompare/MeshLab, tốn ~30 dòng code. JSON giữ cho web-to-web.

---

## Q7 — Quantize uint16, không float32

**Vì sao:** depth map nguồn chỉ có **8-bit — 256 mức**. Lưu `z` với 6 chữ số thập phân là tự huyễn hoặc về độ chính xác. uint16 cho 65 536 mức, đã thừa.

**Đi kèm một bài học từ code gốc:** bài Codrops chia `position16bit / uParticleCount` (65536) trong khi max của uint16 là **65535**. Hai số trùng nhau vì lưới của họ là 256×256 = 65536. Đây là bug chờ nổ khi đổi kích thước lưới. Ở dự án này hằng số tên là `QUANT.positionMax = 65535` và có comment giải thích.

---

## Q8 — Hai worker, không phải một

**Vì sao:** worker AI giữ session ONNX nặng và **sống lâu** (cache theo `modelId`, đổi ảnh không nạp lại). Worker export **sinh ra rồi chết** theo từng lần bấm. Gộp lại thì mỗi lần export giữ session ONNX sống vô ích trong bộ nhớ, và ngược lại mỗi lần đổi model lại mất luôn code export đang chạy.

---

## Q9 — `config.ts` là nguồn sự thật duy nhất

**Vấn đề nó giải:** cùng một phép biến đổi được cài **hai lần** — GLSL (render) và TypeScript (export). Nếu lệch nhau, người dùng thấy hạt đẹp trên màn hình nhưng file JSON xuất ra lại khác. Bug **im lặng**, phát hiện rất muộn.

**Ba lớp phòng thủ:**
1. `shared/config.ts` — không hằng số nào viết trực tiếp trong `.glsl` hay `build.ts`. GLSL nhận qua uniform.
2. `shared/math.ts` — bản TypeScript của `smoothstep`/`remap`, comment trỏ sang cặp GLSL.
3. Test đối chiếu: render 8×8, readback pixel, so với `build.ts`. Đây là test giá trị nhất của dự án.

---

## Q10 — Luật phụ thuộc 4 tầng

**Vì sao:** Toolcraft từ chối đồ thị import có chu trình và in ra vòng lặp ngắn nhất khi vi phạm. Thay vì xử lý từng vụ, đặt một luật đơn giản đủ để nhớ:

```
app (tầng 3) → import được tất cả
depth · pointcloud · scene (tầng 2) → chỉ import shared
shared (tầng 1) → không import gì của ta
```

Tầng 2 **không import lẫn nhau**. Dữ liệu đi ngang qua kiểu khai báo ở `shared/types.ts`, do `app` làm trung gian.

**Cái giá:** một chút gián tiếp — `pointcloud` cần `DepthMap` nhưng không được import `depth`. **Cái nhận:** gate không bao giờ đỏ vì chu trình, và test được từng module độc lập.

---

## Những chỗ bài Codrops thiếu hoặc sai

Ghi lại vì đây là kiến thức đắt — phải tự phát hiện.

| Vấn đề | Bài viết | Thực tế |
|---|---|---|
| **Edge smearing** | Không nhắc | Hạt bị kéo thành màng ở mép vật thể. Cần edge rejection, là fix **bắt buộc** |
| **Filter texture** | Không nhắc | Data texture đóng gói bit **phải** `NearestFilter`. `LinearFilter` nội suy byte thấp → vị trí thành rác |
| **Color space** | Không nhắc | Data texture phải `NoColorSpace`. sRGB decode bóp phi tuyến → sai hết |
| **`65535` vs `65536`** | Chia cho `uParticleCount` | Max uint16 là 65535. Trùng nhau vì lưới 256² |
| **Lý do split 16-bit** | Chỉ nói "giảm size" | Lý do thật: để đi nhờ PNG — lossless, nén tốt, decode native |
| **Nguồn point cloud** | "via any 3D Point Cloud tool", "an internal tool" | Đây là 50% công việc và bị nói lướt hoàn toàn |
| **Bottleneck** | Nhấn vào số hạt | Bottleneck là **fill rate/overdraw**, không phải vertex. 60k `GL_POINTS` rất nhẹ |
| **"Simulating"** | Tiêu đề | Là analytic motion, không có simulation có state |
| **Mouse/scroll** | Không nhắc | Website thật có, bài viết bỏ trống |

Ghi nhận công bằng: phần **fBM + curl noise** và **ý tưởng nén dữ liệu vào texture** là hai đóng góp thật và đáng lấy. `vec2(dy, -dx)` để có trường divergence-free là insight cốt lõi làm particle nhìn "sống".

---

## Nguồn

- [Simulating Life in the Browser](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/) — Codrops, Bautista Berto (basement.studio)
- [pixel-point/toolcraft](https://github.com/pixel-point/toolcraft)
- [Depth Anything 3 paper](https://arxiv.org/html/2511.10647v1)
- [Transformers.js](https://huggingface.co/docs/transformers.js/en/index)
