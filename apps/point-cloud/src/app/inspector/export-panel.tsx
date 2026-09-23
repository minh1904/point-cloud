"use client";

import { Button, FileDrop, Panel, type PanelProps } from "@atelier/ui";
import { useEffect, useState } from "react";

import {
  bundleFilename,
  downloadBytes,
  exportBundle,
  type ExportedBundle,
} from "@/bundle/export-bundle";
import type { PackedBundle } from "@/photo/pack-bundle";
import { useParamsStore } from "@/store/params-store";
import { usePhotoStore } from "@/store/photo-store";
import { useUiStore } from "@/store/ui-store";

interface ExportPanelProps {
  panel: Omit<PanelProps, "children">;
}

function kb(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${Math.round(bytes / 1024)} KB`;
}

/**
 * Export and import (P8.3, P8.5).
 *
 * The size is **measured, not estimated**: the zip is actually built, which
 * takes a few hundred milliseconds per cloud, and the Download button then
 * writes bytes that already exist. A guess would be easy and would be wrong by
 * a factor that depends entirely on the photograph — PNG compression of a
 * coordinate map varies with how smooth the cloud is.
 *
 * It only runs while the panel is open. Building a half-megabyte zip for
 * somebody who never scrolled down here is work nobody asked for.
 */
export function ExportPanel({ panel }: ExportPanelProps) {
  const bundle = usePhotoStore((state) => state.bundle);
  const source = usePhotoStore((state) => state.source);
  const importedName = usePhotoStore((state) => state.importedName);
  const importError = usePhotoStore((state) => state.importError);
  const loadBundleFile = usePhotoStore((state) => state.loadBundleFile);
  const collapsed = useUiStore((state) => state.collapsed["Export"] ?? false);

  // Kept together with the cloud it was built from. That pairing is what lets
  // the effect below never call setState synchronously — a stale result is
  // simply not the current one, rather than something to clear.
  const [built, setBuilt] = useState<{ from: PackedBundle; result: ExportedBundle } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [withParams, setWithParams] = useState(true);

  const prepared = built && built.from === bundle ? built.result : null;

  useEffect(() => {
    if (!bundle || collapsed) return;

    let cancelled = false;

    void exportBundle({
      bundle,
      params: withParams ? useParamsStore.getState().values : undefined,
    })
      .then((result) => {
        if (cancelled) return;
        setBuilt({ from: bundle, result });
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      });

    return () => {
      cancelled = true;
    };
    // Deliberately not depending on the parameter *values*: the zip would be
    // rebuilt on every slider frame. `params.json` is written from whatever
    // the values are when the export is prepared, and the button below
    // re-prepares on demand.
  }, [bundle, collapsed, withParams]);

  return (
    <Panel {...panel}>
      {!bundle && (
        <p className="px-1 py-2 text-2xs text-muted-foreground">
          Build a cloud, or drop a bundle below to open one.
        </p>
      )}

      {bundle && (
        <>
          {error && <p className="px-1 text-2xs text-destructive">{error}</p>}

          {!prepared && !error && (
            <p className="px-1 py-1 text-2xs text-muted-foreground">Measuring…</p>
          )}

          {prepared && (
            <>
              <p className="px-1 font-mono text-2xs text-foreground tabular-nums">
                {kb(prepared.bytes.length)} · {bundle.metadata.particleCount.toLocaleString("en-US")} points
              </p>
              <ul className="px-1 font-mono text-2xs text-muted-foreground tabular-nums">
                {prepared.sizes.map((entry) => (
                  <li key={entry.name} className="flex justify-between gap-2">
                    <span className="truncate">{entry.name}</span>
                    <span className="shrink-0">{kb(entry.bytes)}</span>
                  </li>
                ))}
              </ul>

              <Button
                variant={withParams ? "outline" : "ghost-muted"}
                size="sm"
                className="mt-1"
                onClick={() => setWithParams((on) => !on)}
              >
                {withParams ? "Including the look" : "Data only"}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadBytes(
                    prepared.bytes,
                    bundleFilename(importedName ?? source?.name),
                  )
                }
              >
                Download .zip
              </Button>
            </>
          )}
        </>
      )}

      {importError && <p className="px-1 text-2xs text-destructive">{importError}</p>}

      <FileDrop
        accept=".zip,application/zip"
        label="Open a bundle"
        className="mt-1 px-2 py-2 text-xs"
        onFile={(file) => void loadBundleFile(file)}
      >
        Open a .zip bundle
      </FileDrop>

      {importedName && (
        <p className="truncate px-1 text-2xs text-muted-foreground" title={importedName}>
          opened {importedName}
        </p>
      )}
    </Panel>
  );
}
