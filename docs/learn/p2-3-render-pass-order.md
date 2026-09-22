# P2.3 · Thứ tự các render pass

## Mục tiêu

Biến pipeline hai pass thành một lịch render rõ ràng, không còn dựa vào việc R3F tự vẽ scene gốc sau các callback:

```text
priority -2   đọc thống kê của frame trước
priority -1   render particle scene → FBO
priority  1   render fullscreen triangle → canvas
```

Kết quả quan sát được vẫn là khối cầu chuyển động liên tục, không nhấp nháy. HUD giữ ổn định ở `2 draw calls · 60,000 points`: một draw call cho particles và một draw call cho fullscreen triangle, không có lần render tự động thứ ba.

## Khái niệm

### 1. Một frame của R3F có danh sách callback

Mỗi component gọi `useFrame(callback, priority)` sẽ đăng ký một callback vào vòng lặp chung của `<Canvas>`. R3F sắp xếp danh sách từ priority thấp đến cao rồi gọi lần lượt trong mỗi frame.

Nếu không có priority dương, sau khi chạy hết callback R3F tự gọi:

```ts
gl.render(scene, camera);
```

Cơ chế tự động này tiện cho scene một pass, nhưng pipeline hậu kỳ cần biết chính xác render nào xảy ra trước và đích render đang là gì.

### 2. Vì sao priority `1` thay quyền render

Trong R3F 9.7, chỉ cần một subscription có priority lớn hơn `0`, cờ manual render nội bộ tăng lên. Khi cờ này dương, lần render tự động ở cuối frame bị bỏ qua.

Vì vậy callback priority `1` không có nghĩa là “vẽ thêm sau R3F”. Nó có nghĩa là “app chịu trách nhiệm cho lần vẽ scene gốc”. Nếu callback này quên gọi `gl.render`, canvas sẽ giữ frame cũ hoặc trống.

### 3. Hai render target, hai lần clear

`WebGLRenderer.autoClear=true` làm renderer xoá các buffer của **render target hiện tại** trước mỗi `render()`:

1. Khi target là FBO, clear chỉ xoá texture ngoài màn hình.
2. Khi target là `null`, clear chỉ xoá framebuffer của canvas.

Hai lần clear không phá nhau vì chúng nhắm vào hai framebuffer khác nhau. Điều nguy hiểm là đổi `autoClear=false` mà không tự `clear()`: pixel từ frame trước có thể lưu lại, tạo vệt hoặc flicker. `ScenePass` chủ động bật `autoClear` trong thời gian nó sở hữu pipeline và khôi phục giá trị cũ khi unmount.

### 4. Luôn đặt render target một cách tường minh

Pass đầu lưu target cũ, chuyển sang FBO, render rồi khôi phục. Pass cuối vẫn gọi `setRenderTarget(null)` trước khi vẽ để khẳng định output cuối là canvas.

Không nên dựa vào “target chắc đang là `null`”. Một pass mới được thêm sau này có thể đổi state của renderer; đặt target tường minh làm ranh giới giữa các pass dễ đọc và khó phá hơn.

### 5. Priority cũng sắp xếp camera và thống kê

`OrbitControls` của drei cập nhật damping ở priority `-1`. Nó được mount trước `ScenePass`, nên tại cùng priority camera được cập nhật trước khi scene đi vào FBO.

`RenderInfo` dùng priority `-2` để đọc bộ đếm đã hoàn tất của frame trước. Ngay sau đó pass FBO reset `renderer.info` đúng một lần; cả hai lần `render()` cộng số liệu vào cùng frame thống kê.

## Đi qua code

**`apps/point-cloud/src/scene/scene-pass.tsx`**

Hai priority có tên để ý nghĩa của chúng không bị giấu trong “magic number”:

```tsx
const OFFSCREEN_RENDER_PRIORITY = -1;
const SCREEN_RENDER_PRIORITY = 1;
```

Pass FBO chạy trước. Nó reset thống kê, đổi target, render content scene rồi khôi phục target trước đó:

```tsx
useFrame(({ camera }) => {
  gl.info.reset();
  const previousTarget = gl.getRenderTarget();
  gl.setRenderTarget(target);
  gl.render(contentScene, camera);
  gl.setRenderTarget(previousTarget);
}, OFFSCREEN_RENDER_PRIORITY);
```

Pass màn hình chạy cuối. Priority dương tắt automatic render của R3F, nên đây là lần duy nhất root scene được vẽ:

```tsx
useFrame(({ camera, scene }) => {
  gl.setRenderTarget(null);
  gl.render(scene, camera);
}, SCREEN_RENDER_PRIORITY);
```

Lifecycle effect lưu và khôi phục state toàn cục của renderer:

```tsx
const previousAutoClear = currentRenderer.autoClear;
const previousAutoReset = info.autoReset;

currentRenderer.autoClear = true;
info.autoReset = false;
```

`autoClear` đảm bảo mỗi target bắt đầu sạch. `autoReset=false` giữ số liệu của cả hai render call cho tới khi pipeline tự reset ở đầu frame kế tiếp.

**`apps/point-cloud/src/scene/stage.tsx`**

`OrbitControls` đứng trước `ScenePass` trong cây JSX. Cả hai đăng ký priority `-1`; thứ tự đăng ký này giúp controls cập nhật camera trước khi pass FBO đọc camera đó.

**`apps/point-cloud/src/scene/render-info.tsx`**

HUD tiếp tục dùng priority `-2`. Nó đọc số liệu frame cũ trước khi callback FBO priority `-1` gọi `gl.info.reset()`.

## Lỗi đã gặp

1. **Chỉ thêm một callback render màn hình là chưa đủ.** Nếu callback đó dùng priority `0` hoặc âm, R3F vẫn tự render root scene ở cuối frame. Fullscreen triangle sẽ bị vẽ hai lần và HUD thành 3 draw calls. Priority `1` vừa đặt pass ở cuối vừa tắt automatic render.
2. **`autoClear=false` không tự ghép thành post pipeline.** Khi không clear đúng target, nội dung cũ có thể còn trong color/depth buffer. Hai pass hiện dùng target khác nhau, nên giữ `autoClear=true` là lựa chọn đơn giản và đúng.
3. **Controls cũng dùng priority `-1`.** Nếu đăng ký render FBO trước camera damping, texture có thể dùng camera của frame trước. `Stage` mount controls trước `ScenePass` để camera update đứng trước render tại cùng priority.
4. **Không reset `renderer.info` ở cả hai pass.** Reset lần hai sẽ xoá thống kê particles. Pipeline reset đúng một lần ở đầu pass FBO, rồi để cả hai draw call cộng dồn.

## Tự thử

1. Đổi `SCREEN_RENDER_PRIORITY` từ `1` thành `0`. HUD báo bao nhiêu draw calls? Vì sao R3F bắt đầu tự render lại?
2. Xoá `gl.render(scene, camera)` trong pass priority `1`. Tại sao canvas không còn được cập nhật dù FBO vẫn được render?
3. Tạm đổi `currentRenderer.autoClear=false` mà không gọi `clear()`. Di chuyển camera và quan sát vệt từ frame trước.
4. Bỏ `gl.setRenderTarget(null)` khỏi pass cuối. Nếu pass trước quên khôi phục target, fullscreen triangle sẽ bị vẽ vào đâu?
5. Đổi hai priority cho nhau. Post shader đọc texture mới hay texture của frame trước?

## Đọc thêm

- [React Three Fiber — Hooks (`useFrame`)](https://r3f.docs.pmnd.rs/api/hooks)
- [three.js — WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html)
