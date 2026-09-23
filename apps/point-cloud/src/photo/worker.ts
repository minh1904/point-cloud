/// <reference lib="webworker" />
/**
 * The pipeline worker (P6.3, P6.4).
 *
 * Depth estimation is half a second of solid arithmetic on a good GPU and
 * several seconds on WASM; the importance map is three convolutions over a
 * megapixel. On the main thread that is a frozen canvas — no orbit, no drift,
 * no intro — because `requestAnimationFrame` and a busy main thread are the
 * same queue. A worker is a second thread with its own event loop and no DOM,
 * which is all this work needs.
 *
 * Nothing here imports React, three.js or anything that touches the DOM. The
 * inference library is imported *dynamically* inside `model-depth.ts`, so the
 * worker itself starts in milliseconds and only pays for the library when a
 * photo actually asks for the model.
 */
import { heuristicDepth } from "./depth/heuristic-depth";
import { importanceComponents } from "./importance";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

async function estimateDepth(request: Extract<WorkerRequest, { kind: "depth" }>) {
  const { id, model, image } = request;
  const pixels = new Uint8ClampedArray(image.data);
  const size = { width: image.width, height: image.height };

  const depth =
    model === "heuristic"
      ? heuristicDepth({ ...size, data: pixels })
      : await (async () => {
          const { modelDepth } = await import("./depth/model-depth");
          return modelDepth({ ...size, data: pixels }, (progress) =>
            post({ kind: "progress", id, stage: progress.stage, value: progress.value }),
          );
        })();

  // Transferring hands the buffer over rather than copying it, and the worker
  // has no further use for it. The *input* is deliberately not transferred —
  // that would detach the photo's buffer on the main thread, and every later
  // stage still reads it.
  const buffer = depth.data.buffer as ArrayBuffer;
  post(
    {
      kind: "depth",
      id,
      model: depth.kind,
      width: depth.width,
      height: depth.height,
      data: buffer,
    },
    [buffer],
  );
}

function buildImportance(request: Extract<WorkerRequest, { kind: "importance" }>) {
  const { id, image, depth } = request;

  post({ kind: "progress", id, stage: "measuring detail", value: -1 });

  const components = importanceComponents({
    width: image.width,
    height: image.height,
    pixels: new Uint8ClampedArray(image.data),
    depth: new Float32Array(depth.data),
  });

  const buffers = [
    components.edges.buffer as ArrayBuffer,
    components.texture.buffer as ArrayBuffer,
    components.depthEdges.buffer as ArrayBuffer,
  ];

  post(
    {
      kind: "importance",
      id,
      width: components.width,
      height: components.height,
      edges: buffers[0]!,
      texture: buffers[1]!,
      depthEdges: buffers[2]!,
    },
    buffers,
  );
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.kind === "depth") await estimateDepth(request);
    else if (request.kind === "importance") buildImportance(request);
  } catch (error) {
    post({
      kind: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
