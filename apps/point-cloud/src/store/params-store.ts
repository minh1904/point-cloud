"use client";

/**
 * Every knob's current value, and nothing that renders (P7.3).
 *
 * The problem this solves: a slider drag fires sixty times a second, and with
 * the values in React state each of those was a `setState` on `Studio`, a
 * re-render of the whole tree under it — `Stage`, `Canvas`, `ParticleField`,
 * the effect that copies params into uniforms — to change one float on the GPU.
 * It worked, and the comment `roadmap step 7.3 moves this to transient store
 * updates` sat in `studio.tsx` from P1 waiting for this.
 *
 * The fix has two halves:
 *
 * 1. The values live **outside React**, here. Writing one is a plain object
 *    replacement in a store.
 * 2. The scene reads them **inside `useFrame`** with `getState()`, which does
 *    not subscribe. A slider moving therefore renders exactly one thing: the
 *    slider.
 *
 * Only the inspector subscribes, and only the control being dragged re-renders
 * — the rest of the tree is untouched, which is what "tweaking a slider never
 * re-mounts the canvas" means in practice.
 */
import { create } from "zustand";

import {
  coerce,
  defaultValues,
  PARAM_BY_KEY,
  paramsInGroup,
  type GroupId,
  type ParamValue,
  type ParamValues,
} from "@/params/schema";

/** How many steps back the history keeps. Snapshots are ~20 numbers each. */
const HISTORY_LIMIT = 100;

interface ParamsState {
  values: ParamValues;
  /** Snapshots before each committed change, oldest first. */
  past: readonly ParamValues[];
  future: readonly ParamValues[];

  /** Live write during a drag. Deliberately does not touch history. */
  set: (key: string, value: ParamValue) => void;
  /** End of a gesture: fold everything since the last commit into one step. */
  commit: () => void;
  /** Replace everything at once — a preset, an import. Its own history step. */
  setAll: (values: ParamValues) => void;
  reset: () => void;
  resetGroup: (group: GroupId) => void;
  undo: () => void;
  redo: () => void;
}

/** Shallow equality is enough: every value is a number, boolean or string. */
function sameValues(a: ParamValues, b: ParamValues): boolean {
  for (const key in a) if (a[key] !== b[key]) return false;
  return true;
}

export const useParamsStore = create<ParamsState>((set, get) => {
  /**
   * The values as they were before the gesture in progress (P7.4).
   *
   * This is the whole of "drag coalescing". A slider fires `onValueChange`
   * sixty times a second and `onValueCommitted` once, on pointer up. Pushing
   * history on every change would make Ctrl+Z step back through a drag one
   * frame at a time — technically undo, practically useless. So the first
   * write of a gesture remembers where it started, every later write is free,
   * and the commit turns the whole thing into a single entry.
   *
   * Keeping it outside the store state is deliberate: it is bookkeeping, not
   * something anything should subscribe to or render from.
   */
  let gestureStart: ParamValues | null = null;

  /** Push `before` onto the past and drop the redo branch. */
  const pushHistory = (before: ParamValues) =>
    set((state) => ({
      past: [...state.past, before].slice(-HISTORY_LIMIT),
      // Redo only means anything while you are still walking back the same
      // path. Change something and the branch you had walked away from is
      // gone — the same rule every editor uses.
      future: [],
    }));

  return {
    values: defaultValues(),
    past: [],
    future: [],

    set: (key, value) => {
      const param = PARAM_BY_KEY.get(key);
      if (!param) return;

      const next = coerce(param, value);
      const state = get();
      if (state.values[key] === next) return;

      gestureStart ??= state.values;
      set({ values: { ...state.values, [key]: next } });
    },

    commit: () => {
      const before = gestureStart;
      gestureStart = null;
      if (before && !sameValues(before, get().values)) pushHistory(before);
    },

    setAll: (values) => {
      const before = gestureStart ?? get().values;
      gestureStart = null;
      if (sameValues(before, values)) return;
      pushHistory(before);
      set({ values });
    },

    reset: () => get().setAll(defaultValues()),

    resetGroup: (group) => {
      const values = { ...get().values };
      for (const param of paramsInGroup(group)) values[param.key] = param.default;
      get().setAll(values);
    },

    undo: () => {
      gestureStart = null;
      const { past, future, values } = get();
      const previous = past[past.length - 1];
      if (!previous) return;

      set({ past: past.slice(0, -1), values: previous, future: [values, ...future] });
    },

    redo: () => {
      gestureStart = null;
      const { past, future, values } = get();
      const next = future[0];
      if (!next) return;

      set({ past: [...past, values], values: next, future: future.slice(1) });
    },
  };
});

/**
 * Read the values without subscribing.
 *
 * This is the call the frame loop makes. Importing `useParamsStore.getState`
 * directly would work just as well; naming it says out loud that reading here
 * is *meant* not to cause a render.
 */
export function readParams(): ParamValues {
  return useParamsStore.getState().values;
}
