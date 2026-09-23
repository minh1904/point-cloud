/**
 * The half of PNG that has nothing to do with compression (P8.2).
 *
 * Roadmap 8.2 is blunt about why a hand-written PNG codec exists at all: data
 * PNGs must never go through a canvas. A canvas premultiplies alpha and
 * colour-manages what it draws, which is invisible on a photograph and fatal
 * on a buffer of coordinates. The only safe way to put numbers into a PNG is
 * to assemble the bytes yourself.
 *
 * What is new here is the *split*. Since P3.5 the encoder lived in
 * `scripts/png.ts` and compressed with `node:zlib`, which the browser does not
 * have — and P8 has to write bundles in the browser. Rather than write the
 * whole thing twice, everything except the deflate step moved here:
 *
 * ```
 *          filterScanlines ──▶ [deflate] ──▶ buildPng
 *          unfilterScanlines ◀── [inflate] ◀── readPngChunks
 * ```
 *
 * The node script fills the brackets with `zlib`; the browser fills them with
 * `CompressionStream`. Everything else — the signature, the CRC, the chunk
 * layout, the scanline filters — is shared, so the byte-exact round-trip tests
 * from P3.5 cover both paths.
 *
 * Scope is deliberately narrow: 8 bits per channel, RGB or RGBA, no
 * interlacing. That is the whole of the bundle format.
 */

export interface Image {
  width: number;
  height: number;
  /** 3 = RGB, 4 = RGBA. */
  channels: 3 | 4;
  /** Row-major, `width * height * channels` bytes, top row first. */
  data: Uint8Array;
}

export const PNG_SIGNATURE = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(data.length + 12);
  const view = new DataView(out.buffer);

  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  // The CRC covers the type and the data, but not the length.
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));

  return out;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/**
 * Turn pixels into the bytes that go into IDAT, before compression.
 *
 * Every scanline is prefixed with a filter type. Filters replace each byte
 * with its difference from a neighbour, which is perfectly reversible — they
 * are not lossy, and they are not what the canvas warning is about. They
 * matter a great deal here: a coordinate ramp stored raw barely compresses,
 * while the same ramp stored as differences collapses into a run of
 * near-identical bytes.
 *
 * Which filter suits a row is not knowable in advance, so all five are tried
 * and the one whose output is closest to zero wins — the standard heuristic
 * from the PNG specification.
 */
export function filterScanlines({ width, height, channels, data }: Image): Uint8Array {
  const expected = width * height * channels;
  if (data.length !== expected) {
    throw new RangeError(
      `expected ${expected} bytes for ${width}x${height}x${channels}, got ${data.length}`,
    );
  }

  const stride = width * channels;
  const raw = new Uint8Array((stride + 1) * height);
  const candidate = new Uint8Array(stride);
  let best = new Uint8Array(stride);

  for (let y = 0; y < height; y++) {
    const current = data.subarray(y * stride, (y + 1) * stride);
    const previous = y > 0 ? data.subarray((y - 1) * stride, y * stride) : undefined;

    let bestFilter = 0;
    let bestScore = Infinity;

    for (let filter = 0; filter <= 4; filter++) {
      let score = 0;

      for (let x = 0; x < stride; x++) {
        const a = x >= channels ? current[x - channels]! : 0;
        const b = previous ? previous[x]! : 0;
        const c = x >= channels && previous ? previous[x - channels]! : 0;

        let value: number;
        switch (filter) {
          case 0:
            value = current[x]!;
            break;
          case 1:
            value = current[x]! - a;
            break;
          case 2:
            value = current[x]! - b;
            break;
          case 3:
            value = current[x]! - ((a + b) >> 1);
            break;
          default:
            value = current[x]! - paeth(a, b, c);
        }

        value &= 0xff;
        candidate[x] = value;
        // Treat the byte as signed: both 1 and 255 are a difference of one.
        score += value < 128 ? value : 256 - value;
      }

      if (score < bestScore) {
        bestScore = score;
        bestFilter = filter;
        best = candidate.slice();
      }
    }

    raw[y * (stride + 1)] = bestFilter;
    raw.set(best, y * (stride + 1) + 1);
  }

  return raw;
}

/** Wrap already-compressed IDAT bytes in a complete PNG file. */
export function buildPng(
  width: number,
  height: number,
  channels: 3 | 4,
  compressed: Uint8Array,
): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);

  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = channels === 4 ? 6 : 2; // colour type: RGBA or RGB
  header[10] = 0; // compression: deflate
  header[11] = 0; // filter method
  header[12] = 0; // no interlacing

  return concat([
    PNG_SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", compressed),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export interface PngChunks {
  width: number;
  height: number;
  channels: 3 | 4;
  /** All IDAT chunks joined, still deflated. */
  compressed: Uint8Array;
}

/** Read the structure of a PNG without decompressing its pixels. */
export function readPngChunks(bytes: Uint8Array): PngChunks {
  for (let i = 0; i < PNG_SIGNATURE.length; i++) {
    if (bytes[i] !== PNG_SIGNATURE[i]) throw new Error("not a PNG file");
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let channels: 3 | 4 = 3;
  const idat: Uint8Array[] = [];

  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4]!,
      bytes[offset + 5]!,
      bytes[offset + 6]!,
      bytes[offset + 7]!,
    );
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      const header = new DataView(data.buffer, data.byteOffset, data.byteLength);
      width = header.getUint32(0);
      height = header.getUint32(4);
      const bitDepth = data[8]!;
      const colorType = data[9]!;
      const interlace = data[12]!;

      if (bitDepth !== 8) throw new Error(`only 8-bit PNGs are supported, got ${bitDepth}`);
      if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
      if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new Error(`only RGB and RGBA PNGs are supported, got colour type ${colorType}`);
    } else if (type === "IDAT") {
      // A slice, not a copy: the caller joins them once.
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  if (width === 0 || height === 0) throw new Error("PNG has no IHDR chunk");

  return { width, height, channels, compressed: concat(idat) };
}

/**
 * Undo the per-scanline filters.
 *
 * Each byte is predicted from its left neighbour (a), the byte above (b) and
 * the one above-left (c) — and crucially from the *already reconstructed*
 * versions of them, not from the filtered bytes. Reading from the wrong buffer
 * here produces an image that is plausible at the top and garbage by the
 * bottom, which is a memorable afternoon.
 */
export function unfilterScanlines(
  raw: Uint8Array,
  width: number,
  height: number,
  channels: 3 | 4,
): Uint8Array {
  const stride = width * channels;
  const expected = (stride + 1) * height;
  if (raw.length < expected) {
    throw new RangeError(`expected ${expected} filtered bytes, got ${raw.length}`);
  }

  const out = new Uint8Array(stride * height);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]!;
    const line = y * (stride + 1) + 1;

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? out[y * stride + x - channels]! : 0;
      const b = y > 0 ? out[(y - 1) * stride + x]! : 0;
      const c = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels]! : 0;
      const value = raw[line + x]!;

      let restored: number;
      switch (filter) {
        case 0:
          restored = value;
          break;
        case 1:
          restored = value + a;
          break;
        case 2:
          restored = value + b;
          break;
        case 3:
          restored = value + ((a + b) >> 1);
          break;
        case 4:
          restored = value + paeth(a, b, c);
          break;
        default:
          throw new Error(`unknown scanline filter ${filter}`);
      }

      out[y * stride + x] = restored & 0xff;
    }
  }

  return out;
}
