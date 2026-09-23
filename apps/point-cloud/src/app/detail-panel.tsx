"use client";

import { Button, Panel, Slider, type PanelProps } from "@atelier/ui";
import { useMemo } from "react";

import { mixImportance } from "@/photo/importance";
import { heatPreview } from "@/photo/preview";
import { usePhotoStore } from "@/store/photo-store";

import { PixelPreview } from "./pixel-preview";

interface DetailPanelProps {
  panel: Omit<PanelProps, "children">;
}

/**
 * The importance map and its four knobs (P6.4).
 *
 * The three convolutions behind this run once per photo, in the worker. What
 * the sliders change is only the weighted sum of their results, which is three
 * multiplies per pixel — fast enough to recompute and repaint while a slider
 * is being dragged. Separating the expensive measurement from the cheap mix is
 * the whole reason this panel can be interactive at all.
 */
export function DetailPanel({ panel }: DetailPanelProps) {
  const components = usePhotoStore((state) => state.components);
  const weights = usePhotoStore((state) => state.weights);
  const status = usePhotoStore((state) => state.importanceStatus);
  const error = usePhotoStore((state) => state.importanceError);
  const setWeight = usePhotoStore((state) => state.setWeight);
  const resetWeights = usePhotoStore((state) => state.resetWeights);

  const preview = useMemo(() => {
    if (!components) return null;
    const mixed = mixImportance(components, weights);
    return heatPreview(mixed, components.width, components.height);
  }, [components, weights]);

  return (
    <Panel {...panel}>
      {!components && (
        <p className="px-1 py-2 text-2xs text-muted-foreground">
          {status === "running"
            ? "Measuring detail…"
            : status === "error"
              ? error
              : "Waiting for a photo and its depth."}
        </p>
      )}

      {components && preview && (
        <>
          <PixelPreview
            pixels={preview}
            label="Importance map: bright means more points go here"
            className="h-auto w-full rounded-md border border-border/12"
          />
          {/* Each term is normalised on its own, so these are shares of a
              mix rather than gains — turning them all up changes nothing. */}
          <Slider
            label="Edges"
            value={weights.edges}
            onValueChange={(value) => setWeight("edges", value)}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Texture"
            value={weights.texture}
            onValueChange={(value) => setWeight("texture", value)}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Depth edges"
            value={weights.depthEdges}
            onValueChange={(value) => setWeight("depthEdges", value)}
            format={{ maximumFractionDigits: 2 }}
          />
          <Slider
            label="Floor"
            value={weights.floor}
            onValueChange={(value) => setWeight("floor", value)}
            max={0.6}
            format={{ maximumFractionDigits: 2 }}
          />
          <Button variant="ghost-muted" size="sm" className="mt-1" onClick={resetWeights}>
            Reset
          </Button>
        </>
      )}
    </Panel>
  );
}
