import { describe, expect, it } from "vitest";

import { depthToRgba, sampleColormap } from "./colormap";
import {
  availableProjections,
  DEFAULT_DEPTH_MODEL_ID,
  DEPTH_MODELS,
  findDepthModel,
  resolveDepthModel,
} from "./registry";

describe("registry", () => {
  it("không có id trùng nhau", () => {
    const ids = DEPTH_MODELS.map((model) => model.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("id có dạng repo Hugging Face", () => {
    for (const model of DEPTH_MODELS) {
      expect(model.id).toMatch(/^[\w.-]+\/[\w.-]+$/);
    }
  });

  it("có đúng một model mang badge default, và nó đứng đầu", () => {
    const defaults = DEPTH_MODELS.filter((model) => model.badge === "default");
    expect(defaults).toHaveLength(1);
    expect(DEPTH_MODELS[0].badge).toBe("default");
    expect(DEFAULT_DEPTH_MODEL_ID).toBe(defaults[0].id);
  });

  it("model default phải self-host để lần chạy đầu không phụ thuộc HF CDN", () => {
    expect(resolveDepthModel(undefined).selfHosted).toBe(true);
  });

  it("sizeMB và inputSize là số dương hợp lý", () => {
    for (const model of DEPTH_MODELS) {
      expect(model.sizeMB).toBeGreaterThan(0);
      expect(model.inputSize).toBeGreaterThan(0);
      expect(Number.isInteger(model.inputSize)).toBe(true);
    }
  });

  it("resolveDepthModel về default khi id lạ hoặc thiếu", () => {
    // Bảo vệ trường hợp schema state đã persist trỏ tới model bị xoá khỏi registry.
    expect(resolveDepthModel("khong/ton-tai").id).toBe(DEFAULT_DEPTH_MODEL_ID);
    expect(resolveDepthModel(undefined).id).toBe(DEFAULT_DEPTH_MODEL_ID);
    expect(resolveDepthModel(DEPTH_MODELS[1].id).id).toBe(DEPTH_MODELS[1].id);
  });

  it("findDepthModel trả undefined cho id lạ", () => {
    expect(findDepthModel("khong/ton-tai")).toBeUndefined();
  });

  it("model relative chỉ cho relief; metric cho cả perspective", () => {
    for (const model of DEPTH_MODELS) {
      const projections = availableProjections(model);
      expect(projections).toContain("relief");
      if (model.kind === "relative") {
        expect(projections).toEqual(["relief"]);
      } else {
        expect(projections).toContain("perspective");
      }
    }
  });
});

describe("colormap", () => {
  it("grayscale tuyến tính", () => {
    expect(sampleColormap("grayscale", 0)).toEqual([0, 0, 0]);
    expect(sampleColormap("grayscale", 1)).toEqual([255, 255, 255]);
    expect(sampleColormap("grayscale", 0.5)).toEqual([128, 128, 128]);
  });

  it("kẹp giá trị ngoài 0..1", () => {
    expect(sampleColormap("turbo", -1)).toEqual(sampleColormap("turbo", 0));
    expect(sampleColormap("turbo", 2)).toEqual(sampleColormap("turbo", 1));
  });

  it("mọi kênh nằm trong 0..255 và là số nguyên", () => {
    for (const map of ["grayscale", "turbo", "inferno"] as const) {
      for (let i = 0; i <= 20; i++) {
        for (const channel of sampleColormap(map, i / 20)) {
          expect(Number.isInteger(channel)).toBe(true);
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("turbo và inferno đi từ tối sang sáng", () => {
    const luma = ([r, g, b]: readonly [number, number, number]) =>
      0.2126 * r + 0.7152 * g + 0.0722 * b;
    for (const map of ["turbo", "inferno"] as const) {
      expect(luma(sampleColormap(map, 1))).toBeGreaterThan(
        luma(sampleColormap(map, 0)),
      );
    }
  });

  it("depthToRgba trả đủ 4 kênh, alpha đặc", () => {
    const depth = new Uint8Array([0, 128, 255]);
    const rgba = depthToRgba(depth, "grayscale");
    expect(rgba).toHaveLength(12);
    expect(rgba[3]).toBe(255);
    expect(rgba[7]).toBe(255);
    expect(rgba[11]).toBe(255);
    expect([rgba[0], rgba[1], rgba[2]]).toEqual([0, 0, 0]);
    expect([rgba[8], rgba[9], rgba[10]]).toEqual([255, 255, 255]);
  });

  it("depthToRgba khớp sampleColormap từng pixel", () => {
    // Bảng tra 256 phần tử là tối ưu hiệu năng — test này đảm bảo nó không lệch
    // khỏi hàm gốc.
    const depth = new Uint8Array([0, 37, 91, 128, 200, 255]);
    const rgba = depthToRgba(depth, "inferno");
    depth.forEach((level, index) => {
      const expected = sampleColormap("inferno", level / 255);
      expect([rgba[index * 4], rgba[index * 4 + 1], rgba[index * 4 + 2]]).toEqual(
        [...expected],
      );
    });
  });

  it("ảnh rỗng không crash", () => {
    expect(depthToRgba(new Uint8Array(0), "turbo")).toHaveLength(0);
  });
});
