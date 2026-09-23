"use client";

/**
 * Reading a bundle back in (P8.5).
 *
 * This step exists to prove the format is self-sufficient: if a zip can be
 * exported, closed, reopened on another machine and render identically, then
 * `docs/bundle-format.md` describes everything that matters and nothing is
 * being smuggled in through the app's memory.
 *
 * It is also the strictest test the codec gets. Export writes bytes and reads
 * them back with the same functions, which would hide a symmetric mistake —
 * an encoder and a decoder that are wrong in the same direction agree
 * perfectly. Loading the PNGs through the *browser's* texture loader
 * afterwards is what catches that.
 */
import type { PackedBundle } from "@/photo/pack-bundle";
import { sanitiseValues, type ParamValues } from "@/params/schema";

import { BUNDLE_FILES } from "./export-bundle";
import { parseBundleMetadata } from "./metadata";
import { decodePng } from "./png-browser";
import { readZip } from "./zip";

export interface ImportedBundle {
  bundle: PackedBundle;
  /** Present only if the zip carried a `params.json`. */
  params: ParamValues | null;
}

const decoder = new TextDecoder();

function required(files: Map<string, Uint8Array>, name: string): Uint8Array {
  const bytes = files.get(name);
  if (!bytes) throw new Error(`the bundle has no ${name}`);
  return bytes;
}

/** A data map must be square, RGBA, and exactly the size the metadata claims. */
function expectMap(
  image: { width: number; height: number; channels: number; data: Uint8Array },
  name: string,
  size: number,
): Uint8Array {
  if (image.width !== size || image.height !== size) {
    throw new Error(
      `${name} is ${image.width}×${image.height}, but metadata.json says ${size}×${size}`,
    );
  }
  if (image.channels !== 4) {
    throw new Error(`${name} must be RGBA, got ${image.channels} channels`);
  }
  return image.data;
}

export async function importBundle(file: Blob): Promise<ImportedBundle> {
  const entries = await readZip(new Uint8Array(await file.arrayBuffer()));

  // Zips made by some tools put everything under a top-level folder, which is
  // what happens when you zip a directory rather than its contents. Matching
  // on the basename costs one line and saves a support question.
  const files = new Map(
    entries.map((entry) => [entry.name.split("/").pop() ?? entry.name, entry.bytes]),
  );

  const metadata = parseBundleMetadata(
    JSON.parse(decoder.decode(required(files, BUNDLE_FILES.metadata))),
  );
  const size = metadata.width;

  const [color, positionHigh, positionLow] = await Promise.all([
    decodePng(required(files, BUNDLE_FILES.color)),
    decodePng(required(files, BUNDLE_FILES.positionHigh)),
    decodePng(required(files, BUNDLE_FILES.positionLow)),
  ]);

  const paramsFile = files.get(BUNDLE_FILES.params);

  return {
    bundle: {
      metadata,
      color: expectMap(color, BUNDLE_FILES.color, size),
      positionHigh: expectMap(positionHigh, BUNDLE_FILES.positionHigh, size),
      positionLow: expectMap(positionLow, BUNDLE_FILES.positionLow, size),
    },
    // Sanitised against the current schema, so a bundle exported before a
    // parameter existed still loads — it just uses that parameter's default.
    params: paramsFile ? sanitiseValues(JSON.parse(decoder.decode(paramsFile))) : null,
  };
}
