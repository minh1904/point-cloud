/**
 * Bakes colour grades into 3D LUT images (P5.2).
 *
 *   bun run build:luts
 *
 * A LUT is a lookup table: for every input colour, the colour it becomes. Doing
 * that honestly needs three dimensions, and a GPU cannot sample a 3D texture in
 * WebGL 1, so the cube is sliced and laid out flat:
 *
 *   64 x 64 x 64 colours  ->  64 slices of 64x64  ->  an 8x8 grid  ->  512x512
 *
 * Each slice holds every combination of red and green at one fixed blue:
 * red runs left to right, green top to bottom, and the slice index is blue.
 *
 * The point of pre-baking is that the grade stops being code. Whatever this
 * script does — curves, tints, saturation, or something hand-painted in a photo
 * editor — collapses into one 512x512 PNG that the shader reads with two
 * texture fetches. Swapping the file changes the entire look, and the shader
 * never knows what happened.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { encodePng } from "./png";

/** Samples per axis. 64 is the standard, and 64 * 64 = 4096 = 512 * 8. */
const SIZE = 64;
/** Slices per row in the flattened image. */
const TILES = 8;
const IMAGE = SIZE * TILES; // 512

const here = fileURLToPath(new URL(".", import.meta.url));
const outputDir = `${here}../public/luts`;

type Grade = (r: number, g: number, b: number) => [number, number, number];

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** Pull a colour toward or away from its own brightness. */
function saturate(r: number, g: number, b: number, amount: number): [number, number, number] {
  const l = luminance(r, g, b);
  return [l + (r - l) * amount, l + (g - l) * amount, l + (b - l) * amount];
}

/** Gentle S-curve: darks a little darker, lights a little lighter. */
const contrast = (x: number, amount: number) =>
  x * (1 - amount) + x * x * (3 - 2 * x) * amount;

/**
 * Split toning is the oldest trick in colour grading: push the shadows one way
 * and the highlights the other, and the picture gains depth that no single
 * global shift can give it. Cool shadows against warm light is the combination
 * that reads as "film" to most eyes.
 */
function splitTone(
  r: number,
  g: number,
  b: number,
  shadow: [number, number, number],
  highlight: [number, number, number],
): [number, number, number] {
  const l = luminance(r, g, b);
  const low = (1 - l) * (1 - l);
  const high = l * l;

  return [
    r + shadow[0] * low + highlight[0] * high,
    g + shadow[1] * low + highlight[1] * high,
    b + shadow[2] * low + highlight[2] * high,
  ];
}

const GRADES: Record<string, Grade> = {
  // The control case. An identity LUT must come back byte-for-byte unchanged,
  // which makes it the only honest test of the sampling code: if the picture
  // shifts at all when this one is applied at full strength, the lookup is
  // wrong, not the grade.
  neutral: (r, g, b) => [r, g, b],

  // Cool shadows, warm light, slightly richer colour.
  warm: (r, g, b) => {
    let [cr, cg, cb] = [contrast(r, 0.35), contrast(g, 0.35), contrast(b, 0.35)];
    [cr, cg, cb] = splitTone(cr, cg, cb, [-0.035, 0.005, 0.055], [0.055, 0.02, -0.03]);
    [cr, cg, cb] = saturate(cr, cg, cb, 1.12);
    return [cr, cg, cb];
  },

  // Drained and blue, the other direction: less colour, lifted blacks.
  cool: (r, g, b) => {
    let [cr, cg, cb] = saturate(r, g, b, 0.72);
    [cr, cg, cb] = splitTone(cr, cg, cb, [0.01, 0.025, 0.06], [-0.02, 0.0, 0.03]);
    [cr, cg, cb] = [contrast(cr, 0.18), contrast(cg, 0.18), contrast(cb, 0.18)];
    return [cr, cg, cb];
  },
};

function bake(grade: Grade): Uint8Array {
  const data = new Uint8Array(IMAGE * IMAGE * 3);

  for (let blue = 0; blue < SIZE; blue++) {
    const tileX = (blue % TILES) * SIZE;
    const tileY = Math.floor(blue / TILES) * SIZE;

    for (let green = 0; green < SIZE; green++) {
      for (let red = 0; red < SIZE; red++) {
        const [r, g, b] = grade(red / (SIZE - 1), green / (SIZE - 1), blue / (SIZE - 1));
        const offset = ((tileY + green) * IMAGE + tileX + red) * 3;

        data[offset] = Math.round(clamp(r) * 255);
        data[offset + 1] = Math.round(clamp(g) * 255);
        data[offset + 2] = Math.round(clamp(b) * 255);
      }
    }
  }

  return data;
}

mkdirSync(outputDir, { recursive: true });

for (const [name, grade] of Object.entries(GRADES)) {
  const data = bake(grade);
  const png = encodePng({ width: IMAGE, height: IMAGE, channels: 3, data });
  writeFileSync(`${outputDir}/${name}.png`, png);
  console.log(`${name}.png  ${(png.length / 1024).toFixed(1)} KB`);
}

console.log(`wrote ${Object.keys(GRADES).length} LUTs to ${outputDir}`);
