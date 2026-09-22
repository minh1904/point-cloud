# P2.5 · Render scale FBO

## Mục tiêu

Hoàn thiện mảnh ghép cuối cùng của **Phase 2 (Render pipeline)**: cho phép điều chỉnh độ phân giải của Render Target (FBO) từ **50% đến 100%** thông qua slider **Scale** trong panel *Post effects*.

Đồng thời, bổ sung bộ đo FPS theo thời gian thực trên thanh trạng thái để kiểm chứng quy luật đánh đổi kinh điển trong đồ hoạ thời gian thực: **giảm fill-rate để đổi lấy tốc độ khung hình cao hơn**, trong khi kích thước hạt và độ sắc nét của hạt phim (film grain) vẫn được bảo toàn.

## Khái niệm

### 1. Fill-rate và nút thắt cổ chai trên màn hình DPR cao

**Fill-rate** là tốc độ mà GPU có thể ghi dữ liệu pixel vào bộ nhớ framebuffer (đo bằng pixels/giây).

Trên các thiết bị hiện đại với màn hình Retina (DPR = 2 hoặc 3):
- Một cửa sổ trình duyệt Full HD `1920 × 1080` CSS pixel thực chất có drawing buffer lên tới `(1920 × 2) × (1080 × 2) = 3840 × 2160` (4K UHD) $\approx 8.3$ triệu pixel!
- Khi vẽ 60.000 hạt mềm có bán kính lớn đè lên nhau, rất nhiều fragment phải tính toán và trộn màu (alpha blending) cho cùng một pixel (hiện tượng **overdraw**).
- Khối lượng tính toán pixel tăng theo luỹ thừa bậc 2 của độ phân giải. Trên các GPU tích hợp (iGPU) hoặc màn hình 4K/5K, fill-rate thường là nguyên nhân chính khiến FPS bị tụt.

### 2. Render scale: Giảm tải FBO nhưng giữ nguyên độ phân giải hiển thị

Giải pháp thông dụng trong các engine đồ hoạ chuyên nghiệp là tách rời hai độ phân giải:
1. **Pass dựng hình cảnh 3D (Offscreen pass)**: render vào FBO với độ phân giải thu nhỏ (`renderScale = 0.5 .. 1.0`).
2. **Pass hiển thị & hậu kỳ (Screen pass)**: vẽ fullscreen quad phủ kín canvas với độ phân giải đầy đủ của màn hình (100% DPR).

$$\text{Số pixel FBO} = (\text{width} \times \text{dpr} \times \text{renderScale}) \times (\text{height} \times \text{dpr} \times \text{renderScale})$$

Khi hạ `renderScale` từ `1.0` xuống `0.5`:
- Chiều rộng giảm $\frac{1}{2}$, chiều cao giảm $\frac{1}{2}$.
- Số pixel FBO cần render giảm **4 lần** (chỉ còn **25%** so với ban đầu).
- GPU giải phóng được $\frac{3}{4}$ gánh nặng fill-rate cho cảnh 60.000 hạt, giúp FPS tăng rõ rệt trên các máy yếu hoặc màn hình độ phân giải cao.

### 3. Bilinear filtering khi phóng to texture FBO

Khi fullscreen triangle đọc FBO kích thước nhỏ để vẽ lên màn hình lớn, WebGL sử dụng cơ chế lọc phóng đại (**magnification filter**).
Vì `useFBO` đặt `magFilter: THREE.LinearFilter`, phần cứng GPU tự động nội suy song tuyến (bilinear interpolation) giữa 4 texel lân cận:
- Hình ảnh hạt trông mềm hơn một chút (tương tự một lớp antialiasing nhẹ) chứ không bị vỡ vụn răng cưa thành từng khối pixel lớn như `NearestFilter`.
- Đặc biệt, hiệu ứng **film grain** ở pass cuối cùng được tính toán trực tiếp trên toạ độ pixel màn hình `gl_FragCoord.xy` của canvas thật, nên các hạt grain vẫn sắc nét 1:1 ở độ phân giải gốc của thiết bị!

### 4. Bảo toàn kích thước hạt trên màn hình (Point Size Invariance)

Một cái bẫy thường gặp khi hạ render scale của FBO:
- `gl_PointSize` trong vertex shader được đo bằng **pixel của render target hiện hành**.
- Nếu giữ nguyên `uScale`, một hạt có bán kính 20px sẽ chiếm 20px trong FBO nhỏ.
- Khi fullscreen quad kéo dãn FBO nhỏ lên canvas gấp 2 lần, hạt đó sẽ phình to thành 40px trên màn hình người dùng!

Để kích thước hạt không đổi khi thay đổi `renderScale`, vertex shader cần nhận `uScale` đã được nhân tỉ lệ với `renderScale`:

```ts
uniforms.uScale!.value = height * dpr * renderScale * 0.5;
```

Trong FBO 50%, hạt được vẽ với kích thước 10px; sau khi quad phóng to 2x ra canvas, mắt người dùng vẫn nhìn thấy hạt đúng 20px như mong muốn.

## Đi qua code

**`apps/point-cloud/src/scene/scene-pass.tsx`**

Bổ sung trường `renderScale` vào `PostParams` với giá trị mặc định là `1.0`:

```tsx
export interface PostParams {
  renderScale: number;
  vignette: number;
  chromaticAberration: number;
  grain: number;
}

export const defaultPostParams: PostParams = {
  renderScale: 1,
  vignette: 0.35,
  chromaticAberration: 0.002,
  grain: 0.025,
};
```

Tính toán kích thước pixel thật của FBO theo `renderScale`:

```tsx
const size = useThree((state) => state.size);
const dpr = useThree((state) => state.viewport.dpr);
const renderScale = params.renderScale ?? 1;

const fboWidth = Math.max(1, Math.round(size.width * dpr * renderScale));
const fboHeight = Math.max(1, Math.round(size.height * dpr * renderScale));

const target = useFBO(fboWidth, fboHeight, {
  type: HalfFloatType,
  depthBuffer: true,
  stencilBuffer: false,
});
```

Khi `renderScale` đổi, `useFBO` gọi `target.setSize(fboWidth, fboHeight)` bên trong `useLayoutEffect` để thay đổi kích thước bộ đệm trên GPU mà không tái tạo lại object `target`, giữ nguyên tham chiếu `target.texture` cho shader hậu kỳ.

**`apps/point-cloud/src/scene/particle-field.tsx`**

Nhận prop `renderScale` và cập nhật `uScale` để giữ kích thước điểm ổn định:

```tsx
interface ParticleFieldProps extends ParticleParams {
  count?: number;
  radius?: number;
  color?: string;
  renderScale?: number;
  playing: boolean;
}
```

```tsx
useEffect(() => {
  const uniforms = material.current?.uniforms;
  if (!uniforms) return;
  uniforms.uSize!.value = size;
  uniforms.uScale!.value = height * dpr * renderScale * 0.5;
  // ...
}, [size, color, softness, driftAmplitude, height, dpr, maxPointSize, renderScale]);
```

**`apps/point-cloud/src/scene/render-info.tsx`**

Đếm số frame dựng được trong chu kỳ 0.5 giây để ước lượng FPS chính xác và ổn định:

```tsx
export interface RenderStats {
  fps: number;
  calls: number;
  points: number;
}

export function RenderInfo({ onStats }: { onStats: (stats: RenderStats) => void }) {
  const info = useThree((state) => state.gl.info);
  const elapsed = useRef(0);
  const frames = useRef(0);

  useFrame((_, delta) => {
    elapsed.current += delta;
    frames.current += 1;
    if (elapsed.current < 0.5) return;
    const fps = Math.round(frames.current / elapsed.current);
    elapsed.current = 0;
    frames.current = 0;
    onStats({ fps, calls: info.render.calls, points: info.render.points });
  }, -2);

  return null;
}
```

**`apps/point-cloud/src/app/studio.tsx`**

Hiển thị chỉ số FPS lên HUD góc trái và thêm slider `Scale` (50% – 100%) vào panel `Post effects`:

```tsx
<Slider
  label="Scale"
  value={postParams.renderScale}
  onValueChange={setPost("renderScale")}
  min={0.5}
  max={1}
  step={0.05}
  format={{ style: "percent" }}
/>
```

## Lỗi đã gặp

1. **Hạt bị phình to khi giảm resolution**: Lúc đầu quên nhân `renderScale` vào uniform `uScale`. Khi FBO co lại một nửa, point size giữ nguyên số pixel khiến mỗi hạt chiếm tỉ lệ diện tích gấp 4 lần trên màn hình. Khắc phục bằng cách bù trừ hệ số `renderScale` vào `uScale` trong `ParticleField`.
2. **Tránh re-instantiate FBO**: Nếu dùng `new WebGLRenderTarget` trong render hoặc tạo lại texture mỗi khi slider di chuyển, GPU sẽ phải cấp phát lại VRAM liên tục, gây giật (jank) khung hình. `useFBO` của `@react-three/drei` xử lý việc này hoàn hảo bằng cách tái sử dụng cùng một render target và gọi `target.setSize(w, h)`.
3. **Bộ đếm FPS bị dao động quá nhanh nếu lấy `1 / delta` từng frame**: Giá trị `delta` của một frame đơn lẻ có thể biến động lớn do rác CPU hoặc micro-stutter. Tính trung bình số frame trong cửa sổ 0.5 giây giúp số liệu trên HUD hiển thị êm ái, dễ đọc.

## Tự thử

1. Mở app trên màn hình Retina (DPR 2) và kéo thanh trượt `Scale` từ `100%` xuống `50%`. Quan sát chỉ số FPS trên HUD và cảm nhận độ mượt khi xoay camera.
2. So sánh độ mịn của các hạt ở rìa giữa mức `100%` và `50%`. Bạn có nhận thấy hạt mềm hơn không?
3. Quan sát lớp hạt phim `Grain`: khi hạ `Scale` xuống 50%, grain có bị mờ đi không? Vì sao?

## Đọc thêm

- [SimonDev — Understanding Fill Rate and Overdraw in Real-Time Rendering](https://www.youtube.com/watch?v=F_S6p91Lwvg)
- [three.js — WebGLRenderTarget.setSize()](https://threejs.org/docs/pages/WebGLRenderTarget.html#setSize)
- [MDN — DevicePixelRatio and Canvas Performance](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)
