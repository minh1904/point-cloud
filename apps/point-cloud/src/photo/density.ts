/**
 * How crowded each point is (P6.6) — and what P5.1 has been waiting for.
 *
 * The sampler (6.5) deliberately puts points close together on the subject and
 * far apart on the background. That is the right distribution and it creates a
 * problem: at one point size, the sparse regions show holes. Measuring the
 * crowding lets the renderer grow the lonely points until the background reads
 * as a surface again, which is the whole of step 5.1 — blocked since P5
 * precisely because a cloud on a regular grid has no crowding to measure.
 *
 * ## Measuring it
 *
 * Density is "points per unit area", and the honest way to get it locally is
 * the distance to the k-th nearest neighbour. If the k-th neighbour is at
 * distance d, then roughly k points sit inside a circle of radius d, so the
 * local density is about k / πd². The constants cancel in the normalisation,
 * so what actually gets computed is 1/d².
 *
 * k = 1 would be far too jumpy — one unusually close neighbour halves the
 * estimate. Around six averages over a full ring of neighbours, which is the
 * number of points that surround a point in an evenly spaced 2D arrangement.
 *
 * ## Why the logarithm
 *
 * Between a dense edge and empty sky the spacing can differ tenfold, so the
 * density differs a hundredfold. Normalised linearly, that would push almost
 * every point to nearly zero and leave a handful at one. Taking the log first
 * turns the ratios into differences, which is what makes the resulting 0…1
 * value usable as a slider input rather than a spike.
 *
 * ## Why not min-to-max
 *
 * The obvious normalisation — stretch the lowest to 0 and the highest to 1 —
 * is wrong here, and wrong in a way that only shows up on the easy case. A
 * perfectly even cloud has no real variation at all, just a little noise at
 * the borders where points have fewer neighbours; stretching that to the full
 * range turns nothing into a map that says the edges are empty, and P5.1 would
 * dutifully inflate them.
 *
 * So the scale is **absolute instead**: 0.5 means "spaced like the median
 * point of this cloud", 1 means `SPREAD` times tighter, 0 means `SPREAD` times
 * looser. An even cloud comes back as a field of 0.5, which multiplies point
 * size by a constant — which is to say, it does nothing, which is right.
 */
import { PointGrid } from "./spatial-grid";

export interface DensityOptions {
  /** Interleaved x, y in pixel coordinates — the sampler's output. */
  points: Float32Array;
  width: number;
  height: number;
  /** How many neighbours to average the estimate over. */
  neighbours?: number;
}

/**
 * Spacing ratio that maps to the ends of the 0…1 range.
 *
 * Three is a judgement call from looking at real clouds: the gap between the
 * points on a face and the points in a clear sky is around that, and pushing
 * it higher squeezes everything toward the middle where it stops driving the
 * point size at all.
 */
const SPREAD = 3;

/** Distance to the k-th nearest neighbour, searching outward until k are found. */
function kthDistanceSquared(
  grid: PointGrid,
  points: Float32Array,
  index: number,
  k: number,
): number {
  const x = points[index * 2]!;
  const y = points[index * 2 + 1]!;

  // A fixed-size ascending list of the k best distances so far. For k around
  // six, inserting into an array beats building a heap.
  const best = new Float64Array(k).fill(Infinity);

  for (let rings = 2; rings <= 8; rings *= 2) {
    best.fill(Infinity);
    let found = 0;

    grid.forEachNear(x, y, rings, (other) => {
      if (other === index) return;
      const dx = points[other * 2]! - x;
      const dy = points[other * 2 + 1]! - y;
      const squared = dx * dx + dy * dy;
      found++;

      if (squared >= best[k - 1]!) return;
      let slot = k - 1;
      while (slot > 0 && best[slot - 1]! > squared) {
        best[slot] = best[slot - 1]!;
        slot--;
      }
      best[slot] = squared;
    });

    // Enough neighbours were in range for the k-th to be meaningful.
    if (found >= k) return best[k - 1]!;
  }

  return best[k - 1]!;
}

/**
 * One value per point: **0 for the sparsest, 1 for the densest**.
 *
 * Note the direction. The shader wants to *grow* the sparse points, so it
 * reads this as "how much can I shrink", not "how big".
 */
export function pointDensity({
  points,
  width,
  height,
  neighbours = 6,
}: DensityOptions): Float32Array {
  const count = points.length / 2;
  if (count === 0) return new Float32Array(0);
  if (count <= neighbours) return new Float32Array(count).fill(0.5);

  const grid = new PointGrid(
    points,
    width,
    height,
    Math.max(1, Math.sqrt((width * height) / count)),
  );
  for (let i = 0; i < count; i++) grid.insert(i);

  const logDensity = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const squared = kthDistanceSquared(grid, points, i, neighbours);
    // Two points landing on top of each other would divide by zero; a floor of
    // a hundredth of a pixel keeps the log finite without moving anything real.
    logDensity[i] = -Math.log(Math.max(squared, 1e-4));
  }

  // The median, not the mean: two points landing on top of each other produce
  // a wildly large value that would drag an average with it, and a photograph
  // with one very dense edge is exactly the case where that happens.
  const sorted = Float32Array.from(logDensity).sort();
  const median = sorted[Math.floor(count / 2)]!;

  // logDensity is -log(d²) = -2·log(d), so a point spaced SPREAD times wider
  // than the median sits 2·log(SPREAD) below it. Four of those half-widths
  // span the full 0…1.
  const halfSpan = 2 * Math.log(SPREAD);

  const out = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = (logDensity[i]! - median) / (2 * halfSpan);
    out[i] = Math.min(1, Math.max(0, 0.5 + offset));
  }
  return out;
}
