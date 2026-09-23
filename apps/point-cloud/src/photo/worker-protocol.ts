/**
 * What the main thread and the pipeline worker say to each other (P6.3).
 *
 * Kept in its own module because both sides import it and neither should
 * import the other: the worker must never pull in React, and the main thread
 * must never pull in a 10 MB inference library just to know a message shape.
 *
 * Every buffer crosses as a raw `ArrayBuffer` rather than a typed array. That
 * is the only form `postMessage` can *transfer* (hand over without copying),
 * and the receiving side wraps it back up in one line.
 */
import type { BundleMetadata } from "@/bundle/metadata";

import type { DepthModelId } from "./depth/depth-map";

/** A working image as it crosses the thread boundary: RGBA bytes, row 0 top. */
export interface ImagePayload {
  width: number;
  height: number;
  data: ArrayBuffer;
}

/** One float per pixel — a depth map, an importance map, a component. */
export interface MapPayload {
  width: number;
  height: number;
  data: ArrayBuffer;
}

export type WorkerRequest =
  | {
      kind: "depth";
      id: number;
      model: DepthModelId;
      image: ImagePayload;
    }
  | {
      kind: "importance";
      id: number;
      image: ImagePayload;
      depth: MapPayload;
    }
  | {
      kind: "build";
      id: number;
      image: ImagePayload;
      depth: MapPayload;
      /** The mixed importance map — the weights were applied on the main thread. */
      importance: MapPayload;
      /** Side of the square data texture; `size²` points are placed. */
      size: number;
      /** World width the cloud spans. */
      fieldWidth: number;
      /** World depth between nearest and farthest point. */
      relief: number;
      /** Candidates weighed per placed point (6.5). */
      candidates: number;
      /** Same seed, same cloud. */
      seed: number;
      /** Recorded in the metadata so the UI can say where the depth came from. */
      depthKind: string;
    };

export type WorkerResponse =
  | {
      kind: "progress";
      id: number;
      /** Human-readable step, e.g. `"downloading model.onnx"`. */
      stage: string;
      /** 0…1, or -1 when the step has no measurable length. */
      value: number;
    }
  | {
      kind: "depth";
      id: number;
      model: DepthModelId;
      width: number;
      height: number;
      /** Float32 values, 0 nearest to 1 farthest. */
      data: ArrayBuffer;
    }
  | {
      kind: "importance";
      id: number;
      width: number;
      height: number;
      /** Three Float32 maps, each already normalised to 0…1. */
      edges: ArrayBuffer;
      texture: ArrayBuffer;
      depthEdges: ArrayBuffer;
    }
  | {
      kind: "bundle";
      id: number;
      /** Plain object — structured clone carries it across as-is. */
      metadata: BundleMetadata;
      /** RGBA bytes: colour in RGB, crowding in A. */
      color: ArrayBuffer;
      positionHigh: ArrayBuffer;
      positionLow: ArrayBuffer;
    }
  | { kind: "error"; id: number; message: string };
