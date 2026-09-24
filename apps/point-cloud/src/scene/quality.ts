"use client";

/**
 * How much this device can be asked to do (P9.2).
 *
 * The cloud costs the same arithmetic everywhere; what differs is how many
 * pixels it is asked to fill and how much noise it evaluates per particle. Two
 * knobs, then, and they are chosen rather than negotiated because a phone
 * cannot tell you it is struggling until it already is.
 *
 * ## Pixels are the expensive part
 *
 * A point is drawn as a small sprite, and a sprite's cost is its area. At
 * `devicePixelRatio` 3 — an ordinary modern phone — the same cloud covers
 * **nine times** the pixels it does at 1. That single number dominates
 * everything else the renderer does, which is why capping it is the first
 * lever rather than the last.
 *
 * `renderScale` (P2.5) does the same job and is deliberately left alone here:
 * it belongs to the person using the tool. This is the floor under it.
 *
 * ## Why detection and not measurement
 *
 * Measuring frame rate and adapting would be more accurate and much worse to
 * use: the picture would change under you, and the first few seconds — the
 * intro, the part most likely to be recorded — would be the ones rendered
 * badly. A guess made once, overridable in the inspector, is the better trade.
 */

export type QualityTier = "low" | "medium" | "high";

export interface QualityProfile {
  tier: QualityTier;
  /** Cap for `devicePixelRatio`. The single biggest lever. */
  maxDpr: number;
  /** fBM octaves in the motion field (P4.1). Four is the authored look. */
  fbmOctaves: number;
  /** Shown in the inspector so the choice is not invisible. */
  note: string;
}

export const QUALITY_PROFILES: Readonly<Record<QualityTier, QualityProfile>> = {
  low: {
    tier: "low",
    maxDpr: 1,
    // Two octaves is visibly softer — large swells with no fine churn. It is
    // the honest cost of the tier, not a free win.
    fbmOctaves: 2,
    note: "1× pixels · 2 noise octaves",
  },
  medium: {
    tier: "medium",
    maxDpr: 1.5,
    fbmOctaves: 3,
    note: "1.5× pixels · 3 noise octaves",
  },
  high: {
    tier: "high",
    maxDpr: 2,
    fbmOctaves: 4,
    note: "2× pixels · 4 noise octaves",
  },
};

/**
 * A guess, from what the browser is willing to say about the machine.
 *
 * Every signal here is a proxy and every one of them lies sometimes: a tablet
 * with eight cores reports a coarse pointer, a laptop with a touchscreen
 * reports one too, and `deviceMemory` is Chromium-only and rounded to a power
 * of two. Together they are right often enough, and the inspector has an
 * override for when they are not.
 *
 * Note what is *not* used: the user agent string. It is the one signal that
 * has been actively lied to for thirty years.
 */
export function detectTier(): QualityTier {
  if (typeof navigator === "undefined" || typeof window === "undefined") {
    // The server cannot know. `medium` rather than `high` so a weak device
    // never gets one frame at full cost before the client corrects it.
    return "medium";
  }

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as { deviceMemory?: number }).deviceMemory ?? 8;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  if (coarse && (cores <= 4 || memory <= 4)) return "low";
  if (coarse || cores <= 4 || memory <= 4) return "medium";
  return "high";
}

/** Resolve the `quality` parameter, which may say `"auto"`. */
export function resolveProfile(
  setting: string,
  detected: QualityTier | null,
): QualityProfile {
  if (setting === "low" || setting === "medium" || setting === "high") {
    return QUALITY_PROFILES[setting];
  }
  return QUALITY_PROFILES[detected ?? "medium"];
}
