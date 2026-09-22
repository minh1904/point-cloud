/**
 * Phía main thread của export. Worker sinh ra rồi chết theo từng lần bấm.
 */

import type { DepthMap, Projection } from "@/shared/types";

import { parseExportResponse, type ExportRequest } from "./export-protocol";

export type ExportOptions = {
  readonly depth: DepthMap;
  readonly pixels: {
    readonly data: Uint8ClampedArray<ArrayBuffer>;
    readonly width: number;
    readonly height: number;
  };
  readonly grid: number;
  readonly depthScale: number;
  readonly projection: Projection;
  readonly sourceName: string;
  readonly modelId: string;
  readonly gzip: boolean;
  readonly onProgress: (ratio: number) => void;
};

export type ExportResult = {
  readonly blob: Blob;
  readonly fileName: string;
  readonly count: number;
};

export function exportPointCloud(
  options: ExportOptions,
): Promise<ExportResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL("./export-worker.ts", import.meta.url),
      { type: "module" },
    );

    const finish = (fn: () => void) => {
      worker.terminate();
      fn();
    };

    worker.onmessage = (event: MessageEvent) => {
      const response = parseExportResponse(event.data);
      if (!response) return;

      if (response.kind === "progress") {
        options.onProgress(response.ratio);
        return;
      }
      if (response.kind === "error") {
        finish(() => reject(new Error(response.message)));
        return;
      }

      const base = options.sourceName.replace(/\.[^.]+$/, "") || "pointcloud";
      finish(() =>
        resolve({
          blob: new Blob([response.bytes], { type: response.mime }),
          fileName: `${base}-${response.count}pts.${response.extension}`,
          count: response.count,
        }),
      );
    };

    worker.onerror = () => {
      finish(() => reject(new Error("Export worker gặp lỗi.")));
    };

    const request: ExportRequest = {
      kind: "export",
      depth: options.depth,
      pixels: options.pixels,
      grid: options.grid,
      depthScale: options.depthScale,
      projection: options.projection,
      meta: { sourceName: options.sourceName, modelId: options.modelId },
      gzip: options.gzip,
    };
    worker.postMessage(request);
  });
}

/** Tải Blob về máy. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
