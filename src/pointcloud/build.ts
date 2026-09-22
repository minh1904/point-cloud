/**
 * Depth map + pixel ảnh → point cloud đã lượng tử hoá.
 *
 * Đây là nửa CPU của "hai đường song song": cùng một phép biến đổi được cài hai
 * lần, một lần bằng GLSL (đường render) và một lần ở đây (đường export). Nếu
 * lệch nhau, người dùng thấy hạt đẹp trên màn hình nhưng file xuất ra lại khác —
 * bug im lặng, phát hiện rất muộn.
 *
 * Cặp song sinh: `src/scene/shaders/particles.vert.glsl`. Khi sửa một bên phải
 * sửa bên kia. Mọi hằng số đến từ `shared/config.ts` nên chúng không thể lệch
 * tham số — chỉ có thể lệch công thức, và đó là thứ test đối chiếu bắt được.
 *
 * Xuất **trạng thái gốc** (t = 0, chưa cộng curl noise). Noise tái sinh được từ
 * `uTime` nên lưu lại là vô nghĩa; muốn xuất pose đang animate thì phải readback
 * từ GPU, một đường hoàn toàn khác.
 */

import { EDGE, QUANT } from "@/shared/config";
import { clamp, quantize, smoothstep } from "@/shared/math";
import type { DepthMap, PointCloud, Projection, Vec3 } from "@/shared/types";

export type BuildInput = {
  readonly depth: DepthMap;
  /** RGBA của ảnh nguồn. */
  readonly pixels: {
    readonly data: Uint8ClampedArray;
    readonly width: number;
    readonly height: number;
  };
  readonly grid: number;
  readonly depthScale: number;
  readonly projection: Projection;
  /** Gọi với 0..1. Vòng lặp 262k bước nên UI cần biết tiến độ. */
  readonly onProgress?: (ratio: number) => void;
};

/**
 * Lấy mẫu song tuyến tính (bilinear) một ảnh 1 kênh, kẹp biên.
 *
 * Phải là bilinear chứ không phải nearest: texture depth trên GPU dùng
 * `LinearFilter`, và lưới lấy mẫu gần như luôn khác độ phân giải depth map. Dùng
 * nearest ở đây sẽ làm CPU và GPU lệch nhau ở mọi hạt.
 *
 * Kẹp biên (không wrap): central difference ở mép ảnh phải đọc ngoài biên, và
 * wrap sẽ tạo gradient giả nối mép trái với mép phải. Khớp với
 * `ClampToEdgeWrapping`.
 */
function sampleBilinear(
  data: Uint8Array,
  width: number,
  height: number,
  u: number,
  v: number,
): number {
  // GPU đặt tâm texel ở (i + 0.5) / size.
  const x = clamp(u * width - 0.5, 0, width - 1);
  const y = clamp(v * height - 0.5, 0, height - 1);

  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const fx = x - x0;
  const fy = y - y0;

  const p00 = data[y0 * width + x0];
  const p10 = data[y0 * width + x1];
  const p01 = data[y1 * width + x0];
  const p11 = data[y1 * width + x1];

  const top = p00 + (p10 - p00) * fx;
  const bottom = p01 + (p11 - p01) * fx;
  return (top + (bottom - top) * fy) / 255;
}

export function buildPointCloud(input: BuildInput): PointCloud {
  const { depth, pixels, grid, depthScale, projection, onProgress } = input;

  if (projection === "perspective" && depth.focalLengthPx === undefined) {
    throw new Error(
      "Phép chiếu perspective cần focal length. Model relative không cung cấp.",
    );
  }

  const aspect = pixels.width / pixels.height;
  const texelX = 1 / depth.width;
  const texelY = 1 / depth.height;

  const max = grid * grid;
  const positionsRaw = new Float32Array(max * 3);
  const colors = new Uint8Array(max * 3);
  const density = new Uint8Array(max);

  let count = 0;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  const sample = (u: number, v: number) =>
    sampleBilinear(depth.data, depth.width, depth.height, u, v);

  for (let gy = 0; gy < grid; gy++) {
    for (let gx = 0; gx < grid; gx++) {
      // +0.5 = tâm ô. Bỏ đi thì lệch nửa pixel và mất hàng/cột cuối.
      const u = (gx + 0.5) / grid;
      const v = (gy + 0.5) / grid;

      const d = sample(u, v);

      // Edge rejection — khớp particles.vert.glsl.
      const dx = sample(u + texelX, v) - sample(u - texelX, v);
      const dy = sample(u, v + texelY) - sample(u, v - texelY);
      const edge = Math.hypot(dx, dy);
      const alpha = 1 - smoothstep(EDGE.lo, EDGE.hi, edge);
      if (alpha <= 0) continue;

      let x: number;
      let y: number;
      let z: number;

      if (projection === "perspective") {
        // Unprojection thật: hình học đúng, quay camera không méo.
        const focal = depth.focalLengthPx as number;
        const cx = pixels.width / 2;
        const cy = pixels.height / 2;
        z = d;
        x = ((u * pixels.width - cx) * z) / focal;
        y = ((cy - v * pixels.height) * z) / focal;
      } else {
        // Relief: phù điêu trên mặt phẳng. Lật y vì texture v hướng xuống.
        x = (u - 0.5) * 2 * aspect;
        y = (0.5 - v) * 2;
        z = (d - 0.5) * depthScale;
      }

      const i3 = count * 3;
      positionsRaw[i3] = x;
      positionsRaw[i3 + 1] = y;
      positionsRaw[i3 + 2] = z;

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;

      const px =
        (Math.min(pixels.height - 1, Math.floor(v * pixels.height)) *
          pixels.width +
          Math.min(pixels.width - 1, Math.floor(u * pixels.width))) *
        4;
      colors[i3] = pixels.data[px];
      colors[i3 + 1] = pixels.data[px + 1];
      colors[i3 + 2] = pixels.data[px + 2];

      density[count] = Math.round(alpha * 255);
      count++;
    }

    if (onProgress && gy % 32 === 0) onProgress(gy / grid);
  }

  // Point cloud rỗng (mọi hạt bị loại) vẫn phải có bounds hợp lệ.
  if (count === 0) {
    minX = minY = minZ = 0;
    maxX = maxY = maxZ = 0;
  }

  // Bounds phẳng trên một trục (ví dụ relief với depthScale = 0) sẽ làm
  // quantize chia cho 0. Nới ra một khoảng tối thiểu.
  const span = (lo: number, hi: number): readonly [number, number] =>
    hi - lo < 1e-6 ? [lo - 0.5, lo + 0.5] : [lo, hi];

  const [loX, hiX] = span(minX, maxX);
  const [loY, hiY] = span(minY, maxY);
  const [loZ, hiZ] = span(minZ, maxZ);

  const min: Vec3 = [loX, loY, loZ];
  const max_: Vec3 = [hiX, hiY, hiZ];

  const positions = new Uint16Array(count * 3);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    positions[i3] = quantize(positionsRaw[i3], loX, hiX);
    positions[i3 + 1] = quantize(positionsRaw[i3 + 1], loY, hiY);
    positions[i3 + 2] = quantize(positionsRaw[i3 + 2], loZ, hiZ);
  }

  onProgress?.(1);

  return {
    count,
    grid: [grid, grid],
    bounds: { min, max: max_ },
    projection,
    // subarray chứ không slice: tránh copy thêm vài MB khi count gần max.
    positions,
    colors: colors.subarray(0, count * 3),
    density: density.subarray(0, count),
  };
}

/** Giải mã một vị trí đã lượng tử hoá về world space. Dùng khi đọc lại file. */
export function dequantizePosition(
  cloud: PointCloud,
  index: number,
): Vec3 {
  const { min, max } = cloud.bounds;
  const i3 = index * 3;
  return [
    min[0] + (cloud.positions[i3] / QUANT.positionMax) * (max[0] - min[0]),
    min[1] + (cloud.positions[i3 + 1] / QUANT.positionMax) * (max[1] - min[1]),
    min[2] + (cloud.positions[i3 + 2] / QUANT.positionMax) * (max[2] - min[2]),
  ];
}
