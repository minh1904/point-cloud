/**
 * What the main thread and the pipeline worker say to each other (P6.3).
 *
 * Kept in its own module because both sides import it and neither should
 * import the other: the worker must never pull in React, and the main thread
 * must never pull in a 10 MB inference library just to know a message shape.
 */
import type { DepthModelId } from "./depth/depth-map";

/** A working image as it crosses the thread boundary: RGBA bytes, row 0 top. */
export interface ImagePayload {
  width: number;
  height: number;
  data: ArrayBuffer;
}

export type WorkerRequest = {
  kind: "depth";
  id: number;
  model: DepthModelId;
  image: ImagePayload;
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
  | { kind: "error"; id: number; message: string };
