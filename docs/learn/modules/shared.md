# Module `src/shared`

> **Công dụng trong một câu:** giữ hằng số, kiểu dữ liệu và toán học thuần mà cả ba module còn lại đều cần — để không module nào phải import module ngang hàng.

**Tầng:** 1 (đáy) · **Import từ module khác:** không bao giờ · **Có test:** có, cho `math.ts`

---

## Vì sao module này tồn tại

Hai lý do, cả hai đều là lý do kiến trúc chứ không phải tiện tay.

**1. Chặn chu trình phụ thuộc.** Toolcraft từ chối đồ thị import có chu trình. `pointcloud` cần biết cấu trúc `DepthMap`, mà `DepthMap` do `depth` sinh ra. Nếu `pointcloud` import `depth`, rồi một ngày `depth` cần một helper trong `pointcloud` — chu trình, gate đỏ. Đặt `DepthMap` ở `shared` thì cả hai cùng nhìn xuống, không bao giờ nhìn ngang.

**2. Chống lệch giữa GLSL và TypeScript.** Xem [02-data-flow.md](../02-data-flow.md#hai-đường-song-song---cạm-bẫy-lớn-nhất). Cùng một công thức được cài hai lần, hai ngôn ngữ. `config.ts` là điểm duy nhất khai báo tham số, nên hai bản cài không thể lệch tham số — chỉ có thể lệch công thức, và đó là thứ test đối chiếu bắt được.

---

## File và trách nhiệm

### `config.ts` — nguồn sự thật duy nhất

Mọi hằng số có ý nghĩa vật lý hoặc thị giác sống ở đây. Không ngoại lệ.

```ts
export const PARTICLE = {
  gridSizes: [256, 384, 512] as const,
  defaultGrid: 256,
} as const;

export const DEPTH = {
  scaleMin: 0,
  scaleMax: 2,
  scaleDefault: 0.6,
} as const;

export const EDGE = {
  // ngưỡng gradient depth để loại hạt ở vách vật thể
  lo: 0.02,
  hi: 0.12,
} as const;

export const NOISE = {
  octaves: 4,
  frequency: 1.5,
  amplitude: 0.03,
  rotation: 0.5,   // góc xoay domain mỗi octave (radian)
} as const;

export const QUANT = {
  // 16-bit unsigned: 0..65535. KHÔNG phải 65536.
  positionMax: 65535,
} as const;
```

**Luật:** TypeScript import trực tiếp từ đây. GLSL nhận qua uniform, không hardcode. Nếu bạn thấy một con số trong `.glsl` hay trong `build.ts` mà không phải `0.0`, `0.5`, `1.0`, `2.0` — hãy nghi ngờ.

### `types.ts` — hợp đồng giữa các module

Đây là từ vựng chung. Các module nói chuyện với nhau qua những kiểu này, do `app` làm trung gian truyền.

```ts
/** Output của src/depth. Một kênh, 8-bit. */
export type DepthMap = {
  data: Uint8Array;      // width * height, 1 kênh
  width: number;
  height: number;
  kind: DepthKind;       // quyết định phép chiếu nào khả dụng
  focalLengthPx?: number; // chỉ có ở model metric
  modelId: string;       // ghi vào JSON để truy nguyên
};

/** Model relative trả disparity không đơn vị; metric trả mét thật. */
export type DepthKind = "relative" | "metric";

/** relief: phù điêu trên mặt phẳng. perspective: unprojection thật. */
export type Projection = "relief" | "perspective";

/** Output của src/pointcloud, trước khi serialize. */
export type PointCloud = {
  count: number;                  // SAU khi edge rejection, nhỏ hơn grid²
  grid: readonly [number, number];
  bounds: { min: Vec3; max: Vec3 };
  projection: Projection;
  positions: Uint16Array;         // count * 3, quantized theo bounds
  colors: Uint8Array;             // count * 3
  density: Uint8Array;            // count, = alpha từ edge rejection
};

export type Vec3 = readonly [number, number, number];
```

Vì sao `PointCloud.positions` là `Uint16Array` chứ không `Float32Array`: depth nguồn chỉ có 8-bit. Lưu float 32-bit là tự huyễn hoặc về độ chính xác, và làm file JSON to gấp rưỡi. Chi tiết ở [pointcloud.md](pointcloud.md#vì-sao-uint16).

### `math.ts` — toán thuần, có cặp song sinh trong GLSL

Mỗi hàm ở đây có một bản GLSL tương ứng. Comment phải trỏ sang nhau.

```ts
/** Cặp song sinh: shaders/lib/noise.glsl → smoothstep() (GLSL built-in) */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/** Quantize về uint16 theo bounds. Cặp song sinh: không có — chỉ dùng khi export. */
export function quantize(v: number, lo: number, hi: number): number {
  return Math.round(((v - lo) / (hi - lo)) * QUANT.positionMax) & 0xffff;
}
```

---

## Hợp đồng vào/ra

Module này **không có** hợp đồng runtime. Nó không nhận input, không tạo side effect, không giữ state. Nó chỉ export hằng số, kiểu và pure function.

Đó là điều làm nó an toàn để mọi module khác phụ thuộc vào.

---

## Ràng buộc Toolcraft áp lên module này

| Ràng buộc | Cách tuân thủ |
|---|---|
| Đồ thị phụ thuộc phi chu trình | Tầng đáy, không import gì của ta — vô điều kiện thoả |
| Không import test từ production | `math.test.ts` cạnh `math.ts` nhưng chỉ đi một chiều |
| State sản phẩm thuộc runtime schema | `config.ts` chứa **giá trị mặc định và biên**, không chứa giá trị hiện tại. Giá trị hiện tại nằm trong schema state. |

Điểm thứ ba dễ hiểu sai. `config.ts` không phải nơi lưu "depthScale user đang chọn" — đó là schema state. Nó lưu "depthScale mặc định là 0.6, biên 0..2", tức là thông tin để **khai báo** control.

---

## Cạm bẫy

**`65535` chứ không `65536`.** Giá trị lớn nhất của uint16 là 65535. Lưới 256×256 cho ra đúng 65536 hạt. Hai con số gần nhau và cùng xuất hiện trong dự án — bài Codrops gốc đã nhầm chỗ này (chia cho `uParticleCount` thay vì `65535`). Đó là lý do `QUANT.positionMax` có comment.

**Đừng để `shared` phình ra.** Cám dỗ lớn nhất là dồn mọi thứ "dùng chung" vào đây. Tiêu chuẩn kết nạp: *ít nhất hai module tầng 2 cần nó, và nó không có state, không có side effect.* Một helper chỉ `depth` dùng thì thuộc `depth`, dù nghe có vẻ chung.

**Thêm import vào `shared` là dấu hiệu thiết kế sai.** Nếu `shared` cần import từ `depth`, nghĩa là thứ bạn đặt vào `shared` thực ra thuộc `depth`.

---

## Cách kiểm chứng

```bash
npx vitest run src/shared
```

Test cho `math.ts` phải cover:

- `smoothstep` ở biên: `x <= edge0` → 0, `x >= edge1` → 1
- `quantize(lo)` → 0 và `quantize(hi)` → 65535 chính xác (không phải 65534 hay tràn)
- round-trip: `dequantize(quantize(v))` sai số dưới một bước lượng tử

Và một test cấu trúc rẻ nhưng đáng giá: grep đảm bảo không file nào trong `src/shared` import từ `src/depth`, `src/pointcloud`, `src/scene`.

---

## Đọc thêm

- [02-data-flow.md](../02-data-flow.md) — vì sao hai đường song song cần `config.ts`
- [STRUCTURE.md](../../../STRUCTURE.md#quy-tắc-phụ-thuộc) — luật 4 tầng
- [pointcloud.md](pointcloud.md) — người dùng `math.ts` và `QUANT` nhiều nhất
