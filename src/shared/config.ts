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
  /**
   * Tính bằng pixel ở khoảng cách camera chuẩn.
   *
   * Mặc định 6 chứ không phải 3: với lưới 512 trải trên ~700px, khoảng cách
   * giữa hai hạt là ~1.4px. Hạt NHỎ HƠN khoảng cách đó thì mắt đọc ra **lưới
   * điểm**; hạt LỚN HƠN thì chúng chồng lên nhau thành mảng màu như nét cọ.
   * Đây là khác biệt thị giác lớn nhất giữa "render kỹ thuật" và "hình ảnh".
   */
  pointSizeMin: 0.5,
  pointSizeMax: 40,
  pointSizeDefault: 6,
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
 * Tham số chuyển động.
 *
 * Tách fBM và curl thành hai nhóm riêng vì chúng làm hai việc khác nhau: fBM
 * đẩy hạt ra/vào theo trục z (địa hình gợn sóng), curl xoáy hạt trong mặt phẳng
 * xy (dòng chảy). Gộp chung một "amplitude" thì không chỉnh riêng được.
 *
 * Mọi giá trị ở đây chỉ là MẶC ĐỊNH — chúng là slider trong panel, vì giá trị
 * đẹp phụ thuộc từng ảnh và không có con số cố định nào đúng.
 *
 * Cặp song sinh: src/scene/shaders/lib/noise.glsl
 */
export const FBM = {
  /** Số octave. Shader cap cứng ở 6 vì GLSL cần vòng lặp có biên hằng số. */
  octaves: 4,
  amplitudeMin: 0,
  amplitudeMax: 3,
  amplitudeDefault: 0.35,
  frequencyMin: 0.1,
  frequencyMax: 4,
  frequencyDefault: 0.9,
  speedMin: 0,
  speedMax: 3,
  speedDefault: 0.6,
  /** Bước central difference khi lấy gradient cho curl noise. */
  epsilon: 0.01,
} as const;

export const CURL = {
  strengthMin: 0,
  strengthMax: 1,
  strengthDefault: 0.15,
} as const;

/**
 * Phình/co theo chu kỳ. Mỗi hạt lệch pha một chút nên đám hạt "thở" thay vì
 * phóng to thu nhỏ cứng nhắc như một phép zoom.
 */
export const BREATHING = {
  amplitudeMin: 0,
  amplitudeMax: 0.5,
  amplitudeDefault: 0.06,
  speedMin: 0,
  speedMax: 3,
  speedDefault: 0.5,
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
