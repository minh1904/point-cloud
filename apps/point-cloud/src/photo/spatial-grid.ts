/**
 * A uniform grid over the working image, for "what is near this point?" (6.5, 6.6).
 *
 * Both the sampler and the density pass ask that question tens of thousands of
 * times. Answering it by scanning every placed point is O(n²) — 65,536 points
 * would be four billion comparisons. Bucketing points by which cell they fall
 * in makes the answer local: with the cell size chosen so each cell holds about
 * one point, the nine cells around a position hold essentially every neighbour
 * that could matter.
 *
 * The buckets are a **linked list in two integer arrays**, which is the trick
 * worth taking away from this file. `head[cell]` is the index of the most
 * recently inserted point in that cell, and `next[point]` is the one before
 * it, with -1 for "end of list". No per-cell arrays, no allocation while
 * inserting, no capacity to overflow — two typed arrays sized once, and a cell
 * with forty points in it costs nothing extra.
 */
export class PointGrid {
  private readonly head: Int32Array;
  private readonly next: Int32Array;

  readonly columns: number;
  readonly rows: number;

  /**
   * @param points Interleaved x, y pairs. Read, never written.
   * @param width Image width the coordinates live in.
   * @param height Image height the coordinates live in.
   * @param cellSize Cell edge in the same units as the coordinates.
   */
  constructor(
    private readonly points: Float32Array,
    width: number,
    height: number,
    private readonly cellSize: number,
  ) {
    if (!(cellSize > 0)) throw new RangeError(`cellSize must be positive, got ${cellSize}`);

    this.columns = Math.max(1, Math.ceil(width / cellSize));
    this.rows = Math.max(1, Math.ceil(height / cellSize));
    this.head = new Int32Array(this.columns * this.rows).fill(-1);
    this.next = new Int32Array(points.length / 2).fill(-1);
  }

  private column(x: number): number {
    const c = Math.floor(x / this.cellSize);
    return c < 0 ? 0 : c >= this.columns ? this.columns - 1 : c;
  }

  private row(y: number): number {
    const r = Math.floor(y / this.cellSize);
    return r < 0 ? 0 : r >= this.rows ? this.rows - 1 : r;
  }

  /** File point `index` (whose coordinates are already in `points`). */
  insert(index: number): void {
    const cell = this.row(this.points[index * 2 + 1]!) * this.columns + this.column(this.points[index * 2]!);
    this.next[index] = this.head[cell]!;
    this.head[cell] = index;
  }

  /** Visit every filed point within `rings` cells of (x, y). */
  forEachNear(x: number, y: number, rings: number, visit: (index: number) => void): void {
    const cx = this.column(x);
    const cy = this.row(y);
    const minX = Math.max(0, cx - rings);
    const maxX = Math.min(this.columns - 1, cx + rings);
    const minY = Math.max(0, cy - rings);
    const maxY = Math.min(this.rows - 1, cy + rings);

    for (let row = minY; row <= maxY; row++) {
      for (let column = minX; column <= maxX; column++) {
        for (let i = this.head[row * this.columns + column]!; i !== -1; i = this.next[i]!) {
          visit(i);
        }
      }
    }
  }

  /**
   * Squared distance to the closest filed point, or `Infinity` if the
   * neighbourhood is empty.
   *
   * Squared, because comparing distances never needs the square root and
   * `Math.sqrt` in the inner loop of half a million queries is not free.
   */
  nearestDistanceSquared(x: number, y: number, rings = 1, skip = -1): number {
    let best = Infinity;

    this.forEachNear(x, y, rings, (index) => {
      if (index === skip) return;
      const dx = this.points[index * 2]! - x;
      const dy = this.points[index * 2 + 1]! - y;
      const squared = dx * dx + dy * dy;
      if (squared < best) best = squared;
    });

    return best;
  }
}
