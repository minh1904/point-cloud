"use client";

import { create } from "zustand";

import { decodePhoto, type PhotoPixels } from "@/photo/decode-image";

export type PhotoStatus = "empty" | "decoding" | "ready" | "error";

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
  load: (file: File) => Promise<void>;
  clear: () => void;
}

/**
 * The photo, held outside React (P6.1).
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
  // is allowed to write.
  let token = 0;

  return {
    status: "empty",
    source: null,
    pixels: null,
    error: null,

    load: async (file: File) => {
      const mine = ++token;
      set({
        status: "decoding",
        source: { name: file.name, type: file.type, bytes: file.size },
        pixels: null,
        error: null,
      });

      try {
        const pixels = await decodePhoto(file);
        if (mine !== token) return;
        set({ status: "ready", pixels, error: null });
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
      if (get().status === "empty") return;
      set({ status: "empty", source: null, pixels: null, error: null });
    },
  };
});
