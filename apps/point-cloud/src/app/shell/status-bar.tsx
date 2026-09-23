"use client";

import { useSessionStore } from "@/store/session-store";
import { usePhotoStore } from "@/store/photo-store";

/**
 * The bottom line (P7.1, P7.7).
 *
 * Frame rate, draw calls and point count used to sit in the top-left corner
 * over the picture. A status bar is where a tool puts numbers that are always
 * true and never urgent — and moving them off the canvas means the viewport
 * shows the work rather than a readout on top of it.
 *
 * It re-renders about twice a second, which is how often `RenderInfo` writes
 * stats. Nothing else in the shell re-renders with it.
 */
export function StatusBar() {
  const stats = useSessionStore((state) => state.stats);
  const source = usePhotoStore((state) => state.source);
  const bundle = usePhotoStore((state) => state.bundle);
  const depth = usePhotoStore((state) => state.depth);
  const importedName = usePhotoStore((state) => state.importedName);

  return (
    <div className="flex shrink-0 items-center gap-3 overflow-x-auto border-t border-border/10 bg-popover/60 px-3 py-1 font-mono text-2xs text-muted-foreground tabular-nums backdrop-blur-md">
      <span className="whitespace-nowrap">
        {stats ? `${stats.fps} fps` : "starting…"}
      </span>
      {stats && (
        <>
          <span className="hidden whitespace-nowrap md:inline">
            {stats.calls} draw call{stats.calls === 1 ? "" : "s"}
          </span>
          <span className="whitespace-nowrap">
            {stats.points.toLocaleString("en-US")} points
          </span>
        </>
      )}

      <span className="ml-auto flex items-center gap-3">
        {depth && (
          <span className="hidden whitespace-nowrap lg:inline">depth: {depth.kind}</span>
        )}
        <span className="max-w-40 truncate whitespace-nowrap">
          {importedName
            ? importedName
            : bundle && source
              ? source.name
              : source
                ? `${source.name} — building`
                : "sample bundle"}
        </span>
      </span>
    </div>
  );
}
