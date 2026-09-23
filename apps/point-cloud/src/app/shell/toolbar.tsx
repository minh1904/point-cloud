"use client";

import { Button } from "@atelier/ui";
import type { RefObject } from "react";

import { useSessionStore } from "@/store/session-store";
import { useUiStore } from "@/store/ui-store";
import type { OrbitControlsHandle } from "@/scene/stage";

/**
 * The actions, in a bar of their own (P7.1).
 *
 * Nothing here reads a parameter, so nothing here re-renders while a slider
 * moves. The only subscriptions are `playing` and `inspectorOpen`, both of
 * which change when someone deliberately presses something.
 */
export function Toolbar({
  controls,
}: {
  controls: RefObject<OrbitControlsHandle | null>;
}) {
  const playing = useSessionStore((state) => state.playing);
  const togglePlaying = useSessionStore((state) => state.togglePlaying);
  const replayIntro = useSessionStore((state) => state.replayIntro);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);
  const toggleInspector = useUiStore((state) => state.toggleInspector);
  const toggleHelp = useUiStore((state) => state.toggleHelp);

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-border/10 bg-popover/60 px-2 py-1.5 backdrop-blur-md">
      <span className="mr-1 hidden px-1 text-2xs font-medium tracking-wide text-muted-foreground uppercase sm:inline">
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

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost-muted" className="h-8 sm:h-7" onClick={toggleHelp}>
          ?
        </Button>
        <Button variant="ghost-muted" className="h-8 sm:h-7" onClick={toggleInspector}>
          {inspectorOpen ? "Hide" : "Controls"}
        </Button>
      </div>
    </div>
  );
}
