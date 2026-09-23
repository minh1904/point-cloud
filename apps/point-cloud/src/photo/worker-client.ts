"use client";

/**
 * The main thread's half of the worker conversation (P6.3).
 *
 * ## Cancelling
 *
 * There is no way to interrupt a running ONNX inference session. `postMessage`
 * would sit in the worker's queue until the model finished, which is precisely
 * the wait we want to escape, and an `AbortSignal` has nothing to abort.
 *
 * So cancelling **terminates the worker**. That genuinely stops the work and
 * frees the CPU immediately; the cost is the loaded pipeline, which the next
 * run rebuilds from the browser's cache in a second or two. A flag the worker
 * politely checks between stages would cancel nothing at all during the one
 * stage that takes the time.
 */
import type { DepthMap, DepthModelId } from "./depth/depth-map";
import type { PhotoPixels } from "./decode-image";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

export interface JobProgress {
  stage: string;
  /** 0…1, or -1 when the step has no measurable length. */
  value: number;
}

interface Pending {
  resolve: (depth: DepthMap) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: JobProgress) => void;
}

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<number, Pending>();

function ensureWorker(): Worker {
  if (worker) return worker;

  // `new URL(..., import.meta.url)` is the form every bundler recognises as
  // "this is a worker entry point" — a bare string would be looked up at
  // runtime against a file that was never emitted.
  const created = new Worker(new URL("./worker.ts", import.meta.url), {
    type: "module",
  });

  created.onmessage = (event: MessageEvent<WorkerResponse>) => {
    const message = event.data;
    const job = pending.get(message.id);
    if (!job) return;

    if (message.kind === "progress") {
      job.onProgress?.({ stage: message.stage, value: message.value });
      return;
    }

    pending.delete(message.id);

    if (message.kind === "error") {
      job.reject(new Error(message.message));
      return;
    }

    job.resolve({
      width: message.width,
      height: message.height,
      data: new Float32Array(message.data),
      kind: message.model,
    });
  };

  created.onerror = (event) => {
    const error = new Error(event.message || "the pipeline worker failed to start");
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  };

  worker = created;
  return created;
}

/** Estimate depth for one photo. Rejects if `cancelJobs()` lands first. */
export function runDepth(
  photo: PhotoPixels,
  model: DepthModelId,
  onProgress?: (progress: JobProgress) => void,
): Promise<DepthMap> {
  const id = nextId++;
  const target = ensureWorker();

  return new Promise<DepthMap>((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });

    const request: WorkerRequest = {
      kind: "depth",
      id,
      model,
      // A structured clone, on purpose: transferring would detach
      // `photo.data` here on the main thread, and the preview still draws it.
      image: { width: photo.width, height: photo.height, data: photo.data.buffer },
    };

    target.postMessage(request);
  });
}

/** Stop everything in flight. Safe to call when nothing is running. */
export function cancelJobs(): void {
  const running = worker;
  worker = null;

  for (const job of pending.values()) job.reject(new Error("cancelled"));
  pending.clear();

  running?.terminate();
}
