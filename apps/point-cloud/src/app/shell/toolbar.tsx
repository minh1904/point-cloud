"use client";

import { Button } from "@atelier/ui";
import type { RefObject } from "react";

import { useParamsStore } from "@/store/params-store";
import { useSessionStore } from "@/store/session-store";
import { useUiStore } from "@/store/ui-store";
import type { OrbitControlsHandle } from "@/scene/stage";

/**
 * The actions, in a bar of their own (P7.1).
 *
 * Nothing here reads a parameter, so nothing here re-renders while a slider
 * moves. The only subscriptions are `playing`, `inspectorOpen` and whether
 * undo is possible — all things that change when someone presses something.
 *
 * ## How it narrows
 *
 * The actions **scroll sideways** rather than disappearing. Hiding buttons
 * below a breakpoint is the usual move and it is the wrong one here: every
 * action has a keyboard shortcut, and a phone has no keyboard, so a hidden
 * button on a phone is a lost feature rather than a tidier bar.
 *
 * So the left group takes whatever space is left (`min-w-0 flex-1`) and
 * scrolls inside it, while the right group — the two ways *out* of wherever
 * you are — stays pinned where it can always be reached. The scrollbar itself
 * is hidden, because a scrollbar inside a 28px bar is a smear rather than an
 * affordance.
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
  // A boolean selector, not the arrays themselves: the toolbar should re-render
  // when undo becomes possible, not every time a step is pushed.
  const canUndo = useParamsStore((state) => state.past.length > 0);
  const canRedo = useParamsStore((state) => state.future.length > 0);
  const undo = useParamsStore((state) => state.undo);
  const redo = useParamsStore((state) => state.redo);

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/10 bg-popover/60 px-2 py-1.5 backdrop-blur-md">
      <div
        className={[
          "flex min-w-0 flex-1 items-center gap-1 overflow-x-auto",
          // No scrollbar: it would be a grey smear across a 28px bar.
          "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          // Every child keeps its width; the row scrolls instead of squashing.
          "[&>*]:shrink-0",
        ].join(" ")}
      >
        <span className="mr-1 hidden px-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase lg:inline">
          Point Cloud
        </span>

        <Button variant="outline" className="h-8 sm:h-7" onClick={togglePlaying}>
          {playing ? "Pause" : "Play"}
        </Button>
        {/* Restores the camera state the controls saved when they mounted. */}
        <Button
          variant="ghost-muted"
          className="h-8 sm:h-7"
          onClick={() => controls.current?.reset()}
        >
          Reset<span className="hidden sm:inline">&nbsp;view</span>
        </Button>
        <Button variant="ghost-muted" className="h-8 sm:h-7" onClick={replayIntro}>
          <span className="hidden sm:inline">Replay&nbsp;</span>Intro
        </Button>

        <span className="mx-1 hidden h-4 w-px bg-border/20 sm:block" />

        <Button
          variant="ghost-muted"
          className="h-8 sm:h-7"
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          onClick={undo}
        >
          Undo
        </Button>
        <Button
          variant="ghost-muted"
          className="h-8 sm:h-7"
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
          onClick={redo}
        >
          Redo
        </Button>

        <span className="mx-1 hidden h-4 w-px bg-border/20 sm:block" />

        {/* P9.3 — the still is grabbed inside the next frame, not here: the
            drawing buffer is only valid while the frame is being rendered. */}
        <Button
          variant="ghost-muted"
          className="h-8 sm:h-7"
          title="Save a PNG of the viewport (P)"
          onClick={requestStill}
        >
          PNG
        </Button>
      </div>

      {/* Pinned: the two ways out of wherever you are. */}
      <div className="flex shrink-0 items-center gap-1 border-l border-border/10 pl-1">
        <Button
          variant="ghost-muted"
          className="h-8 sm:h-7"
          title="Keyboard shortcuts (?)"
          onClick={toggleHelp}
        >
          ?
        </Button>
        <Button variant="ghost-muted" className="h-8 sm:h-7" onClick={toggleInspector}>
          {inspectorOpen ? "Hide" : "Controls"}
        </Button>
      </div>
    </div>
  );
}
