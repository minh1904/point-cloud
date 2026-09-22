# Lộ trình đọc

Dự án này có ba lớp kiến thức xếp chồng. Đọc nhảy bậc sẽ rất khó hiểu, vì mỗi lớp giải thích *vì sao* lớp dưới trông như vậy.

```
Lớp 3 — Sản phẩm      Studio UI, model picker, export
Lớp 2 — Đồ hoạ        point cloud, particle shader, fBM/curl noise
Lớp 1 — Framework     ràng buộc Toolcraft: cái gì được sửa, cái gì không
```

---

## Chặng 1 — Hiểu luật chơi (bắt buộc, ~20 phút)

Toolcraft là framework **có guardrail cứng**: khoảng 80 test acceptance sẽ fail nếu bạn viết UI theo cách thông thường. Không đọc chặng này thì mọi thứ còn lại trông vô lý.

1. **[STRUCTURE.md](../../STRUCTURE.md)** — ai sở hữu file nào, quy tắc phụ thuộc 4 tầng
2. **[01-toolcraft-constraints.md](01-toolcraft-constraints.md)** — 8 ràng buộc và cách sống với chúng
3. `AGENTS.md` ở gốc + `docs/toolcraft/core/runtime-boundary.md` — bản gốc của framework, đọc để đối chiếu

> **Bài kiểm tra tự đánh giá:** trả lời được "tại sao app này không có route `/preview`?" thì qua chặng 1.

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
| 10 | **[app](modules/app.md)** | Nơi tất cả gặp nhau. Đọc cuối vì nó chỉ có nghĩa khi đã biết nó đang nối cái gì. |

---

## Chặng 4 — Nền tảng bên ngoài (đọc khi cần đào sâu)

11. **[03-why-these-choices.md](03-why-these-choices.md)** — nhật ký quyết định: vì sao Three.js thuần chứ không R3F, vì sao 4 model chứ không 10, vì sao bỏ JSON naive
12. [Bài Codrops gốc](https://tympanus.net/codrops/2025/12/10/simulating-life-in-the-browser-creating-a-living-particle-system-for-the-untillabs-website/) — nguồn của kỹ thuật particle. `03` có ghi lại cả những chỗ bài viết **thiếu hoặc sai**.
13. `docs/toolcraft/renderer-technique.md` — khi cần thêm render pass mới
14. `docs/toolcraft/schema-reference.md` — khi cần thêm control mới

---

## Nếu bạn chỉ có 15 phút

Đọc đúng ba thứ này:

1. [01-toolcraft-constraints.md](01-toolcraft-constraints.md) mục **"Tám ràng buộc"**
2. [02-data-flow.md](02-data-flow.md) sơ đồ đầu trang
3. [modules/pointcloud.md](modules/pointcloud.md) — module đại diện tốt nhất cho phong cách code của dự án

## Nếu bạn đang đi sửa bug

| Hiện tượng | Đọc |
|---|---|
| `npm run test` đỏ mà code chạy đúng | [01](01-toolcraft-constraints.md) — gần như chắc chắn bạn chạm file bị ký |
| Depth map sai / trắng xoá | [modules/depth.md](modules/depth.md) mục *Cạm bẫy* |
| Hạt bị kéo thành màng ở biên vật thể | [modules/pointcloud.md](modules/pointcloud.md) mục *Edge rejection* |
| Vị trí hạt thành rác | [modules/scene.md](modules/scene.md) mục *Cạm bẫy* — 90% là filter texture |
| File JSON export quá lớn | [modules/pointcloud.md](modules/pointcloud.md) mục *Kích thước* |
