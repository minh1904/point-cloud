/**
 * Monocular depth from a neural network, in the browser (decision 6.2).
 *
 * ## Why this model
 *
 * **Depth Anything V2 Small**, via transformers.js, running on WebGPU with a
 * WASM fallback. Weights for `onnx-community/depth-anything-v2-small`:
 *
 * | build | bytes | where it runs |
 * |---|---|---|
 * | fp32 | 99.1 MB | anywhere, slowest |
 * | fp16 | 49.6 MB | WebGPU (fp16 is native there) |
 * | q8 (uint8) | 27.3 MB | WASM, ~4× smaller than fp32 |
 *
 * So the real first-load cost is 28-50 MB depending on the device, cached by
 * the browser afterwards, plus about 2 MB of library. That is a lot for a web
 * page and very little for what it does: a *relative* depth map for any
 * photograph, with no camera metadata, no second view and no user input.
 *
 * The alternatives and why not:
 *
 * - **MiDaS small** — older, similar size, visibly worse on edges. Depth
 *   Anything V2 is its successor by lineage as much as by benchmark.
 * - **Depth Pro / Marigold** — metric depth, far better, and 1-4 GB. Not a
 *   web download.
 * - **A server endpoint** — no download at all, but it means uploading the
 *   user's photo to somewhere, and this project has no backend. Keeping the
 *   photo on the device is worth the megabytes.
 *
 * ## The two conventions that bite
 *
 * 1. The model predicts **inverse depth**: its numbers grow toward the camera.
 *    Our `DepthMap` runs the other way, so the values are flipped after
 *    normalising.
 * 2. The output is in arbitrary units with no zero — it is *relative* depth.
 *    Only the ordering and the ratios mean anything, which is exactly enough
 *    for 6.7, where the whole map is squeezed into a few percent of the
 *    cloud's width anyway.
 *
 * This module is imported **dynamically, inside the worker**, so a user who
 * never asks for model depth never downloads the library.
 */
import type { ProgressInfo } from "@huggingface/transformers";

import { normalise } from "../filters";
import { DEPTH_ANYTHING_REPO, type DepthMap } from "./depth-map";

export interface ModelDepthInput {
  width: number;
  height: number;
  /** RGBA bytes, row 0 at the top. */
  data: Uint8ClampedArray;
}

export interface ModelProgress {
  stage: string;
  /** 0…1, or -1 when the step has no measurable length. */
  value: number;
}

type Estimator = (image: unknown) => Promise<{ predicted_depth: { data: Float32Array } }>;

/**
 * The loaded pipeline, kept for the life of the worker.
 *
 * Re-creating it per photo would re-read tens of megabytes of weights from
 * cache and rebuild the inference session, which is seconds. The worker being
 * terminated on cancel (see `worker-client.ts`) is what bounds this cache's
 * lifetime — there is no eviction policy here because there is no need for one.
 */
let loaded: { estimator: Estimator; device: string } | null = null;

/** RGBA in, RGB out. The image processor expects three channels. */
function toRgb(data: Uint8ClampedArray, pixels: number): Uint8ClampedArray {
  const rgb = new Uint8ClampedArray(pixels * 3);
  for (let i = 0; i < pixels; i++) {
    rgb[i * 3] = data[i * 4]!;
    rgb[i * 3 + 1] = data[i * 4 + 1]!;
    rgb[i * 3 + 2] = data[i * 4 + 2]!;
  }
  return rgb;
}

async function load(report: (progress: ModelProgress) => void): Promise<{
  estimator: Estimator;
  device: string;
}> {
  if (loaded) return loaded;

  const { pipeline, env } = await import("@huggingface/transformers");

  // There is no `/models` directory being served, and without this the first
  // thing the library does is 404 against our own origin for every file.
  env.allowLocalModels = false;

  const progress_callback = (info: ProgressInfo) => {
    if (info.status === "progress") {
      report({ stage: `downloading ${info.file}`, value: (info.progress ?? 0) / 100 });
    } else if (info.status === "initiate") {
      report({ stage: `fetching ${info.file}`, value: -1 });
    } else if (info.status === "ready") {
      report({ stage: "warming up", value: -1 });
    }
  };

  // WebGPU first: it is several times faster and takes the fp16 weights, which
  // are half the download. The catch is wide — a machine can advertise WebGPU
  // and still fail to build the session — and falling back costs one extra
  // download rather than a broken feature.
  const attempts = [
    { device: "webgpu" as const, dtype: "fp16" as const },
    { device: "wasm" as const, dtype: "q8" as const },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    if (attempt.device === "webgpu" && !("gpu" in navigator)) continue;

    try {
      report({ stage: `starting ${attempt.device}`, value: -1 });
      const estimator = (await pipeline("depth-estimation", DEPTH_ANYTHING_REPO, {
        ...attempt,
        progress_callback,
      })) as unknown as Estimator;

      loaded = { estimator, device: attempt.device };
      return loaded;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `could not start the depth model: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

/** Run the model over one working image. Only ever called inside the worker. */
export async function modelDepth(
  image: ModelDepthInput,
  report: (progress: ModelProgress) => void,
): Promise<DepthMap> {
  const { estimator, device } = await load(report);
  const { RawImage } = await import("@huggingface/transformers");

  report({ stage: `estimating depth on ${device}`, value: -1 });

  const pixels = image.width * image.height;
  const raw = new RawImage(toRgb(image.data, pixels), image.width, image.height, 3);
  const output = await estimator(raw);

  // The pipeline already interpolates its prediction back to the input size,
  // so this is one value per working pixel with no resampling left to do.
  const predicted = output.predicted_depth.data;
  if (predicted.length !== pixels) {
    throw new Error(`model returned ${predicted.length} values for ${pixels} pixels`);
  }

  const relative = normalise(predicted);
  const data = new Float32Array(pixels);
  // Inverse depth in, distance out.
  for (let i = 0; i < pixels; i++) data[i] = 1 - relative[i]!;

  return {
    width: image.width,
    height: image.height,
    data,
    kind: "depth-anything-v2-small",
  };
}
