# Luồng dữ liệu

## Sơ đồ tổng

```
        MAIN THREAD                WORKER 1              GPU              WORKER 2
        ───────────                ────────              ───              ────────

 [1] User kéo ảnh vào
        │
        │  runtime media.import → IndexedDB
        ▼
 [2] ImageBitmap ────────────────────► [3] depth inference
                                            transformers.js
                                            ONNX Runtime
                                            (WebGPU / WASM)
                                                 │
        ◄────── DepthMap ────────────────────────┘
        │       Uint8Array 1 kênh
        │
        ├──────────────────────────────────────────► [4] upload 2 texture
        │                                                 uColor  (RGBA8)
        │                                                 uDepth  (R8)
        │                                                      │
        │                                                      ▼
        │                                              [5] vertex shader
        │                                                  đọc 2 texture
        │                                                  → position + màu
        │                                                  + fBM/curl noise
        │                                                      │
        │                                                      ▼
        │                                                  render GL_POINTS
        │
        └──────────────────────────────────────────────────────────────► [6] build
                                                                              quantize
                                                                              serialize
                                                                              gzip
                                                                                │
        ◄───────────────────── Blob ────────────────────────────────────────────┘
        │
        ▼
 [7] runtime download qua actions.onPanelAction
```

**Điểm quan trọng:** nhánh [4]→[5] (render) và nhánh [6] (export) **độc lập**. Chúng đọc cùng dữ liệu nguồn nhưng không dùng chung đường tính toán. Xem mục *Hai đường song song* bên dưới — đây là chỗ dễ sinh bug nhất trong toàn dự án.

---

## Từng bước

### [1] Upload — runtime sở hữu

Ta **không** viết dropzone. Runtime `media-source` module xử lý: nhận file, validate, ghi bytes vào IndexedDB repository, tạo scene entity, phát metadata vào workspace persistence.

Ta chỉ khai báo trong schema là app cần `fileDrop`, rồi đọc media đã commit.

### [2] Giải mã ảnh

`ImageBitmap` là dạng trung gian. Từ nó rẽ hai đường:

- `createImageBitmap()` → truyền vào worker AI (transferable, zero-copy)
- `THREE.Texture` → upload thẳng lên GPU làm `uColor`

### [3] Depth inference — `src/depth`

Chạy trong Worker vì inference chiếm 100 ms–3 s; để ở main thread là đứng UI.

```
ImageBitmap
  → processor: resize về inputSize của model (322 / 518 / 1536), normalize
  → ONNX session run
  → predicted_depth (Float32, độ phân giải của model)
  → post-process: normalize về 0..255
  → RawImage (Uint8Array, 1 kênh)
```

Model **relative** (DA2/DA3) trả về *inverse relative depth* (disparity): giá trị lớn = gần camera, không có đơn vị, chuẩn hoá riêng cho từng ảnh.

Model **metric** (DepthPro) trả về mét thật + `focallength_px`. Đây là cái mở ra bước [6b].

### [4] Upload texture — `src/scene`

```
uColor : RGBA8,  LinearFilter,  colorSpace = SRGBColorSpace
uDepth : R8,     LinearFilter,  colorSpace = NoColorSpace,  unpackAlignment = 1
```

`unpackAlignment = 1` là bắt buộc với R8 khi width không chia hết cho 4 — nếu quên, depth map bị lệch dần theo từng dòng.

### [5] Render — vertex shader

Không có attribute position nào chứa dữ liệu thật. Chỉ có một lưới UV; shader tra texture để tự tính vị trí.

```glsl
float d = texture2D(uDepth, uv).r;
vec3 p = vec3((uv - 0.5) * 2.0 * vec2(uAspect, 1.0), (d - 0.5) * uDepthScale);
p.xy += curlNoise(p.xy * 1.5, uTime) * 0.03;
```

Chuyển động là **analytic**, không phải simulation: `position = f(uv, uTime)`. Không có velocity buffer, không ping-pong FBO. Đánh đổi: không tích luỹ sai số và scrub được theo thời gian, nhưng không có va chạm hay tương tác vật lý thật.

### [6] Build point cloud — `src/pointcloud`

Đây là nơi dữ liệu **quay về CPU**. Position không tồn tại ở đâu ngoài shader, nên phải tính lại.

```
Depth (Uint8Array) + Pixels (Uint8ClampedArray)
  → duyệt lưới gridSize × gridSize
  → edge rejection: bỏ hạt ở vách depth
  → dựng vị trí theo một trong hai phép chiếu (xem dưới)
  → quantize uint16
  → serialize theo chunk → Blob
  → gzip (fflate)
```

#### [6a] Relief — cho model relative

```
x = (u - 0.5) * 2 * aspect
y = (0.5 - v) * 2
z = (d - 0.5) * depthScale
```

Phù điêu trên mặt phẳng. Quay camera sẽ thấy méo phối cảnh — nhưng đây là lựa chọn nghệ thuật hợp lệ, và là chế độ duy nhất khả dụng với DA2/DA3.

#### [6b] Perspective — cho model metric

```
z = depth_mét
x = (u_px - cx) * z / focallength_px
y = (v_px - cy) * z / focallength_px
```

Unprojection thật. Hình học đúng, quay camera không méo. Chỉ bật được khi model trả `focallength_px`.

Đây là lý do `shared/types.ts` phải có field `projection` và `focalLengthPx` — schema JSON cần ghi lại nó, nếu không người đọc file sau này không biết dữ liệu mang nghĩa gì.

### [7] Download

`actions.onPanelAction` trả Promise thật, dùng `reportProgress(0..1)`. Runtime lo phần tải file và hiển thị progress ở footer.

---

## Hai đường song song — cạm bẫy lớn nhất

Cùng một phép biến đổi được cài **hai lần**, bằng hai ngôn ngữ:

| | Render | Export |
|---|---|---|
| Ngôn ngữ | GLSL | TypeScript |
| File | `src/scene/shaders/particles.vert.glsl` | `src/pointcloud/build.ts` |
| Chạy ở | GPU | Worker |
| Thấy được kết quả sai không? | Có, ngay | Không, tới khi mở file |

Nếu lệch nhau, người dùng thấy hạt đẹp trên màn hình nhưng file JSON xuất ra lại khác. Bug im lặng, phát hiện muộn.

**Ba lớp phòng thủ:**

1. **`src/shared/config.ts` là nguồn sự thật duy nhất.** Không hằng số nào được viết trực tiếp trong GLSL hay trong `build.ts`. GLSL nhận qua uniform; TypeScript import trực tiếp.
2. **`src/shared/math.ts` chứa `smoothstep`, `remap`, `quantize`** bản TypeScript, viết khớp từng dòng với GLSL, có comment trỏ sang nhau.
3. **Test đối chiếu.** Render một frame nhỏ (ví dụ 8×8), readback pixel, so với output của `build.ts` cùng tham số. Đây là test giá trị nhất trong dự án.

Khi đọc code, hãy tự hỏi mỗi lần thấy một con số: *nó có trong `config.ts` không?* Nếu không, đó là bug tiềm ẩn.

---

## Nơi từng thứ chạy

| Bước | Chạy ở | Vì sao |
|---|---|---|
| Upload, giải mã | Main | Runtime sở hữu, nhanh |
| Depth inference | Worker 1 | 100 ms–3 s, chặn UI |
| Upload texture | Main | Phải ở luồng có WebGL context |
| Render | GPU | 262 k hạt, 60 fps |
| Build + serialize | Worker 2 | Vòng lặp 262 k + string vài MB |
| Download | Main (runtime) | Cần DOM |

Hai worker riêng biệt, không phải một. Worker AI giữ session ONNX nặng và sống lâu; worker export sinh ra rồi chết theo từng lần bấm. Gộp lại thì mỗi lần export sẽ giữ session ONNX sống vô ích trong bộ nhớ.
