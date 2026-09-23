/**
 * Builds the committed sample bundle from `color.png` (P3.3 / P3.4).
 *
 *   bun run build:sample
 *
 * Writes `position_h.png`, `position_l.png` and `metadata.json` next to the
 * colour map. Run it again after replacing `color.png` — or after changing the
 * field size or relief below — and the renderer picks up the new numbers with
 * no code change.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * The depth in this bundle is a PLACEHOLDER, not a measurement.
 *
 * Real depth comes from a monocular depth model running in the browser, and
 * since P6.3 the app does exactly that — drop this photo into the running app
 * and it gets Depth Anything V2. This script has no browser, so it falls back
 * to `heuristicDepth`, the same painter's-cue estimator the app uses while the
 * model loads: atmospheric perspective plus the ground plane. It is a stand-in
 * that gives the decode path something real to chew on, and the shallow relief
 * the research note recommends (0.6-5% of width) hides most of its errors. Do
 * not mistake it for depth estimation.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { computeBounds, encodePositions } from "../src/bundle/position-codec";
import { heuristicDepth } from "../src/photo/depth/heuristic-depth";
import { decodePng, encodePng } from "./png";

/** World width the cloud is spread over. Height follows the photo's aspect. */
const FIELD_WIDTH = 3;
/**
 * Depth of the relief, 3% of the width. The UntilLabs scene uses about 0.6%
 * (research note §2.2): shallow relief plus a narrow FOV is what lets an
 * imperfect depth map still read as a photograph rather than a bad 3D model.
 */
const RELIEF = FIELD_WIDTH * 0.03;

const here = fileURLToPath(new URL(".", import.meta.url));
const sampleDir = `${here}../public/particles/sample`;

const color = decodePng(readFileSync(`${sampleDir}/color.png`));
if (color.width !== color.height) {
  throw new Error(`the data texture must be square, got ${color.width}x${color.height}`);
}

const size = color.width;
const count = size * size;
const aspect = 1200 / 800; // the source photo, before it was squeezed square
const fieldHeight = FIELD_WIDTH / aspect;

// Pass 1: depth for every texel, from the shared heuristic.
const smoothed = heuristicDepth({
  width: size,
  height: size,
  data: color.data,
  channels: color.channels,
}).data;

// Pass 2: texel address plus depth becomes a world position. Texel row 0 is
// the top of the photo, and +y is up, so the row index counts downward.
const positions = new Float32Array(count * 3);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    positions[i * 3 + 0] = ((x + 0.5) / size - 0.5) * FIELD_WIDTH;
    positions[i * 3 + 1] = (0.5 - (y + 0.5) / size) * fieldHeight;
    positions[i * 3 + 2] = (0.5 - smoothed[i]!) * RELIEF;
  }
}

const bounds = computeBounds(positions);
const { high, low } = encodePositions(positions, bounds);

writeFileSync(
  `${sampleDir}/position_h.png`,
  encodePng({ width: size, height: size, channels: 3, data: high }),
);
writeFileSync(
  `${sampleDir}/position_l.png`,
  encodePng({ width: size, height: size, channels: 3, data: low }),
);

const metadata = {
  version: 1,
  width: size,
  height: size,
  particleCount: count,
  precision: 16,
  bounds,
  source: { image: "color.png", aspect },
  depth: {
    kind: "heuristic",
    relief: RELIEF,
    note: "Painter's cues, not a depth model. Drop the photo into the app for Depth Anything V2.",
  },
};

writeFileSync(`${sampleDir}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`${count.toLocaleString("en-US")} particles`);
console.log(`bounds min ${bounds.min.map((v) => v.toFixed(4)).join(", ")}`);
console.log(`bounds max ${bounds.max.map((v) => v.toFixed(4)).join(", ")}`);
console.log(`wrote position_h.png, position_l.png, metadata.json to ${sampleDir}`);
