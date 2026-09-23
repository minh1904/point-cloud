"use client";

import { create } from "zustand";

import { importBundle } from "@/bundle/import-bundle";
import { decodePhoto, type PhotoPixels } from "@/photo/decode-image";
import type { DepthMap, DepthModelId } from "@/photo/depth/depth-map";
import {
  defaultImportanceWeights,
  mixImportance,
  type ImportanceComponents,
  type ImportanceWeights,
} from "@/photo/importance";
import type { PackedBundle } from "@/photo/pack-bundle";
import { useParamsStore } from "./params-store";
import {
  cancelJobs,
  runBuild,
  runDepth,
  runImportance,
  type JobProgress,
} from "@/photo/worker-client";

export type PhotoStatus = "empty" | "decoding" | "ready" | "error";

/** Texture sides the cloud can be packed into — one particle per texel. */
export const CLOUD_SIZES = [128, 192, 256, 512] as const;

export interface BuildParams {
  /** Side of the square data texture; `size²` points. */
  size: number;
  /** World width the cloud spans. Matches the sample bundle's 3 units. */
  fieldWidth: number;
  /** Relief as a fraction of the width (6.7). */
  reliefRatio: number;
  /** Candidates weighed per placed point (6.5). */
  candidates: number;
  /** Same seed, same cloud. */
  seed: number;
}

export const defaultBuildParams: BuildParams = {
  size: 256,
  fieldWidth: 3,
  reliefRatio: 0.03,
  candidates: 8,
  seed: 1,
};
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

  /** The three detail measurements, computed once per depth map (6.4). */
  components: ImportanceComponents | null;
  weights: ImportanceWeights;
  importanceStatus: StageStatus;
  importanceError: string | null;

  /** How the cloud is built from the maps (6.5-6.9). */
  build: BuildParams;
  bundle: PackedBundle | null;
  buildStatus: StageStatus;
  buildProgress: JobProgress | null;
  buildError: string | null;

  /** Set when the cloud came from a zip rather than from a photo (8.5). */
  importedName: string | null;
  importError: string | null;

  load: (file: File) => Promise<void>;
  clear: () => void;
  setDepthModel: (model: DepthModelId) => void;
  estimateDepth: () => Promise<void>;
  cancelDepth: () => void;
  setWeight: (key: keyof ImportanceWeights, value: number) => void;
  resetWeights: () => void;
  setBuildParam: <K extends keyof BuildParams>(key: K, value: BuildParams[K]) => void;
  reseed: () => void;
  buildCloud: () => Promise<void>;
  loadBundleFile: (file: File) => Promise<void>;
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
  let importanceRun = 0;
  let buildRun = 0;

  const idleDepth = {
    depth: null,
    depthStatus: "idle" as StageStatus,
    depthProgress: null,
    depthError: null,
    components: null,
    importanceStatus: "idle" as StageStatus,
    importanceError: null,
    bundle: null,
    buildStatus: "idle" as StageStatus,
    buildProgress: null,
    buildError: null,
    importedName: null,
    importError: null,
  };

  /**
   * Re-measure detail against whatever depth map is current.
   *
   * Called after *each* of the two depth passes, because the depth-edge term
   * is only as good as the depth it was measured from — the heuristic version
   * exists so the sliders do something during the model download, and the
   * model version is the one that gets used.
   */
  const measureImportance = async (): Promise<void> => {
    const { pixels, depth } = get();
    if (!pixels || !depth) return;

    const mine = ++importanceRun;
    set({ importanceStatus: "running", importanceError: null });

    try {
      const components = await runImportance(pixels, depth);
      if (mine !== importanceRun) return;
      set({ components, importanceStatus: "ready" });

      // Build once, automatically, as soon as there is a final depth map to
      // build from: dropping a photo should produce a cloud, not a to-do list.
      // Still running means the model pass is on its way and will trigger a
      // better build when it lands.
      if (get().depthStatus !== "running") void get().buildCloud();
    } catch (cause) {
      if (mine !== importanceRun) return;
      set({
        importanceStatus: "error",
        importanceError: cause instanceof Error ? cause.message : String(cause),
      });
    }
  };

  return {
    status: "empty",
    source: null,
    pixels: null,
    error: null,
    depthModel: "depth-anything-v2-small",
    weights: defaultImportanceWeights,
    build: defaultBuildParams,
    ...idleDepth,

    load: async (file: File) => {
      const mine = ++token;
      depthRun++;
      importanceRun++;
      buildRun++;
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
      importanceRun++;
      buildRun++;
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
        void measureImportance();

        if (depthModel === "heuristic") {
          set({ depthStatus: "ready", depthProgress: null });
          return;
        }

        const estimated = await runDepth(pixels, depthModel, (progress) => {
          if (mine === depthRun) set({ depthProgress: progress });
        });
        if (mine !== depthRun) return;
        set({ depth: estimated, depthStatus: "ready", depthProgress: null });
        void measureImportance();
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

    /**
     * Load a cloud from an exported zip (8.5).
     *
     * Everything upstream is cleared, because none of it applies: there is no
     * photo behind an imported cloud, no depth map, no importance map. What
     * arrives is the end of the pipeline, and the renderer cannot tell the
     * difference — which is the whole claim the format makes.
     */
    loadBundleFile: async (file: File) => {
      const mine = ++token;
      depthRun++;
      importanceRun++;
      buildRun++;
      cancelJobs();
      set({ status: "empty", source: null, pixels: null, error: null, ...idleDepth });

      try {
        const { bundle, params } = await importBundle(file);
        if (mine !== token) return;

        // The look goes through `setAll`, so it is one undoable step: opening
        // a bundle should be reversible like any other edit.
        if (params) useParamsStore.getState().setAll(params);
        set({
          bundle,
          buildStatus: "ready",
          importedName: file.name,
          importError: null,
        });
      } catch (cause) {
        if (mine !== token) return;
        set({ importError: cause instanceof Error ? cause.message : String(cause) });
      }
    },

    cancelDepth: () => {
      depthRun++;
      importanceRun++;
      buildRun++;
      cancelJobs();
      set({
        depthStatus: get().depth ? "ready" : "idle",
        depthProgress: null,
        importanceStatus: get().components ? "ready" : "idle",
        buildStatus: get().bundle ? "ready" : "idle",
        buildProgress: null,
      });
    },

    setWeight: (key, value) =>
      set((state) => ({ weights: { ...state.weights, [key]: value } })),

    resetWeights: () => set({ weights: defaultImportanceWeights }),

    setBuildParam: (key, value) =>
      set((state) => ({ build: { ...state.build, [key]: value } })),

    // A new seed is a different cloud from the same photo: the sampler, the
    // shuffle and therefore every per-particle hash downstream all move.
    reseed: () =>
      set((state) => ({ build: { ...state.build, seed: state.build.seed + 1 } })),

    /**
     * Run 6.5 through 6.9 over the current maps.
     *
     * The importance map is mixed here rather than in the worker because the
     * weights live here and the mix is three multiplies per pixel — sending
     * the four sliders and the three components would be more data and more
     * coupling for no saving.
     */
    buildCloud: async () => {
      const { pixels, depth, components, weights, build } = get();
      if (!pixels || !depth || !components) return;

      const mine = ++buildRun;
      set({ buildStatus: "running", buildError: null, buildProgress: null });

      try {
        const bundle = await runBuild(
          {
            photo: pixels,
            depth,
            importance: mixImportance(components, weights),
            size: build.size,
            fieldWidth: build.fieldWidth,
            relief: build.fieldWidth * build.reliefRatio,
            candidates: build.candidates,
            seed: build.seed,
          },
          (progress) => {
            if (mine === buildRun) set({ buildProgress: progress });
          },
        );
        if (mine !== buildRun) return;
        set({ bundle, buildStatus: "ready", buildProgress: null });
      } catch (cause) {
        if (mine !== buildRun) return;
        set({
          buildStatus: "error",
          buildProgress: null,
          buildError: cause instanceof Error ? cause.message : String(cause),
        });
      }
    },
  };
});
