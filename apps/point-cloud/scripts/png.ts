/**
 * A minimal 8-bit PNG reader and writer, with no dependencies.
 *
 * Roadmap 8.2 is blunt about why this exists: data PNGs must never go through
 * a canvas. A canvas premultiplies alpha and colour-manages what it draws,
 * which is invisible on a photo and fatal on a buffer of coordinates. The only
 * safe way to put numbers in a PNG is to assemble the bytes yourself.
 *
 * Scope is deliberately narrow — 8 bits per channel, RGB or RGBA, no
 * interlacing — because that is the whole of the bundle format. Compression
 * comes from `node:zlib`, so this file is for scripts only; the browser-side
 * encoder of P8.2 will use fflate or UPNG instead.
 */
import { deflateSync, inflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface Image {
  width: number;
  height: number;
  /** 3 = RGB, 4 = RGBA. */
  channels: 3 | 4;
  /** Row-major, `width * height * channels` bytes, top row first. */
  data: Uint8Array;
}

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

function chunk(type: string, data: Uint8Array): Buffer {
  const out = Buffer.alloc(data.length + 12);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  Buffer.from(data).copy(out, 8);
  // The CRC covers the type and the data, but not the length.
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePng({ width, height, channels, data }: Image): Buffer {
  const expected = width * height * channels;
  if (data.length !== expected) {
    throw new RangeError(`expected ${expected} bytes for ${width}x${height}x${channels}, got ${data.length}`);
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header.writeUInt8(8, 8); // bit depth
  header.writeUInt8(channels === 4 ? 6 : 2, 9); // colour type: RGBA or RGB
  header.writeUInt8(0, 10); // compression: deflate
  header.writeUInt8(0, 11); // filter method
  header.writeUInt8(0, 12); // no interlacing

  // Every scanline is prefixed with a filter type. Filters replace each byte
  // with its difference from a neighbour, which is perfectly reversible — they
  // are not lossy, and they are not what 8.2 warns about. They matter a lot
  // here: a coordinate ramp stored raw barely compresses, while the same ramp
  // stored as differences collapses to a run of near-identical bytes.
  //
  // Which filter suits a row is not knowable in advance, so try all five and
  // keep the one whose output is closest to zero — the standard heuristic from
  // the PNG specification.
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
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
          case 0: value = current[x]!; break;
          case 1: value = current[x]! - a; break;
          case 2: value = current[x]! - b; break;
          case 3: value = current[x]! - ((a + b) >> 1); break;
          default: value = current[x]! - paeth(a, b, c);
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
    Buffer.from(best).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

export function decodePng(bytes: Buffer): Image {
  if (!bytes.subarray(0, 8).equals(SIGNATURE)) {
    throw new Error("not a PNG file");
  }

  let width = 0;
  let height = 0;
  let channels: 3 | 4 = 3;
  const idat: Buffer[] = [];

  let offset = 8;
  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      const bitDepth = data.readUInt8(8);
      const colorType = data.readUInt8(9);
      const interlace = data.readUInt8(12);

      if (bitDepth !== 8) throw new Error(`only 8-bit PNGs are supported, got ${bitDepth}`);
      if (interlace !== 0) throw new Error("interlaced PNGs are not supported");
      if (colorType === 2) channels = 3;
      else if (colorType === 6) channels = 4;
      else throw new Error(`only RGB and RGBA PNGs are supported, got colour type ${colorType}`);
    } else if (type === "IDAT") {
      idat.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }
  }

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = new Uint8Array(stride * height);

  // Undo the per-scanline filters. Each byte is predicted from its left
  // neighbour (a), the byte above (b) and the one above-left (c).
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
        case 0: restored = value; break;
        case 1: restored = value + a; break;
        case 2: restored = value + b; break;
        case 3: restored = value + ((a + b) >> 1); break;
        case 4: restored = value + paeth(a, b, c); break;
        default: throw new Error(`unknown scanline filter ${filter}`);
      }

      out[y * stride + x] = restored & 0xff;
    }
  }

  return { width, height, channels, data: out };
}
