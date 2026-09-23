# P6.8 · Đóng gói vào DataTexture: đường nối mà cả dự án chờ

## Mục tiêu

Biến đám mây vừa dựng thành **đúng ba texture** mà `ParticleField` đã đọc từ P3.3, rồi đưa lên GPU.

Đây là bước mà cả kiến trúc hướng tới. Renderer chưa bao giờ biết dữ liệu của nó từ đâu tới; sinh ra cùng bộ bản đồ ở đây thì một tấm ảnh thả vào trình duyệt sẽ render qua **đúng shader ấy**, với mọi hiệu ứng P4 và P5 đã có sẵn. Không nhánh `if`, không đường code thứ hai, không "chế độ upload".

Xong khi ảnh tải lên render ra với đầy đủ hiệu ứng.

## Khái niệm

### 1. `DataTexture` so với `Texture`

`Texture` được nuôi bằng một ảnh (`TextureLoader` giải mã PNG). `DataTexture` được nuôi bằng một mảng typed — cùng một thứ dưới mắt sampler, chỉ khác nguồn.

Mọi cờ phải khớp **chính xác** với đường file, nếu không hai nguồn không thể thay thế cho nhau được — mà thay thế được chính là toàn bộ mục đích của bước này:

```ts
texture.minFilter = NearestFilter;
texture.magFilter = NearestFilter;
texture.generateMipmaps = false;
texture.wrapS = texture.wrapT = ClampToEdgeWrapping;
texture.colorSpace = colorSpace;
```

Lý do từng dòng đã viết ở [P3.2](p3-2-color-texture.md): đây là **số**, không phải ảnh, nên mọi tiện nghi mà three.js dành cho ảnh phải tắt đi.

Một khác biệt quan trọng giữa hai loại: **`DataTexture` không bị lật dọc khi upload**, còn ảnh thì có. Và nó **không được** lật: packer ghi hàng 0 trước, shader mong đọc hàng 0 trước. `flipY` để nguyên `false` mặc định — trong khi đường file phải đặt `flipY = false` một cách tường minh để **huỷ** phép lật.

### 2. `RGBAFormat`, không phải RGB

WebGL2 đã bỏ texture byte ba kênh, và three.js bỏ `RGBFormat` theo. Nên packer ghi bốn kênh.

Điều đó nghe như lãng phí một byte mỗi texel — và rồi [P6.6](p6-6-mat-do-diem.md) nhét mật độ vào đúng byte đó. Một hạn chế của định dạng hoá ra là chỗ chứa vừa vặn cho một thứ khác đang cần chỗ.

### 3. Vì sao **vẫn** là 16-bit hi/lo chứ không phải float

Kế hoạch trong roadmap ghi "Float, không cần hi/lo trong app" — và lý lẽ nghe hợp: không có PNG nào phải chui qua thì cần gì tách một số thành hai byte.

Khi làm thật thì dùng lại encoder của P3 hoá ra tốt hơn ở mọi mặt:

| | 16-bit hi/lo | Float texture |
|---|---|---|
| Shader | không đổi một ký tự | cần một đường giải mã thứ hai |
| Test | P3.5 phủ luôn đường này | phải viết bộ test mới |
| Bộ nhớ | 2 texture byte = 512 KB | 1 texture float = 1 MB |
| Xuất bundle (P8.1) | byte đã mã hoá sẵn, chỉ ghi file | phải chuyển đổi lại |

Còn lý lẽ về độ chính xác — thứ khiến float hấp dẫn — không sống sót nổi trước con số. Trên trường rộng ba đơn vị, 16 bit là bước **0.000046** đơn vị thế giới, tức khoảng **một phần nghìn** khoảng cách giữa hai hạt cạnh nhau.

Đây là chỗ **cố ý đi chệch roadmap**, và lý do được ghi lại ngay trong JSDoc của `pack-bundle.ts`.

### 4. Alpha không nằm trong đường cong sRGB

Nhắc lại vì nó là nền tảng của cả thiết kế: GPU giải mã R, G, B qua hàm truyền sRGB và cho **A đi thẳng**. Một con số cất ở alpha về tới shader vẫn là con số đó.

Và nó suy biến đúng hướng: `color.png` không có kênh alpha thì đọc ra 1.0 khắp nơi → "chật nhất" → kích thước không bị đụng. Mọi bundle cũ render y hệt như trước.

### 5. Một texture phải được lấp **đầy**

```ts
if (cloud.count !== count) {
  throw new RangeError(`a ${options.size}² texture needs exactly ${count} points, got ${cloud.count}`);
}
```

Renderer vẽ **một vertex cho mỗi texel** (P3.1). Một đám mây thiếu hạt sẽ để lại những texel chứa bất cứ thứ gì buffer được khởi tạo bằng — tức là hạt ở gốc toạ độ, màu đen, và không có cảnh báo nào.

### 6. GPU memory không có garbage collector

```ts
useEffect(() => () => {
  bundle?.color.dispose();
  bundle?.positionHigh.dispose();
  bundle?.positionLow.dispose();
}, [bundle]);
```

Bộ thu gom rác của JavaScript không nhìn thấy bộ nhớ GPU. Thả một tấm ảnh mới vài giây một lần mà không `dispose()` thì rò rỉ vài megabyte mỗi lần cho tới khi context bỏ cuộc.

Chú ý cấu trúc: `useMemo` **dẫn xuất** texture, `useEffect` chỉ làm đúng việc mà chỉ effect làm được — dọn dẹp. Viết theo kiểu `useState` + `setState` trong effect thì ESLint chặn (`react-hooks/set-state-in-effect`), và luật đó đúng: texture là hàm thuần của mấy mảng byte, không có gì để đồng bộ cả.

## Đi qua code

### `apps/point-cloud/src/photo/pack-bundle.ts` (mới)

```ts
color[i * 4 + 3] = Math.round(clamp01(cloud.density[i]!) * 255);
positionHigh[i * 4 + 3] = 255;
```

Alpha của bản đồ vị trí đặt 255 và không bao giờ đọc. Để 0 cũng chạy, nhưng 255 thì an toàn hơn nếu sau này có ai đó nhìn file bằng mắt.

### `apps/point-cloud/src/scene/use-cloud-bundle.ts` (mới)

Trả về đúng kiểu `ParticleBundle` mà đường file trả — đó là điều kiện để hai bên thay thế nhau.

### `apps/point-cloud/src/scene/particle-field.tsx`

Ba dòng làm nên đường nối:

```tsx
const packed = usePhotoStore((state) => state.bundle);
const photoBundle = useCloudBundle(packed);
const fileBundle = useParticleBundle(packed ? null : bundleUrl);
const bundle = photoBundle ?? fileBundle;
```

`useParticleBundle` nhận thêm `null` nghĩa là "chỗ này đã có người, đừng fetch gì". Hook không được gọi có điều kiện, nên điều kiện phải nằm **bên trong** hook.

Và mọi thứ phía dưới trong component không hề biết nó nhận được cái nào.

### `apps/point-cloud/src/photo/worker.ts` — `buildCloud`

Cả 6.5 → 6.9 nằm trong một hàm, đọc như năm dòng:

```ts
const points  = samplePoints({ … });          // 6.5
const density = pointDensity({ points, … });  // 6.6
const cloud   = liftToCloud({ points, density, … });  // 6.7
const packed  = packCloud(shuffleCloud(cloud, seed), { … });  // 6.9 rồi 6.8
```

Không có vòng lặp ngược, không có trạng thái chia sẻ. Mỗi bước đưa đầu ra cho bước sau.

## Lỗi đã gặp

1. **`setState` đồng bộ trong effect bị ESLint chặn.** Bản đầu của `useCloudBundle` dùng `useState` rồi `setBundle(...)` ngay trong effect. Luật `react-hooks/set-state-in-effect` chặn đúng, và cách sửa (`useMemo` + effect chỉ để dispose) ngắn hơn và đúng hơn bản gốc.
2. **`ArrayBufferLike` lại xuất hiện.** Lần này ở `depth.data.buffer` khi gửi vào worker. Cùng một cách xử lý như [P6.3](p6-3-worker-va-huy.md).
3. **Alias `@/` không chạy trong test.** `pack-bundle.ts` import `@/bundle/position-codec`, và app chưa từng có file cấu hình vitest riêng, nên mọi test cũ đều dùng đường dẫn tương đối. Phải thêm `apps/point-cloud/vitest.config.mts` khai alias. Đuôi `.mts` chứ không phải `.ts`, vì `package.json` của app không có `"type": "module"` và vite cảnh báo.

## Tự thử

1. **Đổi qua đổi lại hai nguồn.** Thả một ảnh, rồi bấm `Clear` trong panel Photo. Cảnh nhảy về bundle mẫu. Mọi slider của P4/P5 vẫn chạy trên cả hai chứ?
2. **Phá `flipY`.** Trong `use-cloud-bundle.ts` đặt `texture.flipY = true`. Điều gì xảy ra, và vì sao nó xảy ra với ảnh nhưng không với bundle mẫu?
3. **Ghi đè alpha thành 255.** Trong `pack-bundle.ts` đặt `color[i*4+3] = 255`. Bây giờ `Fill sparse` có tác dụng gì không? Đây chính là hành vi của bundle trước 6.6.
4. **Bỏ `dispose()`.** Thả 30 ảnh liên tiếp rồi xem tab Memory. Bao lâu thì thấy khác biệt?
5. **Đếm draw call.** Đồng hồ ở góc trên vẫn báo 2 chứ? Vì sao 65.536 hạt đọc từ RAM của trình duyệt lại không tốn thêm draw call nào so với 65.536 hạt đọc từ PNG?

## Đọc thêm

- [three.js — `DataTexture`](https://threejs.org/docs/#api/en/textures/DataTexture)
- [MDN — `WebGLRenderingContext.texImage2D`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D)
- [P3.3 · Vị trí 16-bit trong hai file PNG](p3-3-16-bit-positions.md)
- [P3.1 · Geometry không có vị trí](p3-1-geometry-without-positions.md)
