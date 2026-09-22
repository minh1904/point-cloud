# P1.3 · Hạt tròn, mép mềm

## Mục tiêu

Biến mỗi hạt từ ô vuông thành **đĩa tròn có mép mềm**. Chỉ sửa fragment shader, cộng hai dòng cấu hình material.

## Khái niệm

### 1. Point sprite bản chất là ô vuông

Với `gl_PointSize = 8.0`, GPU tô một ô vuông 8×8 pixel quanh vị trí hạt, và chạy fragment shader cho **từng** pixel trong ô. Biến có sẵn `gl_PointCoord` cho biết pixel đang xét nằm đâu trong ô:

```
gl_PointCoord
(0,0) ┌───────────┐ (1,0)
      │ ·  ·  ·  ·│
      │ ·  ┌─┐  · │      tâm = (0.5, 0.5)
      │ ·  └─┘  · │
      │ ·  ·  ·  ·│
(0,1) └───────────┘ (1,1)
```

### 2. Cắt thành hình tròn bằng khoảng cách

```glsl
float d = length(gl_PointCoord - 0.5);   // khoảng cách tới tâm
```

| Vị trí | `d` |
|---|---|
| Tâm | 0 |
| Giữa cạnh | 0.5 |
| Góc | ≈ 0.707 |

Mọi pixel có `d > 0.5` nằm ngoài vòng tròn nội tiếp → bỏ đi:

```glsl
if (d > 0.5) discard;
```

`discard` = pixel này không tồn tại: không tô màu, không ghi độ sâu.

### 3. Mép mềm bằng `smoothstep`

Cắt cứng ở 0.5 cho mép răng cưa. Thay vào đó, cho alpha giảm dần:

```
alpha
 1 ┤██████████▇▆▅▃▂
   │                ▁
 0 ┤─────────────────▁──▶ d
   0              0.25  0.5
             └ dải mờ ┘
```

`smoothstep(a, b, x)` trả về 0 khi `x ≤ a`, 1 khi `x ≥ b`, và một đường cong mượt ở giữa. Ta dùng `1 − smoothstep(...)` để alpha đi từ 1 xuống 0.

### 4. Trong suốt cần hai thứ ở material

- **`transparent: true`** — bật **blending**: màu hạt trộn với màu phía sau theo alpha. Không bật thì alpha bị bỏ qua.
- **`depthWrite: false`** — không ghi vào **depth buffer**.

Tại sao cần cái thứ hai? Depth buffer lưu "pixel này đã có vật ở độ sâu bao nhiêu". Nếu hạt trước ghi độ sâu, thì **cả phần mép gần như trong suốt** của nó cũng chặn các hạt phía sau → xuất hiện "lỗ đen" quanh mỗi hạt.

```
depthWrite: true            depthWrite: false
  ◯ ◯                          ◯◯
 ◯█◯   ← mép trong suốt       ◯◯◯  ← hạt sau vẫn hiện qua mép
  ◯     vẫn che hạt sau        ◯
```

Cái giá: vật trong suốt đúng ra phải vẽ từ xa đến gần. Với hàng nghìn hạt nhỏ, mắt không nhận ra sai lệch, nên bỏ qua sắp xếp là chấp nhận được.

## Đi qua code

**`apps/point-cloud/src/shaders/points.frag.glsl`**

```glsl
float d = length(gl_PointCoord - 0.5);
if (d > 0.5) discard;
float alpha = 1.0 - smoothstep(0.5 * (1.0 - uSoftness), 0.5, d);
gl_FragColor = vec4(uColor, alpha);
```

`uSoftness` quyết định dải mờ bắt đầu từ đâu: `0` → bắt đầu ở 0.5 (mép sắc), `1` → bắt đầu ở 0 (mờ từ tâm ra, như đốm sáng).

**`scene/particle-field.tsx`** — `transparent: true, depthWrite: false` trong `materialArgs`.

## Lỗi đã gặp

**Hạt tròn mà nhìn không ra.** Với `size = 0.012`, mỗi hạt chỉ ~1,2 pixel — tròn hay vuông cũng là một chấm. Để kiểm tra, đã tạm cho 300 hạt cỡ ~30px, thấy rõ đĩa tròn mép mềm, rồi trả về 60.000 hạt cỡ ~2px. Bài học: muốn kiểm tra một hiệu ứng, **phóng đại nó** cho dễ thấy trước, rồi mới chỉnh về giá trị thật.

## Tự thử

1. Tạm đổi `count = 300`, `size = 0.3` trong `particle-field.tsx`. Đổi giá trị mặc định `softness` lần lượt `0`, `0.5`, `1` và nhìn mép hạt thay đổi. (Slider sẽ có ở bước 1.5.)
2. Đổi `depthWrite: false` thành `true` (giữ cỡ to). Nhìn chỗ các hạt chồng nhau — thấy "viền đen" không?
3. Viết lại để hạt có **lõi sáng + quầng mờ** (glow): gợi ý `alpha = pow(1.0 - d * 2.0, 3.0);`. Đây gần với cách UntilLabs làm.
4. Thử hình khác bằng cách đổi công thức khoảng cách, với `vec2 c = gl_PointCoord - 0.5;`: `max(abs(c.x), abs(c.y))` cho hình vuông, `abs(c.x) + abs(c.y)` cho hình thoi. Vì sao? (Gợi ý: tìm hiểu "Chebyshev distance" và "Manhattan distance".)

## Đọc thêm

- [The Book of Shaders — Shapes](https://thebookofshaders.com/07/) — vẽ hình bằng khoảng cách, đúng kỹ thuật này
- [The Book of Shaders — Shaping functions](https://thebookofshaders.com/05/) — `smoothstep`, `step`, `pow`
- [Khronos — `smoothstep`](https://registry.khronos.org/OpenGL-Refpages/gl4/html/smoothstep.xhtml)
