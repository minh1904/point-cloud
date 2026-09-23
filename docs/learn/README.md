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

### P4 — Chuyển động
- [P4.1 · Value noise và fBM](p4-1-value-noise-fbm.md)
- [P4.2 · Curl noise](p4-2-curl-noise.md)
- [P4.3 · Cộng độ dịch trong clip space](p4-3-clip-space-offset.md)
- [P4.4 · Thở và rung gần camera](p4-4-breathing.md)
- [P4.5 · Biến chuyển động thành núm vặn](p4-5-motion-params.md)

### P5 — Cái nhìn
- [P5.6 · Ống tele 16°](p5-6-telephoto.md)
- [P5.3 · DOF giả trong shader hạt](p5-3-fake-dof.md)
- [P5.4 · Bokeh mép](p5-4-edge-bokeh.md)
- [P5.2 · LUT màu 3D](p5-2-lut-color-grade.md)
- [P5.5 · Intro: hạt hiện dần](p5-5-intro-reveal.md)

Thứ tự ở đây là thứ tự đã làm, không phải thứ tự đánh số: 5.6 đặt khung hình mà mọi bước sau phải chỉnh dưới nó, còn 5.5 để cuối vì intro chỉ đáng dựng khi thứ nó trình diễn đã xong.

### P6 — Ảnh thành đám mây điểm
- [P6.1 · Ảnh vào app: decode, thu nhỏ, không gian màu](p6-1-anh-vao-app.md)
- [P6.2 · Chọn model depth (và cái lưới an toàn bên dưới)](p6-2-chon-model-depth.md)
- [P6.3 · Web Worker: chạy model mà không đứng hình, và huỷ cho thật](p6-3-worker-va-huy.md)
- [P6.4 · Bản đồ tầm quan trọng: "chi tiết" là con số nào?](p6-4-importance-map.md)
- [P6.5 · Blue noise: rải hạt theo tầm quan trọng mà vẫn đều](p6-5-blue-noise-sampling.md)
- [P6.6 · Mật độ điểm — và món nợ P5.1 cuối cùng cũng trả](p6-6-mat-do-diem.md)
- [P6.7 · Nâng ảnh lên 2.5D: vì sao relief phải nông](p6-7-nang-len-2-5d.md)
- [P6.8 · Đóng gói vào DataTexture: đường nối mà cả dự án chờ](p6-8-dong-goi-texture.md)
- [P6.9 · Xáo thứ tự điểm: texture là một cái túi, không phải một tấm bản đồ](p6-9-xao-thu-tu.md)

P6 là chỗ dự án ngừng dựng lại renderer của UntilLabs và đi qua nó: mọi thứ từ 6.2 trở đi tự động hoá phần họ làm tay trong Houdini. **P5.1 được giải quyết trong [P6.6](p6-6-mat-do-diem.md)**, vì mãi tới đó mới có mật độ thật để đo.

### Tiếp theo
- P7.1 · Bố cục viewport + inspector + toolbar + status bar *(sắp tới)*

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
