/**
 * Giao thức tin nhắn giữa main thread và depth worker.
 *
 * Raw postMessage chứ không Comlink. Ban đầu là vì gate của Toolcraft từ chối
 * Comlink (nó bọc structural type lên DOM messaging endpoint); Toolcraft đã bỏ
 * nhưng lựa chọn này thì giữ, vì hai lý do vẫn đúng:
 *
 * 1. Message qua postMessage là **input không tin cậy** — worker có thể bị thay,
 *    phiên bản lệch nhau sau khi deploy. `parseDepthResponseMessage` kiểm shape
 *    thật thay vì gán kiểu bằng `MessageEvent<T>` mà không xác thực gì.
 * 2. Bớt một dependency cho một giao thức chỉ có ba loại message.
 *
 * Ta truyền pixel thô (`Uint8ClampedArray`) chứ không `ImageBitmap`. Lợi ích
 * thật: đường export ở P3 cũng cần pixel trên CPU, nên giải mã ảnh một lần ở
 * main thread phục vụ được cả hai đường.
 */

import type { DepthKind, DepthModel, ProgressReport } from "@/shared/types";

/**
 * Ảnh nguồn dưới dạng dữ liệu thuần.
 *
 * `Uint8ClampedArray<ArrayBuffer>` chứ không để mặc định: từ TS 6 tham số kiểu
 * mặc định là `ArrayBufferLike` (gồm cả SharedArrayBuffer), và `ImageData` chỉ
 * nhận `ArrayBuffer`. getImageData luôn trả ArrayBuffer thường nên thu hẹp ở đây
 * là mô tả đúng thực tế.
 */
export type RawPixels = {
  /** RGBA, độ dài = width * height * 4. */
  readonly data: Uint8ClampedArray<ArrayBuffer>;
  readonly width: number;
  readonly height: number;
};

export type DepthRequest = {
  readonly kind: "estimate";
  /** Đối chiếu response với request; response lỗi thời bị bỏ. */
  readonly runId: number;
  readonly pixels: RawPixels;
  readonly model: DepthModel;
};

export type ReleaseRequest = {
  readonly kind: "release";
};

export type DepthRequestMessage = DepthRequest | ReleaseRequest;

/** Kết quả depth, dạng dữ liệu thuần (DepthMap được dựng lại ở client). */
export type DepthResult = {
  readonly data: Uint8Array;
  readonly width: number;
  readonly height: number;
  readonly kind: DepthKind;
  readonly focalLengthPx?: number;
  readonly modelId: string;
};

export type DepthSuccess = {
  readonly kind: "result";
  readonly runId: number;
  readonly result: DepthResult;
};

export type DepthProgress = {
  readonly kind: "progress";
  readonly runId: number;
  readonly report: ProgressReport;
};

export type DepthFailure = {
  readonly kind: "error";
  readonly runId: number;
  readonly message: string;
};

export type ReleaseDone = {
  readonly kind: "released";
};

export type DepthResponseMessage =
  | DepthSuccess
  | DepthProgress
  | DepthFailure
  | ReleaseDone;

/**
 * Type guard cho response từ worker.
 *
 * Không chỉ để làm vui lòng gate: message qua postMessage là input không tin cậy
 * (worker có thể bị thay, phiên bản lệch nhau sau khi deploy). Kiểm tra shape
 * tường minh thay vì gán kiểu bằng `MessageEvent<DepthResponseMessage>` biến một giá
 * trị DOM thành structural type mà không xác thực gì.
 */
export function parseDepthResponseMessage(value: unknown): DepthResponseMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { kind?: unknown; runId?: unknown };

  if (candidate.kind === "released") return { kind: "released" };
  if (typeof candidate.runId !== "number") return null;

  const runId = candidate.runId;
  if (candidate.kind === "progress") {
    const report = (value as { report?: unknown }).report;
    if (typeof report !== "object" || report === null) return null;
    return { kind: "progress", runId, report: report as ProgressReport };
  }
  if (candidate.kind === "error") {
    const message = (value as { message?: unknown }).message;
    return { kind: "error", runId, message: String(message ?? "Unknown error") };
  }
  if (candidate.kind === "result") {
    const result = (value as { result?: unknown }).result;
    if (typeof result !== "object" || result === null) return null;
    const shape = result as { data?: unknown; width?: unknown; height?: unknown };
    if (!(shape.data instanceof Uint8Array)) return null;
    if (typeof shape.width !== "number" || typeof shape.height !== "number") {
      return null;
    }
    return { kind: "result", runId, result: result as DepthResult };
  }
  return null;
}

/** Type guard cho request tới worker. Cùng lý do như trên. */
export function parseDepthRequestMessage(value: unknown): DepthRequestMessage | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as { kind?: unknown };
  if (candidate.kind === "release") return { kind: "release" };
  if (candidate.kind !== "estimate") return null;

  const shape = value as { runId?: unknown; pixels?: unknown; model?: unknown };
  if (typeof shape.runId !== "number") return null;
  if (typeof shape.pixels !== "object" || shape.pixels === null) return null;
  if (typeof shape.model !== "object" || shape.model === null) return null;

  return {
    kind: "estimate",
    runId: shape.runId,
    pixels: shape.pixels as RawPixels,
    model: shape.model as DepthModel,
  };
}
