/**
 * The browser half of the PNG codec (P8.2).
 *
 * PNG needs DEFLATE, and the browser has had it all along — just not where you
 * would look for it. `CompressionStream` is a *streaming* API meant for
 * fetch bodies, and it happens to be the only zlib in a web page that is not a
 * library you shipped yourself.
 *
 * The one thing to get right is which flavour:
 *
 * | format | what it is | used by |
 * |---|---|---|
 * | `"deflate"` | raw DEFLATE inside a **zlib** wrapper (RFC 1950) | PNG's IDAT |
 * | `"deflate-raw"` | bare DEFLATE, no wrapper (RFC 1951) | zip's method 8 |
 * | `"gzip"` | DEFLATE inside a gzip wrapper | HTTP, `.gz` files |
 *
 * PNG wants the zlib wrapper — two header bytes and an Adler-32 checksum. Use
 * `"deflate-raw"` here and every PNG viewer in the world rejects the file, for
 * the sake of six bytes.
 *
 * Everything else is shared with the node script through `png-codec.ts`.
 */
import {
  buildPng,
  filterScanlines,
  readPngChunks,
  unfilterScanlines,
  type Image,
} from "./png-codec";

export type { Image };

/**
 * Run bytes through one of the browser's compression streams.
 *
 * The parameter is typed as the DOM's own `CompressionStream | DecompressionStream`
 * rather than `TransformStream<Uint8Array, Uint8Array>`: their `writable` side
 * accepts any `BufferSource`, which is wider than `Uint8Array`, and TypeScript
 * is right to refuse the narrower annotation.
 */
async function transform(
  bytes: Uint8Array,
  stream: CompressionStream | DecompressionStream,
): Promise<Uint8Array> {
  const written = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  // `Response` will drain a stream into an ArrayBuffer, which is markedly less
  // code than reading the chunks and stitching them together by hand.
  return new Uint8Array(await new Response(written).arrayBuffer());
}

export function deflate(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new CompressionStream("deflate"));
}

export function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new DecompressionStream("deflate"));
}

/** Bare DEFLATE, for zip entries written with compression method 8. */
export function inflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  return transform(bytes, new DecompressionStream("deflate-raw"));
}

export async function encodePng(image: Image): Promise<Uint8Array> {
  const compressed = await deflate(filterScanlines(image));
  return buildPng(image.width, image.height, image.channels, compressed);
}

export async function decodePng(bytes: Uint8Array): Promise<Image> {
  const { width, height, channels, compressed } = readPngChunks(bytes);
  const raw = await inflate(compressed);
  return { width, height, channels, data: unfilterScanlines(raw, width, height, channels) };
}
