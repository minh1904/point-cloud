/**
 * What every depth source in P6 has to produce.
 *
 * One float per pixel, **0 nearest the camera and 1 farthest**, at the working
 * image's own resolution. Fixing that convention here is the whole reason this
 * file exists: monocular models disagree about it wildly — most of them emit
 * *inverse* depth (bigger means closer) on an arbitrary scale — and a sign
 * error produces a cloud that is inside out but perfectly plausible-looking
 * until you orbit it.
 */
export interface DepthMap {
  width: number;
  height: number;
  /** 0 = nearest, 1 = farthest, one value per pixel, row 0 at the top. */
  data: Float32Array;
  /** Which source produced it, for the UI and for `metadata.json`. */
  kind: DepthModelId;
}

/** Depth sources the app can choose between (decision 6.2). */
export const DEPTH_MODELS = ["heuristic", "depth-anything-v2-small"] as const;
export type DepthModelId = (typeof DEPTH_MODELS)[number];

export const DEPTH_MODEL_LABELS: Record<DepthModelId, string> = {
  heuristic: "Painter's cues",
  "depth-anything-v2-small": "Depth Anything V2",
};

/** Hugging Face repo backing the model option, resolved by transformers.js. */
export const DEPTH_ANYTHING_REPO = "onnx-community/depth-anything-v2-small";
