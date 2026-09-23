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
 * Real depth comes from a monocular depth model running in the browser, which
 * is P6.2-6.3 and still an open decision. Until then `estimateDepth` below
 * uses two classical painter's cues that happen to suit a landscape:
 * atmospheric perspective (distance washes colour out and lightens it) and the
 * ground plane (lower in the frame is nearer). It is a stand-in that gives the
 * decode path something real to chew on, and the shallow relief the research
 * note recommends (0.6-5% of width) hides most of its errors. Do not mistake
 * it for depth estimation.
 * ────────────────────────────────────────────────────────────────────────────
 */
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { computeBounds, encodePositions } from "../src/bundle/position-codec";
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

/** Relative distance in 0…1, where 0 is nearest the camera and 1 is farthest. */
function estimateDepth(r: number, g: number, b: number, rowFraction: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);

  const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const saturation = max === 0 ? 0 : (max - min) / max;

  // Atmospheric perspective: haze lightens distant things and drains their
  // colour. Bright + desaturated reads as far (sky, hazy ridges); dark +
  // saturated reads as near (grass in the foreground, the green jacket).
  const haze = luma * (1 - saturation);

  // Ground plane: for a camera looking across a landscape, the bottom of the
  // frame is at your feet and the top is at the horizon.
  const far = 1 - rowFraction;

  return Math.min(1, Math.max(0, 0.55 * haze + 0.45 * far));
}

/** Box blur, in place over a square grid. Depth noise reads as z-jitter. */
function blur(values: Float32Array, size: number, passes: number): Float32Array {
  let source = values;

  for (let pass = 0; pass < passes; pass++) {
    const out = new Float32Array(source.length);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        let sum = 0;
        let count = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const sx = x + dx;
            const sy = y + dy;
            if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
            sum += source[sy * size + sx]!;
            count++;
          }
        }
        out[y * size + x] = sum / count;
      }
    }

    source = out;
  }

  return source;
}

const color = decodePng(readFileSync(`${sampleDir}/color.png`));
if (color.width !== color.height) {
  throw new Error(`the data texture must be square, got ${color.width}x${color.height}`);
}

const size = color.width;
const count = size * size;
const aspect = 1200 / 800; // the source photo, before it was squeezed square
const fieldHeight = FIELD_WIDTH / aspect;

// Pass 1: depth for every texel, then smooth it.
const depth = new Float32Array(count);
for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const p = i * color.channels;
    depth[i] = estimateDepth(
      color.data[p]! / 255,
      color.data[p + 1]! / 255,
      color.data[p + 2]! / 255,
      (y + 0.5) / size,
    );
  }
}
const smoothed = blur(depth, size, 2);

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
    kind: "placeholder-heuristic",
    relief: RELIEF,
    note: "Atmospheric perspective + ground plane, not a depth model. Replaced by P6.",
  },
};

writeFileSync(`${sampleDir}/metadata.json`, `${JSON.stringify(metadata, null, 2)}\n`);

console.log(`${count.toLocaleString("en-US")} particles`);
console.log(`bounds min ${bounds.min.map((v) => v.toFixed(4)).join(", ")}`);
console.log(`bounds max ${bounds.max.map((v) => v.toFixed(4)).join(", ")}`);
console.log(`wrote position_h.png, position_l.png, metadata.json to ${sampleDir}`);
