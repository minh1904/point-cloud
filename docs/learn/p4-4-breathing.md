# P4.4 · Thở và rung gần camera

## Mục tiêu

Curl noise của 4.2–4.3 chỉ chuyển động **trên mặt phẳng màn hình** — theo thiết kế, vì nó được cộng vào clip space. Nghĩa là bề dày của đám mây hoàn toàn đứng yên.

Bước này thêm hai chuyển động theo **chiều sâu**, cả hai đều rẻ đến mức gần như miễn phí:

1. **Thở** — cả bề mặt phồng ra thóp vào rất chậm.
2. **Rung gần camera** — một dao động nhanh hơn, chỉ bật khi camera lại gần.

Bài học thật sự không phải là hai hiệu ứng đó, mà là: **xếp chồng vài chuyển động rẻ cho ra thứ phức tạp hơn tổng của chúng.**

## Khái niệm

### 1. Vì sao cần chuyển động theo chiều sâu

Sau 4.3, xoay camera một chút sẽ thấy đám mây là một mặt phẳng có gợn — nhưng mặt phẳng ấy **cứng đơ**. Hạt trượt ngang dọc trên đó mà bản thân tấm ấy không hề động.

Relief của ta chỉ dày 0.081 đơn vị trên bề ngang 3.0 — khoảng 2.7%. Ở tỉ lệ đó, một dao động nhỏ theo `z` đủ để bề mặt "thở", và vì nó nhỏ nên không bao giờ làm lộ ra rằng bản đồ độ sâu chỉ là suy đoán.

### 2. Thở: một sin chậm, lệch pha theo từng hạt

```glsl
home.z += sin(uTime * 0.25 + randomness.z * 6.2831) * uBreathe;
```

Hai chi tiết đáng nói:

**Tần số 0.25** → chu kỳ khoảng 25 giây. Chậm tới mức không nhận ra là chuyển động tuần hoàn; chỉ cảm thấy bề mặt "còn sống".

**Pha riêng cho từng hạt** (`randomness.z * 2π`) là thứ biến nó từ tầm thường thành đáng giá. Nếu mọi hạt cùng pha, cả tấm trượt tới lui như một khối gỗ. Lệch pha thì mỗi vùng phồng lên vào một lúc khác nhau, và bề mặt **gợn sóng** thay vì trượt.

```
cùng pha:            lệch pha:
  ▁▁▁▁▁▁▁▁            ▁▂▃▂▁▂▃▄
  ▔▔▔▔▔▔▔▔            ▃▂▁▂▃▄▃▂
  cả tấm trượt        bề mặt gợn
```

Nhưng chú ý: pha lấy từ `randomness.z` — hash của texel — nên **hạt cạnh nhau có pha hoàn toàn khác nhau**. Bề mặt không gợn theo sóng lớn mà gợn ở cấp độ hạt. Muốn sóng lớn thì pha phải lấy từ một trường liên tục (ví dụ chính fBM), và đó là một thí nghiệm hay để thử.

### 3. Rung gần camera: trả tiền cho thứ nhìn thấy được

```glsl
float nearness = smoothstep(3.2, 1.2, -mvPosition.z);
mvPosition.z += sin(uTime * 0.5 + randomness.x * 6.2831) * nearness * uBreathe * 0.6;
```

`-mvPosition.z` là khoảng cách trước camera (camera nhìn theo −z, xem [P1.2](p1-2-shader-material.md)).

`smoothstep(3.2, 1.2, d)` có hai tham số **đảo ngược** — cạnh đầu lớn hơn cạnh sau — nên nó đếm ngược: bằng 0 khi ở xa hơn 3.2, tăng dần lên 1 khi vào gần hơn 1.2.

Lập luận đằng sau: một hạt ở xa chiếm chưa tới một pixel. Cho nó rung là **trả tiền tính toán cho chuyển động không ai nhìn thấy** — và tệ hơn, có thể sinh nhấp nháy ở mức dưới pixel. Bật hiệu ứng theo khoảng cách là kỹ thuật cơ bản của đồ hoạ thời gian thực, và bản gốc cũng làm y hệt: research note §3 ghi `smoothstep(50, 20, camDist)` ở tỉ lệ cảnh của họ.

Ngưỡng 3.2 và 1.2 được chọn theo cảnh này: camera mặc định ở z = 4, `minDistance` của OrbitControls là 0.6. Nên hiệu ứng ngủ yên ở khoảng cách mặc định và thức dậy khi người dùng zoom vào.

### 4. Vì sao cộng vào view space chứ không phải world space

Thở cộng vào `home.z` (**world space**, trước phép biến đổi). Rung cộng vào `mvPosition.z` (**view space**, sau đó).

Khác biệt: `home.z` là trục z **của đám mây** — chính là trục relief, hướng ra khỏi mặt phẳng ảnh. Xoay camera thì nó xoay theo. Đúng cho "thở", vì thở là thuộc tính của bề mặt.

`mvPosition.z` là trục **hướng về camera**, bất kể camera đang ở đâu. Đúng cho rung, vì rung là chuyện giữa hạt và người xem.

### 5. Một núm cho hai hiệu ứng

Cả hai dùng chung `uBreathe`, rung nhân thêm 0.6. Lựa chọn có chủ đích: chúng là **một ý tưởng thị giác** ("bề mặt có chiều sâu sống"), và tách thành hai slider sẽ bắt người dùng cân chỉnh một tỉ lệ mà họ không quan tâm.

Roadmap 4.5 liệt kê đúng năm núm — `breathe` là một trong năm, không phải hai.

## Đi qua code

### `apps/point-cloud/src/shaders/points.vert.glsl`

Thứ tự đầy đủ, để thấy mỗi thứ chen vào đâu:

```glsl
// P4.4 — thở, trong world space
home.z += sin(uTime * 0.25 + randomness.z * 6.2831) * uBreathe;

vec4 mvPosition = modelViewMatrix * vec4(home, 1.0);

// P4.4 — rung, trong view space, tắt dần theo khoảng cách
float nearness = smoothstep(3.2, 1.2, -mvPosition.z);
mvPosition.z += sin(uTime * 0.5 + randomness.x * 6.2831) * nearness * uBreathe * 0.6;

gl_Position = projectionMatrix * mvPosition;

// P4.3 — curl, trong clip space
gl_Position.xy += flow * uNoiseAmplitude * gl_Position.w;
```

Ba chuyển động, ba không gian toạ độ khác nhau, mỗi cái ở đúng chỗ mang lại ý nghĩa cho nó. Đó là toàn bộ P4 gói trong tám dòng.

Cũng để ý `randomness.z` cho thở và `randomness.x` cho rung — hai thành phần khác nhau của cùng một hash, nên hai chuyển động **không đồng bộ với nhau**. Dùng lại cùng một thành phần thì chúng sẽ khoá pha và tổng của chúng lại thành một dao động duy nhất.

## Lỗi đã gặp

1. **`smoothstep` với hai cạnh đảo ngược gây bối rối lúc đọc lại.** `smoothstep(3.2, 1.2, d)` trông như lỗi đánh máy. Nó không phải — đó là cách chuẩn để có một hàm giảm dần, và GLSL xử lý đúng. Đã ghi rõ trong comment vì chính tôi đã phải dừng lại nghĩ một nhịp khi đọc lại.
2. **Ngưỡng khoảng cách phải theo tỉ lệ cảnh.** Chép thẳng `smoothstep(50, 20, ...)` của bản gốc thì hiệu ứng không bao giờ bật, vì cảnh của họ rộng 244 đơn vị còn của ta rộng 3. Mọi hằng số khoảng cách trong shader đều gắn với tỉ lệ cảnh — chép qua dự án khác là phải quy đổi.
3. **Pha theo từng hạt cho gợn ở cấp độ hạt, không phải sóng lớn.** Tôi kỳ vọng thấy sóng lớn lăn qua bề mặt, nhưng vì pha lấy từ hash nên hai hạt kề nhau lệch pha bất kỳ. Không phải bug, nhưng cũng không phải điều tôi tưởng. Muốn sóng lớn thì pha phải đến từ một trường liên tục — ghi lại ở phần *Tự thử* vì nó đáng thử.

## Tự thử

1. **Kéo Breathe lên hết (0.08)** rồi nghiêng camera nhìn ngang. Bề mặt phồng lên thóp xuống — ở giá trị nào thì nó bắt đầu trông như lỗi thay vì như còn sống?
2. **Đánh thức phần rung.** Đặt Breathe khoảng 0.04, rồi zoom camera vào thật gần (cuộn chuột). Chuyển động có đổi tính chất khi vượt qua ngưỡng 3.2 → 1.2 không?
3. **Bỏ lệch pha.** Xoá `+ randomness.z * 6.2831`. Cả tấm trượt như một khối. Đây là khác biệt giữa "bề mặt sống" và "vật thể trượt".
4. **Đổi sang sóng lớn.** Thay pha thở bằng một trường liên tục: `sin(uTime * 0.25 + pcFbm(aParticleUv * 2.0) * 6.2831)`. Giờ sóng có lăn qua bề mặt không? Đắt thêm bao nhiêu?
5. **Dùng chung một thành phần hash.** Đổi `randomness.x` trong phần rung thành `randomness.z`. Hai chuyển động khoá pha với nhau — bạn có nhận ra không?

## Đọc thêm

- [Inigo Quilez — Useful little functions](https://iquilezles.org/articles/functions/) (smoothstep và họ hàng)
- [Khronos — `smoothstep`](https://registry.khronos.org/OpenGL-Refpages/gl4/html/smoothstep.xhtml)
- [research/01-untillabs-method.md §3](../research/01-untillabs-method.md) — dao động Z theo khoảng cách camera của bản gốc
