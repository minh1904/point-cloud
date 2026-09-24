"use client";

/**
 * Things the tool is doing right now, as opposed to what it is set to (P7.1).
 *
 * Playing, the intro counter and the render stats are not parameters: they are
 * not saved in a preset, not exported, and not part of the undo history. They
 * live here so that `Stage` needs no props at all — which is what lets the
 * viewport sit in the tree as an element that never changes identity, and
 * therefore never re-renders when the inspector does.
 */
import { create } from "zustand";

import type { QualityTier } from "@/scene/quality";

export interface RenderStats {
  fps: number;
  calls: number;
  points: number;
}

interface SessionState {
  /** Pause freezes the drift. The intro runs on its own clock regardless. */
  playing: boolean;
  /** Bumped to run the intro again; the scene compares it against what it saw. */
  introRun: number;
  stats: RenderStats | null;
  /**
   * What the device looks capable of (P9.2). Null until an effect has run:
   * the server cannot know, and guessing during render would not survive
   * hydration.
   */
  tier: QualityTier | null;
  /** Bumped to ask for a still; the scene compares it against what it saw. */
  stillRequest: number;
  recording: boolean;

  togglePlaying: () => void;
  replayIntro: () => void;
  setStats: (stats: RenderStats) => void;
  setTier: (tier: QualityTier) => void;
  requestStill: () => void;
  toggleRecording: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  playing: true,
  introRun: 0,
  stats: null,
  tier: null,
  stillRequest: 0,
  recording: false,

  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  replayIntro: () => set((state) => ({ introRun: state.introRun + 1 })),
  setStats: (stats) => set({ stats }),
  setTier: (tier) => set({ tier }),
  requestStill: () => set((state) => ({ stillRequest: state.stillRequest + 1 })),
  toggleRecording: () => set((state) => ({ recording: !state.recording })),
}));

/** Read without subscribing — for `useFrame`, same reasoning as the params. */
export function readSession() {
  return useSessionStore.getState();
}
