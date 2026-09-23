/**
 * Breaking the link between texture order and space (P6.9).
 *
 * The sampler produces points in the order it placed them, and packing them
 * into a 256² texture in that order means texel (x, y) and its neighbours are
 * points that were placed at about the same time — and therefore, because the
 * sampler draws from an importance map, points that are usually close together
 * on the photograph.
 *
 * That matters because three parts of the renderer key off the texel:
 *
 * - P4.2 seeds the flow field from a hash of the texel coordinate. Spatially
 *   correlated texels give spatially correlated seeds, and the "random"
 *   scatter stops being random.
 * - P5.5 derives each particle's arrival time from the same hash. Unshuffled,
 *   whole regions of the photo arrive together — and not in an artistic way,
 *   but as bands that sweep across in the order the sampler happened to work.
 * - Any future pass that reads a neighbouring texel gets a neighbour in space
 *   when it wanted an unrelated sample.
 *
 * After a shuffle the texture is a bag, not a map. Texel neighbours are
 * unrelated points, per-point hashes are independent, and the intro dissolves
 * evenly across the whole picture.
 *
 * ## And `aIndex` finally has a job
 *
 * The ordinal has been uploaded since P3.1 and never read. It could not be
 * used as a seed while the order was spatial (it would have been just another
 * correlated number) and hashing a five-digit integer in a float shader loses
 * precision anyway. Shuffling is what makes the ordinal *mean* nothing, which
 * is exactly what a seed needs — but the precision problem stands, so the
 * shader still hashes texel coordinates. The honest status: shuffling removes
 * the first objection, not the second.
 */
import { mulberry32 } from "./sample-points";
import type { PointCloud } from "./lift";

/**
 * Fisher-Yates, seeded.
 *
 * Walk from the end, swapping each element with a random one at or before it.
 * Every permutation comes out exactly equally likely — unlike the tempting
 * `sort(() => Math.random() - 0.5)`, which is biased, and whose bias depends
 * on the sort implementation.
 */
export function shuffledOrder(count: number, seed = 1): Uint32Array {
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;

  const random = mulberry32(seed);
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const swap = order[i]!;
    order[i] = order[j]!;
    order[j] = swap;
  }

  return order;
}

/** Apply a permutation to every per-point array of a cloud. */
export function shuffleCloud(cloud: PointCloud, seed = 1): PointCloud {
  const order = shuffledOrder(cloud.count, seed);

  const positions = new Float32Array(cloud.count * 3);
  const colors = new Uint8ClampedArray(cloud.count * 3);
  const density = new Float32Array(cloud.count);

  for (let to = 0; to < cloud.count; to++) {
    const from = order[to]!;
    positions[to * 3] = cloud.positions[from * 3]!;
    positions[to * 3 + 1] = cloud.positions[from * 3 + 1]!;
    positions[to * 3 + 2] = cloud.positions[from * 3 + 2]!;
    colors[to * 3] = cloud.colors[from * 3]!;
    colors[to * 3 + 1] = cloud.colors[from * 3 + 1]!;
    colors[to * 3 + 2] = cloud.colors[from * 3 + 2]!;
    density[to] = cloud.density[from]!;
  }

  return { count: cloud.count, positions, colors, density };
}
