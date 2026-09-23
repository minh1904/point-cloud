"use client";

import { Button, cn } from "@atelier/ui";
import { useMemo } from "react";

import { mixImportance } from "@/photo/importance";
import { greyPreview, heatPreview, pointsPreview } from "@/photo/preview";
import { usePhotoStore } from "@/store/photo-store";
import { useUiStore, type StageView } from "@/store/ui-store";

import { PixelPreview } from "../pixel-preview";

const STAGES: readonly { id: StageView; label: string; key: string }[] = [
  { id: "cloud", label: "Cloud", key: "1" },
  { id: "photo", label: "Photo", key: "2" },
  { id: "depth", label: "Depth", key: "3" },
  { id: "importance", label: "Detail", key: "4" },
  { id: "points", label: "Points", key: "5" },
];

/** The row of tabs over the viewport. */
export function StageTabs() {
  const stage = useUiStore((state) => state.stage);
  const setStage = useUiStore((state) => state.setStage);

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center p-2">
      <div className="pointer-events-auto flex gap-0.5 rounded-full border border-border/12 bg-popover/85 p-0.5 backdrop-blur-md">
        {STAGES.map((entry) => (
          <Button
            key={entry.id}
            variant={stage === entry.id ? "outline" : "ghost-muted"}
            size="xs"
            radius="full"
            title={`${entry.label} (${entry.key})`}
            onClick={() => setStage(entry.id)}
          >
            {entry.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

/**
 * What the middle of the pipeline looks like (P7.6).
 *
 * P6 is five transformations deep and only the last one is visible. Each stage
 * already had a thumbnail in its own panel, which is enough to catch a depth
 * map that came back inside out and not nearly enough to judge whether the
 * importance map is spending points in the right places. Here they get the
 * whole viewport.
 *
 * `cloud` renders nothing at all — the canvas underneath is the view. Every
 * other stage covers it, and it keeps rendering behind: pausing the scene to
 * look at a depth map would mean a stutter when you switch back, and the
 * renderer is not the expensive part here anyway.
 */
export function StageOverlay() {
  const stage = useUiStore((state) => state.stage);
  const pixels = usePhotoStore((state) => state.pixels);
  const depth = usePhotoStore((state) => state.depth);
  const components = usePhotoStore((state) => state.components);
  const weights = usePhotoStore((state) => state.weights);
  const bundle = usePhotoStore((state) => state.bundle);

  // Each one is a megapixel of work, so it is built only for the stage being
  // looked at, and only when its input changes.
  const image = useMemo(() => {
    if (stage === "photo") return pixels;
    if (stage === "depth") {
      return depth ? greyPreview(depth.data, depth.width, depth.height) : null;
    }
    if (stage === "importance") {
      return components
        ? heatPreview(
            mixImportance(components, weights),
            components.width,
            components.height,
          )
        : null;
    }
    if (stage === "points") return bundle ? pointsPreview(bundle) : null;
    return null;
  }, [stage, pixels, depth, components, weights, bundle]);

  if (stage === "cloud") return null;

  const label = STAGES.find((entry) => entry.id === stage)?.label ?? stage;

  return (
    <div className="absolute inset-0 z-[5] flex items-center justify-center bg-background/95 p-4 pt-12">
      {image ? (
        <PixelPreview
          pixels={image}
          label={`${label} stage`}
          className={cn(
            // Fit inside the viewport without ever being blown up past its own
            // pixels: this is data, and smoothing it would be a lie.
            "max-h-full max-w-full object-contain",
            "rounded-md border border-border/12 [image-rendering:pixelated]",
          )}
        />
      ) : (
        <p className="text-xs-plus text-muted-foreground">
          Nothing to show yet — drop a photo to fill this stage.
        </p>
      )}
    </div>
  );
}

export { STAGES };
