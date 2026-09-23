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

interface ParamsState {
  values: ParamValues;
  /** Live write during a drag. Deliberately does not touch history (7.4). */
  set: (key: string, value: ParamValue) => void;
  /** Replace everything at once — a preset, an undo step, an import. */
  setAll: (values: ParamValues) => void;
  reset: () => void;
  resetGroup: (group: GroupId) => void;
}

export const useParamsStore = create<ParamsState>((set) => ({
  values: defaultValues(),

  set: (key, value) => {
    const param = PARAM_BY_KEY.get(key);
    if (!param) return;

    set((state) => ({ values: { ...state.values, [key]: coerce(param, value) } }));
  },

  setAll: (values) => set({ values }),

  reset: () => set({ values: defaultValues() }),

  resetGroup: (group) =>
    set((state) => {
      const values = { ...state.values };
      for (const param of paramsInGroup(group)) values[param.key] = param.default;
      return { values };
    }),
}));

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
