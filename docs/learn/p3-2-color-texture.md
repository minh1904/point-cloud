# P3.2 · Màu đọc từ texture

## Mục tiêu

Ở 3.1 mỗi hạt đã có **địa chỉ** (`aParticleUv`) nhưng địa chỉ đó chưa trỏ tới cái gì. Bước này nạp tấm texture đầu tiên và để vertex shader tự đi lấy màu của chính mình.

Trước: cả 65.536 hạt dùng chung một uniform `uColor`. Sau: mỗi hạt đọc đúng một texel của `color.png` và mang màu riêng.

Kết quả nhìn thấy được: bức ảnh mẫu hiện ra trên tấm lưới phẳng — vẫn phẳng, vì độ sâu phải chờ 3.3 — với chất điểm hoạ (pointillism) đặc trưng của point cloud.

Ảnh mẫu (1200 × 800) được đưa vào repo tại `apps/point-cloud/public/particles/sample/color.png`, thu nhỏ còn 256 × 256.

## Khái niệm

### 1. Vertex texture fetch

Từ trước tới giờ ta chỉ đọc texture trong **fragment** shader (P2.2 đọc FBO). Bước này đọc trong **vertex** shader:

```glsl
vColor = texture2D(uColorMap, aParticleUv).rgb;
```

Một dòng, nhưng là dòng mà cả phase P3 tồn tại để làm cho khả thi: 65.536 lần đọc độc lập, mỗi hạt một lần, chạy song song. Vertex texture fetch (VTF) từng là tính năng xa xỉ thời WebGL 1 (nhiều GPU di động báo `MAX_VERTEX_TEXTURE_IMAGE_UNITS = 0`, tức là *không đọc được*); WebGL 2 bắt buộc hỗ trợ tối thiểu 16 đơn vị, nên giờ dùng thoải mái.

Màu đọc ở vertex shader rồi chuyển sang fragment shader qua **varying** `vColor` — đọc một lần cho mỗi hạt, thay vì một lần cho mỗi pixel mà hạt phủ lên. Với hạt to vài chục pixel, đó là tiết kiệm thật.

### 2. Texture chứa **dữ liệu**, không phải **ảnh**

three.js mặc định giả định texture là ảnh để nhìn, nên nó bật sẵn một loạt tiện nghi. Với dữ liệu, mọi tiện nghi đó đều là **làm hỏng**:

| Mặc định | Vì sao hỏng | Đặt lại |
|---|---|---|
| `LinearFilter` | Trộn texel với 4 hàng xóm. Nhưng hàng xóm ở đây là **hạt khác**, không phải phần liền kề của một bức ảnh. | `NearestFilter` |
| `generateMipmaps = true` | Mipmap là bản thu nhỏ trung bình hoá — tức là trộn thêm nữa, và tốn 33% bộ nhớ vô ích. | `false` |
| `flipY = true` | three.js lật ảnh khi upload để uv (0,0) nằm ở góc dưới-trái theo quy ước OpenGL. Hàng 0 của file phải ở nguyên hàng 0. | `false` |
| `RepeatWrapping`¹ | Đọc lố ra ngoài sẽ vòng sang mép đối diện, lấy nhầm dữ liệu của hạt ở đầu kia. | `ClampToEdgeWrapping` |

¹ mặc định của `Texture` là `ClampToEdgeWrapping` rồi, nhưng đặt tường minh vẫn tốt hơn là phụ thuộc vào mặc định của thư viện.

### 3. Ngoại lệ: `colorSpace`

Đây là chỗ duy nhất texture này **thật sự là một bức ảnh**, và roadmap ghi `NoColorSpace` là nói về các texture của 3.3–3.4, không phải texture màu.

Lý do: PNG của một tấm ảnh lưu byte đã **mã hoá sRGB**. Giá trị 128 trong file không có nghĩa là "một nửa lượng ánh sáng" — sRGB là thang phi tuyến, 128 tương ứng khoảng 21% ánh sáng thật. Mà shader thì cộng, nhân, trộn alpha — toàn phép toán chỉ đúng trong **không gian tuyến tính**.

Nên với `color.png`: `colorSpace = SRGBColorSpace`. three.js sẽ upload nó bằng internal format sRGB, và **phần cứng GPU tự giải mã sang tuyến tính khi sample** — miễn phí. Cuối đường ống, `#include <colorspace_fragment>` mã hoá ngược lại sang sRGB để hiển thị.

Ngược lại, `position_h.png` ở 3.3 chứa **con số**, không phải màu. Giá trị 128 ở đó nghĩa đúng là 128. Áp giải mã sRGB lên nó sẽ bóp méo toạ độ một cách âm thầm — điểm sẽ dồn về một phía và không có lỗi nào được báo. Đó là lý do chúng phải giữ `NoColorSpace`.

Quy tắc dễ nhớ: **hỏi xem byte đó có phải là màu người ta nhìn không.** Có → sRGB. Không → NoColorSpace.

### 4. `flipY = false` và chuyện ảnh lộn ngược

Tắt `flipY` thì hàng 0 của texture là hàng **trên cùng** của file PNG. Nhưng trong thế giới 3D, `+y` hướng lên. Nếu cứ map thẳng `uv.y → world.y` thì hàng trên cùng của ảnh rơi xuống đáy → ảnh lộn ngược.

Ta không sửa bằng cách bật `flipY` lại (làm thế là để thư viện sắp xếp lại dữ liệu sau lưng mình — chấp nhận được với ảnh, nguy hiểm với dữ liệu). Ta sửa ở chỗ **diễn giải**, trong shader:

```glsl
vec2 plane = vec2(aParticleUv.x - 0.5, 0.5 - aParticleUv.y);
```

`0.5 - uv.y` thay vì `uv.y - 0.5`: v tăng thì đi xuống. Dữ liệu giữ nguyên si, chỉ cách đọc nó thay đổi.

### 5. Texture vuông, ảnh 3:2 — tỉ lệ là **metadata**

Ảnh gốc 1200 × 800 bị ép vào texture vuông 256 × 256. Nghe như làm hỏng ảnh, nhưng không:

> Texture không phải là bức ảnh. Nó là **cái hộp chứa 65.536 hạt**. Hình dạng cái hộp không nói gì về hình dạng chủ thể.

Texture phải vuông (và lý tưởng là luỹ thừa của 2) vì nó là lưới địa chỉ; còn tỉ lệ 3:2 của ảnh là **thông tin riêng**, ở 3.2 tạm nằm trong hằng số `SAMPLE_SOURCE.aspect`, và 3.4 sẽ chuyển vào `metadata.json` đúng như format thật. Lưới dùng tỉ lệ đó để kéo dữ liệu trở lại đúng hình:

```
uFieldSize = vec2(fieldWidth, fieldWidth / aspect) = (3.0, 2.0)
```

Nhân tiện: vì lưới 256 × 256 trải trên vùng 3.0 × 2.0, khoảng cách giữa hai hạt **không còn vuông** — 0.0117 theo chiều ngang, 0.0078 theo chiều dọc.

## Đi qua code

### Tạo file `color.png`

Repo không có thư viện xử lý ảnh (không `sharp`, không `jimp`), nên asset được tạo một lần bằng GDI+ của Windows, hạ kích thước **hai bước** `1200×800 → 512×512 → 256×256`. Hạ một bước từ 1200 xuống 256 bằng bicubic sẽ bỏ qua quá nhiều pixel nguồn và gây răng cưa.

Lưu ý liên quan tới roadmap 8.2: "không bao giờ ghi PNG dữ liệu qua canvas". Với texture **màu** thì canvas/GDI+ chấp nhận được — sai lệch một hai mức sáng không ai thấy. Với texture **vị trí** ở P8 thì tuyệt đối không: canvas nhân sẵn alpha và quản lý màu, đủ để phá huỷ con số. Từ P6 trở đi việc này chạy ngay trong trình duyệt bằng `createImageBitmap` + `OffscreenCanvas`.

### `apps/point-cloud/src/scene/particle-field.tsx`

Toàn bộ phần cấu hình gom vào một hàm dùng lại được cho các texture dữ liệu sau này:

```tsx
function configureDataTexture(texture: Texture, colorSpace: ColorSpace): Texture {
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;
  texture.generateMipmaps = false;
  texture.flipY = false;
  texture.wrapS = ClampToEdgeWrapping;
  texture.wrapT = ClampToEdgeWrapping;
  texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}
```

Texture được **tự nạp** thay vì dùng `useTexture` của drei (lý do ở mục *Lỗi đã gặp* #1):

```tsx
const [colorTexture, setColorTexture] = useState<Texture | null>(null);
useEffect(() => {
  let loaded: Texture | undefined;
  let cancelled = false;

  new TextureLoader().load(colorMap, (texture) => {
    if (cancelled) {
      texture.dispose();
      return;
    }
    loaded = configureDataTexture(texture, SRGBColorSpace);
    setColorTexture(loaded);
  });

  return () => {
    cancelled = true;
    loaded?.dispose();
  };
}, [colorMap]);
```

Cờ `cancelled` xử lý trường hợp component unmount trong lúc file đang tải: callback vẫn sẽ chạy, và nếu không kiểm tra thì ta `setState` vào một component đã chết, đồng thời rò rỉ một texture trên GPU. `dispose()` là bắt buộc — GC của JavaScript không biết gì về bộ nhớ GPU.

Và vì mọi màu đều nằm trong texture, không có gì đáng vẽ trước khi nó về:

```tsx
if (!colorTexture) return null;
```

### `apps/point-cloud/src/shaders/points.vert.glsl`

```glsl
uniform sampler2D uColorMap; // one texel of colour per particle
uniform vec2 uFieldSize;     // world width/height the grid is spread over

varying vec3 vColor;

void main() {
  vec2 plane = vec2(aParticleUv.x - 0.5, 0.5 - aParticleUv.y);
  vec3 home = vec3(plane * uFieldSize, 0.0);

  vColor = texture2D(uColorMap, aParticleUv).rgb;
  // …
}
```

`uFieldSize` đổi từ `float` sang `vec2` để mang được tỉ lệ ảnh.

### `apps/point-cloud/src/shaders/points.frag.glsl`

`uniform vec3 uColor` biến mất, thay bằng varying:

```glsl
gl_FragColor = vec4(vColor, alpha * vCoverage);
```

`#include <colorspace_fragment>` giữ nguyên — nó vẫn là nơi chuyển tuyến tính → sRGB ở cuối đường ống.

## Lỗi đã gặp

1. **`useTexture` của drei bị ESLint chặn.** Cách viết quen thuộc nhất là `const tex = useTexture(url)` rồi chỉnh thuộc tính trong `useLayoutEffect`. Lint báo đỏ ngay:

   ```
   Error: This value cannot be modified
   Modifying a value returned from a hook is not allowed.   react-hooks/immutability
   ```

   Và rule này **đúng**, không phải phiền hà vô cớ: `useTexture` trả về object nằm trong **cache toàn cục theo URL** của drei. Sửa nó là sửa đồ dùng chung — hôm nay chỉ có một view nên không sao, ngày mai có view thứ hai muốn cùng file với thiết lập khác thì hỏng. Lời giải là tự sở hữu texture bằng `TextureLoader`; đổi lại được thêm hai thứ: không cần `<Suspense>`, và `dispose()` tường minh.

2. **Kích thước hạt mặc định quá nhỏ → ảnh thành đốm tối.** Đặt `size: 0.02` với lập luận "bước lưới 0.0117 thì 0.02 là đủ phủ". Sai. Nhìn màn hình thì ảnh tối om và lốm đốm tím. Hai thứ bị bỏ quên: (a) `scale` ngẫu nhiên 0.5–1 làm *một nửa* số hạt nhỏ lại còn ~0.01, và (b) rìa mềm (`softness 0.5`) đóng góp rất ít alpha, nên đường kính danh nghĩa không phải đường kính thực sự phủ. Thực nghiệm cho thấy cần khoảng **4 lần** bước lưới; `0.045` mới ra mặt liền. Dưới ~0.03 thì nền đen lọt qua khe và bức ảnh tối đi trông thấy.

3. **Tưởng FPS tụt từ 144 xuống 9.** Sau khi thêm vertex texture fetch, HUD báo 9 fps rồi 0 fps — thoáng nghĩ VTF quá đắt. Kiểm tra `document.visibilityState` thì ra `"hidden"`: cửa sổ Chrome bị ẩn, và trình duyệt **throttle `requestAnimationFrame`** cho tab nền xuống gần 0. Không có regression nào cả. Bài học: trước khi tin một con số FPS, kiểm tra tab có đang thật sự hiển thị không.

4. **Suýt bật lại `flipY` để chữa ảnh lộn ngược.** Cách sửa nhanh nhất là `flipY = true`, và nó *sẽ* chạy đúng — cho texture màu. Nhưng đó là để three.js sắp xếp lại dữ liệu sau lưng mình; đến 3.3, khi cùng một thiết lập áp lên texture vị trí, các hàng bị đảo sẽ làm toạ độ sai mà không báo lỗi. Giữ `flipY = false` cho mọi texture dữ liệu, và sửa ở phần diễn giải trong shader.

## Tự thử

1. **Xem từng hạt là một texel.** Kéo **Size** xuống `0.01`. Ảnh rã ra thành các chấm rời — mỗi chấm là đúng một texel của `color.png`. Đếm thử: cạnh ngang có bao nhiêu chấm?
2. **Làm ảnh lộn ngược.** Trong `points.vert.glsl` đổi `0.5 - aParticleUv.y` thành `aParticleUv.y - 0.5`. Ảnh lật dọc. Rồi thử chữa bằng cách đặt `flipY = true` trong `configureDataTexture` — cũng đúng ảnh. Hai cách cho cùng kết quả ở 3.2; đến 3.3 thì không.
3. **Phá không gian màu.** Đổi `SRGBColorSpace` thành `NoColorSpace`. Ảnh sáng bệch và bạc màu. Vì sao lại *sáng hơn* chứ không tối đi?
4. **Phá bộ lọc.** Đổi `NearestFilter` thành `LinearFilter`. Ở 3.2 khác biệt gần như không thấy (vì texel cạnh nhau đúng là pixel cạnh nhau của một bức ảnh). Ghi lại cảm nhận này rồi thử lại đúng thí nghiệm đó sau 3.3 — lúc ấy texel cạnh nhau là **hạt** cạnh nhau, và hậu quả sẽ rất khác.
5. **Thay ảnh của bạn.** Bỏ một file PNG vuông vào `public/particles/`, truyền `colorMap="/particles/cua-ban.png"` và `aspect` đúng tỉ lệ ảnh gốc cho `<ParticleField>` trong `stage.tsx`.
6. **Tăng Drift lên `0.05`.** Bức ảnh tan ra thành trường hạt. Ở khoảng giá trị nào thì chủ thể bắt đầu không nhận ra được nữa? So sánh con số đó với bước lưới `0.0117`.

## Đọc thêm

- [three.js — `Texture`](https://threejs.org/docs/#api/en/textures/Texture) (danh sách đầy đủ các thuộc tính `minFilter`, `flipY`, `colorSpace`…)
- [three.js — Color management](https://threejs.org/docs/#manual/en/introduction/Color-management)
- [WebGL2 Fundamentals — Textures](https://webgl2fundamentals.org/webgl/lessons/webgl-3d-textures.html)
- [MDN — `WebGLRenderingContext.texParameter()`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texParameter) (filter và wrap ở tầng WebGL thô)
- [research/01-untillabs-method.md](../research/01-untillabs-method.md) — các texture còn lại của bundle
