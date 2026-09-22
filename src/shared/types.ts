/**
 * Hợp đồng dữ liệu giữa các module.
 *
 * Toolcraft từ chối đồ thị import có chu trình. Các kiểu ở đây cho phép
 * src/depth, src/pointcloud và src/scene cùng nhìn xuống tầng shared thay vì
 * nhìn ngang nhau: `depth` sinh ra DepthMap, `app` chuyển nó sang `pointcloud`
 * và `scene`, và không module tầng 2 nào import module tầng 2 khác.
 *
 * Xem STRUCTURE.md mục "Quy tắc phụ thuộc".
 */

export type Vec3 = readonly [number, number, number];

/**
 * Loại depth model trả về.
 *
 * - `relative`: disparity không đơn vị, chuẩn hoá riêng từng ảnh, giá trị lớn =
 *   gần camera. DA2, DA3, MiDaS. Chỉ dựng được phép chiếu `relief`.
 * - `metric`: mét thật, kèm focal length. DepthPro, Metric3D. Dựng được cả
 *   `perspective` (unprojection đúng hình học).
 */
export type DepthKind = "relative" | "metric";

/**
 * Phép chiếu dựng point cloud.
 *
 * - `relief`: phù điêu trên mặt phẳng. `z = (d - 0.5) * depthScale`. Hình học
 *   không đúng (quay camera sẽ méo) nhưng là lựa chọn duy nhất với model
 *   relative, và hợp lệ cho mục đích nghệ thuật.
 * - `perspective`: unprojection thật bằng focal length. Cần model metric.
 */
export type Projection = "relief" | "perspective";

/** Một model trong registry của src/depth. */
export type DepthModel = {
  /** Repo id trên Hugging Face, cũng là khoá cache. */
  readonly id: string;
  readonly label: string;
  readonly badge: "default" | "experimental" | "quality" | "metric";
  readonly dtype: "fp32" | "fp16" | "q8" | "q4";
  /** Dung lượng xấp xỉ, dùng để cảnh báo trước khi tải trên mạng/máy yếu. */
  readonly sizeMB: number;
  readonly kind: DepthKind;
  /** Cạnh ảnh model nhận sau khi resize. Chỉ để hiển thị và ước lượng chi phí. */
  readonly inputSize: number;
  /** true nếu file nằm trong public/models/ thay vì tải từ HF CDN. */
  readonly selfHosted?: boolean;
};

/**
 * Output của src/depth — đầu vào cho src/scene và src/pointcloud.
 *
 * `data` là một kênh 8-bit: 0 = xa, 255 = gần. Độ phân giải có thể khác ảnh gốc
 * (model resize về inputSize rồi transformers.js trả về theo kích thước ảnh
 * vào), nên luôn đọc width/height ở đây chứ đừng giả định theo ảnh.
 */
export type DepthMap = {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly kind: DepthKind;
  /** Chỉ có ở model metric. Thiếu nó thì `perspective` không dựng được. */
  readonly focalLengthPx?: number;
  /** Ghi vào file export để truy nguyên dữ liệu được sinh bởi model nào. */
  readonly modelId: string;
};

/** Bảng màu cho preview depth 2D. Ảnh xám rất khó đọc gradient bằng mắt. */
export type Colormap = "grayscale" | "turbo" | "inferno";

/**
 * Output của src/pointcloud, trước khi serialize.
 *
 * `positions` là Uint16Array chứ không Float32Array vì depth nguồn chỉ có
 * 8-bit (256 mức) — lưu float 32-bit là tự huyễn hoặc về độ chính xác và làm
 * file to gấp rưỡi. Giải mã: world = min + (v / 65535) * (max - min).
 */
export type PointCloud = {
  /** SAU edge rejection, nên luôn nhỏ hơn gridSize². Đừng suy ra từ `grid`. */
  readonly count: number;
  readonly grid: readonly [number, number];
  readonly bounds: { readonly min: Vec3; readonly max: Vec3 };
  readonly projection: Projection;
  /** count * 3, quantized theo `bounds`. */
  readonly positions: Uint16Array;
  /** count * 3, sRGB 0..255. */
  readonly colors: Uint8Array;
  /** count, = alpha từ edge rejection. */
  readonly density: Uint8Array;
};

/** Tiến độ dài hạn (tải model, inference, build) báo về UI. */
export type ProgressReport = {
  readonly phase: "downloading" | "loading" | "running" | "building";
  /** 0..1, hoặc undefined khi không xác định được tiến độ. */
  readonly ratio?: number;
  readonly detail?: string;
};
