"use client";

import { create } from "zustand";

import { decodePhoto, type PhotoPixels } from "@/photo/decode-image";
import type { DepthMap, DepthModelId } from "@/photo/depth/depth-map";
import { cancelJobs, runDepth, type JobProgress } from "@/photo/worker-client";

export type PhotoStatus = "empty" | "decoding" | "ready" | "error";
export type StageStatus = "idle" | "running" | "ready" | "error";

/** What we keep about the file itself — enough to label it, nothing more. */
export interface PhotoSource {
  name: string;
  type: string;
  bytes: number;
}

interface PhotoState {
  status: PhotoStatus;
  source: PhotoSource | null;
  pixels: PhotoPixels | null;
  error: string | null;

  /** Which depth source the model pass should use (decision 6.2). */
  depthModel: DepthModelId;
  depth: DepthMap | null;
  depthStatus: StageStatus;
  depthProgress: JobProgress | null;
  depthError: string | null;

  load: (file: File) => Promise<void>;
  clear: () => void;
  setDepthModel: (model: DepthModelId) => void;
  estimateDepth: () => Promise<void>;
  cancelDepth: () => void;
}

/**
 * The photo and everything derived from it, held outside React (P6.1, P6.3).
 *
 * `pixels` is four megabytes for a 1024² image, so it is stored by reference
 * and never copied: zustand replaces the state *object*, not what its fields
 * point at. Nothing may mutate `pixels.data` in place — every later stage
 * reads it and writes its own buffer.
 *
 * A store rather than component state because the pixels outlive any one
 * panel: the depth pass (6.3), the importance map (6.4) and the sampler (6.5)
 * all read the same buffer, and P7.1 will move the previews into their own
 * pane entirely. React state would mean either prop-drilling a megabyte
 * through the tree or decoding it more than once.
 */
export const usePhotoStore = create<PhotoState>((set, get) => {
  // Two drops in quick succession would otherwise race: the slower decode
  // could land last and overwrite the newer photo. Only the most recent token
  // is allowed to write. `depthRun` does the same for the depth passes, which
  // is also how a cancelled run knows to stay quiet.
  let token = 0;
  let depthRun = 0;

  const idleDepth = {
    depth: null,
    depthStatus: "idle" as StageStatus,
    depthProgress: null,
    depthError: null,
  };

  return {
    status: "empty",
    source: null,
    pixels: null,
    error: null,
    depthModel: "depth-anything-v2-small",
    ...idleDepth,

    load: async (file: File) => {
      const mine = ++token;
      depthRun++;
      cancelJobs();
      set({
        status: "decoding",
        source: { name: file.name, type: file.type, bytes: file.size },
        pixels: null,
        error: null,
        ...idleDepth,
      });

      try {
        const pixels = await decodePhoto(file);
        if (mine !== token) return;
        set({ status: "ready", pixels, error: null });
        void get().estimateDepth();
      } catch (cause) {
        if (mine !== token) return;
        set({
          status: "error",
          pixels: null,
          error: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },

    clear: () => {
      token++;
      depthRun++;
      cancelJobs();
      set({ status: "empty", source: null, pixels: null, error: null, ...idleDepth });
    },

    setDepthModel: (model: DepthModelId) => {
      if (get().depthModel === model) return;
      set({ depthModel: model });
      if (get().pixels) void get().estimateDepth();
    },

    /**
     * Two passes, deliberately.
     *
     * The painter's-cue heuristic finishes in a few milliseconds, so the rest
     * of the pipeline has a usable depth map before the real model has even
     * started downloading — and if the model never arrives, that map is what
     * the cloud is built from rather than nothing at all. The model pass then
     * replaces it in place.
     */
    estimateDepth: async () => {
      const { pixels, depthModel } = get();
      if (!pixels) return;

      const mine = ++depthRun;
      set({
        depthStatus: "running",
        depthError: null,
        depthProgress: { stage: "painter's cues", value: -1 },
      });

      try {
        const quick = await runDepth(pixels, "heuristic");
        if (mine !== depthRun) return;
        set({ depth: quick });

        if (depthModel === "heuristic") {
          set({ depthStatus: "ready", depthProgress: null });
          return;
        }

        const estimated = await runDepth(pixels, depthModel, (progress) => {
          if (mine === depthRun) set({ depthProgress: progress });
        });
        if (mine !== depthRun) return;
        set({ depth: estimated, depthStatus: "ready", depthProgress: null });
      } catch (cause) {
        if (mine !== depthRun) return;
        // The heuristic map from the first pass is still in place, so this is
        // a warning with a working fallback, not a dead end.
        set({
          depthStatus: "error",
          depthProgress: null,
          depthError: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },

    cancelDepth: () => {
      depthRun++;
      cancelJobs();
      set({
        depthStatus: get().depth ? "ready" : "idle",
        depthProgress: null,
      });
    },
  };
});
