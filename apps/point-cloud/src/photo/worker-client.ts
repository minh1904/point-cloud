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
import type { PhotoPixels } from "./decode-image";
import type { DepthMap, DepthModelId } from "./depth/depth-map";
import type { ImportanceComponents } from "./importance";
import type { PackedBundle } from "./pack-bundle";
import type { WorkerRequest, WorkerResponse } from "./worker-protocol";

export interface JobProgress {
  stage: string;
  /** 0…1, or -1 when the step has no measurable length. */
  value: number;
}

interface Pending {
  settle: (message: WorkerResponse) => void;
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
    if (message.kind === "error") job.reject(new Error(message.message));
    else job.settle(message);
  };

  created.onerror = (event) => {
    const error = new Error(event.message || "the pipeline worker failed to start");
    for (const job of pending.values()) job.reject(error);
    pending.clear();
  };

  worker = created;
  return created;
}

/** Post one request and resolve with whatever the worker sends back for it. */
function send<T>(
  build: (id: number) => WorkerRequest,
  read: (message: WorkerResponse) => T,
  onProgress?: (progress: JobProgress) => void,
): Promise<T> {
  const id = nextId++;
  const target = ensureWorker();

  return new Promise<T>((resolve, reject) => {
    pending.set(id, { settle: (message) => resolve(read(message)), reject, onProgress });
    target.postMessage(build(id));
  });
}

/** Estimate depth for one photo. Rejects if `cancelJobs()` lands first. */
export function runDepth(
  photo: PhotoPixels,
  model: DepthModelId,
  onProgress?: (progress: JobProgress) => void,
): Promise<DepthMap> {
  return send(
    (id) => ({
      kind: "depth",
      id,
      model,
      // A structured clone, on purpose: transferring would detach
      // `photo.data` here on the main thread, and the preview still draws it.
      image: { width: photo.width, height: photo.height, data: photo.data.buffer },
    }),
    (message) => {
      if (message.kind !== "depth") throw new Error(`expected a depth map, got ${message.kind}`);
      return {
        width: message.width,
        height: message.height,
        data: new Float32Array(message.data),
        kind: message.model,
      };
    },
    onProgress,
  );
}

/** Measure the three detail components of one photo (6.4). */
export function runImportance(
  photo: PhotoPixels,
  depth: DepthMap,
  onProgress?: (progress: JobProgress) => void,
): Promise<ImportanceComponents> {
  return send(
    (id) => ({
      kind: "importance",
      id,
      image: { width: photo.width, height: photo.height, data: photo.data.buffer },
      depth: {
        width: depth.width,
        height: depth.height,
        data: depth.data.buffer as ArrayBuffer,
      },
    }),
    (message) => {
      if (message.kind !== "importance") {
        throw new Error(`expected importance components, got ${message.kind}`);
      }
      return {
        width: message.width,
        height: message.height,
        edges: new Float32Array(message.edges),
        texture: new Float32Array(message.texture),
        depthEdges: new Float32Array(message.depthEdges),
      };
    },
    onProgress,
  );
}

export interface BuildRequest {
  photo: PhotoPixels;
  depth: DepthMap;
  /** The mixed importance map, already weighted (6.4). */
  importance: Float32Array;
  /** Side of the square data texture; `size²` points are placed. */
  size: number;
  fieldWidth: number;
  relief: number;
  candidates: number;
  seed: number;
}

/** Run 6.5 through 6.9 and come back with textures ready to upload (6.8). */
export function runBuild(
  request: BuildRequest,
  onProgress?: (progress: JobProgress) => void,
): Promise<PackedBundle> {
  const { photo, depth, importance } = request;

  return send(
    (id) => ({
      kind: "build",
      id,
      image: { width: photo.width, height: photo.height, data: photo.data.buffer },
      depth: {
        width: depth.width,
        height: depth.height,
        data: depth.data.buffer as ArrayBuffer,
      },
      importance: {
        width: photo.width,
        height: photo.height,
        data: importance.buffer as ArrayBuffer,
      },
      size: request.size,
      fieldWidth: request.fieldWidth,
      relief: request.relief,
      candidates: request.candidates,
      seed: request.seed,
      depthKind: depth.kind,
    }),
    (message) => {
      if (message.kind !== "bundle") {
        throw new Error(`expected a packed bundle, got ${message.kind}`);
      }
      return {
        metadata: message.metadata,
        color: new Uint8Array(message.color),
        positionHigh: new Uint8Array(message.positionHigh),
        positionLow: new Uint8Array(message.positionLow),
      };
    },
    onProgress,
  );
}

/** Stop everything in flight. Safe to call when nothing is running. */
export function cancelJobs(): void {
  const running = worker;
  worker = null;

  for (const job of pending.values()) job.reject(new Error("cancelled"));
  pending.clear();

  running?.terminate();
}
