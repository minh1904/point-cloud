"use client";

import { Button, Panel, type PanelProps } from "@atelier/ui";
import { useMemo } from "react";

import {
  DEPTH_MODEL_LABELS,
  DEPTH_MODELS,
  type DepthModelId,
} from "@/photo/depth/depth-map";
import { greyPreview } from "@/photo/preview";
import { usePhotoStore } from "@/store/photo-store";

import { PixelPreview } from "./pixel-preview";

interface DepthPanelProps {
  panel: Omit<PanelProps, "children">;
}

/**
 * Depth estimation, and the proof it worked (P6.2, P6.3).
 *
 * The preview is the point of this panel. A depth map is a thousand invisible
 * numbers until it is painted, and the two failures that matter — inside out,
 * or flat — are both instantly obvious in a thumbnail: near should be dark,
 * far should be light, and the subject should be a shape rather than a smear.
 */
export function DepthPanel({ panel }: DepthPanelProps) {
  const pixels = usePhotoStore((state) => state.pixels);
  const depth = usePhotoStore((state) => state.depth);
  const model = usePhotoStore((state) => state.depthModel);
  const status = usePhotoStore((state) => state.depthStatus);
  const progress = usePhotoStore((state) => state.depthProgress);
  const error = usePhotoStore((state) => state.depthError);
  const setDepthModel = usePhotoStore((state) => state.setDepthModel);
  const estimateDepth = usePhotoStore((state) => state.estimateDepth);
  const cancelDepth = usePhotoStore((state) => state.cancelDepth);

  // Repainting a megapixel of greyscale on every store change would be a
  // wasted 4 MB allocation per render; only a new map is worth one.
  const preview = useMemo(
    () => (depth ? greyPreview(depth.data, depth.width, depth.height) : null),
    [depth],
  );

  const cycleModel = () => {
    const next = DEPTH_MODELS[
      (DEPTH_MODELS.indexOf(model) + 1) % DEPTH_MODELS.length
    ] as DepthModelId;
    setDepthModel(next);
  };

  return (
    <Panel {...panel}>
      {!pixels && (
        <p className="px-1 py-2 text-2xs text-muted-foreground">
          Drop a photo to estimate its depth.
        </p>
      )}

      {pixels && (
        <>
          {preview && (
            <PixelPreview
              pixels={preview}
              label="Estimated depth: dark is near, light is far"
              className="h-auto w-full rounded-md border border-border/12"
            />
          )}

          {status === "running" && (
            <>
              <p className="truncate px-1 text-2xs text-muted-foreground">
                {progress?.stage ?? "working"}
                {progress && progress.value >= 0 &&
                  ` · ${Math.round(progress.value * 100)}%`}
              </p>
              {/* A bar rather than a number, because the honest answer for
                  most of these steps is "no idea how long". P-UI gets a real
                  Progress component at P6; this is its consumer. */}
              <div className="mx-1 h-1 overflow-hidden rounded-full bg-input/15">
                <div
                  className="h-full rounded-full bg-foreground/50 transition-[width]"
                  style={{
                    width:
                      progress && progress.value >= 0
                        ? `${Math.round(progress.value * 100)}%`
                        : "35%",
                  }}
                />
              </div>
              <Button variant="ghost-muted" size="sm" className="mt-1" onClick={cancelDepth}>
                Cancel
              </Button>
            </>
          )}

          {status === "error" && (
            <p className="px-1 text-2xs text-destructive">
              {error} — showing painter&apos;s cues instead.
            </p>
          )}

          {status === "ready" && depth && (
            <p className="px-1 font-mono text-2xs text-muted-foreground tabular-nums">
              {DEPTH_MODEL_LABELS[depth.kind]} · {depth.width}×{depth.height}
            </p>
          )}

          <Button
            variant="ghost-muted"
            size="sm"
            className="mt-1"
            disabled={status === "running"}
            onClick={cycleModel}
          >
            Model: {DEPTH_MODEL_LABELS[model]}
          </Button>

          {status !== "running" && (
            <Button variant="ghost-muted" size="sm" onClick={() => void estimateDepth()}>
              Re-estimate
            </Button>
          )}
        </>
      )}
    </Panel>
  );
}
