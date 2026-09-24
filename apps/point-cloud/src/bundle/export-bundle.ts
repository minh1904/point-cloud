"use client";

/**
 * Turning a cloud in memory into a file on disk (P8.2, P8.3).
 *
 * The whole of the export is four files in a zip, and three of them are the
 * PNGs the renderer has read since P3.4. That is the point of the format
 * decision in `docs/bundle-format.md`: an export is not a new representation,
 * it is the one that already exists, written down.
 */
import type { PackedBundle } from "@/photo/pack-bundle";
import type { ParamValues } from "@/params/schema";

import { encodePng } from "./png-browser";
import { writeZip, type ZipEntry } from "./zip";

export interface ExportOptions {
  bundle: PackedBundle;
  /** The look to travel with the cloud. Omit to export the data alone. */
  params?: ParamValues;
}

/** Four names, fixed by the format. Changing one breaks every reader. */
export const BUNDLE_FILES = {
  metadata: "metadata.json",
  color: "color.png",
  positionHigh: "position_h.png",
  positionLow: "position_l.png",
  params: "params.json",
} as const;

const encoder = new TextEncoder();

function json(value: unknown): Uint8Array {
  // Indented, because someone is going to open this in a text editor and the
  // two hundred bytes it costs are not worth the unreadability.
  return encoder.encode(`${JSON.stringify(value, null, 2)}\n`);
}

/** Build the bundle's files. Exposed separately so the size can be measured. */
export async function buildBundleEntries({
  bundle,
  params,
}: ExportOptions): Promise<ZipEntry[]> {
  const size = bundle.metadata.width;

  // Three PNGs, encoded in parallel. Each is a megapixel of scanline filtering
  // followed by a deflate through a stream, so overlapping them is worth the
  // one line it costs.
  const [color, positionHigh, positionLow] = await Promise.all([
    encodePng({ width: size, height: size, channels: 4, data: bundle.color }),
    encodePng({ width: size, height: size, channels: 4, data: bundle.positionHigh }),
    encodePng({ width: size, height: size, channels: 4, data: bundle.positionLow }),
  ]);

  const entries: ZipEntry[] = [
    { name: BUNDLE_FILES.metadata, bytes: json(bundle.metadata) },
    { name: BUNDLE_FILES.color, bytes: color },
    { name: BUNDLE_FILES.positionHigh, bytes: positionHigh },
    { name: BUNDLE_FILES.positionLow, bytes: positionLow },
  ];

  if (params) entries.push({ name: BUNDLE_FILES.params, bytes: json(params) });

  return entries;
}

export interface ExportedBundle {
  bytes: Uint8Array;
  /** Per-file sizes, for the UI to show where the kilobytes went. */
  sizes: { name: string; bytes: number }[];
}

export async function exportBundle(options: ExportOptions): Promise<ExportedBundle> {
  const entries = await buildBundleEntries(options);

  return {
    bytes: writeZip(entries),
    sizes: entries.map((entry) => ({ name: entry.name, bytes: entry.bytes.length })),
  };
}

/**
 * Hand the file to the browser.
 *
 * An anchor with `download` and an object URL is the whole mechanism. The
 * `revokeObjectURL` matters more than it looks: without it the blob stays
 * alive for the life of the document, and a few exports of half a megabyte
 * each add up to a leak nobody attributes to a download link.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

export function downloadBytes(bytes: Uint8Array, filename: string): void {
  downloadBlob(new Blob([bytes as BlobPart], { type: "application/zip" }), filename);
}

/** `my photo.JPG` → `my-photo`, so the download has a name worth keeping. */
export function bundleFilename(source: string | undefined): string {
  const base = (source ?? "point-cloud").replace(/\.[^.]+$/, "");
  const slug = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${slug || "point-cloud"}.zip`;
}
