# Lộ trình đọc

```
Lớp 3 — Sản phẩm   Studio UI, model picker, export
Lớp 2 — Đồ hoạ     point cloud, particle shader, fBM/curl noise
Lớp 1 — Dữ liệu    ảnh → depth map → point cloud
```

---

## Chặng 1 — Bố cục (~10 phút)

1. **[STRUCTURE.md](../../STRUCTURE.md)** — cây thư mục và quy tắc phụ thuộc 4 tầng

> **Bài kiểm tra:** trả lời được "tại sao `scene/` không được import `depth/`?" thì qua chặng 1.

---

## Chặng 2 — Hiểu luồng dữ liệu (~15 phút)

4. **[02-data-flow.md](02-data-flow.md)** — từ file ảnh đến file JSON, từng phép biến đổi
5. **[glossary.md](glossary.md)** — tra khi gặp thuật ngữ lạ. Không cần đọc hết một lượt.

> **Bài kiểm tra:** vẽ lại được luồng `File → depth map → point cloud → JSON` và nói được mỗi bước chạy ở đâu (main thread / worker / GPU).

---

## Chặng 3 — Đọc module theo thứ tự phụ thuộc (~60 phút)

Đọc từ tầng đáy lên. Mỗi file md có mục *Hợp đồng vào/ra* — đọc mục đó trước, rồi mới mở code.

| # | Module | Vì sao đọc ở vị trí này |
|---|---|---|
| 6 | **[shared](modules/shared.md)** | Định nghĩa từ vựng. Mọi module khác nói bằng kiểu dữ liệu ở đây. |
| 7 | **[depth](modules/depth.md)** | Đầu vào của hệ thống. Phần AI. Độc lập hoàn toàn với đồ hoạ. |
| 8 | **[pointcloud](modules/pointcloud.md)** | Toán học thuần, không GPU, không React. Module dễ đọc và dễ test nhất — **nên đọc code trước ở đây**. |
| 9 | **[scene](modules/scene.md)** | Phần khó nhất: GLSL + Three.js + hợp đồng renderer của Toolcraft. |
| 9 | **[ui](modules/ui.md)** | Control tự viết, canvas pan/zoom, state. Có ghi lại các luật thiết kế lấy từ Toolcraft. |
| 10 | **`src/App.tsx`** | Nơi tất cả gặp nhau. Đọc cuối vì nó chỉ có nghĩa khi đã biết nó đang nối cái gì — chú ý bảng "khi nào chạy lại cái gì" ở đầu file. |

---

## Chặng 4 — Nền tảng bên ngoài (đọc khi cần đào sâu)

11. **[03-why-these-choices.md](03-why-these-choices.md)** — nhật ký quyết định, gồm cả **vì sao đã bỏ Toolcraft sau khi đã dùng nó** và bài học "README của repo model không phải bằng chứng"
12. [Bài Codrops gốc](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/) — nguồn của kỹ thuật particle. `03` có ghi lại cả những chỗ bài viết **thiếu hoặc sai**.
---

## Nếu bạn chỉ có 15 phút

Đọc đúng ba thứ này:

1. [02-data-flow.md](02-data-flow.md) sơ đồ đầu trang
2. [modules/depth.md](modules/depth.md) — phần AI, trái tim của app
3. [03-why-these-choices.md](03-why-these-choices.md) mục Q11 và Q12 — hai bài học đắt nhất

## Nếu bạn đang đi sửa bug

| Hiện tượng | Đọc |
|---|---|
| Depth map sai / trắng xoá | [modules/depth.md](modules/depth.md) mục *Cạm bẫy* |
| Hạt bị kéo thành màng ở biên vật thể | [modules/pointcloud.md](modules/pointcloud.md) mục *Edge rejection* |
| Vị trí hạt thành rác | [modules/scene.md](modules/scene.md) mục *Cạm bẫy* — 90% là filter texture |
| File JSON export quá lớn | [modules/pointcloud.md](modules/pointcloud.md) mục *Kích thước* |
