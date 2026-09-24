"use client";

import { Button, Kbd } from "@atelier/ui";

import { stringValue } from "@/params/schema";
import { useParamsStore } from "@/store/params-store";
import { usePhotoStore } from "@/store/photo-store";
import { useSessionStore } from "@/store/session-store";
import { useUiStore } from "@/store/ui-store";

interface Shortcut {
  keys: readonly string[];
  action: string;
}

/**
 * The list, written once.
 *
 * It is a separate constant from the handler in `use-shortcuts.ts`, which is a
 * real duplication and a deliberate one: driving the handler from this table
 * would mean encoding modifiers, `preventDefault` and the typing guard as
 * data, and the table would stop being readable long before the handler
 * started being shorter. The test that keeps them honest is the one you are
 * reading this in — a help sheet nobody can find is worse than none.
 */
const SHORTCUTS: readonly { group: string; items: readonly Shortcut[] }[] = [
  {
    group: "Viewport",
    items: [
      { keys: ["Space"], action: "Play / pause the drift" },
      { keys: ["R"], action: "Replay the intro" },
      { keys: ["P"], action: "Save a PNG of the viewport" },
      { keys: ["Drag"], action: "Orbit · right-drag or shift to pan · wheel to dolly" },
    ],
  },
  {
    group: "Pipeline stages",
    items: [
      { keys: ["1"], action: "The cloud" },
      { keys: ["2"], action: "The photo, decoded and downscaled" },
      { keys: ["3"], action: "The depth map" },
      { keys: ["4"], action: "The importance map" },
      { keys: ["5"], action: "Where the points landed" },
    ],
  },
  {
    group: "Editing",
    items: [
      { keys: ["Ctrl", "Z"], action: "Undo — one step per drag" },
      { keys: ["Ctrl", "Shift", "Z"], action: "Redo" },
      { keys: ["C"], action: "Show or hide the inspector" },
      { keys: ["?"], action: "This sheet" },
      { keys: ["Esc"], action: "Close it" },
    ],
  },
];

/**
 * The shortcut sheet (P7.7).
 *
 * A tool with keyboard shortcuts and no way to discover them has shortcuts for
 * the person who wrote it and nobody else.
 */
export function HelpOverlay() {
  const open = useUiStore((state) => state.helpOpen);
  const toggleHelp = useUiStore((state) => state.toggleHelp);
  // P9 — the perf readout used to be a status bar across the bottom. It is
  // here now: numbers you go looking for, rather than numbers you stare at
  // all day. Subscribing only matters while the sheet is open, and the sheet
  // is the only thing that renders them.
  const stats = useSessionStore((state) => state.stats);
  const tier = useSessionStore((state) => state.tier);
  const quality = useParamsStore((state) => stringValue(state.values, "quality"));
  const depth = usePhotoStore((state) => state.depth);

  if (!open) return null;

  return (
    // Not a `<dialog>`: this must not trap focus or block the page. The canvas
    // keeps rendering behind it, and clicking anywhere dismisses it.
    <div
      role="presentation"
      onClick={toggleHelp}
      className="absolute inset-0 z-30 flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"
    >
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        onClick={(event) => event.stopPropagation()}
        className="max-h-full w-full max-w-md overflow-y-auto rounded-xl border border-border/12 bg-popover/95 p-4 shadow-lg backdrop-blur-md"
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs-plus font-medium text-foreground">Keyboard shortcuts</h2>
          <Button variant="ghost-muted" size="xs" onClick={toggleHelp}>
            Close
          </Button>
        </div>

        <div className="flex flex-col gap-3">
          {SHORTCUTS.map((section) => (
            <section key={section.group}>
              <h3 className="mb-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase">
                {section.group}
              </h3>
              <ul className="flex flex-col gap-1">
                {section.items.map((shortcut) => (
                  <li
                    key={shortcut.action}
                    className="flex items-baseline justify-between gap-3 text-xs-plus text-muted-foreground"
                  >
                    <span className="min-w-0">{shortcut.action}</span>
                    <span className="flex shrink-0 items-center gap-1">
                      {shortcut.keys.map((key, index) => (
                        <span key={key} className="flex items-center gap-1">
                          {index > 0 && <span className="text-2xs">+</span>}
                          <Kbd>{key}</Kbd>
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

        <p className="mt-3 text-2xs text-muted-foreground">
          Shortcuts are ignored while a text field has focus, so Ctrl+Z still means
          what it usually does there.
        </p>

        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 border-t border-border/10 pt-3 font-mono text-2xs text-muted-foreground tabular-nums">
          <span>{stats ? `${stats.fps} fps` : "measuring…"}</span>
          {stats && (
            <>
              <span>
                {stats.calls} draw call{stats.calls === 1 ? "" : "s"}
              </span>
              <span>{stats.points.toLocaleString("en-US")} points</span>
            </>
          )}
          <span>quality: {quality === "auto" ? `auto (${tier ?? "…"})` : quality}</span>
          {depth && <span>depth: {depth.kind}</span>}
        </div>
      </div>
    </div>
  );
}
