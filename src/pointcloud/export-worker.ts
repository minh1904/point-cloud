/// <reference lib="webworker" />
/**
 * Dựng point cloud và serialize ngoài main thread.
 *
 * Worker này **sinh ra rồi chết** theo từng lần bấm export, khác với depth
 * worker sống lâu để giữ cache model. Gộp chung thì mỗi lần export sẽ giữ session
 * ONNX sống vô ích trong bộ nhớ.
 *
 * Vòng lặp 262k bước cộng với việc dựng string vài MB sẽ làm đứng UI vài trăm ms
 * nếu để ở main thread.
 */

import { buildPointCloud } from "./build";
import type { ExportRequest, ExportResponse } from "./export-protocol";
import { gzipBlob, serializeToBlob } from "./serialize";

function reply(message: ExportResponse, transfer?: ArrayBuffer[]): void {
  if (transfer) {
    self.postMessage(message, transfer);
    return;
  }
  self.postMessage(message);
}

async function run(request: ExportRequest): Promise<void> {
  const cloud = buildPointCloud({
    depth: request.depth,
    pixels: request.pixels,
    grid: request.grid,
    depthScale: request.depthScale,
    projection: request.projection,
    onProgress: (ratio) => reply({ kind: "progress", ratio: ratio * 0.8 }),
  });

  reply({ kind: "progress", ratio: 0.85 });

  const json = serializeToBlob(cloud, {
    sourceName: request.meta.sourceName,
    sourceWidth: request.pixels.width,
    sourceHeight: request.pixels.height,
    modelId: request.meta.modelId,
    depthScale: request.depthScale,
    aspect: request.pixels.width / request.pixels.height,
    ...(request.depth.focalLengthPx !== undefined
      ? { focalLengthPx: request.depth.focalLengthPx }
      : {}),
  });

  reply({ kind: "progress", ratio: 0.92 });

  const compressed = request.gzip ? await gzipBlob(json) : null;
  const final = compressed ?? json;
  const bytes = await final.arrayBuffer();

  reply(
    {
      kind: "done",
      bytes,
      mime: final.type,
      extension: compressed ? "json.gz" : "json",
      count: cloud.count,
    },
    [bytes],
  );
}

addEventListener("message", (event: MessageEvent) => {
  const request = event.data as ExportRequest;
  if (request?.kind !== "export") return;
  void run(request).catch((error: unknown) => {
    reply({
      kind: "error",
      message: error instanceof Error ? error.message : String(error),
    });
  });
});
