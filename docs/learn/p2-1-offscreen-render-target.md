# P2.1 · Render scene vào FBO

## Mục tiêu

Đổi đường đi của hình ảnh mà **không đổi hình ảnh cuối**. Trước đây particle scene được vẽ thẳng vào canvas. Bây giờ nó được vẽ vào một texture HalfFloat ngoài màn hình trước, rồi texture đó được chép nguyên trạng lên canvas bằng một fullscreen triangle.

Kết quả nhìn vẫn là khối cầu 60.000 hạt với cùng màu, kích thước, animation và camera. Khác biệt nằm ở đường ống: ta đã có một texture trung gian để P2.2–P2.5 xử lý từng pixel.

## Khái niệm

### 1. Framebuffer mặc định và render target

Mỗi lần `WebGLRenderer` vẽ, GPU cần một nơi nhận màu và độ sâu của từng pixel. Bình thường nơi đó là **framebuffer mặc định** của canvas — kết quả xuất hiện ngay trên màn hình.

Một **render target** tạo một framebuffer khác nằm ngoài màn hình:

```text
P1:  scene ───────────────▶ canvas

P2:  scene ─▶ FBO texture ─▶ fullscreen triangle ─▶ canvas
          pass 1                    pass 2
```

FBO là cách gọi ngắn của _Framebuffer Object_. Màu trong FBO được lưu ở `target.texture`, vì vậy pass sau có thể đọc nó như mọi texture khác.

### 2. Vì sao dùng HalfFloat

Texture 8-bit thông thường chỉ có 256 mức cho mỗi kênh màu. Qua nhiều phép hậu kỳ, việc làm sáng/tối rồi lượng tử hoá lặp lại có thể tạo dải màu (_banding_) hoặc mất chi tiết sáng.

`HalfFloatType` dùng số thực 16-bit cho mỗi kênh. Nó tốn bộ nhớ hơn 8-bit nhưng giữ khoảng giá trị và độ chính xác tốt hơn cho chuỗi hậu kỳ. P2.1 chưa biến đổi màu, nhưng chọn đúng định dạng ngay từ đầu để các pass sau không phải đổi lại plumbing.

`useFBO` tự lấy kích thước CSS × DPR và resize render target cùng canvas. Vì thế texture luôn khớp từng pixel với drawing buffer.

### 3. `createPortal`: một React tree, hai three.js scene

Portal của R3F không đưa JSX sang DOM khác. Nó gắn cùng React subtree vào một `THREE.Scene` khác:

- `ParticleField` và background thuộc `contentScene`.
- Fullscreen triangle thuộc scene gốc của `<Canvas>`.
- Cả hai vẫn dùng chung renderer, camera và render loop.

Điểm quan trọng là code của particle không cần biết nó đang được vẽ vào canvas hay texture. Đây là ranh giới tốt: renderer hạt lo tạo hình; post pipeline lo xử lý ảnh đã tạo.

### 4. Fullscreen triangle

Tên component là `ScreenQuad`, nhưng geometry thực tế chỉ có **một tam giác quá khổ** với ba đỉnh `(-1,-1)`, `(3,-1)`, `(-1,3)`. Sau khi GPU cắt phần nằm ngoài clip space, tam giác phủ kín màn hình.

Một tam giác tốt hơn hai tam giác ghép thành quad vì:

- chỉ có 3 đỉnh thay vì 4;
- không có đường chéo ở giữa màn hình;
- UV nội suy liên tục trên toàn khung.

Vertex shader đặt thẳng `gl_Position`, bỏ qua camera và ma trận phối cảnh. Fragment shader lấy `target.texture` tại `vUv` rồi xuất lại nguyên màu.

### 5. Linear color chỉ đổi sang sRGB một lần

Particle shader tạo màu linear. Khi vẽ vào FBO, màu cần tiếp tục ở linear để các phép hậu kỳ sau này cộng/trừ/nhân đúng.

Chỉ copy shader cuối cùng mới chạy:

```glsl
#include <colorspace_fragment>
```

để đổi linear → output color space của renderer. Nếu đổi sang sRGB trong pass 1 rồi lại coi kết quả là linear ở pass 2, màu sẽ bị sai gamma.

### 6. Hai render call và `renderer.info`

Mỗi frame bây giờ có hai draw call:

1. vẽ 60.000 points vào FBO;
2. vẽ fullscreen triangle ra canvas.

three.js mặc định reset `renderer.info` ở **mỗi** lần gọi `render()`. Nếu giữ mặc định, lần render thứ hai sẽ xoá thống kê points của lần đầu. `ScenePass` tắt `autoReset` và reset đúng một lần ở đầu frame. `RenderInfo` chạy priority `-2`, đọc frame đã hoàn tất trước khi reset mới xảy ra.

## Đi qua code

**`apps/point-cloud/src/scene/scene-pass.tsx`**

Render target được tạo một lần, tự resize và tự dispose bởi `useFBO`:

```tsx
const target = useFBO({
  type: HalfFloatType,
  depthBuffer: true,
  stencilBuffer: false,
});
```

Scene nội dung là object ổn định. Portal đưa children vào scene đó:

```tsx
const contentScene = useMemo(() => new Scene(), []);

return <>{createPortal(children, contentScene)}</>;
```

Mỗi frame, renderer tạm chuyển đích sang FBO, vẽ scene nội dung bằng camera hiện tại, rồi khôi phục đích cũ. Khôi phục thay vì luôn đặt `null` giúp component không phá một pipeline lồng bên ngoài trong tương lai:

```tsx
const previousTarget = gl.getRenderTarget();
gl.setRenderTarget(target);
gl.render(contentScene, camera);
gl.setRenderTarget(previousTarget);
```

`ScreenQuad` dùng copy shader tối thiểu. P2.2 sẽ tách shader hậu kỳ thành file riêng và thêm phép invert để chứng minh texture thực sự đi qua fragment shader.

**`apps/point-cloud/src/scene/stage.tsx`**

Chỉ nội dung 3D nằm trong pass:

```tsx
<ScenePass>
  <color attach="background" args={["#000000"]} />
  <ParticleField {...params} playing={playing} />
</ScenePass>
```

`OrbitControls` vẫn ở scene gốc nhưng cập nhật cùng camera mà pass 1 dùng. UI HTML không liên quan đến FBO.

**`apps/point-cloud/src/scene/render-info.tsx`**

HUD đọc tổng của frame trước ở priority `-2`. Sau P2.1 nó hiển thị `2 draw calls · 60,000 points`, đúng với hai pass thật.

## Lỗi đã gặp

1. **ESLint không cho mutate renderer lấy trực tiếp từ hook.** Dòng `gl.info.autoReset = false` bị rule `react-hooks/immutability` chặn, vì `gl` là giá trị trả về từ `useThree`. Renderer được chuyển vào `useRef`; mutation imperative sau đó đi qua `renderer.current`, cùng nguyên tắc với material uniforms của P1.5.
2. **Không thể để `renderer.info` tự reset.** Có hai lần `render()` trong một frame, nên lần vẽ fullscreen triangle sẽ xoá số points của pass đầu. Pipeline phải sở hữu luôn ranh giới reset thống kê.
3. **Copy pass phải làm color conversion ở cuối.** FBO giữ linear; `colorspace_fragment` chỉ nằm ở pass ra màn hình. Nhờ vậy ảnh sau migration giữ độ sáng giống P1.

## Tự thử

1. Bỏ `#include <colorspace_fragment>` khỏi copy fragment shader. Màu hạt sáng/tối khác thế nào? Vì sao dữ liệu linear không nên đưa thẳng lên màn hình sRGB?
2. Đổi `HalfFloatType` thành `UnsignedByteType`. P2.1 có nhìn khác ngay không? Vì sao khác biệt thường chỉ lộ rõ sau nhiều phép hậu kỳ?
3. Trong copy shader, đổi `gl_FragColor.rgb` thành `1.0 - gl_FragColor.rgb`. Đây chính là sanity test sẽ được làm có kiểm soát ở P2.2.
4. Bỏ `createPortal` và đặt `ParticleField` lại ở scene gốc. Fullscreen triangle sẽ che hay bị trộn với hạt ra sao?
5. Tạm bỏ `gl.info.autoReset = false`. HUD còn thấy 60.000 points không? Draw-call count đại diện pass nào?

## Đọc thêm

- [three.js manual — Render Targets](https://threejs.org/manual/pages/rendertargets.html)
- [three.js — WebGLRenderTarget](https://threejs.org/docs/pages/WebGLRenderTarget.html)
- [React Three Fiber — Additional exports (`createPortal`)](https://r3f.docs.pmnd.rs/api/additional-exports)
- [drei — `useFBO`](https://drei.docs.pmnd.rs/misc/fbo-use-fbo)
