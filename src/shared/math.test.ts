import { describe, expect, it } from "vitest";

import { QUANT } from "./config";
import {
  clamp,
  dequantize,
  quantize,
  remap,
  sampleClamped,
  smoothstep,
} from "./math";

describe("smoothstep", () => {
  it("kẹp ở hai biên", () => {
    expect(smoothstep(0.2, 0.8, 0.1)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.2)).toBe(0);
    expect(smoothstep(0.2, 0.8, 0.8)).toBe(1);
    expect(smoothstep(0.2, 0.8, 0.9)).toBe(1);
  });

  it("cho 0.5 ở chính giữa", () => {
    expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 10);
  });

  it("khớp công thức Hermite của GLSL", () => {
    // Nếu ai đó thay bằng easing khác, test này bắt được.
    for (const x of [0.1, 0.25, 0.4, 0.6, 0.75, 0.9]) {
      expect(smoothstep(0, 1, x)).toBeCloseTo(x * x * (3 - 2 * x), 10);
    }
  });

  it("không chia cho 0 khi hai biên trùng nhau", () => {
    expect(smoothstep(0.5, 0.5, 0.4)).toBe(0);
    expect(smoothstep(0.5, 0.5, 0.6)).toBe(1);
  });
});

describe("quantize", () => {
  it("biên dưới thành 0 và biên trên thành 65535 chính xác", () => {
    // Đây là test chống lỗi off-by-one 65535/65536 mà bài Codrops gốc mắc phải.
    expect(quantize(-2, -2, 2)).toBe(0);
    expect(quantize(2, -2, 2)).toBe(QUANT.positionMax);
    expect(QUANT.positionMax).toBe(65535);
  });

  it("không vượt biên uint16", () => {
    expect(quantize(999, -1, 1)).toBeLessThanOrEqual(65535);
    expect(quantize(-999, -1, 1)).toBeGreaterThanOrEqual(0);
  });

  it("round-trip sai số dưới một bước lượng tử", () => {
    const lo = -1.7778;
    const hi = 1.7778;
    const step = (hi - lo) / QUANT.positionMax;
    for (const value of [-1.7778, -0.9, -0.0001, 0, 0.3333, 1.5, 1.7778]) {
      const back = dequantize(quantize(value, lo, hi), lo, hi);
      expect(Math.abs(back - value)).toBeLessThanOrEqual(step);
    }
  });

  it("đơn điệu tăng", () => {
    let previous = -1;
    for (let i = 0; i <= 100; i++) {
      const current = quantize(i / 100, 0, 1);
      expect(current).toBeGreaterThanOrEqual(previous);
      previous = current;
    }
  });
});

describe("remap", () => {
  it("đổi khoảng đúng", () => {
    expect(remap(0.5, 0, 1, -1, 1)).toBeCloseTo(0, 10);
    expect(remap(0, 0, 1, 10, 20)).toBe(10);
    expect(remap(1, 0, 1, 10, 20)).toBe(20);
  });

  it("không kẹp biên", () => {
    expect(remap(2, 0, 1, 0, 10)).toBe(20);
  });
});

describe("sampleClamped", () => {
  const width = 3;
  const height = 2;
  // 0 1 2
  // 3 4 5
  const data = new Uint8Array([0, 51, 102, 153, 204, 255]);

  it("đọc đúng pixel trong biên", () => {
    expect(sampleClamped(data, width, height, 0, 0)).toBeCloseTo(0, 5);
    expect(sampleClamped(data, width, height, 2, 1)).toBeCloseTo(1, 5);
  });

  it("kẹp biên chứ không wrap", () => {
    // Wrap sẽ trả về pixel ở mép đối diện và tạo gradient giả.
    expect(sampleClamped(data, width, height, -5, 0)).toBe(
      sampleClamped(data, width, height, 0, 0),
    );
    expect(sampleClamped(data, width, height, 99, 1)).toBe(
      sampleClamped(data, width, height, 2, 1),
    );
  });
});

describe("clamp", () => {
  it("kẹp hai đầu", () => {
    expect(clamp(-1, 0, 1)).toBe(0);
    expect(clamp(2, 0, 1)).toBe(1);
    expect(clamp(0.5, 0, 1)).toBe(0.5);
  });
});
