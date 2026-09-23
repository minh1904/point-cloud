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
import { pointDensity } from "./density";
import { heuristicDepth } from "./depth/heuristic-depth";
import { importanceComponents } from "./importance";
import { liftToCloud } from "./lift";
import { packCloud, pointsForSize } from "./pack-bundle";
import { samplePoints } from "./sample-points";
import { shuffleCloud } from "./shuffle";
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

/**
 * The whole of 6.5 through 6.9, in order, in one place (P6.8).
 *
 * Each stage hands its output to the next and nothing here loops back, which
 * is why it reads as five lines: place the points, measure how crowded each
 * one ended up, lift them into space, shuffle the order, pack the result into
 * the textures the renderer already knows how to read.
 */
function buildCloud(request: Extract<WorkerRequest, { kind: "build" }>) {
  const { id, image, depth, importance, size } = request;
  const count = pointsForSize(size);
  const step = (stage: string, value: number) =>
    post({ kind: "progress", id, stage, value });

  step(`placing ${count.toLocaleString("en-US")} points`, 0.05);
  const points = samplePoints({
    width: image.width,
    height: image.height,
    importance: new Float32Array(importance.data),
    count,
    candidates: request.candidates,
    seed: request.seed,
  });

  step("measuring density", 0.5);
  const density = pointDensity({ points, width: image.width, height: image.height });

  step("lifting into space", 0.7);
  const cloud = liftToCloud({
    points,
    density,
    width: image.width,
    height: image.height,
    depth: new Float32Array(depth.data),
    pixels: new Uint8ClampedArray(image.data),
    fieldWidth: request.fieldWidth,
    relief: request.relief,
  });

  step("shuffling", 0.9);
  const packed = packCloud(shuffleCloud(cloud, request.seed), {
    size,
    depthKind: request.depthKind,
    relief: request.relief,
    aspect: image.width / image.height,
  });

  const buffers = [
    packed.color.buffer as ArrayBuffer,
    packed.positionHigh.buffer as ArrayBuffer,
    packed.positionLow.buffer as ArrayBuffer,
  ];

  post(
    {
      kind: "bundle",
      id,
      metadata: packed.metadata,
      color: buffers[0]!,
      positionHigh: buffers[1]!,
      positionLow: buffers[2]!,
    },
    buffers,
  );
}

scope.onmessage = async (event: MessageEvent<WorkerRequest>) => {
  const request = event.data;

  try {
    if (request.kind === "depth") await estimateDepth(request);
    else if (request.kind === "importance") buildImportance(request);
    else if (request.kind === "build") buildCloud(request);
  } catch (error) {
    post({
      kind: "error",
      id: request.id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
