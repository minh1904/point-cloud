# P3.1 · Geometry không có vị trí

## Mục tiêu

Đảo ngược chiều dữ liệu của cả renderer.

Từ P1 đến P2, CPU tính sẵn 60.000 toạ độ rồi **phát** cho GPU: mỗi hạt nhận vị trí của mình qua attribute `position`. Từ P3, dữ liệu sẽ nằm trong **texture** (đọc từ PNG ở 3.2–3.4, sinh ra từ ảnh người dùng ở P6), và hạt không còn được phát vị trí nữa — nó được phát một **địa chỉ** rồi tự đi lấy.

Bước 3.1 dựng đúng phần khung đó, chưa nạp texture nào:

- geometry mang `position` **toàn số 0**, cộng thêm `aParticleUv` (tâm texel của hạt) và `aIndex` (số thứ tự);
- `frustumCulled = false`;
- vertex shader tự suy ra vị trí từ `aParticleUv`, tạm thời trải 65.536 hạt thành một lưới phẳng — chính là tấm lưới mà dữ liệu ảnh sẽ đáp xuống ở 3.2 và 3.3.

Kiểm chứng: HUD báo **65,536 points · 2 draw calls**, khung hình hiện một mặt lưới vuông, và `geometry.attributes.position` trên CPU không chứa gì ngoài số 0.

## Khái niệm

### 1. Hai cách một hạt biết mình ở đâu

```
P1–P2:  CPU tính  ──▶  attribute position  ──▶  vertex shader ĐƯỢC PHÁT vị trí
P3+  :  CPU tính  ──▶  texture (PNG/DataTexture)
                        ▲
        attribute aParticleUv ──▶ vertex shader TỰ TRA vị trí
```

Attribute là dữ liệu **được phát theo thứ tự**: GPU tự động đưa cho vertex thứ 7 đúng bộ 3 số ở vị trí 21, 22, 23 trong buffer. Shader không có quyền chọn — nó chỉ nhận.

Texture thì ngược lại: shader **tính ra toạ độ nào cũng đọc được**. Đó là khác biệt cốt lõi, và nó mở ra ba thứ attribute không làm nổi:

1. **Dữ liệu trở thành file ảnh.** 65.536 vị trí nén thành hai file PNG vài trăm KB, trình duyệt giải nén bằng code native. Đây chính là cách UntilLabs ship hero của họ (xem [research/01-untillabs-method.md](../research/01-untillabs-method.md)) và là format ta sẽ export ở P8.
2. **Renderer không cần biết dữ liệu từ đâu.** P6 sinh texture từ ảnh upload, P3 đọc texture từ file tải về — vertex shader giống hệt nhau.
3. **Hạt đọc được dữ liệu của hạt khác, hoặc của chính nó ở frame trước.** Đây là điều kiện cần cho lớp GPGPU ping-pong ở P9.

Ở 3.1 ta chưa fetch texture thật; ta mới dựng **đường ống địa chỉ**. Dòng quan trọng nhất của cả bước chỉ là:

```glsl
vec3 home = vec3((aParticleUv - 0.5) * uFieldSize, 0.0);
```

3.3 sẽ thay đúng một dòng này bằng một lệnh đọc texture, phần còn lại của shader không đổi.

### 2. Texel, UV, và con số `+ 0.5`

**Texel** là một ô của texture (texture element), tương tự pixel của ảnh. **UV** là toạ độ chuẩn hoá chạy từ 0 đến 1 trên toàn tấm texture — không phụ thuộc texture to hay nhỏ.

Với texture `4 × 4`, texel cột `x` chiếm khoảng uv `[x/4, (x+1)/4)`:

```
u:   0        0.25       0.5       0.75        1
     ├─────────┼─────────┼─────────┼─────────┤
     │ texel 0 │ texel 1 │ texel 2 │ texel 3 │
     ├────▲────┼────▲────┼────▲────┼────▲────┤
       0.125     0.375     0.625     0.875
          ▲ tâm texel = (x + 0.5) / size
     ▲
     x / size — nằm ngay trên VẠCH NGĂN giữa hai texel
```

Nếu lấy `u = x / size`, ta trỏ đúng vào **biên** giữa hai texel. Chỉ cần một sai số làm tròn cỡ 1 ulp của float32 là GPU đọc nhầm sang texel hàng xóm; với `LinearFilter` thì còn tệ hơn — nó trộn hai texel lại. `u = (x + 0.5) / size` trỏ vào **tâm** texel, cách mỗi biên nửa texel, không sai số nào vượt qua nổi.

Đây là lý do `createParticleGrid` có `+ 0.5`, và là một trong những lỗi kinh điển khi dùng texture làm dữ liệu.

Số hạt cũng đổi theo: texture phải là lưới chữ nhật, nên 60.000 (số lẻ) trở thành **256² = 65.536**.

### 3. `position` toàn 0 nhưng vẫn bắt buộc phải có

three.js lấy **số lượng vertex** từ `geometry.attributes.position.count`. Không có attribute `position` thì không có gì để vẽ, kể cả khi shader chẳng bao giờ đọc tới nó. Nên ta vẫn upload `Float32Array(count * 3)` — 786 KB toàn số 0 — thuần tuý để three.js biết "có 65.536 đỉnh".

(Nghe lãng phí, nhưng đây là cách chuẩn của mọi hệ particle chạy bằng texture. P3.2 có thể thu nó lại còn 1 float/vertex nếu muốn.)

### 4. Bounding sphere và frustum culling — cái bẫy màn hình đen

**Frustum culling** là tối ưu mặc định của three.js: trước khi vẽ, nó kiểm tra xem vật có nằm trong khối nón cụt (frustum) mà camera nhìn thấy không; nếu không thì bỏ luôn draw call.

Để kiểm tra, nó dùng **bounding sphere** — hình cầu nhỏ nhất bao trọn vật — và three.js tính hình cầu này **từ attribute `position`**.

Mà `position` của ta toàn 0. Nên:

```
boundingSphere = { center: (0,0,0), radius: 0 }
```

Tức là three.js tin rằng toàn bộ 65.536 hạt nằm gọn trong một điểm duy nhất ở gốc toạ độ. Xoay camera lệch đi một chút, cái "điểm" đó ra khỏi khung hình → **cả draw call bị bỏ, màn hình đen, không một lời cảnh báo**.

Vị trí thật chỉ tồn tại bên trong vertex shader, mà three.js thì không đọc được GLSL. Nó không có cách nào biết. Nên ta phải tự tắt:

```tsx
<points frustumCulled={false}>
```

Từ đây trở đi, mọi vật có vị trí sinh trong shader đều phải tắt culling. Đổi lại ta mất tối ưu đó — chấp nhận được, vì trường hạt gần như luôn nằm trong khung hình.

### 5. Hash thay cho attribute ngẫu nhiên (và cái bẫy độ chính xác)

P1.4 và P1.5 dùng hai attribute `aScale` và `aRandomness` do CPU sinh bằng `Math.random()`. Chúng cũng là "dữ liệu CPU" — đúng thứ bước này muốn loại bỏ. Thay vào đó, shader tự **hash** ra số ngẫu nhiên từ toạ độ texel:

```glsl
vec3 hash32(vec2 p) {
  vec3 p3 = fract(p.xyx * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}
```

Hash là hàm tất định: cùng một texel luôn cho ra cùng bộ số, trên mọi máy, không cần upload gì. Nhưng nó có **hai cái bẫy về độ chính xác float** mà ta đã vấp cả hai (xem mục *Lỗi đã gặp*):

- Đầu vào **quá lớn** (ví dụ `aIndex` chạy tới 65.535): `fract()` của một số hàng nghìn chỉ còn vài trăm giá trị phân biệt được, vì float 32-bit đã tiêu hết mantissa cho phần nguyên.
- Đầu vào **nhỏ hơn 1** (ví dụ uv trong `(0, 1)`): `fract(x)` với `x < 1` trả về chính `x` — không "cuộn" (wrap) gì cả, nên hai texel cạnh nhau cho ra hai giá trị gần nhau. Hash biến thành một dải gradient mượt thay vì nhiễu.

Vùng an toàn là đầu vào cỡ **hàng chục đến hàng trăm**: đủ lớn để `fract` cuộn nhiều vòng, đủ nhỏ để float còn độ phân giải. Toạ độ texel `0 … 255` rơi đúng vào vùng này, nên shader nhân uv lên trước khi hash:

```glsl
vec2 texel = aParticleUv * uTextureSize;  // 0.5 … 255.5
vec3 randomness = hash32(texel);
```

## Đi qua code

### `apps/point-cloud/src/scene/particle-grid.ts` (mới)

Thay cho `sphere-field.ts`, module này không sinh ra hình dạng nào cả — nó chỉ đánh địa chỉ:

```ts
export function createParticleGrid(size: number = DEFAULT_TEXTURE_SIZE): ParticleGrid {
  if (!Number.isInteger(size) || size < 1) {
    throw new RangeError(`texture size must be a positive integer, got ${size}`);
  }

  const count = size * size;
  const particleUv = new Float32Array(count * 2);
  const index = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const x = i % size;
    const y = Math.floor(i / size);

    particleUv[i * 2 + 0] = (x + 0.5) / size;
    particleUv[i * 2 + 1] = (y + 0.5) / size;
    index[i] = i;
  }

  return {
    size,
    count,
    positions: new Float32Array(count * 3),
    particleUv,
    index,
  };
}
```

Ba mảng, ba vai trò khác hẳn nhau:

| Mảng | Vai trò | Ai đọc |
|---|---|---|
| `positions` | **Không gì cả** — 786 KB số 0, chỉ để three.js đếm vertex | three.js (đếm), shader (không) |
| `particleUv` | **Địa chỉ** — texel của hạt này nằm đâu | vertex shader, ngay từ 3.1 |
| `index` | **Danh tính** — hạt này là hạt thứ mấy | vertex shader, từ P4.2 và P5.5 |

`i % size` cho cột, `Math.floor(i / size)` cho hàng: đây chính là phép "trải một danh sách 1 chiều lên lưới 2 chiều", thao tác nền tảng của mọi kỹ thuật texture-as-data.

`index` được tạo và upload từ bây giờ vì nó thuộc về hợp đồng geometry của bước này, nhưng vertex shader chưa đọc tới — nó bắt đầu có việc ở P4.2 (hạt giống cho curl noise) và P5.5 (thứ tự hiện ra của hiệu ứng intro). Attribute nào shader không khai báo thì three.js cũng không bind, nên nó chưa tốn gì trên GPU.

### `apps/point-cloud/src/scene/particle-grid.test.ts` (mới)

Phần đáng giá nhất là test mô phỏng đúng việc GPU sẽ làm với texture `NearestFilter` — biến uv ngược lại thành toạ độ texel:

```ts
for (let i = 0; i < grid.count; i += 997) {
  const x = Math.floor(grid.particleUv[i * 2]! * size);
  const y = Math.floor(grid.particleUv[i * 2 + 1]! * size);

  expect(x).toBe(i % size);
  expect(y).toBe(Math.floor(i / size));
}
```

Test này chính là thứ bắt được lỗi nếu ai đó bỏ `+ 0.5`: khi đó `Math.floor` rơi vào đúng ranh giới và sai số float32 có thể đẩy kết quả lùi một texel. Nó cũng là bản nháp trên CPU của phép giải mã mà 3.5 sẽ viết đầy đủ.

### `apps/point-cloud/src/shaders/points.vert.glsl`

Attribute cũ `aScale` và `aRandomness` biến mất, thay bằng đúng một attribute:

```glsl
attribute vec2 aParticleUv;  // centre of this particle's texel, in (0, 1)

uniform float uTextureSize;  // side of the square data texture, in texels
uniform float uFieldSize;    // world width/height the grid is spread over
```

Trong `main()`, ba dòng đầu là toàn bộ nội dung của bước 3.1:

```glsl
vec2 texel = aParticleUv * uTextureSize;

vec3 home = vec3((aParticleUv - 0.5) * uFieldSize, 0.0);

vec3 randomness = hash32(texel);
float scale = mix(0.5, 1.0, hash32(texel + 91.7).y);
```

`aParticleUv - 0.5` dời uv từ `(0, 1)` về `(-0.5, 0.5)` để lưới nằm giữa gốc toạ độ, rồi nhân `uFieldSize` để trải ra kích thước thế giới thật. `z = 0` → lưới hoàn toàn phẳng; 3.3 sẽ thay `z` bằng độ sâu giải mã từ ảnh.

`hash32(texel + 91.7)` là lần hash thứ hai với đầu vào dịch đi, để `scale` không tương quan với `randomness`. Phần còn lại của shader — phối cảnh, sub-pixel dimming, clamp `gl_PointSize` — giữ nguyên hệt P1.4.

### `apps/point-cloud/src/scene/particle-field.tsx`

Props đổi từ "bao nhiêu hạt trong quả cầu bán kính bao nhiêu" sang "texture cạnh bao nhiêu, trải ra vùng rộng bao nhiêu":

```tsx
interface ParticleFieldProps extends ParticleParams {
  /** Side of the square data texture; the field holds `textureSize²` points. */
  textureSize?: number;
  /** World width and height the grid of texels is spread over. */
  fieldSize?: number;
  // …
}
```

Geometry rút xuống còn ba attribute, và `frustumCulled` bị tắt:

```tsx
<points frustumCulled={false}>
  <bufferGeometry>
    {/* Zeros, but required: three.js reads the vertex count from here. */}
    <bufferAttribute attach="attributes-position" args={[grid.positions, 3]} />
    <bufferAttribute attach="attributes-aParticleUv" args={[grid.particleUv, 2]} />
    <bufferAttribute attach="attributes-aIndex" args={[grid.index, 1]} />
  </bufferGeometry>
  <shaderMaterial ref={material} args={materialArgs} />
</points>
```

Vòng `useFrame` cũng gọn lại — phép tự xoay quanh trục Y bị bỏ (xem *Lỗi đã gặp* #4), chỉ còn đẩy thời gian:

```tsx
useFrame((_, delta) => {
  if (!playing || !material.current) return;
  material.current.uniforms.uTime!.value += delta * driftSpeed;
});
```

Giá trị mặc định được chỉnh lại theo bước lưới `fieldSize / textureSize = 3 / 256 ≈ 0.0117` đơn vị thế giới:

```tsx
export const defaultParticleParams: ParticleParams = {
  size: 0.016,
  softness: 0.5,
  driftAmplitude: 0.01,
  driftSpeed: 1,
};
```

### `apps/point-cloud/src/app/studio.tsx`

Slider **Drift** đổi từ `max 0.3 / step 0.005` xuống `max 0.1 / step 0.001`. Lý do thuần tuý là tỉ lệ: khoảng cách giữa hai hạt giờ chỉ còn ~0.0117, nên toàn bộ dải hữu ích của drift nằm dưới 0.02 — với step cũ thì cả slider chỉ có 4 nấc dùng được.

### `apps/point-cloud/src/scene/sphere-field.ts`

Không bị xoá, nhưng **renderer không còn dùng tới**. Nó vẫn là code mà các bài P1.1–P1.5 đi qua từng dòng, và lập luận lấy mẫu đều trong thể tích (`∛u`) sẽ quay lại ở P6.5 khi ta lấy mẫu điểm từ bản đồ importance.

## Lỗi đã gặp

1. **Suýt hash thẳng từ `aIndex`.** Bản nháp đầu dùng `hash11(aIndex)` với `aIndex` chạy tới 65.535. Tính lại bằng tay mới thấy: `65535 × 0.1031 ≈ 6756.7`, mà ulp của float32 ở vùng 6756 là `2⁻¹¹ ≈ 0.00049` → `fract()` chỉ còn khoảng 2048 giá trị phân biệt cho 65.536 hạt. Tệ hơn, những hạt cách nhau **97 đơn vị index** (vì `97 × 0.1031 ≈ 10.0007`, phần lẻ gần 0) nhận giá trị gần như y hệt nhau — 97 không chia hết cho 256, nên lỗi sẽ hiện ra thành các vệt chéo trên lưới. Đổi sang hash từ toạ độ texel.

2. **Rồi suýt hash từ uv.** Sửa lần một là truyền thẳng `aParticleUv` (trong khoảng `0 … 1`) vào `hash32`. Sai tiếp, theo hướng ngược lại: `fract(x)` với `x < 1` trả về chính `x`, nên bước `fract` đầu tiên — bước có nhiệm vụ phá tương quan giữa các hạt cạnh nhau — không làm gì cả, và hash thoái hoá thành một dải gradient. Sửa lần hai: nhân uv với `uTextureSize` để về khoảng `0.5 … 255.5` rồi mới hash.

3. **`frustumCulled` — lỗi được dự đoán trước, vẫn nên tự gây ra một lần.** Với `position` toàn 0 thì bounding sphere có bán kính 0; chỉ cần xoay camera là mất sạch hình. Đáng bỏ 30 giây xoá dòng đó và xoay thử, vì triệu chứng (màn hình đen, không lỗi, không cảnh báo, `renderer.info` vẫn báo 0 draw call) rất dễ khiến ta đi tìm nhầm chỗ ở shader.

4. **Tự xoay quanh trục Y + mặt phẳng = biến mất.** `points.rotation.y += delta * 0.15` từ P1.1 hợp lý với quả cầu, nhưng một tấm lưới phẳng xoay quanh Y sẽ định kỳ quay nghiêng đúng cạnh về phía camera và mỏng đi thành một vạch. Đã bỏ hẳn; điều khiển góc nhìn giờ là việc của OrbitControls (P1.6), và chuyển động thật sẽ đến ở P4.

5. **Drift mặc định nuốt mất lưới.** Giá trị cũ `0.06` được chọn cho quả cầu bán kính 1.3, nghĩa là hạt đi lang thang xa gấp **5 lần** bước lưới mới (0.0117) — kết quả là một đám mây nhiễu, không còn dấu vết cấu trúc lưới để mà kiểm chứng. Hạ xuống `0.01` (~85% bước lưới): đủ để thấy lưới lung linh, chưa đủ để xoá nó.

## Tự thử

1. **Nhìn thấy cái lưới.** Kéo **Drift** về `0`. Đám nhiễu phải biến thành một lưới điểm đều tăm tắp. Nếu không đều → `aParticleUv` sai.
2. **Tự gây ra màn hình đen.** Xoá `frustumCulled={false}` trong `particle-field.tsx`, rồi xoay camera. Đoán trước: mất hình ở khoảng góc bao nhiêu? Mở DevTools xem `renderer.info.render.calls` tụt từ 2 xuống 1.
3. **Đổi ngân sách hạt.** Truyền `textureSize={128}` cho `<ParticleField>` trong `stage.tsx`. HUD phải báo 16.384 points, và lưới thưa đi đúng 2 lần mỗi chiều. Thử `512` → 262.144 points; FPS đổi bao nhiêu?
4. **Bỏ `+ 0.5`.** Sửa `particle-grid.ts` thành `x / size`. Chạy `bun run test` — test round-trip có đỏ không? Rồi nhìn app: lưới dịch đi nửa texel về một góc. Ở 3.2, khi đã có texture màu thật, cùng lỗi này sẽ gây hậu quả nặng hơn nhiều.
5. **Xem trước 3.2.** Kéo **Size** lên khoảng `0.03`. Các hạt chạm nhau thành một mặt liền — đó chính là hình dáng mà dữ liệu ảnh sẽ đáp xuống ở bước sau.
6. **Kiểm tra lời tuyên bố "positions toàn 0".** Trong DevTools Console, sau khi app chạy: hạt nằm đúng chỗ trên màn hình, nhưng không một con số nào của `position` khác 0. Vị trí thật sống ở đâu?

## Đọc thêm

- [three.js — `Object3D.frustumCulled`](https://threejs.org/docs/#api/en/core/Object3D.frustumCulled)
- [three.js — `BufferGeometry.boundingSphere`](https://threejs.org/docs/#api/en/core/BufferGeometry.boundingSphere)
- [WebGL2 Fundamentals — GPGPU](https://webgl2fundamentals.org/webgl/lessons/webgl-gpgpu.html) (dùng texture làm dữ liệu tính toán)
- [The Book of Shaders — Random](https://thebookofshaders.com/10/) (vì sao hash trong shader lại trông như thế)
- [Dave Hoskins — Hash without Sine](https://www.shadertoy.com/view/4djSRW) (nguồn gốc của `hash32`)
- [research/01-untillabs-method.md](../research/01-untillabs-method.md) — format dữ liệu mà P3.2–3.4 sẽ giải mã
