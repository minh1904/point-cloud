"use client";

/**
 * Saved looks, and the last one you were working on (P7.5).
 *
 * ## Why persistence has to wait for the browser
 *
 * The inspector is server-rendered. `localStorage` does not exist on the
 * server, so reading it while rendering would produce different markup on the
 * two sides and React would report a hydration mismatch — the same class of
 * bug as `Date.now()` in a component.
 *
 * So nothing is read until `hydrate()` runs in an effect, after the first
 * paint. The cost is that the tool opens on defaults for a frame; the benefit
 * is that it opens at all.
 *
 * ## Why saving is throttled
 *
 * The params store changes sixty times a second during a drag, and
 * `localStorage.setItem` is synchronous — it blocks the main thread, which is
 * the one thing P7.3 just went to some trouble to keep free. Writing at most
 * once every 500ms makes it invisible, and losing half a second of slider
 * position to a browser crash is not a real loss.
 */
import { create } from "zustand";

import { sanitiseValues, type ParamValues } from "@/params/schema";
import type { Preset } from "@/params/presets";

import { useParamsStore } from "./params-store";

const VALUES_KEY = "point-cloud:params:v1";
const PRESETS_KEY = "point-cloud:presets:v1";
const SAVE_DELAY_MS = 500;

interface PresetsState {
  /** User-saved presets. The built-ins are a constant, not state. */
  presets: readonly Preset[];
  /** False until the browser's copy has been read. */
  hydrated: boolean;

  hydrate: () => () => void;
  save: (name: string) => void;
  remove: (name: string) => void;
}

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    // Private mode, a full quota, or a half-written value from a crash. None
    // of them are worth breaking the app over — defaults are a fine answer.
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded or storage disabled. Nothing here is precious enough to
    // interrupt someone over.
  }
}

/** Anything in storage was written by an older build, so check it. */
function parsePresets(raw: unknown): Preset[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter(
      (entry): entry is { name: string; values: unknown } =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as { name?: unknown }).name === "string",
    )
    .map((entry) => ({ name: entry.name, values: sanitiseValues(entry.values) }));
}

export const usePresetsStore = create<PresetsState>((set, get) => ({
  presets: [],
  hydrated: false,

  /**
   * Read storage, then keep it in step. Returns an unsubscribe, so the effect
   * that calls this can clean up after itself in the usual way.
   */
  hydrate: () => {
    if (!get().hydrated) {
      const storedValues = readJson(VALUES_KEY);
      if (storedValues) {
        // Straight into the store, not through `setAll`: restoring where you
        // left off is not an edit, and it should not be the first thing
        // Ctrl+Z undoes.
        useParamsStore.setState({ values: sanitiseValues(storedValues) });
      }

      set({ presets: parsePresets(readJson(PRESETS_KEY)), hydrated: true });
    }

    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsubscribe = useParamsStore.subscribe((state) => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        writeJson(VALUES_KEY, state.values);
      }, SAVE_DELAY_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  },

  save: (name) => {
    const trimmed = name.trim();
    if (!trimmed) return;

    const values = useParamsStore.getState().values;
    // Saving over a name replaces it in place rather than appending, which is
    // what "save" means everywhere else.
    const others = get().presets.filter((preset) => preset.name !== trimmed);
    const presets = [...others, { name: trimmed, values }];

    set({ presets });
    writeJson(PRESETS_KEY, presets);
  },

  remove: (name) => {
    const presets = get().presets.filter((preset) => preset.name !== name);
    set({ presets });
    writeJson(PRESETS_KEY, presets);
  },
}));

/** Apply a saved look. One undoable step, because it is an edit. */
export function applyPreset(values: ParamValues): void {
  useParamsStore.getState().setAll(values);
}
