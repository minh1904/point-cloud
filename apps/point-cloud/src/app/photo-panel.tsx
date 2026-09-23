"use client";

import { Button, FileDrop, Panel, type PanelProps } from "@atelier/ui";

import { WORKING_LONG_SIDE } from "@/photo/decode-image";
import { usePhotoStore } from "@/store/photo-store";

import { PixelPreview } from "./pixel-preview";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface PhotoPanelProps {
  /** Spread in from `Studio` — title, collapse state, width. */
  panel: Omit<PanelProps, "children">;
}

/**
 * Where a photo enters the app (P6.1).
 *
 * Everything downstream reads the store, so this panel's whole job is to put
 * one decoded buffer in it and show enough of the result to prove the decode
 * was right: the picture itself, and the size it was reduced to.
 */
export function PhotoPanel({ panel }: PhotoPanelProps) {
  const status = usePhotoStore((state) => state.status);
  const source = usePhotoStore((state) => state.source);
  const pixels = usePhotoStore((state) => state.pixels);
  const error = usePhotoStore((state) => state.error);
  const load = usePhotoStore((state) => state.load);
  const clear = usePhotoStore((state) => state.clear);

  return (
    <Panel {...panel}>
      {status === "empty" && (
        <FileDrop
          accept="image/*"
          label="Choose a photo"
          onFile={(file) => void load(file)}
        >
          <span className="font-medium text-foreground">Drop a photo</span>
          <span className="text-2xs">
            or click to browse · scaled to {WORKING_LONG_SIDE} px
          </span>
        </FileDrop>
      )}

      {status === "decoding" && (
        <p className="px-1 py-3 text-center text-xs-plus text-muted-foreground">
          Decoding {source?.name}…
        </p>
      )}

      {status === "error" && (
        <>
          <p className="px-1 py-2 text-xs-plus text-destructive">
            Could not read that file: {error}
          </p>
          <Button variant="ghost-muted" size="sm" onClick={clear}>
            Try another
          </Button>
        </>
      )}

      {status === "ready" && pixels && (
        <>
          <PixelPreview
            pixels={pixels}
            label={`Preview of ${source?.name ?? "the photo"}`}
            className="h-auto w-full rounded-md border border-border/12"
          />
          <p className="truncate px-1 text-2xs text-muted-foreground" title={source?.name}>
            {source?.name}
          </p>
          <p className="px-1 font-mono text-2xs text-muted-foreground tabular-nums">
            {pixels.width}×{pixels.height}
            {source && ` · ${formatBytes(source.bytes)}`}
          </p>
          <div className="mt-1 flex gap-1">
            <FileDrop
              accept="image/*"
              label="Choose another photo"
              onFile={(file) => void load(file)}
              className="flex-1 border-solid px-2 py-1 text-xs"
            >
              Replace
            </FileDrop>
            <Button variant="ghost-muted" size="sm" onClick={clear}>
              Clear
            </Button>
          </div>
        </>
      )}
    </Panel>
  );
}
