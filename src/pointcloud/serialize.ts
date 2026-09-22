/**
 * PointCloud → Blob JSON, và nén gzip.
 *
 * Hai quyết định định hình toàn bộ file này:
 *
 * **1. SoA, không phải AoS.** `{positions: [...], colors: [...]}` thay vì
 * `[{x,y,z,r,g,b}, ...]`. Bỏ được việc lặp tên field 240 000 lần — khoảng 60
 * byte/hạt xuống còn ~35. Đây là quyết định lớn nhất về kích thước.
 *
 * **2. Generator theo chunk, không `JSON.stringify`.** `stringify` dựng một
 * string 8 MB trong RAM rồi mới tạo Blob. Generator + `TypedArray.join` giữ bộ
 * nhớ đỉnh thấp và không jank. `join` là native nên rất nhanh, và vì mảng đã là
 * số nguyên nên không có rủi ro `-0.30000000000000004`.
 */

import { QUANT } from "@/shared/config";
import type { PointCloud } from "@/shared/types";

/** 8192 phần tử mỗi mảnh: đủ lớn để `join` hiệu quả, đủ nhỏ để không dựng string to. */
const CHUNK = 8192;

export type ExportMeta = {
  readonly sourceName: string;
  readonly sourceWidth: number;
  readonly sourceHeight: number;
  readonly modelId: string;
  readonly depthScale: number;
  readonly aspect: number;
  readonly focalLengthPx?: number;
};

const ATTRIBUTES = {
  position: { components: 3, encoding: "uint16-normalized" },
  color: { components: 3, encoding: "uint8-srgb" },
  density: { components: 1, encoding: "uint8" },
} as const;

function* arrayField(
  name: string,
  array: Uint16Array | Uint8Array,
  length: number,
): Generator<string> {
  yield `,"${name}":[`;
  for (let i = 0; i < length; i += CHUNK) {
    const end = Math.min(i + CHUNK, length);
    yield array.subarray(i, end).join(",");
    if (end < length) yield ",";
  }
  yield "]";
}

function* serialize(cloud: PointCloud, meta: ExportMeta): Generator<string> {
  yield '{"format":"pointcloud-json","version":1';
  yield `,"createdAt":${JSON.stringify(new Date().toISOString())}`;
  yield `,"count":${cloud.count}`;
  yield `,"grid":[${cloud.grid[0]},${cloud.grid[1]}]`;
  yield `,"source":${JSON.stringify({
    name: meta.sourceName,
    width: meta.sourceWidth,
    height: meta.sourceHeight,
  })}`;
  yield `,"model":${JSON.stringify(meta.modelId)}`;
  yield `,"projection":${JSON.stringify(cloud.projection)}`;
  yield `,"focalLengthPx":${meta.focalLengthPx ?? "null"}`;
  // `params` không phải metadata trang trí: không có nó, người mở file sau này
  // không biết dữ liệu mang nghĩa gì và không tái hiện được.
  yield `,"params":${JSON.stringify({
    depthScale: meta.depthScale,
    aspect: meta.aspect,
    quantMax: QUANT.positionMax,
  })}`;
  yield `,"bounds":${JSON.stringify(cloud.bounds)}`;
  yield `,"attributes":${JSON.stringify(ATTRIBUTES)}`;

  yield* arrayField("positions", cloud.positions, cloud.count * 3);
  yield* arrayField("colors", cloud.colors, cloud.count * 3);
  yield* arrayField("density", cloud.density, cloud.count);

  yield "}";
}

export function serializeToBlob(
  cloud: PointCloud,
  meta: ExportMeta,
): Blob {
  return new Blob([...serialize(cloud, meta)], { type: "application/json" });
}

/**
 * Nén gzip bằng `CompressionStream` — API sẵn có của browser, không thêm
 * dependency. JSON toàn chữ số và dấu phẩy nén rất tốt, thường còn khoảng 1/4.
 *
 * Trả về `null` khi môi trường không có `CompressionStream` (Safari cũ), để
 * caller rơi về JSON thường thay vì thất bại.
 */
export async function gzipBlob(blob: Blob): Promise<Blob | null> {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const stream = blob.stream().pipeThrough(new CompressionStream("gzip"));
    const bytes = await new Response(stream).arrayBuffer();
    return new Blob([bytes], { type: "application/gzip" });
  } catch {
    return null;
  }
}
