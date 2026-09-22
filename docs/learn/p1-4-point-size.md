# P1.4 · Kích thước hạt: phối cảnh, DPR, dưới 1 pixel

## Mục tiêu

Hạt trông **cùng cỡ trên mọi màn hình** (thường hay retina), **co giãn theo cửa sổ** như phần còn lại của cảnh, và xử lý đúng hai trường hợp biên: hạt nhỏ hơn 1 pixel và hạt vượt giới hạn GPU. Thêm độ đa dạng: mỗi hạt một cỡ riêng.

## Khái niệm

### 1. Pixel CSS và pixel thiết bị

Màn retina có DPR = 2: mỗi pixel CSS gồm 2×2 = 4 pixel thiết bị. WebGL vẽ vào **drawing buffer** có kích thước thật:

```
drawing buffer = kích thước CSS × DPR
cửa sổ 1000×800 CSS, DPR 2  →  vẽ vào 2000×1600 pixel thiết bị
```

`gl_PointSize` tính bằng **pixel thiết bị**. Nếu tính cỡ hạt mà quên DPR, hạt trên retina sẽ chỉ bằng nửa (chiếm cùng số pixel thiết bị, nhưng mỗi pixel nhỏ hơn).

### 2. Vì sao công thức của ta đã đúng với DPR

```
uScale = chiều cao CSS × DPR / 2          (pixel thiết bị)
gl_PointSize = uSize × uScale / khoảng cách
```

DPR tăng gấp đôi → `gl_PointSize` gấp đôi số pixel thiết bị → **cùng kích thước nhìn thấy**. Cửa sổ cao gấp đôi → hạt gấp đôi pixel, đúng như khối cầu cũng to gấp đôi. Nghĩa là hạt luôn giữ **tỉ lệ với cảnh**.

> Công thức `1920 / height / dpr` trong code UntilLabs thực chất quy về cùng biểu thức này, chỉ viết theo "độ phân giải tham chiếu 1920".

> *Đính chính:* ở cuối bước 1.3 từng nói "màn retina thấy hạt to gấp đôi" — sai. Phân tích trên cho thấy cỡ nhìn thấy không đổi theo DPR.

### 3. Hạt nhỏ hơn 1 pixel

GPU **không vẽ được nửa pixel**: `gl_PointSize = 0.3` vẫn tô đủ 1 pixel. Hạt ở xa vì thế sáng và dày hơn thực tế, và nhấp nháy khi xoay (lúc thì có pixel, lúc thì không).

Cách sửa: vẫn vẽ 1 pixel, nhưng **giảm alpha theo diện tích lẽ ra hạt chiếm**:

```
hạt 0.3 px  →  diện tích lẽ ra = 0.3² = 0.09  →  alpha × 0.09
hạt ≥ 1 px  →  giữ nguyên
```

Tổng lượng ánh sáng của hạt đúng với kích thước thật của nó, dù chỉ vẽ được 1 pixel.

### 4. Giới hạn cỡ tối đa của GPU

Mỗi GPU hỗ trợ `gl_PointSize` trong một khoảng, hỏi được qua `ALIASED_POINT_SIZE_RANGE` (máy dev hiện tại: tối đa **1024** px; có máy chỉ 64). Vượt quá, GPU **cắt âm thầm** — mỗi máy cắt một mức. Tự `clamp` theo đúng con số của máy thì hành vi rõ ràng và giống nhau.

### 5. Varying: truyền dữ liệu từ vertex sang fragment

Hệ số làm mờ tính ở vertex shader (nơi biết cỡ hạt), nhưng cần dùng ở fragment shader (nơi quyết định alpha). Cầu nối là **varying**:

```glsl
// vertex shader
varying float vCoverage;
vCoverage = min(pixels * pixels, 1.0);

// fragment shader
varying float vCoverage;           // cùng tên, cùng kiểu
gl_FragColor = vec4(uColor, alpha * vCoverage);
```

GPU chuyển giá trị cho mọi pixel của hạt. (Với tam giác, varying được **nội suy** giữa 3 đỉnh — ví dụ tô màu chuyển dần. Với point chỉ có một đỉnh nên mọi pixel nhận cùng giá trị.)

### 6. Attribute riêng: mỗi hạt một cỡ

Cỡ đồng đều trông như lưới máy móc. Thêm attribute `aScale` — một số ngẫu nhiên 0.5–1.0 cho mỗi hạt — khiến khối cầu có chiều sâu và kết cấu hơn. Đây là attribute đầu tiên ta tự thêm ngoài `position`; từ P3 trở đi sẽ có nhiều attribute kiểu này (UV để đọc texture, chỉ số hạt…).

## Đi qua code

**`apps/point-cloud/src/shaders/points.vert.glsl`**

```glsl
attribute float aScale;
float pixels = uSize * aScale * (uScale / -mvPosition.z);
vCoverage = min(pixels * pixels, 1.0);
gl_PointSize = clamp(pixels, 1.0, uMaxPointSize);
```

**`shaders/points.frag.glsl`** — `alpha * vCoverage`.

**`scene/sphere-field.ts`** — `createScales(count, min, max)` sinh mảng cỡ, có test kiểm tra khoảng giá trị và trung bình 0.75.

**`scene/particle-field.tsx`**

```tsx
<bufferAttribute attach="attributes-aScale" args={[scales, 1]} />   // 1 số / hạt

const range = context.getParameter(context.ALIASED_POINT_SIZE_RANGE); // [min, max]
```

## Lỗi đã gặp

- **Kiểm tra resize bằng tool không được** vì cửa sổ đang maximize. Đổi cách: thu nhỏ `<main>` bằng CSS — R3F đo kích thước theo phần tử cha nên tương đương resize cửa sổ. So ảnh canvas 520×400 với ảnh canvas 1041×799 thu nhỏ một nửa: gần như trùng khớp → hạt co giãn đúng tỉ lệ.
- **Một nhận định sai được sửa lại** (mục 2). Bài học: với đồ hoạ, hãy viết công thức ra và thay số, đừng chỉ dựa vào cảm giác.

## Tự thử

1. Bỏ `* vCoverage` trong fragment shader, tăng `radius` lên `3` và lùi camera. Hạt ở xa có sáng lên và nhấp nháy khi xoay không?
2. Tạm đặt `uMaxPointSize` = `4.0` (sửa trong `useEffect`) và tăng `size` lên `0.2`. Chuyện gì xảy ra với các hạt gần camera?
3. Đổi `createScales(count)` thành `createScales(count, 1, 1)` (mọi hạt cùng cỡ). So sánh cảm giác chiều sâu.
4. Mở DevTools → Rendering → mô phỏng DPR khác (hoặc zoom trình duyệt). Kích thước hạt so với khối cầu có đổi không?

## Đọc thêm

- [MDN — `devicePixelRatio`](https://developer.mozilla.org/en-US/docs/Web/API/Window/devicePixelRatio)
- [WebGL Fundamentals — Resizing the canvas](https://webglfundamentals.org/webgl/lessons/webgl-resizing-the-canvas.html) — drawing buffer và DPR
- [MDN — `WebGLRenderingContext.getParameter`](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/getParameter) — `ALIASED_POINT_SIZE_RANGE`
