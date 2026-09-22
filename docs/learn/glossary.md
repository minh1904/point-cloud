# Thuật ngữ

Tra khi gặp, không cần đọc một lượt.

---

## Depth estimation

**Monocular depth estimation** — đoán độ sâu từ **một** ảnh duy nhất, không cần stereo hay LiDAR. Bản chất là bài toán thiếu điều kiện: model phải dựa vào tri thức về thế giới (vật gì thường to bằng nào, phối cảnh, bóng đổ).

**Relative depth / disparity** — output của DA2, DA3, MiDaS. Giá trị **không có đơn vị**, chuẩn hoá riêng cho từng ảnh, và **nghịch đảo**: số lớn = gần camera. Hệ quả thực tế: cùng một `depthScale`, hai ảnh khác nhau cho độ dày rất khác nhau. Không thể auto-calibrate.

**Metric depth** — output của DepthPro, Metric3D. Giá trị là **mét thật**. Cho phép unprojection đúng hình học, và so sánh được giữa các ảnh.

**`focallength_px`** — tiêu cự tính theo pixel, DepthPro trả về kèm depth. Có nó mới làm được [perspective unprojection](#unprojection).

**Unprojection** — từ pixel 2D + depth dựng lại điểm 3D thật:
```
x = (u - cx) * z / f
y = (v - cy) * z / f
z = depth
```
Cần `f` (tiêu cự) và `cx, cy` (principal point, thường là tâm ảnh). Không có `f` thì chỉ làm được [relief](#relief).

**Relief** — chế độ dựng hình "phù điêu": đặt hạt trên mặt phẳng rồi đẩy theo trục z. `z = (d - 0.5) * scale`. Hình học **không đúng** (quay camera sẽ thấy méo) nhưng là lựa chọn duy nhất với model relative, và hoàn toàn hợp lệ cho mục đích nghệ thuật.

**Edge smearing** — hiện tượng hạt bị kéo thành "màng" ở mép vật thể, do depth đơn ảnh không có mặt sau. Chống bằng [edge rejection](#edge-rejection).

**Edge rejection** — loại hoặc làm mờ hạt ở nơi gradient depth lớn. Là fix **bắt buộc**, không phải tuỳ chọn. Xem [pointcloud.md](modules/pointcloud.md#edge-rejection--phần-quan-trọng-nhất).

---

## Noise và chuyển động

**Value noise** — noise sinh bằng cách gán số random cho các điểm lưới rồi nội suy giữa chúng. Rẻ hơn Perlin, đủ mượt cho mục đích thị giác.

**fBM (fractional / fractal Brownian motion)** — cộng nhiều tầng noise, mỗi tầng tần số gấp đôi và biên độ giảm một nửa. Cho ra cấu trúc **fractal**: có chi tiết ở nhiều thang độ, giống thứ tự nhiên tạo ra.

```
value = Σ amplitude_i * noise(frequency_i * st)
amplitude_i+1 = amplitude_i * 0.5
frequency_i+1 = frequency_i * 2.0
```

**Domain rotation** — xoay hệ toạ độ mỗi octave của fBM (`mat2` góc ~0.5 rad). Phá artifact axis-aligned làm noise trông như lưới. Công thức của Inigo Quilez.

**Curl noise** — lấy gradient của một trường scalar rồi **quay 90°**: `vec2(dy, -dx)`. Kết quả là trường **divergence-free**.

**Divergence-free (∇·v = 0)** — trường vector không có nguồn và không có giếng. Hạt đi theo nó thì xoáy, cuộn, và **bảo toàn thể tích** — không bị hút dồn về một điểm hay bắn tán ra. Đây là lý do toán học khiến particle system nhìn "sống". Không phải số lượng hạt.

**Analytic motion / stateless motion** — vị trí là hàm thuần của thời gian: `position = f(uv, uTime)`. Đối lập với **stateful simulation** (có velocity buffer, tích phân từng bước).

| | Analytic (dự án này) | Stateful simulation |
|---|---|---|
| Sai số tích luỹ | Không | Có |
| Scrub/seek theo thời gian | Được | Không |
| Ping-pong FBO | Không cần | Cần |
| Va chạm, flocking, né chuột | Không làm được | Làm được |

Bài Codrops gốc tên là "Simulating Life" nhưng thực chất dùng analytic motion — không có simulation có state nào.

---

## WebGL / GPU

**`GL_POINTS`** — primitive vẽ mỗi đỉnh thành một điểm vuông. Một draw call cho toàn bộ hạt. Rất rẻ về vertex.

**`gl_PointSize`** — kích thước điểm, đặt trong vertex shader. Bị cap bởi `ALIASED_POINT_SIZE_RANGE` (~64 px trên Safari và một số GPU). Muốn to hơn phải dùng instanced quads.

**`gl_PointCoord`** — toạ độ 0..1 trong một point, dùng ở fragment shader để vẽ hình tròn mềm:
```glsl
float d = length(gl_PointCoord - 0.5);
float alpha = pow(1.0 - smoothstep(0.0, 0.5, d), 1.5);
```

**Fill rate / overdraw** — chi phí ghi pixel. Với alpha blending và point to, nhiều hạt cùng ghi lên một pixel → đây là bottleneck thật của particle system, **không phải** số vertex. Tối ưu: render ở resolution thấp hơn rồi upscale.

**FBO (Frame Buffer Object) / render target** — buffer off-screen để render vào thay vì ra màn hình. Dùng cho post-processing, hoặc render ở resolution khác.

**Ping-pong buffer** — hai FBO đổi vai đọc/ghi mỗi frame, để làm simulation có state trên GPU. Dự án này **không dùng** (motion analytic).

**GPGPU** — dùng GPU cho tính toán tổng quát, không phải vẽ. Ping-pong FBO là dạng GPGPU trên WebGL.

**Data texture** — texture dùng để chứa **dữ liệu**, không phải hình ảnh. Bắt buộc `NoColorSpace` và thường `NearestFilter`.

**`unpackAlignment`** — WebGL mặc định giả định mỗi dòng texture căn theo 4 byte. Với texture R8 (1 byte/pixel) mà width không chia hết cho 4, phải đặt `= 1` nếu không ảnh bị lệch dần theo dòng.

**LUT (Look-Up Table)** — bảng tra màu, thường là texture 3D hoặc strip 2D, dùng để color grading. Đổi file LUT là đổi toàn bộ tông màu mà không sửa shader.

**LinearFilter vs NearestFilter** — nội suy mượt giữa các pixel, hay lấy pixel gần nhất. Với ảnh thì Linear đẹp hơn. Với **dữ liệu đã đóng gói bit** thì Linear **phá hoàn toàn** — phải Nearest.

---

## Encoding và nén

**16-bit split (high/low byte)** — lưu một số 16-bit vào hai texture 8-bit: `value = high * 256 + low`. Bài Codrops dùng cách này. Lý do thật (bài không nói): để đi nhờ định dạng **PNG** — lossless, nén tốt, decode bằng image decoder native của browser.

**Quantization** — nén dải giá trị liên tục về số nguyên có hạn. Ở dự án này: float world-space → `uint16` theo `bounds`.
```
q = round((v - min) / (max - min) * 65535)
v = min + q / 65535 * (max - min)
```
**Chú ý `65535`, không `65536`** — max của uint16. Lưới 256×256 cho 65536 hạt, hai số này trùng nhau một cách tình cờ và là bug chờ nổ.

**SoA (Structure of Arrays)** — `{ positions: [...], colors: [...] }`. Đối lập với **AoS (Array of Structures)** — `[{x,y,z,r,g,b}, ...]`. Với JSON, SoA tiết kiệm rất nhiều vì không lặp tên field mỗi phần tử.

**`dtype` trong ONNX** — độ chính xác weight: `fp32` (gốc), `fp16` (nửa size), `q8` (8-bit, ~1/4), `q4` (4-bit, ~1/8). Càng thấp càng nhỏ và nhanh, chất lượng giảm dần.

---

## AI trong browser

**ONNX** — định dạng model trung lập giữa các framework. Cầu nối để model PyTorch chạy được trong browser.

**ONNX Runtime Web** — engine chạy ONNX trong browser, backend WebGPU hoặc WASM.

**Transformers.js** — thư viện của Hugging Face bọc ONNX Runtime Web, lo cả pre/post-processing (resize, normalize, decode output). Đây là phần đáng dùng nhất — tự làm pre/post-processing là chỗ dễ sai nhất.

**WebGPU** — API GPU thế hệ mới, có compute shader. Chrome/Edge tốt, Safari 18+, Firefox mới có. Cần cho inference nhanh.

**WASM fallback** — chạy inference trên CPU. Chậm hơn nhiều nhưng chạy mọi nơi. Luôn phải có.

**`SharedArrayBuffer`** — cần cho WASM đa luồng. Chỉ có khi trang được **cross-origin isolated**.

**Cross-origin isolation** — trạng thái trang khi có đủ hai header `COOP: same-origin` + `COEP: credentialless`. Kiểm tra: `crossOriginIsolated === true`. Thiếu nó, ORT âm thầm về single-thread, chậm 3–4 lần, **không báo lỗi**.

**`COEP: credentialless` vs `require-corp`** — `require-corp` chặn mọi asset cross-origin (kể cả model từ HF CDN). Dùng `credentialless`.

---

## Toolcraft

**Signed file** — file bị manifest integrity bảo vệ. Sửa → `npm run test` fail. Gồm `src/toolcraft/**`, `src/routes/**`, `index.html`, `vite.config.ts`, `AGENTS.md`, `docs/toolcraft/**`, và **nội dung các script npm**.

**Schema control** — control UI khai báo dưới dạng dữ liệu (`{ id, kind, ... }`), runtime dựng ra. Đối lập với việc tự render component form.

**`canvasContent`** — port để cắm output sản phẩm vào canvas của runtime. Chỉ được chứa output, không chứa UI chrome.

**`useToolcraftProductSceneFrame()`** — hook trả về product rect, backing size, world-to-local translation. **Nguồn duy nhất** cho kích thước và hệ toạ độ. Không đo DOM.

**`rasterFrameRenderer`** — callback tất định vẽ một frame trong toạ độ scene, để runtime dùng khi export ảnh/video.

**`sceneBoundsProvider`** — trả rect world-space của scene sản phẩm, cho cả live output và export.

**`onPanelAction`** — handler cho action không thuộc export chuẩn. Đây là đường hợp lệ để export JSON của ta.

**Artifact export** — export ảnh/SVG/video do runtime sở hữu hoàn toàn. Product code chỉ cung cấp `renderFrame`.

**Non-export download** — download do sản phẩm khởi tạo qua `onPanelAction`, trả Promise thật. Đây là loại của export JSON.

**`rendererTechnique`** — khai báo bắt buộc trước khi viết shader: mỗi pass có cost, frequency, lifecycle, execution location, cache key, invalidation.

**Acceptance test** — ~80 test trong `src/app/app-acceptance.*.test.ts` enforce design system. Bị ký, không sửa được. Fail nghĩa là schema của bạn sai, không phải test sai.
