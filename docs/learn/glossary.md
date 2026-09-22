# Từ điển thuật ngữ

Thuật ngữ giữ nguyên tiếng Anh (vì code và tài liệu gốc đều dùng tiếng Anh), kèm giải thích tiếng Việt. Cột "Gặp lần đầu" trỏ tới bài học nơi khái niệm xuất hiện.

## Đồ hoạ & GPU

| Thuật ngữ | Nghĩa | Gặp lần đầu |
|---|---|---|
| **WebGL** | API để JavaScript ra lệnh cho GPU vẽ trong trình duyệt. three.js là lớp bọc dễ dùng hơn bên trên. | [P0](p0-scaffold.md) |
| **Draw call** | Một lệnh "vẽ" CPU gửi cho GPU. Mỗi draw call có chi phí cố định → càng ít càng tốt. | [P1.1](p1-1-points.md) |
| **Vertex** (đỉnh) | Một điểm dữ liệu mà GPU xử lý. Với `THREE.Points`, mỗi hạt là một vertex. | [P1.1](p1-1-points.md) |
| **Buffer** | Mảng số liên tục (`Float32Array`) được gửi lên bộ nhớ GPU. | [P1.1](p1-1-points.md) |
| **`GL_POINTS`** | Chế độ vẽ mỗi vertex thành một ô vuông pixel (point sprite), thay vì tam giác. | [P1.1](p1-1-points.md) |
| **Shader** | Chương trình nhỏ chạy trên GPU, viết bằng GLSL. | [P1.2](p1-2-shader-material.md) |
| **GLSL** | Ngôn ngữ viết shader, cú pháp giống C. | [P1.2](p1-2-shader-material.md) |
| **Vertex shader** | Chạy một lần cho mỗi vertex; quyết định vị trí (`gl_Position`) và kích thước point (`gl_PointSize`). | [P1.2](p1-2-shader-material.md) |
| **Fragment shader** | Chạy một lần cho mỗi pixel mà hình phủ lên; quyết định màu (`gl_FragColor`). | [P1.2](p1-2-shader-material.md) |
| **Rasterization** | Bước GPU biến hình học (điểm, tam giác) thành danh sách pixel cần tô. | [P1.2](p1-2-shader-material.md) |
| **Attribute** | Dữ liệu **riêng cho từng vertex** (vị trí, cỡ riêng…). Đọc trong vertex shader. | [P1.2](p1-2-shader-material.md) |
| **Uniform** | Dữ liệu **chung cho mọi vertex/pixel** trong một draw call (thời gian, màu, kích thước…). Đổi giá trị không cần biên dịch lại shader. | [P1.2](p1-2-shader-material.md) |
| **Varying** | Biến vertex shader tính rồi chuyển cho fragment shader. | [P1.4](p1-4-point-size.md) |
| **`gl_PointCoord`** | Toạ độ của pixel hiện tại bên trong point sprite, (0,0) → (1,1). | [P1.3](p1-3-round-points.md) |
| **`discard`** | Lệnh trong fragment shader: bỏ hẳn pixel này, không tô. | [P1.3](p1-3-round-points.md) |
| **Blending** | Cách màu mới trộn với màu đã có trên màn hình, dựa vào alpha. | [P1.3](p1-3-round-points.md) |
| **Depth buffer** | Bộ nhớ lưu độ sâu mỗi pixel để vật gần che vật xa. | [P1.3](p1-3-round-points.md) |
| **`depthWrite`** | Có ghi độ sâu của vật này vào depth buffer hay không. | [P1.3](p1-3-round-points.md) |
| **Stateless animation** | Chuyển động tính lại từ đầu mỗi frame chỉ từ dữ liệu gốc + thời gian; không nhớ frame trước. | [P1.5](p1-5-gpu-drift.md) |
| **Amplitude / Frequency / Phase** | Biên độ (lắc xa bao nhiêu) / tần số (nhanh chậm) / pha (đang ở đâu trong chu kỳ) của một dao động `sin`. | [P1.5](p1-5-gpu-drift.md) |
| **`ALIASED_POINT_SIZE_RANGE`** | Khoảng `gl_PointSize` mà GPU hỗ trợ; mỗi máy khác nhau. | [P1.4](p1-4-point-size.md) |

## Không gian toạ độ

| Thuật ngữ | Nghĩa | Gặp lần đầu |
|---|---|---|
| **Object / local space** | Toạ độ gốc của vật, như khi ta tạo ra nó. | [P1.2](p1-2-shader-material.md) |
| **View / camera space** | Toạ độ nhìn từ camera. Camera ở gốc, nhìn theo hướng **−z**. | [P1.2](p1-2-shader-material.md) |
| **Clip space** | Toạ độ sau ma trận chiếu, trước khi chia cho `w`. Đây là thứ `gl_Position` nhận. | [P1.2](p1-2-shader-material.md) |
| **`modelViewMatrix`** | Ma trận đưa điểm từ object space sang view space. | [P1.2](p1-2-shader-material.md) |
| **`projectionMatrix`** | Ma trận chiếu phối cảnh: view space → clip space. | [P1.2](p1-2-shader-material.md) |
| **`viewMatrix` / `modelMatrix`** | Ma trận của camera / của vật. `modelViewMatrix` là tích của hai ma trận này. | [P1.6](p1-6-orbit-camera.md) |
| **Orbit / target** | Camera đi trên mặt cầu quanh một điểm nhìn cố định (target). | [P1.6](p1-6-orbit-camera.md) |
| **Dolly vs zoom (fov)** | Dolly = camera tiến/lùi thật (đổi phối cảnh). Zoom fov = hẹp góc nhìn (chỉ phóng to). | [P1.6](p1-6-orbit-camera.md) |
| **Pan** | Dời camera và target cùng lúc, song song với màn hình. | [P1.6](p1-6-orbit-camera.md) |
| **Damping** | Mỗi frame chỉ đi một phần quãng còn lại → chuyển động chậm dần tự nhiên. | [P1.6](p1-6-orbit-camera.md) |
| **Perspective divide** | GPU tự chia `x, y, z` cho `w` → vật xa nhỏ lại. | [P1.2](p1-2-shader-material.md) |
| **Size attenuation** | Làm kích thước point nhỏ lại theo khoảng cách, vì point không có hình học để phép chiếu tự thu nhỏ. | [P1.2](p1-2-shader-material.md) |

## Màn hình & màu

| Thuật ngữ | Nghĩa | Gặp lần đầu |
|---|---|---|
| **DPR** (device pixel ratio) | Số pixel thiết bị trên một pixel CSS. Màn retina: 2 hoặc 3. | [P1.4](p1-4-point-size.md) |
| **Drawing buffer** | Vùng pixel thật mà WebGL vẽ vào = kích thước CSS × DPR. | [P1.4](p1-4-point-size.md) |
| **Linear color** | Không gian màu mà phép cộng/trộn đúng về mặt vật lý; GPU tính toán trong không gian này. | [P1.2](p1-2-shader-material.md) |
| **sRGB** | Không gian màu của màn hình và mã hex (`#dfe6ff`). Phải đổi linear → sRGB trước khi hiển thị. | [P1.2](p1-2-shader-material.md) |

## React Three Fiber & Next.js

| Thuật ngữ | Nghĩa | Gặp lần đầu |
|---|---|---|
| **R3F** (React Three Fiber) | Viết cảnh three.js bằng JSX của React. | [P0](p0-scaffold.md) |
| **`<Canvas>`** | Component R3F tạo renderer, scene, camera và vòng lặp render. | [P0](p0-scaffold.md) |
| **`useFrame`** | Hook chạy một hàm ở **mỗi frame**, trước khi vẽ. Chỉ sửa object trực tiếp, không `setState`. | [P0](p0-scaffold.md) |
| **`useThree`** | Hook đọc trạng thái R3F: renderer (`gl`), kích thước, camera… | [P0](p0-scaffold.md) |
| **SSR** | Server render HTML trước khi gửi xuống trình duyệt. | [P0](p0-scaffold.md) |
| **Hydration** | React "gắn" sự kiện vào HTML do server render; nếu HTML lệch → cảnh báo hydration. | [P0](p0-scaffold.md) |
| **Accessible name** | Tên mà trình đọc màn hình đọc cho một control (ví dụ slider "Size"), thường lấy từ `aria-label` hoặc `<label>`. | [P1.5](p1-5-gpu-drift.md) |
| **Base UI** | Thư viện component không kèm style (unstyled) lo phần hành vi và truy cập; Atelier dựng style lên trên. | [P1.5](p1-5-gpu-drift.md) |
| **Monorepo** | Một repo chứa nhiều package/app dùng chung công cụ. | [P0](p0-scaffold.md) |
