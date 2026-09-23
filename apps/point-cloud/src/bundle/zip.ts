/**
 * A zip file, written and read by hand (P8.2).
 *
 * Zip has a reputation for being complicated, and most of that reputation
 * belongs to the parts this does not need: spanned archives, encryption,
 * zip64, the dozen compression methods nobody has used since 1993.
 *
 * What is left is a format with a simple shape. Each file is stored as a
 * **local header followed by its bytes**, one after another; then a **central
 * directory** repeats that information with an offset back to each local
 * header; then an **end-of-central-directory** record says where the directory
 * starts and how many entries it has.
 *
 * ```
 * [local header][file 1][local header][file 2] … [central dir][EOCD]
 *                                                     ▲          │
 *                                                     └──────────┘
 * ```
 *
 * The redundancy is on purpose: a reader can walk forward through the local
 * headers, or jump to the end and read the directory. This one jumps, because
 * the directory is the authoritative list.
 *
 * ## Writing is stored, reading accepts both
 *
 * Entries are written with compression method **0 (stored)**. A bundle is
 * mostly PNGs, which already deflate their own pixel data; deflating an
 * already-deflated stream saves essentially nothing and costs the time twice.
 *
 * Reading accepts method 8 as well, because a bundle that has been through a
 * normal zip tool will come back deflated. That path needs `"deflate-raw"` —
 * zip stores bare DEFLATE with no zlib wrapper, unlike PNG.
 */
import { inflateRaw } from "./png-browser";

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const STORED = 0;
const DEFLATED = 8;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

/** Same polynomial as PNG's, which is not a coincidence — both are CRC-32. */
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

/**
 * Build a zip from entries, all stored.
 *
 * Every multi-byte field is **little-endian** — zip came from MS-DOS, while
 * PNG came from the internet and is big-endian throughout. Two formats in the
 * same file, disagreeing about byte order, is exactly the kind of detail that
 * costs an hour if you assume rather than check.
 */
export function writeZip(entries: readonly ZipEntry[]): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);

    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_HEADER, true);
    localView.setUint16(4, 20, true); // version needed: 2.0
    localView.setUint16(6, 0, true); // flags
    localView.setUint16(8, STORED, true);
    // MS-DOS time and date. Zeroed on purpose: a bundle exported twice from
    // the same cloud should be byte-identical, and a timestamp would make
    // every export differ from the last for no reason anyone can use.
    localView.setUint16(10, 0, true);
    localView.setUint16(12, 0, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true); // compressed size
    localView.setUint32(22, entry.bytes.length, true); // uncompressed size
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true); // extra field length
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, CENTRAL_HEADER, true);
    centralView.setUint16(4, 20, true); // version made by
    centralView.setUint16(6, 20, true); // version needed
    centralView.setUint16(8, 0, true); // flags
    centralView.setUint16(10, STORED, true);
    centralView.setUint16(12, 0, true); // time
    centralView.setUint16(14, 0, true); // date
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint16(30, 0, true); // extra
    centralView.setUint16(32, 0, true); // comment
    centralView.setUint16(34, 0, true); // disk number
    centralView.setUint16(36, 0, true); // internal attributes
    centralView.setUint32(38, 0, true); // external attributes
    centralView.setUint32(42, offset, true); // where the local header is
    central.set(name, 46);
    centrals.push(central);

    offset += local.length;
  }

  const directorySize = centrals.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, END_OF_CENTRAL_DIRECTORY, true);
  endView.setUint16(4, 0, true); // this disk
  endView.setUint16(6, 0, true); // disk with the directory
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, directorySize, true);
  endView.setUint32(16, offset, true); // where the directory starts
  endView.setUint16(20, 0, true); // comment length

  const parts = [...locals, ...centrals, end];
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }

  return out;
}

/**
 * Find the end-of-central-directory record.
 *
 * It is the **last** thing in the file, but not at a fixed offset, because it
 * may be followed by a comment of up to 65,535 bytes. So the only way to find
 * it is to scan backwards for its signature — which is what every zip reader
 * ever written does, and why zip files can survive being concatenated onto the
 * end of something else.
 */
function findEndRecord(view: DataView): number {
  const earliest = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let i = view.byteLength - 22; i >= earliest; i--) {
    if (view.getUint32(i, true) === END_OF_CENTRAL_DIRECTORY) return i;
  }
  throw new Error("not a zip file: no end-of-central-directory record");
}

export async function readZip(bytes: Uint8Array): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = findEndRecord(view);

  const count = view.getUint16(end + 10, true);
  let cursor = view.getUint32(end + 16, true);
  const entries: ZipEntry[] = [];

  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== CENTRAL_HEADER) {
      throw new Error(`corrupt zip: expected a central directory entry at ${cursor}`);
    }

    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== LOCAL_HEADER) {
      throw new Error(`corrupt zip: ${name} does not point at a local header`);
    }

    // The local header has its own name and extra-field lengths, and the extra
    // field is routinely a different size from the central one — readers that
    // reuse the central lengths here read garbage.
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const stored = bytes.subarray(dataStart, dataStart + compressedSize);

    if (method === STORED) entries.push({ name, bytes: stored });
    else if (method === DEFLATED) entries.push({ name, bytes: await inflateRaw(stored) });
    else throw new Error(`${name} uses compression method ${method}, which is not supported`);

    cursor += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
