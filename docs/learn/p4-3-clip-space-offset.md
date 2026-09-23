# P4.3 · Cộng độ dịch trong clip space

## Mục tiêu

Câu hỏi của bước này chỉ có một: **cộng độ dịch của curl noise vào lúc nào?**

Trước khi chiếu, hay sau khi chiếu? Câu trả lời quyết định chuyển động trông đều hay lệch hẳn giữa hạt gần và hạt xa.

## Khái niệm

### 1. Đường đi của một toạ độ

Nhắc lại chuỗi biến đổi đã dựng từ P1.2:

```
object space ──modelViewMatrix──▶ view space ──projectionMatrix──▶ clip space ──÷w──▶ NDC ──▶ pixel
```

Bước `÷w` (perspective divide) do GPU tự làm sau khi vertex shader trả về `gl_Position`. `w` xấp xỉ **khoảng cách tới camera**. Đó là lý do vật xa trông nhỏ: toạ độ của nó bị chia cho một số lớn hơn.

### 2. Cộng trong world space thì sao?

```glsl
home.xy += flow * uNoiseAmplitude;   // ❌
```

Một hạt cách camera 2 đơn vị và một hạt cách 6 đơn vị cùng dịch 0.01 đơn vị thế giới. Nhưng hạt xa bị chia cho `w` lớn gấp 3, nên **trên màn hình nó chỉ nhúc nhích bằng một phần ba**.

Kết quả: hạt tiền cảnh lắc lư trong khi hạt hậu cảnh gần như đứng yên. Với một đám mây điểm phẳng và relief chỉ 3% thì sự chênh lệch này còn nhẹ, nhưng khi camera lại gần (P4.4 quan tâm đúng chuyện này) thì nó lộ rõ.

### 3. Cộng trong clip space, nhân với `w`

```glsl
gl_Position = projectionMatrix * mvPosition;

vec2 flow = pcCurl(flowSeed);
flow.x /= uViewportAspect;
gl_Position.xy += flow * uNoiseAmplitude * gl_Position.w;
```

Mẹo nằm ở `* gl_Position.w`. GPU sắp chia tất cả cho `w`, nên nhân trước với `w` là **triệt tiêu đúng phép chia đó**:

```
(x + offset·w) / w  =  x/w + offset
```

Độ dịch cuối cùng trong NDC đúng bằng `offset`, **không phụ thuộc độ sâu**. Hạt gần và hạt xa lắc lư bằng đúng số pixel như nhau.

Đây cũng là cách bản gốc làm — research note §3: *"Độ dịch được cộng sau phép chiếu, trong clip space. Vì thế hạt lắc theo pixel màn hình, đều nhau bất kể độ sâu."*

### 4. Vì sao thế lại đúng về mặt thẩm mỹ

Nghe qua thì "chuyển động không theo phối cảnh" có vẻ sai về vật lý — mà đúng là sai thật. Nhưng mục tiêu ở đây không phải mô phỏng.

Đám mây điểm này là **một bức ảnh có chút bề dày**, không phải một cảnh 3D. Chuyển động tồn tại để bề mặt trông sống, như hạt phim hay như không khí đang rung. Hiệu ứng ấy thuộc về **mặt phẳng ảnh**, nên đo nó bằng pixel màn hình là đúng chỗ.

Thêm nữa: `uNoiseAmplitude` trở thành một con số **có ý nghĩa cố định** — "bao nhiêu phần trăm màn hình" — thay vì một đơn vị thế giới mà ý nghĩa thay đổi theo camera. Núm vặn nào cũng nên có đơn vị mà người vặn hiểu được.

### 5. NDC vuông, màn hình thì không

NDC chạy −1…1 theo **cả hai** trục, bất kể cửa sổ rộng hay hẹp. Trên cửa sổ 1600×900, một đơn vị NDC theo x phủ 800 pixel còn theo y chỉ 450.

Cộng thẳng độ dịch vào NDC thì chuyển động bị **kéo dãn ngang**: hạt vẽ ra hình elip nằm chứ không phải hình tròn, và hình dạng ấy đổi theo mỗi lần thay đổi kích thước cửa sổ.

```glsl
flow.x /= uViewportAspect;   // aspect = width / height
```

Một phép chia, và chuyển động tròn trở lại trên mọi tỉ lệ cửa sổ.

## Đi qua code

### `apps/point-cloud/src/shaders/points.vert.glsl`

Thứ tự trong `main()` chính là nội dung của bước này:

```glsl
vec4 mvPosition = modelViewMatrix * vec4(home, 1.0);
// … P4.4 sửa mvPosition.z ở đây …
gl_Position = projectionMatrix * mvPosition;

// P4.3 — sau phép chiếu, không phải trước
vec2 flow = pcCurl(flowSeed);
flow.x /= uViewportAspect;
gl_Position.xy += flow * uNoiseAmplitude * gl_Position.w;
```

Chú ý: độ dịch chỉ chạm `.xy`. `z` giữ nguyên nên **thứ tự độ sâu không đổi** — chuyển động không thể đẩy một hạt ra trước hay ra sau hạt khác. Với `depthWrite: false` thì điều đó không quan trọng lắm hôm nay, nhưng nó giữ cho DOF giả của P5.3 khỏi nhấp nháy.

### `apps/point-cloud/src/scene/particle-field.tsx`

Tỉ lệ khung hình lấy từ R3F:

```tsx
uniforms.uViewportAspect!.value = size2d.width / Math.max(1, size2d.height);
```

Dùng kích thước **canvas**, không phải kích thước FBO. Render scale của P2.5 thu nhỏ FBO nhưng không đổi tỉ lệ, nên hai giá trị này luôn cho cùng một aspect — và lấy theo canvas thì đúng về ý nghĩa: ta đang nói về hình dạng của thứ người dùng nhìn thấy.

## Lỗi đã gặp

1. **Quên `* gl_Position.w` là im lặng.** Nếu thiếu, code vẫn chạy và chuyển động vẫn có — chỉ là hạt xa lắc ít hơn hạt gần. Với cảnh gần phẳng như của ta thì rất khó phát hiện bằng mắt. Cách kiểm chắc chắn là kéo camera ra thật xa: nếu chuyển động **nhỏ dần theo khoảng cách** thì thiếu `w`; nếu nó giữ nguyên kích thước trên màn hình thì đúng.
2. **Suýt bỏ qua aspect.** Cửa sổ lúc thử gần như vuông nên không nhìn ra méo. Chỉ khi resize thành cửa sổ ngang mới thấy chuyển động dãn ra theo chiều ngang. Loại lỗi chỉ hiện ra khi đổi kích thước cửa sổ thì rất dễ lọt lưới.
3. **Bản gốc làm khác một chút.** Research note ghi UntilLabs dùng `gl_Position.yx += c * uNoiseFactor * perspectiveScale` — có hoán vị `.yx` (không rõ cố ý hay không) và một `perspectiveScale` tính từ khoảng cách camera toàn cục thay vì `w` của từng hạt. Cách của họ xấp xỉ đúng khi mọi hạt cách camera gần như nhau, đúng với cảnh của họ. Nhân với `w` thì đúng trong mọi trường hợp và rẻ ngang nhau.

## Tự thử

1. **Bỏ `* gl_Position.w`** rồi zoom camera ra xa hết cỡ (`maxDistance = 12`). Chuyển động biến mất dần. Đưa lại vào và lặp lại — giờ nó giữ nguyên.
2. **Bỏ chia aspect** rồi kéo cửa sổ thành thật ngang. Chuyển động méo theo hướng nào? Đoán trước rồi hãy nhìn.
3. **Cộng trong world space.** Thay dòng clip space bằng `home.xy += flow * uNoiseAmplitude;` trước phép nhân modelView. Đặt Amplitude cao cho dễ thấy, rồi nghiêng camera: chuyển động bây giờ dính vào mặt phẳng ảnh hay dính vào *đám mây*?
4. **Đổi Amplitude thành số phần trăm màn hình.** Amplitude 0.012 trong NDC là bao nhiêu phần trăm chiều rộng màn hình? (Nhớ NDC rộng 2 đơn vị.)
5. **Chạm vào `z`.** Đổi `gl_Position.xy +=` thành `gl_Position.xyz +=`. Nhìn kỹ vùng hạt chồng nhau — có gì nhấp nháy không? Vì sao P5.3 sẽ quan tâm chuyện này?

## Đọc thêm

- [Scratchapixel — The Perspective and Orthographic Projection Matrix](https://www.scratchapixel.com/lessons/3d-basic-rendering/perspective-and-orthographic-projection-matrix/index.html)
- [WebGL2 Fundamentals — 3D Perspective](https://webgl2fundamentals.org/webgl/lessons/webgl-3d-perspective.html)
- [research/01-untillabs-method.md §3](../research/01-untillabs-method.md)
