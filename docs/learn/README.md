# Học đồ hoạ 3D qua dự án point-cloud

Nhật ký học tập đi kèm [roadmap](../roadmap.md). Mỗi bước của roadmap có một bài ở đây, viết **bằng tiếng Việt**, bám sát code thật trong repo — không phải lý thuyết chung chung.

## Cách đọc

Mỗi bài có cùng khung:

| Mục | Để làm gì |
|---|---|
| **Mục tiêu** | Bước này tạo ra cái gì nhìn thấy được |
| **Khái niệm** | Kiến thức nền cần nắm, giải thích từ gốc |
| **Đi qua code** | Đọc code thật từng đoạn, kèm đường dẫn file |
| **Lỗi đã gặp** | Những chỗ đã vấp trong dự án và vì sao |
| **Tự thử** | Bài tập nhỏ: sửa một con số, đoán kết quả, rồi kiểm tra |
| **Đọc thêm** | Nguồn đáng tin để đào sâu |

Gặp thuật ngữ lạ → tra [từ điển thuật ngữ](glossary.md).

Cách học hiệu quả nhất: mở song song bài học và file code được nhắc tới, chạy `bun run dev`, làm phần **Tự thử** trước khi đọc tiếp bài sau.

## Mục lục

### P0 — Nền móng
- [P0 · Monorepo, Next.js và vòng lặp render của R3F](p0-scaffold.md)

### P1 — Trường hạt đơn giản
- [P1.1 · 60.000 hạt trong một draw call](p1-1-points.md)
- [P1.2 · Tự viết shader thay cho PointsMaterial](p1-2-shader-material.md)
- [P1.3 · Hạt tròn, mép mềm](p1-3-round-points.md)
- [P1.4 · Kích thước hạt: phối cảnh, DPR, dưới 1 pixel](p1-4-point-size.md)
- [P1.5 · Hạt tự trôi trên GPU (và slider đầu tiên)](p1-5-gpu-drift.md)
- [P1.6 · Camera: xoay, pan, zoom](p1-6-orbit-camera.md)

### P2 — Render pipeline
- [P2.1 · Render scene vào FBO](p2-1-offscreen-render-target.md)
- [P2.2 · Fullscreen post-processing shader](p2-2-fullscreen-post-shader.md)
- [P2.3 · Thứ tự các render pass](p2-3-render-pass-order.md)
- [P2.4 · Vignette, chromatic aberration và grain](p2-4-post-effects.md)
- [P2.5 · Render scale FBO](p2-5-render-scale.md)

### P3 — Texture làm dữ liệu
- [P3.1 · Geometry không có vị trí](p3-1-geometry-without-positions.md)
- [P3.2 · Màu đọc từ texture](p3-2-color-texture.md)
- [P3.3 · Vị trí 16-bit trong hai file PNG](p3-3-16-bit-positions.md)
- [P3.4 · Bounds và `metadata.json`](p3-4-bounds-va-metadata.md)
- [P3.5 · Test cho decoder](p3-5-test-cho-decoder.md)

### Tiếp theo
- P4.1 · Value noise và fBM trong GLSL *(sắp tới)*

## Bức tranh tổng thể

Mọi thứ ta xây đều chạy qua cùng một đường ống (pipeline) của GPU. Nhớ sơ đồ này, mỗi bài sau chỉ là phóng to một ô:

```
 CPU (JavaScript)                           GPU
┌──────────────────────┐   upload   ┌──────────────────────────────────────────────┐
│ Float32Array vị trí   │ ─────────▶ │ Vertex shader    chạy 1 lần / mỗi đỉnh (hạt)  │
│ attribute, uniform    │            │   → gl_Position (hạt nằm đâu trên màn hình)   │
│ (một lần, hoặc khi đổi)│            │   → gl_PointSize (hạt to bao nhiêu pixel)     │
└──────────────────────┘            │            ▼                                  │
                                    │ Rasterization   biến mỗi hạt thành các pixel  │
 mỗi frame (~60 lần/giây):          │            ▼                                  │
 cập nhật vài uniform (thời gian,   │ Fragment shader  chạy 1 lần / mỗi pixel       │
 kích thước...) rồi gọi draw        │   → gl_FragColor (màu + độ trong suốt)        │
                                    │            ▼                                  │
                                    │ Blending / depth → framebuffer → màn hình     │
                                    └──────────────────────────────────────────────┘
```

Nguyên tắc xuyên suốt dự án: **đẩy việc lên GPU**. CPU chỉ gửi dữ liệu một lần và vài con số mỗi frame; GPU làm phần nặng song song cho hàng chục nghìn hạt.
