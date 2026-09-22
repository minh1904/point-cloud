/**
 * Registry model AI. Thêm model mới = thêm một entry, không sửa code chỗ khác:
 * app-schema.ts sinh options của model picker từ mảng này.
 *
 * Vì sao chỉ vài model chứ không phải cả 30 model tương thích transformers.js:
 * mỗi model là một bộ quirk riêng (input size, output shape, cách normalize)
 * phải test. Danh sách này cover đủ trục đánh đổi nhẹ / mới / chất lượng /
 * metric. Xem docs/learn/03-why-these-choices.md mục Q4.
 */

import type { DepthModel } from "@/shared/types";

/**
 * Mỗi entry ở đây đã được kiểm chứng là có `preprocessor_config.json` trên HF —
 * `pipeline()` cần file đó để biết cách resize/normalize, và thiếu nó thì HF trả
 * trang 404 HTML, cho ra lỗi khó hiểu "Unexpected token '<'".
 *
 * Bài học: README của một repo nói "dùng được với transformers.js" KHÔNG đủ.
 * Phải kiểm file thật. `en970/depth-anything-v3-small-onnx` (Depth Anything V3)
 * quảng cáo đúng như vậy nhưng chỉ có config.json + hai file .onnx, nên không
 * nạp được. Khi onnx-community phát hành bản DA3 chính thức thì thêm lại.
 *
 * Model `metric` (DepthPro) thêm ở P4 cùng với chế độ chiếu perspective.
 */
export const DEPTH_MODELS: readonly DepthModel[] = [
  {
    // 73.4k downloads, bản chính thức từ onnx-community. Chọn làm default vì
    // với một feature mà lỗi làm app trắng màn, số downloads là tín hiệu quan
    // trọng hơn điểm benchmark.
    id: "onnx-community/depth-anything-v2-small",
    label: "Depth Anything V2 Small",
    badge: "default",
    dtype: "fp16",
    sizeMB: 50,
    kind: "relative",
    inputSize: 518,
    selfHosted: true,
  },
  {
    // V1: nhỏ, nhanh, và cho ra depth map "mềm" hơn V2 — hữu ích để so sánh
    // phong cách chứ không chỉ độ chính xác. 13.1k downloads.
    id: "Xenova/depth-anything-small-hf",
    label: "Depth Anything V1 Small",
    badge: "experimental",
    dtype: "q8",
    sizeMB: 25,
    kind: "relative",
    inputSize: 518,
  },
  {
    // 97M params. Chi tiết ở biên tốt hơn rõ rệt, đổi lại 190 MB.
    id: "onnx-community/depth-anything-v2-base",
    label: "Depth Anything V2 Base",
    badge: "quality",
    dtype: "fp16",
    sizeMB: 190,
    kind: "relative",
    inputSize: 518,
  },
];

export const DEFAULT_DEPTH_MODEL_ID = DEPTH_MODELS[0].id;

export function findDepthModel(id: string): DepthModel | undefined {
  return DEPTH_MODELS.find((model) => model.id === id);
}

/**
 * Trả về model hợp lệ cho một id bất kỳ. Dùng khi đọc giá trị đã persist: một
 * schema state cũ có thể trỏ tới model đã bị xoá khỏi registry.
 */
export function resolveDepthModel(id: string | undefined): DepthModel {
  return (id ? findDepthModel(id) : undefined) ?? DEPTH_MODELS[0];
}

/**
 * Phép chiếu khả dụng cho một model.
 *
 * Model relative không có focal length nên không unproject được — chỉ `relief`.
 * Khi user đổi từ model metric sang relative, app phải tự đưa `projection` về
 * `relief` thay vì để lại state vô nghĩa.
 */
export function availableProjections(
  model: DepthModel,
): readonly ["relief"] | readonly ["relief", "perspective"] {
  return model.kind === "metric" ? ["relief", "perspective"] : ["relief"];
}
