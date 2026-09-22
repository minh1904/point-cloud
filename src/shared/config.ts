/**
 * NGUỒN SỰ THẬT DUY NHẤT cho mọi tham số có ý nghĩa vật lý hoặc thị giác.
 *
 * Vì sao file này tồn tại: cùng một phép biến đổi được cài hai lần — một lần
 * bằng GLSL (đường render) và một lần bằng TypeScript (đường export). Nếu hai
 * bản lệch tham số, người dùng thấy hạt đẹp trên màn hình nhưng file xuất ra
 * lại khác — bug im lặng, phát hiện rất muộn.
 *
 * Luật: TypeScript import trực tiếp từ đây. GLSL nhận qua uniform, KHÔNG
 * hardcode. Nếu thấy một con số trong .glsl hoặc trong build.ts mà không phải
 * 0.0 / 0.5 / 1.0 / 2.0 thì hãy nghi ngờ.
 *
 * Xem docs/learn/02-data-flow.md mục "Hai đường song song".
 */

/** Lưới lấy mẫu. gridSize² là số hạt tối đa (trước edge rejection). */
export const PARTICLE = {
  gridSizes: [256, 384, 512],
  defaultGrid: 256,
  /** Tính bằng pixel ở khoảng cách camera chuẩn. */
  pointSizeMin: 0.5,
  pointSizeMax: 12,
  pointSizeDefault: 3,
} as const;

/** Độ dày phù điêu ở chế độ relief. Không có đơn vị — depth là tương đối. */
export const DEPTH = {
  scaleMin: 0,
  scaleMax: 2,
  scaleDefault: 0.6,
} as const;

/**
 * Ngưỡng gradient depth để loại hạt ở vách vật thể.
 *
 * Depth đơn ảnh không có mặt sau, nên ở mép vật thể depth nhảy đột ngột và hạt
 * bị kéo thành "màng" nối vật thể với hậu cảnh. Đây là fix BẮT BUỘC.
 *
 * Cặp song sinh: src/scene/shaders/particles.vert.glsl (uniform uEdgeLo/uEdgeHi)
 *                src/pointcloud/build.ts
 */
export const EDGE = {
  /** Dưới ngưỡng này: hạt hoàn toàn rõ (alpha = 1). */
  lo: 0.02,
  /** Trên ngưỡng này: loại hẳn hạt. Giữa lo và hi: mờ dần theo smoothstep. */
  hi: 0.12,
} as const;

/**
 * Tham số fBM + curl noise.
 *
 * Cặp song sinh: src/scene/shaders/lib/noise.glsl
 */
export const NOISE = {
  /** Số octave của fBM. Shader cap cứng ở 6 vì GLSL cần vòng lặp có biên. */
  octaves: 4,
  /** Tần số lấy mẫu noise theo toạ độ world. */
  frequency: 1.5,
  /** Biên độ dịch chuyển hạt. */
  amplitude: 0.03,
  /** Góc xoay domain mỗi octave (radian) — phá artifact axis-aligned. */
  rotation: 0.5,
  /** Tốc độ trôi của trường noise theo thời gian. */
  timeScale: 0.1,
  /** Bước central difference khi lấy gradient cho curl noise. */
  epsilon: 0.01,
} as const;

/** Lượng tử hoá vị trí khi export. */
export const QUANT = {
  /**
   * Giá trị lớn nhất của uint16 là 65535 — KHÔNG phải 65536.
   *
   * Lưới 256×256 cho đúng 65536 hạt, nên hai con số này trùng nhau một cách
   * tình cờ. Bài Codrops gốc nhầm chỗ này (chia cho uParticleCount thay vì
   * 65535) và đó là bug chờ nổ khi đổi kích thước lưới.
   */
  positionMax: 65535,
} as const;
