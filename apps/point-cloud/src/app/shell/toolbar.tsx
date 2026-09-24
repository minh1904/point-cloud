"use client";

import { Button } from "@atelier/ui";
import type { RefObject } from "react";

import { useParamsStore } from "@/store/params-store";
import { useSessionStore } from "@/store/session-store";
import { useUiStore } from "@/store/ui-store";
import type { OrbitControlsHandle } from "@/scene/stage";

/**
 * The actions, floating over the bottom of the viewport.
 *
 * ## Why it moved off the top
 *
 * A bar across the top is a *document* pattern — it belongs to a page you read
 * downward. A tool whose subject is a picture wants the opposite: the picture
 * gets the whole rectangle, and the controls float over the edge of it, near
 * where the hands already are. Figma, Figjam and every canvas editor since
 * have converged on the same place for the same reason.
 *
 * It also buys back a row of vertical space for the thing the app is actually
 * about, which on a laptop is worth more than it sounds.
 *
 * ## What it is careful about
 *
 * Nothing here reads a parameter, so nothing here re-renders while a slider
 * moves. The only subscriptions are `playing`, `inspectorOpen` and whether
 * undo is possible — all things that change when somebody presses something.
 *
 * The row **scrolls sideways** when it runs out of room rather than hiding
 * buttons. Hiding below a breakpoint is the usual move and the wrong one here:
 * every action has a keyboard shortcut, and a phone has no keyboard, so a
 * hidden button on a phone is a lost feature rather than a tidier bar.
 */
export function Toolbar({
  controls,
}: {
  controls: RefObject<OrbitControlsHandle | null>;
}) {
  const playing = useSessionStore((state) => state.playing);
  const togglePlaying = useSessionStore((state) => state.togglePlaying);
  const replayIntro = useSessionStore((state) => state.replayIntro);
  const requestStill = useSessionStore((state) => state.requestStill);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const toggleHelp = useUiStore((state) => state.toggleHelp);
  // A boolean selector, not the arrays themselves: the bar should re-render
  // when undo becomes possible, not every time a step is pushed.
  const canUndo = useParamsStore((state) => state.past.length > 0);
  const canRedo = useParamsStore((state) => state.future.length > 0);
  const undo = useParamsStore((state) => state.undo);
  const redo = useParamsStore((state) => state.redo);

  return (
    // The wrapper is only there to centre the pill: a pointer-events-none
    // strip, so the half of the viewport either side of the bar still orbits
    // the camera instead of hitting an invisible box.
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex justify-center p-2 sm:p-3">
      <div
        className={[
          "pointer-events-auto flex items-center gap-0.5 overflow-x-auto",
          "max-w-full rounded-xl border border-border/12 bg-popover/90 p-1",
          "shadow-lg shadow-black/20 backdrop-blur-md",
          // No scrollbar: inside a 36px pill it is a smear, not an affordance.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Children keep their width; the row scrolls instead of squashing.
          "[&>*]:shrink-0",
        ].join(" ")}
      >
        <Button variant="outline" size="sm" title="Play / pause the drift (Space)" onClick={togglePlaying}>
          {playing ? "Pause" : "Play"}
        </Button>
        {/* Restores the camera state the controls saved when they mounted. */}
        <Button
          variant="ghost-muted"
          size="sm"
          title="Reset the camera"
          onClick={() => controls.current?.reset()}
        >
          Reset
        </Button>
        <Button variant="ghost-muted" size="sm" title="Replay the intro (R)" onClick={replayIntro}>
          Intro
        </Button>

        <span className="mx-0.5 h-4 w-px bg-border/20" />

        <Button
          variant="ghost-muted"
          size="sm"
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          onClick={undo}
        >
          Undo
        </Button>
        <Button
          variant="ghost-muted"
          size="sm"
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          onClick={redo}
        >
          Redo
        </Button>

        <span className="mx-0.5 h-4 w-px bg-border/20" />

        {/* P9.3 — the still is grabbed inside the next frame, not here: the
            drawing buffer is only valid while the frame is being rendered. */}
        <Button variant="ghost-muted" size="sm" title="Save a PNG of the viewport (P)" onClick={requestStill}>
          PNG
        </Button>
        <Button variant="ghost-muted" size="sm" title="Keyboard shortcuts (?)" onClick={toggleHelp}>
          ?
        </Button>
        <Button
          variant={inspectorOpen ? "ghost-muted" : "outline"}
          size="sm"
          title="Show or hide the inspector (C)"
          onClick={toggleInspector}
        >
          {inspectorOpen ? "Hide" : "Controls"}
        </Button>
      </div>
    </div>
  );
}
