"use client";

import { cn } from "@atelier/ui";
import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";

import type { OrbitControlsHandle } from "@/scene/stage";
import { detectTier } from "@/scene/quality";
import { usePresetsStore } from "@/store/presets-store";
import { useSessionStore } from "@/store/session-store";
import { useUiStore } from "@/store/ui-store";

import { Inspector } from "../inspector/inspector";
import { HelpOverlay } from "./help-overlay";
import { StageOverlay, StageTabs } from "./stage-view";
import { Toolbar } from "./toolbar";
import { useShortcuts } from "./use-shortcuts";

// WebGL only exists in the browser, so the canvas is never server-rendered:
// no empty markup to hydrate, and scene code may touch window freely.
const Stage = dynamic(() => import("@/scene/stage").then((m) => m.Stage), {
  ssr: false,
});

/**
 * The tool's frame: a viewport, an inspector, and a toolbar floating over the
 * picture (P7.1, rearranged at P9).
 *
 * ## Why this replaced floating panels
 *
 * Through P5 and P6 the controls were cards floating over a full-bleed canvas.
 * That reads well in a screenshot and stops working at eight panels: the
 * column scrolls over the picture, its header showed the panels sliding
 * underneath, and the viewport has no honest aspect ratio because part of it is
 * always hidden. Docking the inspector gives the canvas a rectangle it owns.
 *
 * The *actions* went the other way. A bar across the top is a document
 * pattern; a tool whose subject is a picture gives the picture the whole
 * rectangle and floats its controls over the bottom edge, near where the hands
 * already are. So there is no top bar and no status bar either — a wordmark in
 * the corner, tabs at the top, actions at the bottom, and the frame-rate
 * readout moved into the help sheet, which is where a tool keeps the numbers
 * you go looking for rather than the ones you stare at all day.
 *
 * ## What it is careful about
 *
 * This component subscribes to **one** thing, `inspectorOpen`, and that is
 * deliberate. `Stage` is memoised and takes only a ref, so as long as this
 * component does not re-render, the canvas element keeps its identity and
 * React never walks into the scene at all. Dragging a slider therefore reaches
 * the GPU without React learning about it — which is the P7.3 criterion, and
 * also why the parameters do not live here.
 *
 * ## The three layouts
 *
 * Under `sm` the inspector is a sheet over the bottom of the viewport, because
 * a 224px column next to a 360px screen leaves no viewport. From `sm` it docks
 * as a real column and the canvas shrinks to fit beside it.
 */
export function AppShell() {
  const controls = useRef<OrbitControlsHandle>(null);
  const inspectorOpen = useUiStore((state) => state.inspectorOpen);

  useShortcuts();

  // P7.5 — localStorage cannot be read while rendering: the server has none,
  // and the markup would not match. An effect runs after the first paint,
  // which is late enough to be safe and early enough not to be seen.
  const hydrate = usePresetsStore((state) => state.hydrate);
  useEffect(() => hydrate(), [hydrate]);

  // P9.2 — in an effect for the same reason: the server has no `navigator`,
  // and a tier guessed during render would not survive hydration.
  const setTier = useSessionStore((state) => state.setTier);
  useEffect(() => setTier(detectTier()), [setTier]);

  return (
    <main className="flex h-dvh w-full flex-col overflow-hidden bg-background">
      <div className="relative flex min-h-0 flex-1">
        {/* The viewport keeps its own stacking context so the sheet on small
            screens can sit over it without a z-index fight. */}
        <div className="relative min-w-0 flex-1">
          <Stage controlsRef={controls} />

          {/* The corner wordmark a canvas tool keeps instead of a title bar. */}
          <span className="pointer-events-none absolute top-2 left-3 z-10 text-2xs font-medium tracking-wide text-muted-foreground/70 uppercase select-none sm:top-3">
            Point Cloud
          </span>

          <StageTabs />
          <StageOverlay />
          {/* Floating over the bottom edge, centred on the picture rather than
              on the whole window — which is why it lives in here and not in
              the row below. */}
          <Toolbar controls={controls} />
          <HelpOverlay />
        </div>

        {inspectorOpen && (
          <aside
            aria-label="Inspector"
            className={cn(
              // Phone: a sheet over the bottom of the viewport.
              "absolute inset-x-0 bottom-0 z-10 max-h-[58dvh] border-t border-border/12 bg-popover/85 backdrop-blur-md",
              // Tablet and up: a docked column, and the viewport gives up the width.
              "sm:static sm:inset-auto sm:max-h-none sm:w-56 sm:shrink-0 sm:border-t-0 sm:border-l sm:bg-popover/40",
              "lg:w-64",
            )}
          >
            <Inspector />
          </aside>
        )}
      </div>
    </main>
  );
}
