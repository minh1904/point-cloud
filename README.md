# Point Cloud Studio

Web app chạy hoàn toàn trong browser: **upload ảnh → AI estimate depth → dựng point cloud → render particle 3D → export JSON**.

Không có backend. Ảnh của user không bao giờ rời khỏi máy họ.

| | |
|---|---|
| **AI** | `@huggingface/transformers` v4 (ONNX Runtime Web), WebGPU với fallback WASM |
| **Render** | Canvas 2D (preview depth) · Three.js + GLSL (particles, P2) |
| **UI** | Tự viết — xem [modules/ui.md](docs/learn/modules/ui.md) |
| **Build** | Vite 8 · React 19 · TypeScript 6 · Tailwind 4 · zustand |

---

## Học dự án này

Dự án được viết để đọc được, không chỉ để chạy. Mỗi module có một file md giải thích **công dụng, lý do tồn tại, hợp đồng vào/ra và cạm bẫy**.

➡️ Bắt đầu tại **[docs/learn/00-reading-order.md](docs/learn/00-reading-order.md)**

| Tài liệu | Nội dung |
|---|---|
| [STRUCTURE.md](STRUCTURE.md) | Cây thư mục đầy đủ + ai sở hữu file nào |
| [docs/learn/00-reading-order.md](docs/learn/00-reading-order.md) | Lộ trình đọc theo thứ tự |
| [docs/learn/02-data-flow.md](docs/learn/02-data-flow.md) | Luồng dữ liệu end-to-end |
| [docs/learn/03-why-these-choices.md](docs/learn/03-why-these-choices.md) | Nhật ký quyết định kỹ thuật |
| [docs/learn/glossary.md](docs/learn/glossary.md) | Thuật ngữ: fBM, curl noise, disparity, metric depth, FBO... |

### Module

| Module | Công dụng |
|---|---|
| [`src/shared`](docs/learn/modules/shared.md) | Hằng số, kiểu dữ liệu, toán học thuần — tầng đáy, không phụ thuộc ai |
| [`src/depth`](docs/learn/modules/depth.md) | Registry model AI + inference trong Web Worker → depth map |
| [`src/pointcloud`](docs/learn/modules/pointcloud.md) | Depth map → point cloud → JSON/gzip |
| [`src/scene`](docs/learn/modules/scene.md) | Vẽ: preview depth 2D, particle 3D (P2) |
| [`src/ui` + `src/store`](docs/learn/modules/ui.md) | Control tự viết, canvas pan/zoom, state |

---

## Chạy

```bash
npm install
npm run models:fetch   # tải model default ~47 MB (chạy một lần)
npm run dev            # http://localhost:5173
npm run typecheck && npm run test
```

Kiểm tra sau khi mở: `crossOriginIsolated === true` trong console. Thiếu nó thì
nhánh fallback WASM chạy single-thread, chậm 3–4 lần mà không báo lỗi gì.

## Nguồn tham khảo

- [Simulating Life in the Browser](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/) — Codrops, nguồn gốc của kỹ thuật particle + fBM/curl noise
- [Transformers.js](https://huggingface.co/docs/transformers.js)
