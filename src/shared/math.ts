/**
 * Toán học thuần dùng chung. Mỗi hàm ở đây có một cặp song sinh trong GLSL;
 * comment ghi rõ ở đâu. Khi sửa một bên, phải sửa bên kia.
 *
 * Xem docs/learn/02-data-flow.md mục "Hai đường song song".
 */

import { QUANT } from "./config";

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * Nội suy mượt giữa hai biên, đạo hàm bằng 0 ở hai đầu.
 *
 * Cặp song sinh: GLSL `smoothstep()` (built-in). Cài đặt phải khớp đúng công
 * thức Hermite `t² (3 - 2t)` mà GLSL dùng, không phải một easing khác.
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Đưa `value` từ khoảng [inMin, inMax] về [outMin, outMax], không kẹp biên. */
export function remap(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  if (inMin === inMax) return outMin;
  return outMin + ((value - inMin) / (inMax - inMin)) * (outMax - outMin);
}

/**
 * Lượng tử hoá một giá trị world-space về uint16 theo biên [lo, hi].
 *
 * Chia cho QUANT.positionMax = 65535 (max của uint16), KHÔNG phải 65536.
 * Xem comment trong config.ts để biết vì sao chỗ này dễ nhầm.
 */
export function quantize(value: number, lo: number, hi: number): number {
  if (lo === hi) return 0;
  const normalized = clamp((value - lo) / (hi - lo), 0, 1);
  return Math.round(normalized * QUANT.positionMax);
}

/** Nghịch đảo của `quantize`. Dùng khi đọc lại file đã export. */
export function dequantize(quantized: number, lo: number, hi: number): number {
  return lo + (quantized / QUANT.positionMax) * (hi - lo);
}

/**
 * Lấy mẫu một ảnh 1 kênh với toạ độ bị kẹp vào biên.
 *
 * Kẹp biên (clamp) chứ không wrap: ở mép ảnh, central difference cần đọc ngoài
 * biên, và wrap sẽ tạo ra gradient giả nối mép trái với mép phải.
 *
 * Cặp song sinh: GLSL dùng `THREE.ClampToEdgeWrapping` trên texture depth để
 * có cùng hành vi này.
 */
export function sampleClamped(
  data: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const sx = clamp(x, 0, width - 1) | 0;
  const sy = clamp(y, 0, height - 1) | 0;
  return data[sy * width + sx] / 255;
}
