# P1.6 · Camera: xoay, pan, zoom

## Mục tiêu

Người dùng tự điều khiển góc nhìn: **kéo trái** để xoay quanh khối cầu, **kéo phải** (hoặc Shift/Ctrl + kéo trái) để pan, **cuộn** để zoom. Camera chuyển động có quán tính nhẹ. Nút **Reset view** đưa camera về vị trí ban đầu. Đây là bước cuối của P1.

## Khái niệm

### 1. Di chuyển camera khác di chuyển vật

Có hai cách làm khối cầu "xoay" trên màn hình:

| | Xoay vật (`points.rotation.y += …`) | Xoay camera (OrbitControls) |
|---|---|---|
| Cái gì đổi | `modelMatrix` của vật | `viewMatrix` của camera |
| Ảnh hưởng | Chỉ vật đó | Mọi thứ trong cảnh |
| Dùng khi | Vật tự chuyển động (animation) | Người xem đổi góc nhìn |

Trong shader, cả hai gộp vào `modelViewMatrix = viewMatrix × modelMatrix`. Shader không biết (và không cần biết) ai đã xoay. Dự án dùng cả hai cùng lúc: nút Play/Pause xoay **vật**, còn chuột xoay **camera**.

### 2. Orbit: camera đi trên một mặt cầu tưởng tượng

OrbitControls giữ một điểm **target** (mặc định là gốc toạ độ) và đặt camera trên mặt cầu quanh target, mô tả bằng toạ độ cầu — y như cách ta rải hạt ở [P1.1](p1-1-points.md):

```
            camera
              ●
             /|
   radius  /  |
          /   |          radius  = khoảng cách tới target   ← zoom đổi cái này
         / φ  |          θ (theta) = góc quanh trục đứng    ← kéo ngang
target ●──────┘          φ (phi)   = góc từ trục đứng xuống ← kéo dọc
```

- **Xoay** = đổi θ và φ, giữ nguyên radius. Camera luôn nhìn về target.
- **Zoom** (thực chất là *dolly*) = đổi radius: camera tiến lại gần/lùi ra xa. Khác với đổi `fov` (góc nhìn) — dolly làm đổi phối cảnh, fov chỉ phóng to như zoom ống kính.
- **Pan** = dời **cả target lẫn camera** cùng một đoạn, song song với mặt phẳng màn hình.

`minDistance = 0.6` và `maxDistance = 12` giới hạn radius, để không chui quá sâu vào trong khối cầu hay lùi xa đến mức mất dấu.

### 3. Damping — quán tính cho camera

Không có damping, camera dừng ngay khi thả chuột — trông cứng như máy. Với damping, mỗi frame camera chỉ đi **một phần** quãng đường còn lại:

```
còn lại = đích − hiện tại
hiện tại += còn lại × dampingFactor   (0.08 = đi 8% quãng còn lại mỗi frame)
```

Quãng còn lại giảm dần theo cấp số nhân → camera trượt chậm dần rồi dừng. Vì vậy damping **cần gọi `controls.update()` mỗi frame**; drei tự làm việc đó trong `useFrame`.

### 4. Zoom về tâm, không về con trỏ

`zoomToCursor={false}`: cuộn chuột luôn tiến về target, nên chủ thể giữ nguyên giữa khung. Zoom theo con trỏ (kiểu bản đồ) tiện khi soi chi tiết, nhưng dễ làm khung hình trôi lệch — với một cảnh có một chủ thể ở giữa, zoom về tâm dễ chịu hơn.

### 5. Hệ quả với kích thước hạt

Nhớ công thức ở [P1.4](p1-4-point-size.md): `gl_PointSize = uSize × aScale × uScale / khoảng cách`. Zoom lại gần → khoảng cách nhỏ → hạt **to ra**, đúng như vật thật. Đây là lúc thấy rõ vì sao cần `clamp` theo giới hạn GPU: sát camera, một hạt có thể đòi hàng trăm pixel.

## Đi qua code

**`apps/point-cloud/src/scene/stage.tsx`**

```tsx
<OrbitControls
  ref={controlsRef}
  makeDefault          // đăng ký làm controls mặc định của R3F (component khác lấy được qua useThree)
  enableDamping
  dampingFactor={0.08}
  zoomToCursor={false}
  minDistance={0.6}
  maxDistance={12}
/>
```

drei gắn controls vào chính phần tử canvas, nên thao tác trên Panel (một phần tử HTML khác nằm đè lên) không bao giờ lọt xuống camera.

**`app/studio.tsx`** — `useRef<OrbitControlsHandle>` được truyền xuống `Stage` qua prop `controlsRef`; nút **Reset view** gọi `controls.current?.reset()`. `reset()` khôi phục trạng thái camera mà controls tự lưu (`saveState`) lúc được tạo.

`OrbitControlsHandle = ComponentRef<typeof OrbitControls>` — lấy kiểu của ref từ chính component, khỏi phải import `three-stdlib` (một phụ thuộc gián tiếp).

## Lỗi đã gặp

1. **Ảnh chụp không chứng minh được camera đã xoay.** Khối cầu nhìn góc nào cũng như nhau! Phải đổi cách kiểm tra: tạm gắn controls lên `window` để **đọc thẳng vị trí camera** trước/sau mỗi thao tác. Kết quả: xoay đổi (x, y, z) nhưng giữ khoảng cách 4; cuộn giảm khoảng cách 4 → 3.8; kéo phải dời cả camera lẫn target 0.91; kéo slider không đổi camera. Bài học: với cảnh đối xứng, **đo số liệu** thay vì nhìn ảnh.
2. **Shift + kéo trong công cụ tự động lại xoay chứ không pan** — công cụ không truyền phím Shift vào sự kiện pointer. Pan bằng chuột phải (gửi sự kiện trực tiếp) thì đúng. Đây là giới hạn của công cụ kiểm thử, không phải lỗi app.

## Tự thử

1. Đặt `enableDamping={false}`. Kéo rồi thả — cảm giác khác gì? Thử `dampingFactor` = `0.02` và `0.3`.
2. Đặt `zoomToCursor` (bỏ `={false}`). Đưa chuột ra mép khối cầu rồi cuộn. Khung hình thay đổi thế nào?
3. Bỏ `minDistance`, cuộn cho tới khi chui vào trong khối cầu. Nhìn hạt sát camera — to cỡ nào? Vì sao?
4. Trong `stage.tsx`, đổi camera `fov: 45` thành `fov: 16` (như UntilLabs) và `position: [0, 0, 4]` thành `[0, 0, 11]` để khối cầu vẫn vừa khung. Xoay thử: phối cảnh "phẳng" hơn không? Liên hệ lý do UntilLabs chọn FOV hẹp trong [bài nghiên cứu](../research/01-untillabs-method.md).
5. Pause rồi xoay camera, sau đó Play rồi đứng yên. Phân biệt bằng mắt đâu là camera xoay, đâu là vật xoay.

## Đọc thêm

- [drei — OrbitControls](https://drei.docs.pmnd.rs/controls/orbit-controls)
- [three.js — OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls) — mọi thuộc tính (`dampingFactor`, `minPolarAngle`, `screenSpacePanning`…)
- [three.js manual — Cameras](https://threejs.org/manual/#en/cameras) — perspective camera, fov, near/far
