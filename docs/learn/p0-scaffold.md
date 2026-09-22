# P0 · Monorepo, Next.js và vòng lặp render của R3F

## Mục tiêu

Dựng khung dự án: một app Next.js vẽ khối lập phương xoay bằng React Three Fiber, dùng component từ bộ UI riêng `@atelier/ui`. Chưa có hạt nào — mục đích là hiểu **khung chạy** trước khi đổ nội dung vào.

## Khái niệm

### 1. Monorepo: một repo, nhiều package

```
apps/point-cloud/    ← app Next.js (sản phẩm)
packages/tokens/     ← @atelier/tokens: màu, cỡ chữ, bo góc (CSS variables)
packages/ui/         ← @atelier/ui: Button... dùng chung cho nhiều demo
```

`pnpm-workspace.yaml` khai báo các thư mục này là workspace. App dùng package nội bộ qua `"@atelier/ui": "workspace:*"` — pnpm tạo liên kết (symlink) thay vì tải từ npm, sửa code trong `packages/ui` là app thấy ngay.

Vì package xuất **mã nguồn TypeScript** chứ không build sẵn, Next phải tự biên dịch nó: đó là lý do có `transpilePackages: ["@atelier/ui"]` trong `apps/point-cloud/next.config.ts`.

### 2. React Three Fiber (R3F) là gì

three.js là thư viện kiểu "mệnh lệnh": tạo `Scene`, `Camera`, `Mesh`, tự viết vòng lặp `requestAnimationFrame`, tự gọi `renderer.render()`. R3F cho phép viết cùng thứ đó bằng JSX:

```tsx
<Canvas>                     // tạo WebGLRenderer + Scene + Camera + vòng lặp
  <mesh>                     // = new THREE.Mesh()
    <boxGeometry />          // = new THREE.BoxGeometry()  → gắn vào mesh.geometry
    <meshStandardMaterial /> // = new THREE.MeshStandardMaterial() → mesh.material
  </mesh>
</Canvas>
```

Mỗi thẻ viết thường là một class của three.js. R3F lo tạo, gắn và **dọn dẹp** (`dispose`) object khi component unmount.

### 3. Vòng lặp render và `useFrame`

`<Canvas>` chạy một vòng lặp ~60 lần/giây. Mỗi vòng:

1. gọi mọi hàm đăng ký qua `useFrame` (cập nhật animation),
2. gọi `renderer.render(scene, camera)` (vẽ).

```tsx
useFrame((state, delta) => {
  mesh.current.rotation.y += delta * 0.6; // delta = số giây kể từ frame trước
});
```

Hai quy tắc quan trọng:

- **Nhân với `delta`**, đừng cộng số cố định. Máy 120Hz gọi `useFrame` gấp đôi máy 60Hz; nhân `delta` thì tốc độ xoay như nhau trên mọi máy.
- **Sửa object trực tiếp qua `ref`, không `setState`** trong `useFrame`. `setState` 60 lần/giây bắt React render lại cả cây component 60 lần/giây.

### 4. Vì sao canvas chỉ render ở client

Next.js mặc định render HTML trên server (SSR) rồi "hydrate" ở trình duyệt. Server không có GPU, không có WebGL — render canvas ở đó chỉ ra một thẻ `div` rỗng. Vì vậy `apps/point-cloud/src/app/studio.tsx:11` tải `Stage` bằng:

```tsx
const Stage = dynamic(() => import("@/scene/stage").then((m) => m.Stage), { ssr: false });
```

Canvas chỉ được tạo sau khi JavaScript chạy trên trình duyệt.

## Đi qua code

| File | Vai trò |
|---|---|
| `apps/point-cloud/src/app/layout.tsx` | Khung HTML, nạp font Inter (`next/font`) |
| `apps/point-cloud/src/app/studio.tsx` | Component client: nút Pause/Spin, HUD, tải `Stage` không SSR |
| `apps/point-cloud/src/scene/stage.tsx` | `<Canvas>`: camera, màu nền, các object trong cảnh |
| `packages/tokens/src/theme.css` | Token màu theo vai trò (`background`, `primary`, `border`…) |
| `packages/ui/src/button.tsx` | Button dựng trên Base UI, biến thể bằng `cva` |

## Lỗi đã gặp

1. **Canvas chỉ 300×150 pixel.** R3F tự đặt `style="position: relative"` cho thẻ bọc canvas, đè lên class Tailwind `absolute`. Cách sửa: đặt vị trí cho một `div` cha (`stage.tsx`), không style trực tiếp `<Canvas>`. Bài học: thư viện nào tự set inline style thì đừng cố đè bằng class.
2. **Cảnh báo hydration `bis_skin_checked`.** Không phải lỗi code: extension trình duyệt chèn thuộc tính vào HTML trước khi React hydrate. Chỉ xuất hiện ở dev.
3. **Cảnh báo `THREE.Clock` deprecated.** R3F 9.7 còn dùng `Clock`, three r183 đánh dấu lỗi thời → ghim three 0.182. Bài học: đọc cảnh báo để biết nó đến từ code mình hay từ thư viện.

## Tự thử

1. Trong `scene/stage.tsx`, đổi `fov: 45` thành `fov: 15` rồi `90`. Khối cầu to/nhỏ thế nào? Vì sao? *(Gợi ý: fov là góc nhìn — góc hẹp như ống tele.)*
2. Đổi `camera={{ position: [0, 0, 4] }}` thành `[0, 0, 8]`. So với việc giảm fov — hình có khác nhau không, ngoài kích thước?
3. Trong `particle-field.tsx`, bỏ `delta *` trong `useFrame` (chỉ cộng `0.15`). Xoay nhanh hơn bao nhiêu lần? Sẽ thế nào trên màn hình 120Hz?

## Đọc thêm

- [R3F — Introduction](https://r3f.docs.pmnd.rs/getting-started/introduction)
- [R3F — Hooks (`useFrame`, `useThree`)](https://r3f.docs.pmnd.rs/api/hooks)
- [R3F — Performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls) — đặc biệt phần "never setState in useFrame"
- [three.js fundamentals](https://threejs.org/manual/#en/fundamentals)
