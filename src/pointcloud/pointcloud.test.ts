import { describe, expect, it } from "vitest";

import { QUANT } from "@/shared/config";
import type { DepthMap } from "@/shared/types";

import { buildPointCloud, dequantizePosition } from "./build";
import { serializeToBlob } from "./serialize";

/** Depth map phẳng: mọi pixel cùng giá trị. */
function flatDepth(value: number, size = 16): DepthMap {
  return {
    data: new Uint8Array(size * size).fill(value),
    width: size,
    height: size,
    kind: "relative",
    modelId: "test/flat",
  };
}

/**
 * Gradient ngang thoải: trái tối, phải sáng.
 *
 * Độ dốc phải đủ nhỏ để KHÔNG kích hoạt edge rejection — một gradient 0→255
 * trên 16px cho bước ~17 mức/pixel, tức dx ≈ 0.13 > EDGE.hi, và gần như mọi
 * hạt bị loại. Đây là hành vi đúng của thuật toán, nhưng làm hỏng ý đồ test.
 */
function gradientDepth(size = 64): DepthMap {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = Math.round((x / (size - 1)) * 120);
    }
  }
  return { data, width: size, height: size, kind: "relative", modelId: "test/grad" };
}

/** Vách dựng đứng ở giữa: nửa trái 0, nửa phải 255. */
function cliffDepth(size = 16): DepthMap {
  const data = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      data[y * size + x] = x < size / 2 ? 0 : 255;
    }
  }
  return { data, width: size, height: size, kind: "relative", modelId: "test/cliff" };
}

function pixels(width = 16, height = 16) {
  const data = new Uint8ClampedArray(new ArrayBuffer(width * height * 4));
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = 10;
    data[i * 4 + 1] = 20;
    data[i * 4 + 2] = 30;
    data[i * 4 + 3] = 255;
  }
  return { data, width, height };
}

const base = {
  pixels: pixels(),
  grid: 8,
  depthScale: 0.6,
  projection: "relief" as const,
};

describe("buildPointCloud — hình học", () => {
  it("depth phẳng cho mọi z bằng nhau", () => {
    const cloud = buildPointCloud({ ...base, depth: flatDepth(128) });
    expect(cloud.count).toBe(64);

    const zs = new Set<number>();
    for (let i = 0; i < cloud.count; i++) zs.add(cloud.positions[i * 3 + 2]);
    expect(zs.size).toBe(1);
  });

  it("gradient ngang cho z đơn điệu theo trục x", () => {
    // Bắt được lỗi lệch trục hoặc lấy mẫu sai chiều.
    const grid = 8;
    const cloud = buildPointCloud({ ...base, depth: gradientDepth(), grid });
    expect(cloud.count).toBe(grid * grid);

    // Hàng đầu của lưới là grid phần tử đầu tiên khi không có hạt nào bị loại.
    for (let i = 1; i < grid; i++) {
      expect(dequantizePosition(cloud, i)[2]).toBeGreaterThan(
        dequantizePosition(cloud, i - 1)[2],
      );
    }
  });

  it("lật y: hàng đầu của lưới nằm TRÊN hàng cuối", () => {
    const cloud = buildPointCloud({ ...base, depth: flatDepth(128), grid: 4 });
    const first = dequantizePosition(cloud, 0);
    const last = dequantizePosition(cloud, cloud.count - 1);
    expect(first[1]).toBeGreaterThan(last[1]);
  });

  it("aspect phi vuông làm giãn x chứ không giãn y", () => {
    // Lấy mẫu ở TÂM ô nên x không bao giờ chạm đúng ±aspect: với lưới 4, u lớn
    // nhất là 0.875 → x = 1.5 chứ không phải 2. Bất biến thật sự là TỈ LỆ giữa
    // hai trục phải bằng aspect của ảnh.
    const cloud = buildPointCloud({
      ...base,
      pixels: pixels(32, 16),
      depth: flatDepth(128),
      grid: 4,
    });
    const spanX = cloud.bounds.max[0] - cloud.bounds.min[0];
    const spanY = cloud.bounds.max[1] - cloud.bounds.min[1];
    expect(spanX / spanY).toBeCloseTo(2, 5);
  });

  it("lấy mẫu ở tâm ô, không chạm mép", () => {
    const grid = 4;
    const cloud = buildPointCloud({
      ...base,
      depth: flatDepth(128),
      grid,
    });
    // u lớn nhất = (grid - 0.5) / grid = 0.875 → x = (0.875 - 0.5) * 2 = 0.75
    expect(cloud.bounds.max[0]).toBeCloseTo(0.75, 6);
    expect(cloud.bounds.min[0]).toBeCloseTo(-0.75, 6);
  });
});

describe("buildPointCloud — edge rejection", () => {
  it("vách depth làm count nhỏ hơn grid²", () => {
    const cloud = buildPointCloud({ ...base, depth: cliffDepth(), grid: 16 });
    expect(cloud.count).toBeGreaterThan(0);
    expect(cloud.count).toBeLessThan(16 * 16);
  });

  it("depth phẳng không loại hạt nào", () => {
    const cloud = buildPointCloud({ ...base, depth: flatDepth(200), grid: 16 });
    expect(cloud.count).toBe(16 * 16);
  });

  it("density = 255 khi không có gradient", () => {
    const cloud = buildPointCloud({ ...base, depth: flatDepth(200), grid: 4 });
    for (let i = 0; i < cloud.count; i++) expect(cloud.density[i]).toBe(255);
  });
});

describe("buildPointCloud — lượng tử hoá", () => {
  it("biên bounds ánh xạ đúng về 0 và 65535", () => {
    // Test chống lỗi off-by-one 65535/65536 mà bài Codrops gốc mắc phải.
    const cloud = buildPointCloud({ ...base, depth: gradientDepth(), grid: 8 });
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < cloud.count; i++) {
      const q = cloud.positions[i * 3];
      if (q < min) min = q;
      if (q > max) max = q;
    }
    expect(min).toBe(0);
    expect(max).toBe(QUANT.positionMax);
  });

  it("round-trip sai số dưới một bước lượng tử", () => {
    const cloud = buildPointCloud({ ...base, depth: gradientDepth(), grid: 8 });
    const { min, max } = cloud.bounds;
    for (let axis = 0; axis < 3; axis++) {
      const step = (max[axis] - min[axis]) / QUANT.positionMax;
      for (let i = 0; i < cloud.count; i += 7) {
        const value = dequantizePosition(cloud, i)[axis];
        expect(value).toBeGreaterThanOrEqual(min[axis] - step);
        expect(value).toBeLessThanOrEqual(max[axis] + step);
      }
    }
  });

  it("trục phẳng không làm chia cho 0", () => {
    // depthScale = 0 nghĩa là mọi z bằng nhau → span bằng 0.
    const cloud = buildPointCloud({
      ...base,
      depth: flatDepth(128),
      depthScale: 0,
      grid: 4,
    });
    for (let i = 0; i < cloud.count; i++) {
      expect(Number.isFinite(dequantizePosition(cloud, i)[2])).toBe(true);
    }
  });
});

describe("buildPointCloud — biên và lỗi", () => {
  it("lưới 1×1 chạy được", () => {
    const cloud = buildPointCloud({ ...base, depth: flatDepth(128), grid: 1 });
    expect(cloud.count).toBe(1);
  });

  it("perspective không có focal length thì throw", () => {
    expect(() =>
      buildPointCloud({
        ...base,
        depth: flatDepth(128),
        projection: "perspective",
      }),
    ).toThrow(/focal/i);
  });

  it("perspective với focal length dựng được hình học đúng", () => {
    const depth: DepthMap = {
      ...flatDepth(128),
      kind: "metric",
      focalLengthPx: 500,
    };
    const cloud = buildPointCloud({
      ...base,
      depth,
      projection: "perspective",
      grid: 4,
    });
    expect(cloud.count).toBe(16);
    expect(cloud.projection).toBe("perspective");
  });

  it("báo tiến độ kết thúc ở 1", () => {
    const seen: number[] = [];
    buildPointCloud({
      ...base,
      depth: flatDepth(128),
      grid: 64,
      onProgress: (ratio) => seen.push(ratio),
    });
    expect(seen.at(-1)).toBe(1);
    expect(seen.every((r) => r >= 0 && r <= 1)).toBe(true);
  });
});

describe("serializeToBlob", () => {
  async function roundTrip(grid: number) {
    const cloud = buildPointCloud({ ...base, depth: gradientDepth(), grid });
    const blob = serializeToBlob(cloud, {
      sourceName: "test.png",
      sourceWidth: 16,
      sourceHeight: 16,
      modelId: "test/model",
      depthScale: 0.6,
      aspect: 1,
    });
    return { cloud, parsed: JSON.parse(await blob.text()) };
  }

  it("JSON hợp lệ và khớp PointCloud gốc", async () => {
    const { cloud, parsed } = await roundTrip(8);
    expect(parsed.format).toBe("pointcloud-json");
    expect(parsed.version).toBe(1);
    expect(parsed.count).toBe(cloud.count);
    expect(parsed.positions).toHaveLength(cloud.count * 3);
    expect(parsed.colors).toHaveLength(cloud.count * 3);
    expect(parsed.density).toHaveLength(cloud.count);
    expect(parsed.projection).toBe("relief");
    expect(parsed.model).toBe("test/model");
  });

  it("mảng khớp từng phần tử", async () => {
    const { cloud, parsed } = await roundTrip(8);
    expect(parsed.positions).toEqual([...cloud.positions]);
    expect(parsed.colors).toEqual([...cloud.colors]);
    expect(parsed.density).toEqual([...cloud.density]);
  });

  it("ghép chunk không làm hỏng dấu phẩy ở lưới lớn", async () => {
    // CHUNK = 8192; lưới 64² cho 4096 hạt × 3 = 12288 phần tử, vượt một chunk.
    const { cloud, parsed } = await roundTrip(64);
    expect(parsed.positions).toHaveLength(cloud.count * 3);
    expect(parsed.positions).toEqual([...cloud.positions]);
  });

  it("chỉ chứa số nguyên, không có float rác", async () => {
    const { parsed } = await roundTrip(8);
    for (const value of parsed.positions as number[]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("giữ bounds để giải mã lại được", async () => {
    const { cloud, parsed } = await roundTrip(8);
    expect(parsed.bounds.min).toEqual([...cloud.bounds.min]);
    expect(parsed.bounds.max).toEqual([...cloud.bounds.max]);
    expect(parsed.params.quantMax).toBe(QUANT.positionMax);
  });
});
