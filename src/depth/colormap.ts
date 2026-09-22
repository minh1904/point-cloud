/**
 * Tô màu depth map để xem bằng mắt.
 *
 * Depth map thô là ảnh xám, và mắt người đọc gradient xám rất kém — hai vùng
 * chênh nhau 10 mức xám nhìn như nhau. Turbo và Inferno làm sự khác biệt depth
 * hiện rõ, nên dễ phát hiện model đoán sai hoặc depth bị phẳng.
 *
 * Thuần và đồng bộ: nhận 1 kênh, trả RGBA để src/scene upload làm texture.
 */

import { clamp } from "@/shared/math";
import type { Colormap } from "@/shared/types";

type Rgb = readonly [number, number, number];

/**
 * Các mốc màu, nội suy tuyến tính giữa chúng.
 *
 * Turbo (Google) và Inferno (matplotlib) đều là bảng perceptually-uniform: bước
 * màu đều nhau tương ứng bước giá trị đều nhau. Dùng bảng rút gọn 8 mốc thay vì
 * đa thức đầy đủ — đủ chính xác cho preview và đọc được bằng mắt thường.
 */
const STOPS: Record<Exclude<Colormap, "grayscale">, readonly Rgb[]> = {
  turbo: [
    [48, 18, 59],
    [70, 107, 227],
    [42, 176, 244],
    [33, 224, 176],
    [134, 252, 91],
    [237, 224, 53],
    [251, 129, 26],
    [196, 34, 3],
  ],
  inferno: [
    [0, 0, 4],
    [31, 12, 72],
    [85, 15, 109],
    [136, 34, 106],
    [186, 54, 85],
    [227, 89, 51],
    [249, 142, 9],
    [252, 255, 164],
  ],
};

/** Tra một giá trị 0..1 thành RGB theo bảng màu. */
export function sampleColormap(map: Colormap, t: number): Rgb {
  const value = clamp(t, 0, 1);
  if (map === "grayscale") {
    const level = Math.round(value * 255);
    return [level, level, level];
  }

  const stops = STOPS[map];
  const scaled = value * (stops.length - 1);
  const index = Math.min(Math.floor(scaled), stops.length - 2);
  const frac = scaled - index;
  const from = stops[index];
  const to = stops[index + 1];

  return [
    Math.round(from[0] + (to[0] - from[0]) * frac),
    Math.round(from[1] + (to[1] - from[1]) * frac),
    Math.round(from[2] + (to[2] - from[2]) * frac),
  ];
}

/**
 * Chuyển depth map 1 kênh thành RGBA để upload làm texture preview.
 *
 * Alpha luôn 255: depth map là ảnh đặc, phần trong suốt không có nghĩa ở đây.
 */
export function depthToRgba(
  depth: Uint8Array,
  map: Colormap,
): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(new ArrayBuffer(depth.length * 4));

  // Bảng tra 256 phần tử: rẻ hơn gọi sampleColormap cho từng pixel khi ảnh lớn
  // (một ảnh 1024×1024 là hơn một triệu lần gọi).
  const lut = new Uint8Array(256 * 3);
  for (let level = 0; level < 256; level++) {
    const [r, g, b] = sampleColormap(map, level / 255);
    lut[level * 3] = r;
    lut[level * 3 + 1] = g;
    lut[level * 3 + 2] = b;
  }

  for (let i = 0; i < depth.length; i++) {
    const offset = depth[i] * 3;
    const target = i * 4;
    rgba[target] = lut[offset];
    rgba[target + 1] = lut[offset + 1];
    rgba[target + 2] = lut[offset + 2];
    rgba[target + 3] = 255;
  }

  return rgba;
}
