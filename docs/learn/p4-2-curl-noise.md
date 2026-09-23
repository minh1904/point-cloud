# P4.2 · Curl noise

## Mục tiêu

Biến trường fBM của 4.1 thành **chuyển động**. Nhưng không phải bằng cách lấy thẳng giá trị noise làm độ dịch — đó là cách sai, và hiểu vì sao nó sai chính là nội dung của bước này.

Kết quả: hạt trôi lượn có tổ chức, xoáy nhẹ, và **không bao giờ vón cục**.

## Khái niệm

### 1. Cách làm hiển nhiên, và vì sao nó hỏng

Ý đầu tiên ai cũng nghĩ ra: dùng gradient của trường noise làm vận tốc.

```
gradient = hướng dốc lên của trường
```

Cho hạt đi theo **ngược** gradient thì chúng "lăn xuống dốc". Nghe hợp lý, nhưng sau vài giây:

```
     ban đầu                 sau một lúc
   · · · · · · · ·          ·        ·
   · · · · · · · ·                ●●●
   · · · · · · · ·          ·    ●●●●●     ← mọi hạt rơi vào
   · · · · · · · ·                ●●●        các đáy thung lũng
   · · · · · · · ·          ·        ·
```

Trường gradient có **điểm hút**. Hạt trôi vào đáy rồi nằm đó. Trường rỗng chỗ này, nghẹt chỗ kia, và chuyển động chết dần.

### 2. Xoay gradient 90° là xong

Curl trong 2D đơn giản đến bất ngờ: lấy gradient rồi **quay một phần tư vòng**.

```glsl
// (∂ψ/∂y, −∂ψ/∂x)
return vec2(dy, -dx) / (2.0 * e);
```

Thay vì đi *xuống dốc*, hạt đi **vòng quanh sườn dốc** — như đường đồng mức trên bản đồ địa hình.

Tính chất toán học đằng sau: trường này có **divergence bằng 0**. Divergence đo "có bao nhiêu thứ sinh ra hoặc mất đi tại một điểm". Bằng 0 nghĩa là với mọi vùng nhỏ, lượng chảy vào đúng bằng lượng chảy ra. **Không có điểm hút, không có nguồn.** Mật độ hạt được bảo toàn vĩnh viễn.

Đó là lý do curl noise được dùng khắp nơi để giả lập khói, mây, chất lỏng: nó cho *cảm giác* của dòng chảy không nén mà không cần giải phương trình nào.

### 3. Đạo hàm bằng sai phân trung tâm

Ta không có công thức giải tích cho đạo hàm của fBM, nên đo bằng cách thử:

```glsl
const float e = 0.08;
float dx = pcFbm(p + vec2(e, 0.0)) - pcFbm(p - vec2(e, 0.0));
float dy = pcFbm(p + vec2(0.0, e)) - pcFbm(p - vec2(0.0, e));
```

Lấy mẫu hai bên rồi trừ — **sai phân trung tâm**, chính xác hơn sai phân tiến (`f(p+e) − f(p)`) với cùng số lần gọi hàm... thực ra tốn 4 lần thay vì 3, nhưng sai số bậc hai thay vì bậc một.

Đây cũng là **chỗ đắt nhất của cả khung hình**: 4 lần gọi fBM × 4 octave = 16 lần lấy mẫu noise, mỗi lần 4 lần hash → **64 phép hash cho mỗi hạt**, nhân 65.536 hạt. P9.2 sẽ bớt một octave cho mobile.

Chọn `e` cũng có bẫy: quá nhỏ thì hiệu hai số gần bằng nhau, float32 mất hết chữ số có nghĩa; quá lớn thì không còn là đạo hàm mà là hiệu trung bình trên một vùng rộng. 0.08 so với octave đầu tiên có ô lưới cỡ 1.0 là khoảng 8% — đủ nhỏ để là đạo hàm, đủ lớn để không nhiễu.

### 4. `Scatter`: hạt đi cùng nhau hay đi riêng

Mỗi hạt lấy mẫu trường ở đâu?

```glsl
vec2 flowSeed = aParticleUv * uNoiseFrequency
              + randomness.xy * uNoiseScatter
              + uTime * 0.12;
```

Ba số hạng, ba vai trò:

| Số hạng | Làm gì |
|---|---|
| `aParticleUv * uNoiseFrequency` | vị trí của hạt trên ảnh → hạt gần nhau lấy mẫu gần nhau |
| `randomness.xy * uNoiseScatter` | xê dịch riêng cho từng hạt |
| `uTime * 0.12` | trôi cả trường theo thời gian |

`Scatter` là núm quan trọng nhất và cũng dễ vặn quá tay nhất:

- **Scatter = 0** — hạt kề nhau lấy mẫu gần như cùng một chỗ, cả đám di chuyển như **một tấm vải trong gió**. Thấy rõ xoáy, ảnh vẫn sắc nét.
- **Scatter lớn** — mỗi hạt lấy mẫu một nơi hoàn toàn khác, chúng **rung tại chỗ** độc lập, ảnh rã ra thành lấp lánh. Đây là điều bản gốc của UntilLabs làm (research note: *"mỗi hạt đi một quỹ đạo riêng"*).

Mặc định để 0.15 — nghiêng hẳn về phía dòng chảy mạch lạc, chỉ thêm chút phá đều.

### 5. Seed từ hash chứ không từ `aIndex`

Roadmap ghi "seeded by `uv + index`", và bản gốc viết `aParticleUv + aIndex * 0.01`. Ta dùng `randomness.xy` — tức là hash của texel — thay vì `aIndex` thô.

Cùng một thứ về ý nghĩa (texel *chính là* index trải trên lưới 2D), nhưng an toàn hơn về số học: `aIndex` chạy tới 65.535, và [P3.1 §5](p3-1-geometry-without-positions.md) đã ghi lại chuyện hash một số năm chữ số làm cạn độ phân giải float32 và sinh vệt chéo.

Nên `aIndex` **vẫn chưa được shader đọc tới**. Nó còn chờ P5.5, nơi cần đúng thứ tự chứ không phải một hàm băm của thứ tự.

## Đi qua code

### `apps/point-cloud/src/shaders/noise.glsl`

```glsl
vec2 pcCurl(vec2 p) {
  const float e = 0.08;

  float dx = pcFbm(p + vec2(e, 0.0)) - pcFbm(p - vec2(e, 0.0));
  float dy = pcFbm(p + vec2(0.0, e)) - pcFbm(p - vec2(0.0, e));

  return vec2(dy, -dx) / (2.0 * e);
}
```

Toàn bộ curl noise nằm trong sáu dòng. Điều đáng nhớ không phải là code mà là tính chất: **hoán vị và đổi dấu là đủ để biến một trường có điểm hút thành một trường bảo toàn**.

### `apps/point-cloud/src/shaders/points.vert.glsl`

Hoàn toàn **không có trạng thái**. Không lưu vận tốc, không cộng dồn vị trí, không đọc frame trước:

```glsl
vec2 flow = pcCurl(flowSeed);
```

Hạt không *đi theo* dòng chảy — nó được **đặt vào** đúng chỗ mà trường chỉ tới, tính lại từ đầu mỗi frame. Vì thế không có sai số tích luỹ, tạm dừng rồi chạy tiếp không lệch, và tua ngược thời gian cho ra đúng hình cũ.

Đây là lựa chọn kiến trúc lớn nhất của P4, và roadmap ghi rõ: *"Stateless by design (no simulation)."* Cái giá phải trả nằm ở P9.1 — muốn chuột đẩy được hạt thì bắt buộc phải có tầng GPGPU ping-pong lưu trạng thái.

## Lỗi đã gặp

1. **Scatter mặc định 0.6 làm hỏng cả hai thứ cùng lúc.** Ảnh rã ra lấp lánh *và* debug view của 4.1 biến thành confetti thay vì mây — vì mỗi hạt lấy mẫu một chỗ khác nhau thì vẽ trường lên hạt chẳng còn là vẽ trường nữa. Hạ xuống 0.15. Đáng nhớ: **debug view hỏng là một triệu chứng chẩn đoán**, không chỉ là một tính năng hỏng.
2. **Biên độ mặc định quá lớn.** Đặt 0.02 (đơn vị NDC, màn hình rộng 2) nghĩa là hạt lắc khoảng 1% bề ngang màn hình. Nghe nhỏ, nhưng so với một khuôn mặt chiếm vài phần trăm khung hình thì đủ để bôi nhoè. Hạ xuống 0.012.
3. **Suýt dùng thẳng gradient.** Bản nháp đầu tiên định lấy `vec2(dx, dy)` cho gọn. Nó *chạy* và thoạt nhìn giống — chỉ sau vài chục giây mới thấy hạt dồn thành từng mảng và nền thủng lỗ. Nếu không biết trước tính chất divergence thì đây là loại bug rất khó quy trách nhiệm.

## Tự thử

1. **Kéo Scatter về 0.** Bấm Pause rồi Play xen kẽ và quan sát: cả đám hạt trôi như một tấm vải. Đây là lúc dễ *thấy* xoáy nhất.
2. **Kéo Scatter lên 4.** Ảnh rã ra. Đây là cách bản gốc UntilLabs chạy — bạn thích kiểu nào hơn?
3. **Biến curl thành gradient.** Trong `pcCurl` đổi `return vec2(dy, -dx)` thành `return vec2(dx, dy)`. Để chạy 30 giây. Hạt dồn vào đâu? Nền có thủng không?
4. **Phá epsilon.** Đặt `e = 0.0001`. Chuyện gì xảy ra, và vì sao nó liên quan tới bài về ulp trong [P3.1](p3-1-geometry-without-positions.md)?
5. **Đo giá của noise.** Đổi `PC_FBM_OCTAVES` từ 4 xuống 2 và nhìn FPS trên HUD (nhớ để tab đang hiển thị — tab nền bị throttle). Tiết kiệm được bao nhiêu, và có nhìn ra khác biệt không?

## Đọc thêm

- [Robert Bridson — Curl-Noise for Procedural Fluid Flow (PDF)](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf) — bài gốc
- [Inigo Quilez — Gradients and derivatives](https://iquilezles.org/articles/gradientnoise/)
- [research/01-untillabs-method.md §3](../research/01-untillabs-method.md) — bản gốc dùng curl noise thế nào
