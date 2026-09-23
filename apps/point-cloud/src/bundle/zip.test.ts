import { describe, expect, it } from "vitest";

import { readZip, writeZip, type ZipEntry } from "./zip";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const text = (value: string) => encoder.encode(value);

/** The signatures a zip is made of, so the tests can point at them. */
const LOCAL = [0x50, 0x4b, 0x03, 0x04];
const END = [0x50, 0x4b, 0x05, 0x06];

describe("writeZip", () => {
  it("starts with a local file header and ends with the central directory record", () => {
    const bytes = writeZip([{ name: "a.txt", bytes: text("hello") }]);

    expect([...bytes.subarray(0, 4)]).toEqual(LOCAL);
    expect([...bytes.subarray(bytes.length - 22, bytes.length - 18)]).toEqual(END);
  });

  it("writes the same bytes for the same input, with no timestamp", () => {
    const entries: ZipEntry[] = [{ name: "a.txt", bytes: text("hello") }];
    expect(Array.from(writeZip(entries))).toEqual(Array.from(writeZip(entries)));
  });

  it("stores rather than compresses", () => {
    // Method lives at offset 8 of the local header, little-endian.
    const bytes = writeZip([{ name: "a.txt", bytes: text("x".repeat(500)) }]);
    const view = new DataView(bytes.buffer);
    expect(view.getUint16(8, true)).toBe(0);
    // And a stored entry is never smaller than its content.
    expect(bytes.length).toBeGreaterThan(500);
  });

  it("makes an empty archive that is just the end record", () => {
    expect(writeZip([]).length).toBe(22);
  });
});

describe("readZip", () => {
  it("round-trips several files", async () => {
    const entries: ZipEntry[] = [
      { name: "metadata.json", bytes: text("{}") },
      { name: "color.png", bytes: new Uint8Array([1, 2, 3, 250, 251, 252]) },
      { name: "params.json", bytes: text("{}") },
    ];

    const read = await readZip(writeZip(entries));

    expect(read.map((entry) => entry.name)).toEqual([
      "metadata.json",
      "color.png",
      "params.json",
    ]);
    expect(decoder.decode(read[0]!.bytes)).toBe("{}");
    expect(Array.from(read[1]!.bytes)).toEqual([1, 2, 3, 250, 251, 252]);
  });

  it("round-trips bytes with every possible value", async () => {
    const all = new Uint8Array(256);
    for (let i = 0; i < 256; i++) all[i] = i;

    const [entry] = await readZip(writeZip([{ name: "all.bin", bytes: all }]));
    expect(Array.from(entry!.bytes)).toEqual(Array.from(all));
  });

  it("keeps non-ASCII names, which are UTF-8 on the wire", async () => {
    const [entry] = await readZip(writeZip([{ name: "anh-đẹp.png", bytes: text("x") }]));
    expect(entry!.name).toBe("anh-đẹp.png");
  });

  it("handles an empty file", async () => {
    const [entry] = await readZip(writeZip([{ name: "empty", bytes: new Uint8Array(0) }]));
    expect(entry!.bytes.length).toBe(0);
  });

  it("refuses something that is not a zip", async () => {
    await expect(readZip(text("this is not a zip at all"))).rejects.toThrow(
      /no end-of-central-directory/,
    );
  });

  it("refuses an archive whose directory offset is wrong", async () => {
    const bytes = writeZip([{ name: "a.txt", bytes: text("hello") }]);
    // Keep the end record but corrupt where it says the directory starts.
    const view = new DataView(bytes.buffer);
    view.setUint32(bytes.length - 22 + 16, 3, true);

    await expect(readZip(bytes)).rejects.toThrow(/central directory/);
  });
});
