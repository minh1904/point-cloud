# P8.6 · Một component thả vào dự án của người khác

## Mục tiêu

```tsx
<Canvas camera={{ position: [0, 0, 8], fov: 16 }}>
  <ParticleImage src="/particles/my-cloud" />
</Canvas>
```

Xong khi nó chạy trong một dự án Vite hoặc Next mới tinh.

Đây là bước đóng lại cả câu chuyện: từ P1 tới P8.5 ta xây một **công cụ**; bước này đóng gói **kết quả** của nó thành thứ dùng được ở nơi khác.

## Khái niệm

### 1. Cái làm ra và cái trình bày là hai phần mềm khác nhau

Công cụ có một model depth, một worker, một bộ lấy mẫu importance, một schema, một inspector, một lịch sử undo. Thứ **trình bày** một đám mây đã làm xong cần: một loader, một material, một draw call.

Nên package này **không phụ thuộc gì vào studio**. Không store, không schema, không worker. Bất cứ thứ gì chia sẻ giữa hai bên đều là một dependency mà component không cần và người dùng không gỡ được.

Cái giá là vài chỗ lặp lại — `createGrid` là bản sao ngắn của `particle-grid.ts`, các giá trị mặc định lặp lại schema. Với một thứ **được thiết kế để copy ra khỏi repo**, tự đủ thắng DRY.

### 2. Shader phải là **chuỗi**, không phải file

Trong studio, shader là file `.glsl` nạp qua `raw-loader`, và `#include <pc_noise>` được `THREE.ShaderChunk` giải quyết nhờ một side effect lúc import module.

Cả hai thứ đó đều **không tồn tại** trong dự án của người khác. Bundler của họ không được cấu hình để import `.glsl`, và registry `ShaderChunk` sẽ trống vì file đăng ký nằm trong app.

Thứ duy nhất mọi cấu hình đều đồng ý là một chuỗi. Nên có một script sinh code:

```bash
cd apps/point-cloud && bun run build:particle-image
```

Nó chép GLSL vào template literal và **giải quyết `#include` tại chỗ** — đúng phép thay thế mà `ShaderChunk` làm lúc chạy, làm trước.

```ts
return source.replace(/^#include <(\w+)>$/gm, (line, name) => {
  const chunk = chunks[name];
  if (chunk === undefined) return line;   // để nguyên chunk của three
  return `// ---- inlined ${name} ----\n${chunk}\n// ---- end ${name} ----`;
});
```

Dòng `if (chunk === undefined) return line` quan trọng: `#include <colorspace_fragment>` là chunk **của three**, và `ShaderMaterial` bên người dùng vẫn tự giải quyết nó lúc biên dịch. Chỉ chunk của ta mới cần nội tuyến.

Và phải escape template literal:

```ts
source.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
```

Một dấu backtick hay một `${` trong GLSL sẽ kết thúc chuỗi sớm. GLSL hiện tại không có cái nào, nhưng một file sinh tự động phải đúng cho cả file chưa viết.

### 3. File sinh ra được **commit**

`shaders.gen.ts` nằm trong git. Người copy package ra khỏi repo không nên phải chạy một bước build để có một component hoạt động.

Cái giá: file sẽ cũ đi nếu shader đổi mà không chạy lại script. Nên chính nó nói điều đó ở đầu file, và `docs/particle-image.md` kết thúc bằng câu "Re-run it after changing a shader. Nothing will remind you."

Đó là một đánh đổi trung thực, không phải một chỗ quên.

### 4. Thứ tự ưu tiên: prop → `params.json` → mặc định

```ts
const params = { ...defaultParticleImageParams, ...loaded.params, ...overrides };
```

Xuất một look kèm dữ liệu, rồi vẫn đè được một con số ở chỗ gọi:

```tsx
<ParticleImage src="/particles/my-cloud" speed={0.3} edgeBokeh={0} />
```

Ba mức, đọc từ trái sang phải trong một dòng spread. Đây là loại API mà người dùng đoán đúng mà không cần đọc tài liệu.

### 5. Callback phải nằm trong ref — một bug thật, đo được

Bản đầu khai:

```ts
}, [src, useBundleParams, onLoad, onError]);
```

Trông đúng theo luật `exhaustive-deps`. Thực tế nó biến component thành một vòng lặp fetch: `onLoad` hầu như luôn là một arrow function viết thẳng tại chỗ gọi, nên nó là **một hàm mới ở mỗi lần render** → effect chạy lại → load → setState → render → hàm mới → load…

Số đo thật: **36 request cho 4 file** trước khi sửa.

Cách sửa là mẫu "latest callback":

```ts
const callbacks = useRef({ onLoad, onError });
useEffect(() => { callbacks.current = { onLoad, onError }; }, [onLoad, onError]);
```

Rồi effect chỉ phụ thuộc `[src, useBundleParams]`. Đây đúng là vấn đề mà `useEffectEvent` đang được thêm vào React để giải quyết.

Bài học rộng hơn: **một API nhận callback phải chịu được callback viết inline**, vì đó là cách mọi người viết.

### 6. Cái mà component cố tình **không** làm

- **Không hậu kỳ.** Vignette, chromatic aberration, grain là một fullscreen pass của studio (P2), không phải một phần của đám mây.
- **Không LUT trong bundle.** Một LUT đã bake là PNG 512² — quá lớn so với thứ khôi phục được từ một cái tên. Nó là một prop.
- **Không camera.** Nhưng tài liệu nói rõ là nó **quan trọng**: đám mây được thiết kế để chụp bằng ống tele, và ở `fov: 50` nó trông phẳng. Quyết định P5.6 đi theo dữ liệu, và tài liệu là chỗ duy nhất nói được điều đó.

## Đi qua code

### `apps/point-cloud/scripts/build-particle-image.ts` (mới)

38 dòng. Đọc bốn file GLSL, giải `#include`, escape, ghi ra một file TypeScript.

### `packages/particle-image/src/particle-image.tsx` (mới)

Một component, ba `useEffect` (bundle, LUT, callback ref), một `useFrame`. Không hook tuỳ biến, không store.

`frustumCulled={false}` xuất hiện lại, với cùng lời cảnh báo từ [P3.1](p3-1-geometry-without-positions.md): vị trí thật chỉ tồn tại trong vertex shader, nên bounding sphere có bán kính 0, nên bật culling là mất cả draw call ngay khi camera quay đi — im lặng.

### `apps/point-cloud/src/app/embed/` (mới)

Một route `/embed` dùng package **đúng cách một dự án lạ sẽ dùng**: import `@atelier/particle-image` và không import gì khác từ repo này. Nếu trang đó render được thì package thật sự tự đủ — một tuyên bố đáng **kiểm** chứ không đáng **tin**.

## Lỗi đã gặp

1. **Vòng lặp fetch vì callback trong dependency.** Xem mục 5. Đo được, không đoán.
2. **`next/dynamic` bên trong `<Canvas>` treo cả cây con.** Bản đầu nạp `OrbitControls` bằng `dynamic(..., {ssr:false})` ngay trong Canvas. `next/dynamic` dựng trên `React.lazy`, và một ranh giới lazy bên trong cây R3F **treo mọi thứ bên dưới nó** — nên component đang được trình diễn không bao giờ mount. Ranh giới lazy phải nằm **ngoài** Canvas, đúng như studio vẫn làm.
3. **R3F không mount scene khi tab bị ẩn.** Canvas ở kích thước mặc định 300×150 và không bao giờ được đo lại, vì `ResizeObserver` không chạy trong một document ẩn. Nghĩa là không thể kiểm bất cứ thứ gì bên trong Canvas khi cửa sổ bị thu nhỏ — đã ghi vào `status.md`.

## Tự thử

1. **Mở `/embed`.** Đám mây mẫu có hiện không? Đổi `fov: 16` thành `50` và so.
2. **Xuất một bundle của bạn**, giải nén vào `apps/point-cloud/public/particles/test/`, rồi đổi `src` của trang embed. Có cần đổi gì khác không?
3. **Sửa một shader** (ví dụ đổi `pow(9.0, …)` thành `pow(4.0, …)` trong `points.vert.glsl`), reload `/embed`. Đổi không? Rồi chạy `bun run build:particle-image` và reload lại.
4. **Bỏ prop `lut`.** Màu đổi thế nào, và vì sao `gradeIntensity` tự về 0?
5. **Gây lại vòng lặp fetch.** Đưa `onLoad` trở lại mảng dependency, mở tab Network, lọc `metadata.json`. Đếm.

## Đọc thêm

- [Tài liệu `<ParticleImage>` của dự án](../particle-image.md)
- [React — `useEffectEvent` (RFC)](https://react.dev/learn/separating-events-from-effects)
- [three.js — `ShaderChunk`](https://threejs.org/docs/#api/en/renderers/webgl/WebGLProgram)
- [P3.1 · Geometry không có vị trí](p3-1-geometry-without-positions.md)
