import { z } from "zod";

import type { Bounds } from "./position-codec";

/**
 * What a bundle has to say about itself (P3.4, versioned at P8.4).
 *
 * The PNGs hold 65,536 numbers between 0 and 1 and nothing else — no units, no
 * origin, no idea how big the cloud is. `bounds` is what turns them back into
 * world coordinates, and keeping it out here rather than baked into the data is
 * exactly what makes the format both compact and precise: the full 16-bit range
 * is spent on the extent this particular cloud occupies.
 *
 * ## Why this is a zod schema now
 *
 * Until P8 the only thing that ever produced a `metadata.json` was this repo,
 * and a hand-written validator was proportionate. P8.5 changes the threat
 * model: the file arrives inside a zip that somebody else may have edited, and
 * it is the *only* description of what the three PNGs mean.
 *
 * A malformed `bounds` would not throw. It would place every particle at NaN,
 * and a cloud that renders nothing at all looks exactly like a dozen other
 * bugs. zod turns that into a sentence naming the field.
 *
 * `version` is the promise that old exports keep loading. When it changes,
 * `parseBundleMetadata` grows a branch; it does not get rewritten.
 */

const triple = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);

const bundleMetadataSchema = z
  .object({
    version: z.literal(1),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    particleCount: z.number().int().positive(),
    /** Bits per coordinate: 16, split across the high and low PNGs. */
    precision: z.number().int().positive().default(16),
    bounds: z.object({ min: triple, max: triple }),
    source: z.object({ image: z.string(), aspect: z.number().finite() }).optional(),
    depth: z
      .object({ kind: z.string(), relief: z.number().finite(), note: z.string().optional() })
      .optional(),
  })
  // The cross-field rules. Each one is a way the file can be internally
  // consistent as JSON and still be nonsense as a bundle.
  .refine((value) => value.width === value.height, {
    message: "the data texture must be square",
    path: ["height"],
  })
  .refine((value) => value.particleCount === value.width * value.height, {
    message: "particleCount must equal width * height — one particle per texel",
    path: ["particleCount"],
  })
  .refine(
    (value) => [0, 1, 2].every((axis) => value.bounds.max[axis]! > value.bounds.min[axis]!),
    {
      message: "bounds is empty on at least one axis: decoding would divide by zero",
      path: ["bounds"],
    },
  );

export type BundleMetadata = Omit<z.infer<typeof bundleMetadataSchema>, "bounds"> & {
  bounds: Bounds;
};

/** Current format version. Bump only alongside `docs/bundle-format.md`. */
export const BUNDLE_VERSION = 1;

/**
 * Check a parsed `metadata.json` before the renderer trusts it.
 *
 * Throws a `TypeError` whose message names the offending field, because the
 * person reading it is usually holding a zip somebody else made.
 */
export function parseBundleMetadata(value: unknown): BundleMetadata {
  const result = bundleMetadataSchema.safeParse(value);

  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? first.path.join(".") : "metadata";
    throw new TypeError(`metadata.json is not valid: ${where} — ${first?.message}`);
  }

  const parsed = result.data;
  return {
    ...parsed,
    bounds: {
      min: [...parsed.bounds.min] as [number, number, number],
      max: [...parsed.bounds.max] as [number, number, number],
    },
  };
}
