"use client";

/**
 * How the tool is arranged, as opposed to what it is set to (P7.1).
 *
 * Collapsed panels, whether the inspector is showing, which pipeline stage is
 * being looked at, whether the help sheet is open. None of it is a parameter,
 * none of it is exported, and none of it belongs in the undo history.
 *
 * It lives in a store rather than in the shell component for the same reason
 * the parameters do: only the pieces that care subscribe, so collapsing a
 * panel re-renders the inspector and leaves the viewport alone.
 */
import { create } from "zustand";

export type StageView = "cloud" | "photo" | "depth" | "importance" | "points";

interface UiState {
  inspectorOpen: boolean;
  collapsed: Record<string, boolean>;
  stage: StageView;
  helpOpen: boolean;

  toggleInspector: () => void;
  setInspectorOpen: (open: boolean) => void;
  setCollapsed: (panel: string, collapsed: boolean) => void;
  setAllCollapsed: (panels: readonly string[], collapsed: boolean) => void;
  setStage: (stage: StageView) => void;
  toggleHelp: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  inspectorOpen: true,
  collapsed: {},
  stage: "cloud",
  helpOpen: false,

  toggleInspector: () => set((state) => ({ inspectorOpen: !state.inspectorOpen })),
  setInspectorOpen: (inspectorOpen) => set({ inspectorOpen }),

  setCollapsed: (panel, collapsed) =>
    set((state) => ({ collapsed: { ...state.collapsed, [panel]: collapsed } })),

  setAllCollapsed: (panels, collapsed) =>
    set(() => ({
      collapsed: Object.fromEntries(panels.map((panel) => [panel, collapsed])),
    })),

  setStage: (stage) => set({ stage }),
  toggleHelp: () => set((state) => ({ helpOpen: !state.helpOpen })),
}));
