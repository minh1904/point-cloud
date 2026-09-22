# Module `src/scene`

> **Công dụng trong một câu:** vẽ output sản phẩm bằng Three.js — preview depth 2D và particle cloud 3D — trong khuôn khổ hợp đồng renderer của Toolcraft.

**Tầng:** 2 · **Import:** chỉ `src/shared` · **Chạy ở:** main thread + GPU · **Khó nhất trong dự án**

---

## Vì sao module này khó

Nó chịu ba loại phức tạp cùng lúc:

1. **GLSL** — ngôn ngữ khác, debug bằng cách đổi màu pixel
2. **Vòng đời tài nguyên GPU** — texture, buffer, program phải dispose đúng lúc
3. **Hợp đồng Toolcraft** — phải khai báo render plan trước khi viết shader, và không được tự sở hữu canvas

**Một canvas chỉ có được một loại context.** Không thể vừa `getContext("2d")` cho preview depth vừa `getContext("webgl")` cho particles. Nên cả hai pass đều chạy WebGL qua một `stage-renderer.ts` duy nhất — pass 2D là một fullscreen quad với shader lo split và colormap.

Hoá ra lại tốt hơn: tra colormap trên GPU nghĩa là đổi bảng màu hay kéo thanh split là tức thì, không phải duyệt hàng triệu pixel trên CPU rồi dựng `ImageBitmap`.

---

## Quy tắc số một: không dùng React Three Fiber

Catalog provider của Toolcraft là **catalog đóng**. Three.js có đúng một dòng:

| Situation | Typed decision |
|---|---|
| Three.js WebGL presentation | `backend: "webgl"`, `provider: "three"` |

R3F không có trong đó. Và về bản chất R3F muốn sở hữu `<canvas>` + render loop, còn Toolcraft đã sở hữu canvas backing, scene frame, và export compositing. Hai bên tranh nhau thì thua.

**Cách đúng:** Three.js thuần, lấy hệ toạ độ từ runtime:

```tsx
const frame = useToolcraftProductSceneFrame();
// frame → product rect, backing size, world-to-local translation
```

Và tuyệt đối:

- ❌ không `getBoundingClientRect()` để lấy kích thước
- ❌ không suy ra hình học scene từ `image.naturalWidth`
- ❌ không tạo `<canvas>` thứ hai
- ✅ chỉ đọc `frame`

---

## File và trách nhiệm

### `renderer-technique.ts` — viết trước shader

Doc của Toolcraft nói thẳng: *"Do not write renderer code before the envelope, rendererTechnique, pipeline, and assessment exist."*

Mỗi pass phải khai báo: cost, frequency, lifecycle, execution location, cache key, invalidation chính xác.

```ts
export const rendererTechnique = {
  backend: "webgl",
  provider: "three",
  passes: [
    {
      id: "depth-preview",
      stage: "render",
      state: "stateless",
      frequency: "on-change",              // chỉ vẽ lại khi texture/split đổi
      invalidatedBy: ["depthMap", "colormap", "splitPosition"],
    },
    {
      id: "particles",
      stage: "render",
      state: "stateless",                  // analytic motion, không feedback
      frequency: "per-frame",              // uTime đổi mỗi frame
      invalidatedBy: ["depthMap", "gridSize", "depthScale", "projection", "noise"],
    },
  ],
} as const;
```

`state: "stateless"` là quan trọng: chuyển động của ta là `f(uv, uTime)`, không có velocity buffer. Nếu ta dùng ping-pong FBO thì phải khai `"feedback"`, và theo doc điều đó tạo áp lực chọn WebGPU. Motion analytic giữ ta ở WebGL — đơn giản hơn, tương thích rộng hơn.

### `scene-host.tsx` — cầu nối React ↔ Three.js

Mount vào `scene.canvasContent`. Đọc `viewMode` từ schema state để chọn pass. **Một WebGL context, hai pass** — không phải hai canvas.

```tsx
export function SceneHost() {
  const frame = useToolcraftProductSceneFrame();
  const { viewMode, depthScale, gridSize, colormap } = useSchemaValues();

  // Three.js objects sống NGOÀI React render, trong ref.
  // Texture và geometry không được tạo lại mỗi lần React re-render.
  const gpu = useRef<GpuResources>();
  // ...
}
```

Đây là điểm dễ sai nhất về hiệu năng: nếu tạo `THREE.Texture` trong thân component, mỗi lần kéo slider sẽ upload lại texture lên GPU.

### `depth-preview.ts` — pass 2D

Vẽ ảnh gốc và depth map cạnh nhau với split slider. Một fullscreen quad, fragment shader chọn texture nào theo `uSplit`:

```glsl
vec3 color = uv.x < uSplit
  ? texture2D(uColor, uv).rgb
  : applyColormap(texture2D(uDepth, uv).r);
```

### `particle-cloud.ts` — pass 3D

`THREE.Points` với một geometry duy nhất chứa **chỉ** attribute UV lưới. Không có position thật — shader tự tính.

```ts
// gridSize² đỉnh, mỗi đỉnh chỉ cần biết mình ở ô nào
const uvs = new Float32Array(n * 2);
geometry.setAttribute("aGridUv", new THREE.BufferAttribute(uvs, 2));
```

Đổi `gridSize` là tạo lại geometry — tốn, nên chỉ làm khi giá trị thật sự đổi, không phải mỗi re-render.

### `raster-frame.ts` — cho export ảnh

Cài `scene.rasterFrameRenderer.renderFrame`: một callback **tất định** vẽ frame trong toạ độ scene. Runtime gọi nó khi export ảnh.

Bị cấm trong callback này: cấp phát canvas, gọi `toBlob`/`toDataURL`, tạo object URL, download. Runtime lo hết.

Tất định nghĩa là: cùng state → cùng pixel. Nên khi export phải dùng `uTime` từ state, không phải `performance.now()`.

### `shaders/lib/noise.glsl` — chuỗi noise

Bốn tầng, xây từ dưới lên. Đây là phần lấy trực tiếp từ bài Codrops và là phần đáng lấy nhất.

```glsl
// 1. hash → pseudo-random từ toạ độ
float random(vec2 st) {
  return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
}

// 2. value noise — nội suy 4 góc bằng smoothstep
//    vec2 u = f * f * (3.0 - 2.0 * f);

// 3. fBM — cộng nhiều octave, XOAY domain mỗi tầng
float fbm(vec2 st, int octaves) {
  float value = 0.0, amplitude = 0.5;
  mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    value += amplitude * noise(st);
    st = rot * st * 2.0 + vec2(100.0);   // xoay + scale + dịch
    amplitude *= 0.5;
  }
  return value;
}

// 4. curl noise — gradient QUAY 90 ĐỘ
vec2 curlNoise(vec2 st, float time) {
  float eps = 0.01;
  float dx = (fbm(st + vec2(eps,0.0) + time*0.1, 4) - fbm(st - vec2(eps,0.0) + time*0.1, 4)) / (2.0*eps);
  float dy = (fbm(st + vec2(0.0,eps) + time*0.1, 4) - fbm(st - vec2(0.0,eps) + time*0.1, 4)) / (2.0*eps);
  return vec2(dy, -dx);   // ◀── chỗ này là tất cả
}
```

**`vec2(dy, -dx)` là lý do hạt nhìn "sống".** Quay gradient 90° cho ra trường **divergence-free** (∇·v = 0). Hạt không bị hút vào giếng hay bắn ra từ nguồn như khi dùng gradient trực tiếp — nó xoáy và cuộn, bảo toàn thể tích. Không phải số lượng hạt tạo cảm giác sống, mà là tính chất toán học này.

**Xoay domain mỗi octave** (`mat2` với góc 0.5 rad) phá artifact axis-aligned — công thức kinh điển của Inigo Quilez. Bỏ phép xoay thì noise trông như lưới.

### `shaders/particles.vert.glsl`

```glsl
uniform sampler2D uColor, uDepth;
uniform vec2  uDepthTexel;      // 1.0 / vec2(depthW, depthH)
uniform float uAspect, uDepthScale, uTime, uPointSize;
uniform float uEdgeLo, uEdgeHi; // ◀── từ shared/config.ts, KHÔNG hardcode
attribute vec2 aGridUv;
varying vec3  vColor;
varying float vAlpha;

void main() {
  vec2 st = aGridUv;
  float d = texture2D(uDepth, st).r;

  // edge rejection — PHẢI khớp src/pointcloud/build.ts
  float dx = texture2D(uDepth, st + vec2(uDepthTexel.x, 0.0)).r
           - texture2D(uDepth, st - vec2(uDepthTexel.x, 0.0)).r;
  float dy = texture2D(uDepth, st + vec2(0.0, uDepthTexel.y)).r
           - texture2D(uDepth, st - vec2(0.0, uDepthTexel.y)).r;
  vAlpha = 1.0 - smoothstep(uEdgeLo, uEdgeHi, length(vec2(dx, dy)));

  vec3 p = vec3((st - 0.5) * 2.0 * vec2(uAspect, 1.0), (d - 0.5) * uDepthScale);
  p.xy += curlNoise(p.xy * 1.5, uTime) * 0.03;

  vColor = texture2D(uColor, st).rgb;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position  = projectionMatrix * mv;
  gl_PointSize = uPointSize * (1.0 / -mv.z);
}
```

---

## Hợp đồng vào/ra

```ts
// VÀO — từ app, qua props
{
  depthMap: DepthMap | null;
  colorBitmap: ImageBitmap | null;
  viewMode: "2d" | "3d";
  depthScale: number;
  gridSize: number;
  projection: Projection;
  colormap: "grayscale" | "turbo" | "inferno";
  frame: ProductSceneFrame;   // từ useToolcraftProductSceneFrame()
}

// RA — pixel trên canvas + hai port cho runtime
scene.rasterFrameRenderer.renderFrame(ctx)
scene.sceneBoundsProvider() → world-space rect
```

Module này **không** tạo file, không gọi AI, không biết JSON schema.

---

## Ràng buộc Toolcraft áp lên module này

| Ràng buộc | Cách tuân thủ |
|---|---|
| `canvasContent` chỉ chứa output sản phẩm | Không button, không hướng dẫn, không upload prompt trong canvas |
| Không tự sở hữu canvas | Đọc `useToolcraftProductSceneFrame()`, không đo DOM |
| Giữ nguyên canvas backing | Vẽ foreground trong suốt; không ghi đè background của runtime |
| Khai báo render plan trước | `renderer-technique.ts` + `assessToolcraftRenderPlan` |
| Text sản phẩm phải đánh dấu | `data-toolcraft-product-output` nếu có DOM text trong canvas |
| Style local | `*.module.css` cạnh component, selector local |
| Export thuộc runtime | Chỉ cài `renderFrame`, không tự encode/download |

---

## Cạm bẫy

**Filter texture depth.** Nếu sau này chuyển sang encoding hi/lo byte, **bắt buộc** `NearestFilter` + `generateMipmaps = false` — `LinearFilter` sẽ nội suy byte thấp giữa các hạt lân cận và vị trí thành rác hoàn toàn. Với depth 8-bit một kênh như hiện tại, `LinearFilter` lại là đúng (mượt hơn).

**Color space.** `uDepth` phải `NoColorSpace`. Nếu Three.js áp sRGB decode lên texture dữ liệu, nó bóp phi tuyến và sai hết. `uColor` thì `SRGBColorSpace` mới đúng.

**`unpackAlignment = 1`** với texture R8 khi width không chia hết cho 4. Quên → depth map lệch dần theo từng dòng, trông như bị xé.

**`gl_PointSize` có giới hạn.** `ALIASED_POINT_SIZE_RANGE` cap ở ~64 px trên Safari và một số GPU. Muốn hạt to hơn phải chuyển sang instanced quads. Đừng ngạc nhiên khi hạt không to thêm dù tăng `uPointSize`.

**Bottleneck là fill rate, không phải vertex.** 262 k `GL_POINTS` rất nhẹ về vertex. Cái đắt là overdraw do alpha blending với point to. Tối ưu quan trọng nhất: render ở resolution thấp hơn màn hình rồi upscale (bài Codrops làm đúng chỗ này), cộng `depthWrite: false` và clamp DPR.

**Tạo tài nguyên GPU trong thân React component.** Mỗi lần kéo slider sẽ upload lại texture. Tài nguyên phải sống trong `useRef`, ngoài render.

**Dispose.** Đổi ảnh, đổi `gridSize`, unmount — đều phải `.dispose()` texture/geometry/material. Không thì VRAM leak tới khi tab chết.

**`uTime` khi export.** `rasterFrameRenderer` phải tất định. Dùng `uTime` từ state, không `performance.now()`, nếu không mỗi lần export ra một ảnh khác.

---

## Cách kiểm chứng

Module này khó test bằng Vitest (cần WebGL context). Chủ yếu là Playwright:

| Test | Bắt được gì |
|---|---|
| Đổi `viewMode` 2D ↔ 3D | Context bị tạo lại (không được), texture bị mất |
| Kéo `depthScale` | Có upload lại texture không (không được) |
| Export ảnh hai lần cùng state → hash SHA-256 giống nhau | `renderFrame` không tất định |
| Đổi `gridSize` rồi đo VRAM | Geometry cũ không dispose |
| Ảnh có vách depth rõ | Edge rejection hoạt động trên GPU |
| `npm run verify:perf` | fps tụt dưới ngưỡng |

**Test quan trọng nhất của toàn dự án:** render lưới 8×8, `readRenderTargetPixels`, so từng vị trí với output `src/pointcloud/build.ts` cùng tham số. Đây là thứ duy nhất chứng minh GLSL và TypeScript không lệch nhau. Xem [02-data-flow.md](../02-data-flow.md#hai-đường-song-song---cạm-bẫy-lớn-nhất).

---

## Đọc thêm

- [03-why-these-choices.md](../03-why-these-choices.md#q2--renderer-threejs-thuần-không-r3f) — vì sao Three.js thuần, không R3F
- [pointcloud.md](pointcloud.md) — bản TypeScript của cùng công thức
- [Bài Codrops gốc](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/) — nguồn của fBM/curl noise
