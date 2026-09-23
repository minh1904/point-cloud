/**
 * Placing 65,536 points on a photograph (P6.5).
 *
 * Two things have to be true at once, and they pull against each other:
 *
 * 1. **More points where the importance map is high.** That is what makes the
 *    subject sharp and the sky cheap.
 * 2. **Even spacing wherever you look.** Not uniform *density* — density is
 *    supposed to vary — but no clumps and no gaps at whatever density is
 *    locally in force.
 *
 * Plain weighted random sampling gets (1) and fails (2) badly. Independent
 * draws clump: the expected gap between two random points is as likely to be
 * tiny as large, so a weighted-random cloud has knots of overlapping points
 * next to holes. On a point cloud that reads as noise, and no amount of point
 * size fixes it.
 *
 * What we want is **blue noise** — a distribution whose Fourier spectrum has
 * no low frequencies, which in plain terms means "random, but no two points
 * close together". The eye is extremely good at spotting the clumps of white
 * noise and almost blind to the structure of blue noise, which is why it is
 * what dithering, stippling and sampling all converge on.
 *
 * ## Mitchell's best-candidate
 *
 * Proper Poisson-disk sampling with a varying radius is fiddly. Mitchell's
 * algorithm gets most of the way there in twenty lines: to place a point,
 * generate `candidates` of them, and keep whichever is **farthest from the
 * points already placed**. One candidate is plain random sampling; around
 * eight is visually indistinguishable from real Poisson-disk.
 *
 * ## Farthest is not quite the right question
 *
 * Drawing candidates from the importance distribution gets the density right
 * and taking the farthest gets the spacing right — but they fight. A candidate
 * out in the empty background is farther from everything almost by definition,
 * so it wins rounds it should have lost, and the density flattens out: weights
 * of 1 against 0.1 land about 2.3 times as many points on the busy half
 * instead of ten times.
 *
 * The fix is to ask the right question. What matters is not "how far from its
 * neighbours" but "how far **compared to how far it should be here**". Where
 * the importance is w, points want to sit about 1/√w apart, so the relative
 * spacing is d·√w — and maximising its square, `d²·w`, is one extra multiply.
 * With that, a tight gap on the subject beats a merely large gap in the sky.
 *
 * The measured effect on that same 1-against-0.1 test: 10.0 : 1, the ratio the
 * map asked for, and unchanged whether one candidate is weighed or sixteen.
 * The candidate count now buys spacing alone, which is what it is for.
 */
import { PointGrid } from "./spatial-grid";

export interface SampleOptions {
  width: number;
  height: number;
  /** One weight per pixel. Relative, not normalised. */
  importance: Float32Array;
  count: number;
  /** Candidates weighed per placed point. 1 is white noise, 8 is blue. */
  candidates?: number;
  /** Fixing this makes the same photo produce the same cloud every time. */
  seed?: number;
}

/**
 * mulberry32 — a tiny, fast, well-distributed PRNG.
 *
 * `Math.random()` cannot be seeded, and an unseeded cloud is a cloud you
 * cannot reproduce: a bug that only shows on some point placements would be
 * unrepeatable, and P8's exports would differ every run for no reason.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Give up on a rejection draw after this many tries and take what we have. */
const MAX_REJECTION_TRIES = 64;

/**
 * Draw one pixel with probability proportional to its importance.
 *
 * **Rejection sampling**: pick a pixel uniformly, accept it with probability
 * `importance / max`. Over many draws the accepted pixels follow the
 * importance distribution exactly, and it needs no cumulative table — which
 * for a megapixel image would be eight megabytes and a binary search per draw.
 *
 * The cost is retries: the acceptance rate is `mean / max`, so a map that is
 * one bright spot on a black field would retry for a long time. The floor in
 * the importance map (6.4) keeps the mean up, and the try limit bounds the
 * worst case at the price of a slightly-too-uniform point in a rare corner.
 */
function drawPixel(
  importance: Float32Array,
  max: number,
  random: () => number,
): number {
  const pixels = importance.length;

  for (let tries = 0; tries < MAX_REJECTION_TRIES; tries++) {
    const index = Math.min(pixels - 1, Math.floor(random() * pixels));
    if (random() * max <= importance[index]!) return index;
  }

  return Math.min(pixels - 1, Math.floor(random() * pixels));
}

/**
 * Sample `count` positions. Returns interleaved x, y in **pixel coordinates**,
 * with sub-pixel jitter — snapping to pixel centres would put every point back
 * on a lattice, which is exactly the regularity P3.1 went to such trouble to
 * leave behind.
 */
export function samplePoints({
  width,
  height,
  importance,
  count,
  candidates = 8,
  seed = 1,
}: SampleOptions): Float32Array {
  if (importance.length !== width * height) {
    throw new RangeError(
      `importance has ${importance.length} values, expected ${width * height}`,
    );
  }
  if (count <= 0) return new Float32Array(0);

  const random = mulberry32(seed);
  const points = new Float32Array(count * 2);

  let max = 0;
  for (const value of importance) if (value > max) max = value;
  // A map with no signal at all still has to produce a cloud, so fall back to
  // uniform rather than rejecting forever.
  if (!(max > 0)) max = 1;

  // One point per cell on average: the nine cells around a candidate then hold
  // roughly nine neighbours, which is enough to know whether it is crowded.
  const cellSize = Math.max(1, Math.sqrt((width * height) / count));
  const grid = new PointGrid(points, width, height, cellSize);

  // Two rings, not one: a candidate near a cell border would otherwise miss
  // neighbours just over it and look emptier than it is. Nothing beyond the
  // searched box can be seen, so an empty neighbourhood scores as if the
  // nearest point sat exactly on its edge — which keeps the score finite and
  // lets the importance term break the tie.
  const rings = 2;
  const reach = ((rings + 1) * cellSize) ** 2;

  for (let placed = 0; placed < count; placed++) {
    let bestX = 0;
    let bestY = 0;
    let bestScore = -1;

    const tries = placed === 0 ? 1 : candidates;
    for (let candidate = 0; candidate < tries; candidate++) {
      const pixel = drawPixel(importance, max, random);
      const x = (pixel % width) + random();
      const y = Math.floor(pixel / width) + random();

      const distance = Math.min(reach, grid.nearestDistanceSquared(x, y, rings));
      const score = distance * importance[pixel]!;

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
        bestY = y;
      }
    }

    points[placed * 2] = bestX;
    points[placed * 2 + 1] = bestY;
    grid.insert(placed);
  }

  return points;
}
