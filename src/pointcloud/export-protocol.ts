/**
 * Giao thức cho export worker. Cùng nguyên tắc như `depth/protocol.ts`: không
 * kiểu lib.dom nào đi qua ranh giới, và message được kiểm shape tường minh.
 */

import type { DepthMap, Projection } from "@/shared/types";

export type ExportRequest = {
  readonly kind: "export";
  readonly depth: DepthMap;
  readonly pixels: {
    readonly data: Uint8ClampedArray<ArrayBuffer>;
    readonly width: number;
    readonly height: number;
  };
  readonly grid: number;
  readonly depthScale: number;
  readonly projection: Projection;
  readonly meta: {
    readonly sourceName: string;
    readonly modelId: string;
  };
  readonly gzip: boolean;
};

export type ExportProgress = {
  readonly kind: "progress";
  readonly ratio: number;
};

export type ExportDone = {
  readonly kind: "done";
  readonly bytes: ArrayBuffer;
  readonly mime: string;
  readonly extension: string;
  readonly count: number;
};

export type ExportFailed = {
  readonly kind: "error";
  readonly message: string;
};

export type ExportResponse = ExportProgress | ExportDone | ExportFailed;

export function parseExportResponse(value: unknown): ExportResponse | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { kind?: unknown };

  if (candidate.kind === "progress") {
    const ratio = (value as { ratio?: unknown }).ratio;
    return typeof ratio === "number" ? { kind: "progress", ratio } : null;
  }
  if (candidate.kind === "error") {
    const message = (value as { message?: unknown }).message;
    return { kind: "error", message: String(message ?? "Export thất bại.") };
  }
  if (candidate.kind === "done") {
    const shape = value as {
      bytes?: unknown;
      mime?: unknown;
      extension?: unknown;
      count?: unknown;
    };
    if (!(shape.bytes instanceof ArrayBuffer)) return null;
    return {
      kind: "done",
      bytes: shape.bytes,
      mime: String(shape.mime ?? "application/json"),
      extension: String(shape.extension ?? "json"),
      count: Number(shape.count ?? 0),
    };
  }
  return null;
}
