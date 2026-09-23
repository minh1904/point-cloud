"use client";

import { Button, Panel, Slider, type PanelProps } from "@atelier/ui";

import { CLOUD_SIZES, usePhotoStore } from "@/store/photo-store";

interface CloudPanelProps {
  panel: Omit<PanelProps, "children">;
}

/**
 * Turning the maps into the cloud on screen (P6.5 - P6.9).
 *
 * The build runs once automatically when a photo's depth is final, because a
 * dropped photo should become a cloud rather than a to-do list. Everything
 * here is for the second look: a different point count, deeper or shallower
 * relief, more candidates per point, another seed.
 */
export function CloudPanel({ panel }: CloudPanelProps) {
  const build = usePhotoStore((state) => state.build);
  const status = usePhotoStore((state) => state.buildStatus);
  const progress = usePhotoStore((state) => state.buildProgress);
  const error = usePhotoStore((state) => state.buildError);
  const bundle = usePhotoStore((state) => state.bundle);
  const components = usePhotoStore((state) => state.components);
  const setBuildParam = usePhotoStore((state) => state.setBuildParam);
  const reseed = usePhotoStore((state) => state.reseed);
  const buildCloud = usePhotoStore((state) => state.buildCloud);

  const points = build.size * build.size;

  return (
    <Panel {...panel}>
      {!components && (
        <p className="px-1 py-2 text-2xs text-muted-foreground">
          Drop a photo to build a cloud from it.
        </p>
      )}

      {components && (
        <>
          {status === "running" && (
            <>
              <p className="truncate px-1 text-2xs text-muted-foreground">
                {progress?.stage ?? "building"}
              </p>
              <div className="mx-1 h-1 overflow-hidden rounded-full bg-input/15">
                <div
                  className="h-full rounded-full bg-foreground/50 transition-[width]"
                  style={{ width: `${Math.round((progress?.value ?? 0) * 100)}%` }}
                />
              </div>
            </>
          )}

          {status === "error" && (
            <p className="px-1 text-2xs text-destructive">{error}</p>
          )}

          {status === "ready" && bundle && (
            <p className="px-1 font-mono text-2xs text-muted-foreground tabular-nums">
              {bundle.metadata.particleCount.toLocaleString("en-US")} points ·{" "}
              {bundle.metadata.width}² texels
            </p>
          )}

          {/* Relief as a share of the width, not world units: the number that
              matters is the ratio, and it is what the research note quotes. */}
          <Slider
            label="Relief"
            value={build.reliefRatio}
            onValueChange={(value) => setBuildParam("reliefRatio", value)}
            min={0.002}
            max={0.12}
            step={0.002}
            format={{ style: "percent", maximumFractionDigits: 1 }}
          />
          {/* Mitchell's candidate count. At 1 the sampler is plain weighted
              random and the cloud visibly clumps; the blue noise appears
              somewhere around 4 and stops improving around 10. */}
          <Slider
            label="Spacing"
            value={build.candidates}
            onValueChange={(value) => setBuildParam("candidates", value)}
            min={1}
            max={16}
            step={1}
            format={{ maximumFractionDigits: 0 }}
          />

          <Button
            variant="ghost-muted"
            size="sm"
            className="mt-1"
            disabled={status === "running"}
            onClick={() => {
              const next =
                CLOUD_SIZES[(CLOUD_SIZES.indexOf(build.size as 128) + 1) % CLOUD_SIZES.length]!;
              setBuildParam("size", next);
            }}
          >
            Points: {points.toLocaleString("en-US")}
          </Button>
          <Button
            variant="ghost-muted"
            size="sm"
            disabled={status === "running"}
            onClick={reseed}
          >
            Seed: {build.seed}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={status === "running"}
            onClick={() => void buildCloud()}
          >
            {status === "running" ? "Building…" : "Rebuild"}
          </Button>
        </>
      )}
    </Panel>
  );
}
