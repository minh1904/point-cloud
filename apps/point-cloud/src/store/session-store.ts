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

  togglePlaying: () => void;
  replayIntro: () => void;
  setStats: (stats: RenderStats) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  playing: true,
  introRun: 0,
  stats: null,

  togglePlaying: () => set((state) => ({ playing: !state.playing })),
  replayIntro: () => set((state) => ({ introRun: state.introRun + 1 })),
  setStats: (stats) => set({ stats }),
}));

/** Read without subscribing — for `useFrame`, same reasoning as the params. */
export function readSession() {
  return useSessionStore.getState();
}
