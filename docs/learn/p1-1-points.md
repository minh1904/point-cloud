# P1.1 · 60.000 hạt trong một draw call

## Mục tiêu

Thay khối lập phương bằng 60.000 hạt phân bố **đều trong thể tích** một khối cầu, vẽ bằng **một** draw call. HUD góc trên báo `1 draw call · 60,000 points`.

## Khái niệm

### 1. Draw call — vì sao phải ít

Mỗi lần CPU bảo GPU "vẽ cái này" là một **draw call**. Mỗi draw call tốn chi phí cố định: kiểm tra trạng thái, đổi shader, gửi lệnh qua driver. GPU vẽ rất nhanh, nhưng *ra lệnh* thì chậm.

| Cách làm | Draw call | Kết quả |
|---|---|---|
| 60.000 `<mesh>` hình cầu nhỏ | 60.000 | Trình duyệt đứng hình |
| 1 `<points>` có 60.000 đỉnh | **1** | Mượt 60 fps |

### 2. `THREE.Points` và `GL_POINTS`

Thay vì tam giác, `THREE.Points` bảo GPU vẽ **mỗi đỉnh thành một ô vuông pixel** (point sprite). Toàn bộ vị trí nằm trong **một** mảng:

```
Float32Array: [x0, y0, z0,  x1, y1, z1,  x2, y2, z2, ...]   ← 60.000 × 3 = 180.000 số
                └ hạt 0 ┘   └ hạt 1 ┘    └ hạt 2 ┘
```

Mảng này được upload lên GPU **một lần**. Sau đó mỗi frame chỉ gửi vài con số (ma trận xoay) — dữ liệu hạt nằm yên trên GPU.

### 3. Phân bố đều trong khối cầu — toán học

Muốn hạt đều theo **thể tích**, cần chọn *hướng* và *bán kính* cẩn thận.

**Bán kính: phải là `R · ∛u`, không phải `R · u`** (với `u` ngẫu nhiên đều trong [0, 1]).

Thể tích bên trong bán kính r tỉ lệ với r³. Nếu chọn r đều, số hạt ở mỗi lớp vỏ bằng nhau — nhưng lớp vỏ trong bé hơn lớp ngoài rất nhiều → hạt dồn cục ở tâm.

```
r đều (sai):            r = R·∛u (đúng):
    · · ·                   · · · · ·
  · ·███· ·               · · · · · · ·
  · █████ ·               · · · · · · ·
  · ·███· ·               · · · · · · ·
    · · ·                   · · · · ·
  dày đặc ở tâm            đều khắp
```

Kiểm chứng bằng con số: nửa bán kính trong chiếm (½)³ = **1/8** thể tích → phải chứa 12,5% số hạt. Nếu quên căn bậc ba, con số đó là 50%.

**Hướng: chọn `cos φ` đều, không chọn `φ` đều.** Góc φ (từ cực bắc xuống) chọn đều thì hạt dồn về hai cực, vì vòng tròn gần cực ngắn hơn vòng xích đạo nhưng nhận cùng số hạt. Chọn `cos φ` đều trong [−1, 1] thì mỗi vùng diện tích bằng nhau nhận số hạt bằng nhau.

## Đi qua code

**`apps/point-cloud/src/scene/sphere-field.ts`** — hàm thuần, không phụ thuộc three.js, nên test được:

```ts
const theta = random() * Math.PI * 2;        // góc quanh trục: đều trong [0, 2π)
const phi = Math.acos(2 * random() - 1);     // cos φ đều trong [-1, 1]
const r = radius * Math.cbrt(random());      // ∛u → đều theo thể tích
```

Rồi đổi toạ độ cầu (r, θ, φ) sang Descartes (x, y, z):

```ts
positions[i * 3 + 0] = r * sin(phi) * cos(theta);
positions[i * 3 + 1] = r * sin(phi) * sin(theta);
positions[i * 3 + 2] = r * cos(phi);
```

**`sphere-field.test.ts`** kiểm chứng đúng hai điều trên bằng thống kê: 1/8 số hạt trong nửa bán kính, 10% số hạt trong vùng `|cos φ| > 0.9`. Dùng bộ sinh số ngẫu nhiên có seed (`mulberry32`) để test cho kết quả lặp lại được.

**`scene/particle-field.tsx`** — đưa mảng vào GPU:

```tsx
<points>
  <bufferGeometry>
    <bufferAttribute attach="attributes-position" args={[positions, 3]} />
  </bufferGeometry>
</points>
```

`args={[positions, 3]}` = "mảng này, cứ **3** số là một đỉnh". `attach="attributes-position"` = gắn vào `geometry.attributes.position`.

**`scene/render-info.tsx`** — HUD đọc `renderer.info.render.calls` và `.points`, 2 lần/giây.

## Lỗi đã gặp

Không có lỗi — nhưng một điểm đáng nhớ: `renderer.info` được reset ở **đầu** mỗi lần vẽ, và `useFrame` chạy **trước** khi vẽ. Nên số liệu HUD đọc được là của frame trước. Đủ chính xác cho HUD, nhưng đừng dùng nó để tính toán trong cùng frame.

## Tự thử

1. Trong `sphere-field.ts`, bỏ `Math.cbrt(...)` (để `r = radius * random()`). Chạy `bun run test` — test nào đỏ? Nhìn trên màn hình khác gì?
2. Đổi `phi` thành `random() * Math.PI`. Test nào đỏ? Xoay khối cầu và nhìn hai cực.
3. Tăng `count` lên 500.000, rồi 2.000.000. Số draw call có đổi không? FPS thì sao? Điểm nghẽn bây giờ nằm ở đâu?

## Đọc thêm

- [three.js — Points](https://threejs.org/docs/#api/en/objects/Points)
- [three.js — BufferGeometry](https://threejs.org/docs/#api/en/core/BufferGeometry)
- [Wolfram MathWorld — Sphere Point Picking](https://mathworld.wolfram.com/SpherePointPicking.html) — chứng minh vì sao chọn `cos φ` đều
