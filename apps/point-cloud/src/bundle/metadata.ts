import type { Bounds } from "./position-codec";

/**
 * What a bundle has to say about itself (P3.4).
 *
 * The PNGs hold 65,536 numbers between 0 and 1 and nothing else — no units, no
 * origin, no idea how big the cloud is. `bounds` is what turns them back into
 * world coordinates, and keeping it out here rather than baked into the data is
 * exactly what makes the format both compact and precise: the full 16-bit range
 * is spent on the extent this particular cloud occupies.
 *
 * `version` is the promise that old exports keep loading. P8.4 pins the schema
 * properly and validates it with zod; this is the shape it grows from.
 */
export interface BundleMetadata {
  version: number;
  /** Data texture dimensions, in texels. */
  width: number;
  height: number;
  particleCount: number;
  /** Bits per coordinate: 16, split across the high and low PNGs. */
  precision: number;
  bounds: Bounds;
  source?: { image: string; aspect: number };
  depth?: { kind: string; relief: number; note?: string };
}

function isTriple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) && value.length === 3 && value.every((v) => typeof v === "number" && Number.isFinite(v));
}

/**
 * Checks a parsed `metadata.json` before the renderer trusts it.
 *
 * A malformed bounds array would not throw — it would quietly place every
 * particle at NaN, and a cloud that renders nothing at all looks exactly like
 * a dozen other bugs. Failing loudly here is much cheaper to diagnose.
 */
export function parseBundleMetadata(value: unknown): BundleMetadata {
  if (typeof value !== "object" || value === null) {
    throw new TypeError("metadata.json must be an object");
  }

  const raw = value as Record<string, unknown>;
  const bounds = raw.bounds as Record<string, unknown> | undefined;

  if (typeof raw.version !== "number") throw new TypeError("metadata.version must be a number");
  if (typeof raw.width !== "number" || typeof raw.height !== "number") {
    throw new TypeError("metadata.width and metadata.height must be numbers");
  }
  if (raw.width !== raw.height) {
    throw new TypeError(`the data texture must be square, got ${raw.width}x${raw.height}`);
  }
  if (typeof raw.particleCount !== "number" || raw.particleCount !== raw.width * raw.height) {
    throw new TypeError("metadata.particleCount must equal width * height — one particle per texel");
  }
  if (!bounds || !isTriple(bounds.min) || !isTriple(bounds.max)) {
    throw new TypeError("metadata.bounds must hold min and max arrays of three numbers");
  }
  for (let axis = 0; axis < 3; axis++) {
    if (bounds.max[axis]! <= bounds.min[axis]!) {
      throw new TypeError(`metadata.bounds is empty on axis ${axis}: decoding would divide by zero`);
    }
  }

  return {
    version: raw.version,
    width: raw.width,
    height: raw.height,
    particleCount: raw.particleCount,
    precision: typeof raw.precision === "number" ? raw.precision : 16,
    bounds: { min: bounds.min, max: bounds.max },
    source: raw.source as BundleMetadata["source"],
    depth: raw.depth as BundleMetadata["depth"],
  };
}
