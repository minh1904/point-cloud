/**
 * Sinh texture LUT 3D cho color grading.
 *
 * Định dạng giống demo gốc: một texture 512×512 chứa 64 lát cắt xanh lam, xếp
 * thành lưới 8×8 tile, mỗi tile 64×64 ứng với (đỏ, lục). Đây là bố cục LUT
 * chuẩn của ngành, nên một file `.cube` hay `.png` LUT có sẵn cũng cắm vừa.
 *
 * Sinh bằng code chứ không ship file PNG: bốn preset dưới đây chỉ là vài phép
 * toán trên màu, và giữ chúng ở dạng hàm nghĩa là sửa được, đọc hiểu được, và
 * không thêm asset nhị phân vào repo.
 */

import * as THREE from "three";

export type LutPreset = "neutral" | "warm" | "cool" | "filmic";

export const LUT_PRESETS: readonly LutPreset[] = [
  "neutral",
  "warm",
  "cool",
  "filmic",
];

const SIZE = 64; // số bậc mỗi kênh
const TILES = 8; // 8×8 tile = 64 lát
const TEXTURE_SIZE = SIZE * TILES; // 512

type Rgb = [number, number, number];

/** Đường cong S nhẹ quanh 0.5 — tăng tương phản mà không cắt cụt hai đầu. */
function contrast(value: number, amount: number): number {
  return value + (value - 0.5) * amount * (1 - Math.abs(value - 0.5) * 2) * 2;
}

function grade(preset: LutPreset, r: number, g: number, b: number): Rgb {
  switch (preset) {
    case "neutral":
      return [r, g, b];

    case "warm":
      // Đẩy ấm ở vùng sáng, để vùng tối hơi lạnh — kiểu ánh nắng cuối ngày.
      return [
        contrast(r, 0.15) + 0.06 * r,
        contrast(g, 0.1) + 0.01,
        contrast(b, 0.1) - 0.05 * (1 - b),
      ];

    case "cool":
      return [
        contrast(r, 0.1) - 0.04 * (1 - r),
        contrast(g, 0.1) + 0.01,
        contrast(b, 0.15) + 0.07 * b,
      ];

    case "filmic": {
      // Tương phản mạnh hơn, và giảm bão hoà ở vùng tối để bóng đổ không bị
      // rực màu — đặc trưng của phim nhựa.
      const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const shadow = 1 - Math.min(1, luma * 2);
      const mix = (c: number) => c + (luma - c) * shadow * 0.45;
      return [
        contrast(mix(r), 0.3),
        contrast(mix(g), 0.3),
        contrast(mix(b), 0.3),
      ];
    }
  }
}

function clamp255(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value * 255)));
}

export function createLutTexture(preset: LutPreset): THREE.DataTexture {
  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);

  for (let blue = 0; blue < SIZE; blue++) {
    const tileX = (blue % TILES) * SIZE;
    const tileY = Math.floor(blue / TILES) * SIZE;

    for (let green = 0; green < SIZE; green++) {
      for (let red = 0; red < SIZE; red++) {
        const [r, g, b] = grade(
          preset,
          red / (SIZE - 1),
          green / (SIZE - 1),
          blue / (SIZE - 1),
        );

        const index = ((tileY + green) * TEXTURE_SIZE + (tileX + red)) * 4;
        data[index] = clamp255(r);
        data[index + 1] = clamp255(g);
        data[index + 2] = clamp255(b);
        data[index + 3] = 255;
      }
    }
  }

  const texture = new THREE.DataTexture(
    data,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    THREE.RGBAFormat,
  );
  // LUT là DỮ LIỆU tra cứu, không phải ảnh: sRGB decode sẽ bóp phi tuyến và làm
  // sai toàn bộ phép grading.
  texture.colorSpace = THREE.NoColorSpace;
  // Linear để nội suy giữa các bậc; shader tự lo nội suy giữa hai lát xanh lam.
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}
