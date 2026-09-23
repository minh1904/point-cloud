/// <reference lib="webworker" />
/**
 * The pipeline worker (P6.3).
 *
 * Depth estimation is half a second of solid arithmetic on a good GPU and
 * several seconds on WASM. On the main thread that is half a second of frozen
 * canvas — no orbit, no drift, no intro — because `requestAnimationFrame` and
 * a busy main thread are the same queue. A worker is a second thread with its
 * own event loop and no DOM, which is all this work needs.
 *
 * Nothing here imports React, three.js or anything that touches the DOM. The
 * inference library is imported *dynamically* inside `model-depth.ts`, so the
 * worker itself starts in milliseconds and only pays for the library when a
 * photo actually asks for the model.
 */
import { heuristicDepth } from "./depth/heuristic-depth";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

const scope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse, transfer: Transferable[] = []) {
  scope.postMessage(message, transfer);
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;
  if (request.kind !== "depth") return;

  const { id, model, image } = request;

  try {
    const pixels = new Uint8ClampedArray(image.data);

    const depth =
      model === "heuristic"
        ? heuristicDepth({ width: image.width, height: image.height, data: pixels })
        : await (async () => {
            const { modelDepth } = await import("./depth/model-depth");
            return modelDepth({ width: image.width, height: image.height, data: pixels }, (p) =>
              post({ kind: "progress", id, stage: p.stage, value: p.value }),
            );
          })();

    // Transferring hands the buffer over rather than copying it: one megabyte
    // for a 512² map, and the worker has no further use for it. The *input*
    // is deliberately not transferred — that would detach the photo's buffer
    // on the main thread, and every later stage still reads it.
    post(
      {
        kind: "depth",
        id,
        model: depth.kind,
        width: depth.width,
        height: depth.height,
        data: depth.data.buffer as ArrayBuffer,
      },
      [depth.data.buffer as ArrayBuffer],
    );
  } catch (error) {
    post({
      kind: "error",
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
