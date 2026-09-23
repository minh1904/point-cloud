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
| **FBO / Framebuffer** | Vùng bộ nhớ GPU nhận màu và độ sâu khi render. Framebuffer mặc định thuộc canvas; FBO cho phép vẽ ngoài màn hình. | [P2.1](p2-1-offscreen-render-target.md) |
| **Render target** | Đích render ngoài màn hình có texture để pass sau đọc lại. | [P2.1](p2-1-offscreen-render-target.md) |
| **Half float** | Số thực 16-bit; chính xác và có khoảng giá trị rộng hơn kênh màu 8-bit, phù hợp cho texture hậu kỳ. | [P2.1](p2-1-offscreen-render-target.md) |
| **Fullscreen triangle** | Một tam giác clip-space quá khổ phủ toàn màn hình, dùng để chạy fragment shader một lần cho mỗi pixel. | [P2.1](p2-1-offscreen-render-target.md) |
| **Post-processing** | Xử lý ảnh sau khi scene đã được render: fragment shader đọc texture của cả khung hình rồi biến đổi từng pixel. | [P2.2](p2-2-fullscreen-post-shader.md) |
| **Texture sampling** | Đọc giá trị màu/dữ liệu từ texture tại một toạ độ UV bằng hàm như `texture2D`. | [P2.2](p2-2-fullscreen-post-shader.md) |
| **UV** | Toạ độ 2D chuẩn hoá trên texture; thường `(0,0)` ở một góc và `(1,1)` ở góc đối diện. | [P2.2](p2-2-fullscreen-post-shader.md) |
| **Render priority (R3F)** | Số quyết định thứ tự callback `useFrame`: số thấp chạy trước; priority dương đồng thời tắt automatic render để callback tự vẽ. | [P2.3](p2-3-render-pass-order.md) |
| **`autoClear`** | Cờ của `WebGLRenderer` cho phép tự xoá color/depth/stencil buffer của render target hiện tại trước mỗi lần `render()`. | [P2.3](p2-3-render-pass-order.md) |
| **Manual render** | Khi app tự gọi `gl.render(scene, camera)` và chịu trách nhiệm về thứ tự pass thay vì để R3F vẽ scene gốc tự động. | [P2.3](p2-3-render-pass-order.md) |
| **Per-pixel effect** | Hiệu ứng hậu kỳ xử lý độc lập từng pixel từ toạ độ hoặc mẫu màu cục bộ, chi phí tính toán rất thấp. | [P2.4](p2-4-post-effects.md) |
| **Vignette** | Hiệu ứng làm tối dần rìa và bốn góc khung hình nhằm tập trung tầm nhìn vào vùng trung tâm. | [P2.4](p2-4-post-effects.md) |
| **Chromatic aberration** | Hiện tượng sắc sai quang học: dải màu đỏ và xanh lam bị tách lệch khỏi tâm thấu kính. | [P2.4](p2-4-post-effects.md) |
| **Film grain** | Hạt nhiễu giả ngẫu nhiên mô phỏng phim nhựa cổ điển, giúp ảnh sống động và giảm bệt màu (banding). | [P2.4](p2-4-post-effects.md) |
| **Fill-rate** | Tốc độ GPU có thể ghi pixel vào framebuffer (pixels/giây); thường là nút thắt cổ chai trên màn hình DPR cao. | [P2.5](p2-5-render-scale.md) |
| **Overdraw** | Hiện tượng nhiều fragment/hạt vẽ chồng lên cùng một vị trí pixel, làm lãng phí công suất tính toán của GPU. | [P2.5](p2-5-render-scale.md) |
| **Render scale** | Tỉ lệ co giảm độ phân giải của FBO (ví dụ 50%–100%) so với canvas để giảm tải fill-rate mà UI vẫn giữ nguyên độ nét. | [P2.5](p2-5-render-scale.md) |
| **Texel** | Một ô của texture (texture element), tương tự pixel của ảnh. Texture `256²` có 65.536 texel. | [P3.1](p3-1-geometry-without-positions.md) |
| **Texture as data** | Dùng texture để chứa số liệu (vị trí, màu, mật độ) thay vì chỉ chứa hình ảnh, để vertex shader tự tra cứu. | [P3.1](p3-1-geometry-without-positions.md) |
| **Tâm texel** (`+ 0.5`) | UV phải trỏ vào giữa ô: `(x + 0.5) / size`. Lấy `x / size` là trỏ vào vạch ngăn hai texel → sai số làm tròn đọc nhầm ô bên cạnh. | [P3.1](p3-1-geometry-without-positions.md) |
| **Bounding sphere** | Hình cầu nhỏ nhất bao trọn một vật; three.js tính nó **từ attribute `position`**. | [P3.1](p3-1-geometry-without-positions.md) |
| **Frustum culling** | Bỏ draw call của vật nằm ngoài khối nón cụt camera nhìn thấy. Phải tắt khi vị trí chỉ sinh ra trong shader. | [P3.1](p3-1-geometry-without-positions.md) |
| **Hash (trong shader)** | Hàm tất định biến một toạ độ thành số "ngẫu nhiên", thay cho attribute random do CPU sinh. Nhạy với độ lớn đầu vào. | [P3.1](p3-1-geometry-without-positions.md) |
| **ulp** (unit in the last place) | Khoảng cách giữa hai số float liền kề. Càng xa 0 thì ulp càng lớn → số lớn mất độ phân giải phần thập phân. | [P3.1](p3-1-geometry-without-positions.md) |
| **Vertex texture fetch** (VTF) | Đọc texture ngay trong vertex shader. WebGL 2 bảo đảm hỗ trợ; WebGL 1 thì nhiều GPU di động không cho. | [P3.2](p3-2-color-texture.md) |
| **`NearestFilter`** | Trả về đúng texel được hỏi, không nội suy. Bắt buộc với texture chứa dữ liệu vì texel cạnh nhau là hạt khác nhau. | [P3.2](p3-2-color-texture.md) |
| **Mipmap** | Chuỗi bản thu nhỏ trung bình hoá của texture. Tốt cho ảnh ở xa, hỏng cho dữ liệu. | [P3.2](p3-2-color-texture.md) |
| **`flipY`** | three.js lật ảnh theo chiều dọc khi upload để hợp quy ước OpenGL. Phải tắt với texture dữ liệu. | [P3.2](p3-2-color-texture.md) |
| **Wrap mode** (`ClampToEdge` / `Repeat`) | Cách xử lý khi uv đi ra ngoài `[0, 1]`: kẹp vào mép, hay vòng sang phía đối diện. | [P3.2](p3-2-color-texture.md) |
| **`colorSpace` của texture** | Báo cho three.js biết byte trong file là màu đã mã hoá sRGB (`SRGBColorSpace`) hay con số thô (`NoColorSpace`). | [P3.2](p3-2-color-texture.md) |
| **Lượng tử hoá** (quantisation) | Ép một số thực về một trong N mức rời rạc. Sai số tối đa bằng nửa bước nếu làm tròn về mức gần nhất. | [P3.3](p3-3-16-bit-positions.md) |
| **Tách hi/lo** | Chia một giá trị 16-bit thành byte cao và byte thấp, cất vào hai file PNG 8-bit: `(hi × 256 + lo) / 65535`. | [P3.3](p3-3-16-bit-positions.md) |
| **PNG scanline filter** | Mỗi hàng của PNG được lưu thành hiệu với byte lân cận. Thuận nghịch, không mất mát, và là lý do dốc toạ độ nén được. | [P3.3](p3-3-16-bit-positions.md) |
| **Bounds** | Khoảng nhỏ nhất–lớn nhất của từng trục, lưu trong `metadata.json`. Biến giá trị 0…1 trong PNG thành toạ độ thế giới. | [P3.4](p3-4-bounds-va-metadata.md) |
| **Normalised storage** | Cất dữ liệu ở dạng 0…1 rồi ánh xạ lại bằng bounds — gọn vì dùng hết độ phân giải cho đúng vùng có dữ liệu. | [P3.4](p3-4-bounds-va-metadata.md) |
| **Relief** | Bề dày của phần nổi so với bề rộng ảnh. Bản gốc chỉ ~0.6%; nông cộng FOV hẹp giúp depth sai vẫn trông thật. | [P3.3](p3-3-16-bit-positions.md) |
| **`Math.fround`** | Làm tròn một số về float32 gần nhất — cách mô phỏng số học của GPU ngay trong test JavaScript. | [P3.5](p3-5-test-cho-decoder.md) |
| **Value noise** | Gán số ngẫu nhiên cho mỗi điểm lưới nguyên rồi nội suy mượt ở giữa. Rẻ hơn Perlin, khó phân biệt khi chồng nhiều octave. | [P4.1](p4-1-value-noise-fbm.md) |
| **fBM** (fractional Brownian motion) | Cộng cùng một noise ở tần số gấp đôi, biên độ một nửa. Cho chi tiết ở mọi cỡ như tự nhiên. | [P4.1](p4-1-value-noise-fbm.md) |
| **Octave** | Một tầng trong fBM. Mỗi octave gấp đôi tần số và giảm nửa biên độ; xoay mỗi octave để khử thiên lệch theo trục. | [P4.1](p4-1-value-noise-fbm.md) |
| **`ShaderChunk`** | Sổ đăng ký toàn cục của three.js; `#include <tên>` trong bất kỳ shader nào đều tra ở đây. Cách duy nhất để chia sẻ code GLSL. | [P4.1](p4-1-value-noise-fbm.md) |
| **Curl noise** | Gradient của một trường noise, xoay 90°. Divergence bằng 0 nên hạt xoáy mãi mà không bao giờ vón cục. | [P4.2](p4-2-curl-noise.md) |
| **Divergence** | Đo lượng "sinh ra hoặc mất đi" tại một điểm của trường. Bằng 0 = vào bao nhiêu ra bấy nhiêu = mật độ được bảo toàn. | [P4.2](p4-2-curl-noise.md) |
| **Sai phân trung tâm** | Ước lượng đạo hàm bằng `(f(p+e) − f(p−e)) / 2e`. Chính xác hơn sai phân tiến, đổi lại một lần lấy mẫu. | [P4.2](p4-2-curl-noise.md) |
| **Stateless animation** (P4) | Toàn bộ độ dịch tính lại từ `uTime` mỗi frame. Không trạng thái, không sai số tích luỹ, nhưng cũng không tương tác được. | [P4.2](p4-2-curl-noise.md) |
| **Nhân với `w`** | Cộng độ dịch trong clip space rồi nhân `gl_Position.w` để triệt tiêu perspective divide — chuyển động đều bằng nhau trên màn hình bất kể độ sâu. | [P4.3](p4-3-clip-space-offset.md) |

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
| **Portal (R3F)** | Gắn một React subtree vào `THREE.Scene` khác nhưng vẫn dùng chung renderer và render loop. | [P2.1](p2-1-offscreen-render-target.md) |
