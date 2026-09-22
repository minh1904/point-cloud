/// <reference lib="webworker" />
/**
 * Inference depth trong Web Worker.
 *
 * Vì sao phải ở worker: inference chiếm từ ~100 ms (DA3 q8 trên WebGPU) đến vài
 * giây (WASM single-thread). Để ở main thread là đứng UI, và Toolcraft có gate
 * hiệu năng kiểm frame budget.
 *
 * Worker này sống lâu và cache pipeline theo modelId — đổi ảnh không nạp lại
 * model. Đối lập với export worker (P3) sinh ra rồi chết theo từng lần bấm.
 *
 * Giao tiếp bằng raw postMessage, không Comlink — xem lý do ở protocol.ts.
 */

import {
  env,
  pipeline,
  RawImage,
  type DepthEstimationPipeline,
} from "@huggingface/transformers";

import type { DepthModel, ProgressReport } from "@/shared/types";

import { parseDepthRequestMessage } from "./protocol";
import type { RawPixels, DepthResponseMessage } from "./protocol";

env.localModelPath = "/models/";

let cachedId: string | null = null;
let cachedEstimator: DepthEstimationPipeline | null = null;

function reply(message: DepthResponseMessage, transfer?: ArrayBuffer[]): void {
  if (transfer) {
    self.postMessage(message, transfer);
    return;
  }
  self.postMessage(message);
}

function reportProgress(runId: number, report: ProgressReport): void {
  reply({ kind: "progress", runId, report });
}

/**
 * Chọn backend. WebGPU nhanh hơn nhiều nhưng Safari/Firefox mới hỗ trợ, nên
 * luôn phải có nhánh WASM.
 *
 * Phát hiện bằng cách thử requestAdapter() thật, không đoán qua user-agent:
 * navigator.gpu có thể tồn tại mà vẫn không cấp được adapter (driver bị chặn,
 * máy ảo, cờ bị tắt).
 */
async function pickDevice(): Promise<"webgpu" | "wasm"> {
  const gpu = navigator.gpu;
  if (!gpu) return "wasm";
  try {
    return (await gpu.requestAdapter()) ? "webgpu" : "wasm";
  } catch {
    return "wasm";
  }
}

async function disposeCached(): Promise<void> {
  if (!cachedEstimator) return;
  // Bỏ bước dispose là nguyên nhân số một của "app chạy được vài lần rồi
  // crash" — hai session ONNX cùng giữ VRAM.
  const estimator = cachedEstimator;
  cachedEstimator = null;
  cachedId = null;
  await estimator.dispose();
}

async function getEstimator(
  model: DepthModel,
  runId: number,
): Promise<DepthEstimationPipeline> {
  if (cachedId === model.id && cachedEstimator) return cachedEstimator;
  await disposeCached();

  // Bật tìm-local CHỈ cho model self-host. Nếu để `allowLocalModels = true` cho
  // mọi model, transformers.js thử /models/<id>/config.json trước với model ở
  // CDN; dev server trả index.html cho đường dẫn không tồn tại và ta nhận lỗi
  // "Unexpected token '<'" thay vì model. Đây là bug đã gặp thật.
  env.allowLocalModels = model.selfHosted === true;
  env.allowRemoteModels = model.selfHosted !== true;

  const device = await pickDevice();
  reportProgress(runId, {
    phase: "downloading",
    detail: `${model.label} · ${model.dtype} · ${device}`,
  });

  const estimator = await pipeline("depth-estimation", model.id, {
    device,
    dtype: model.dtype,
    progress_callback: (event: unknown) => {
      const item = event as { status?: string; progress?: number };
      if (item.status === "progress" && typeof item.progress === "number") {
        reportProgress(runId, {
          phase: "downloading",
          ratio: item.progress / 100,
        });
      }
    },
  });

  cachedId = model.id;
  cachedEstimator = estimator;
  return estimator;
}

async function estimate(
  runId: number,
  pixels: RawPixels,
  model: DepthModel,
): Promise<void> {
  const estimator = await getEstimator(model, runId);
  reportProgress(runId, { phase: "running" });

  // RawImage nhận pixel thô trực tiếp — không cần OffscreenCanvas trong worker.
  // 4 kênh vì main thread gửi RGBA từ getImageData.
  const image = new RawImage(pixels.data, pixels.width, pixels.height, 4);
  const { depth } = await estimator(image);

  // depth.data có thể là Uint8Array hoặc Uint8ClampedArray tuỳ đường
  // post-process; chuẩn hoá về Uint8Array để hợp đồng chỉ có một kiểu. Copy
  // buffer để transfer được mà không kéo theo bộ nhớ của model.
  const data = new Uint8Array(depth.data.length);
  data.set(depth.data);

  reply(
    {
      kind: "result",
      runId,
      result: {
        data,
        width: depth.width,
        height: depth.height,
        kind: model.kind,
        modelId: model.id,
      },
    },
    [data.buffer],
  );
}

// addEventListener thay vì gán self.onmessage: gate coi việc gán handler lên
// GLOBAL SCOPE là "imperative host mutation". Gán lên một Worker *instance* thì
// được (test của framework khẳng định), nhưng self là global scope.
addEventListener("message", (event: MessageEvent) => {
  const request = parseDepthRequestMessage(event.data);
  if (!request) return;

  if (request.kind === "release") {
    void disposeCached().then(() => reply({ kind: "released" }));
    return;
  }

  void estimate(request.runId, request.pixels, request.model).catch(
    (error: unknown) => {
      reply({
        kind: "error",
        runId: request.runId,
        message: error instanceof Error ? error.message : String(error),
      });
    },
  );
});
