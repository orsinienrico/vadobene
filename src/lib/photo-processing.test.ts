import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeOutfitPhoto, stripJpegMetadata } from "./photo-processing";

const cfContext = vi.hoisted(() => ({ current: null as null | { env: Record<string, unknown> } }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: () => cfContext.current }));
afterEach(() => { delete process.env.VB_IMAGE_PROCESSOR; cfContext.current = null; });

function segment(marker: number, data: number[]) {
  const len = data.length + 2;
  return [0xff, marker, len >>> 8, len & 255, ...data];
}
const jpeg = (segments: number[][]) => new Uint8Array([
  0xff, 0xd8,
  ...segments.flat(),
  // Start of scan (length 2), arbitrary scan bytes and end of image.
  0xff, 0xda, 0x00, 0x02, 0x10, 0x20, 0xff, 0xd9,
]);

describe("Cloudflare JPEG privacy stripping", () => {
  it("removes EXIF/GPS, XMP and comment markers while preserving scan", () => {
    const file = jpeg([
      segment(0xe0, [0x4a, 0x46]),
      segment(0xe1, [0x45, 0x78, 0x69, 0x66]), // EXIF
      segment(0xed, [0x58, 0x4d, 0x50]), // XMP
      segment(0xfe, [0x53, 0x45, 0x43]), // Comment
      segment(0xdb, [0x00, 0x02]), // JPEG quantization
    ]);
    const sanitized = stripJpegMetadata(file);
    expect([...sanitized]).toEqual([...jpeg([segment(0xdb, [0x00, 0x02])])]);
  });
  it("removes metadata between progressive scans and preserves byte-stuffed JPEG data", () => {
    const content = new Uint8Array([
      0xff, 0xd8,
      ...segment(0xdb, [0x00, 0x02]),
      ...segment(0xda, []), 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56,
      ...segment(0xe1, [0x47, 0x50, 0x53]),
      ...segment(0xc4, [0x00, 0x02]),
      ...segment(0xda, []), 0x78, 0xff, 0xd9,
      0x54, 0x52, 0x41, 0x49, 0x4c,
    ]);
    const expected = new Uint8Array([
      0xff, 0xd8,
      ...segment(0xdb, [0x00, 0x02]),
      ...segment(0xda, []), 0x12, 0xff, 0x00, 0x34, 0xff, 0xd0, 0x56,
      ...segment(0xc4, [0x00, 0x02]),
      ...segment(0xda, []), 0x78, 0xff, 0xd9,
    ]);
    expect([...stripJpegMetadata(content)]).toEqual([...expected]);
  });
  it("discards trailing bytes appended after JPEG end-of-image", () => {
    const valid = jpeg([segment(0xdb, [0x00, 0x02])]);
    const malicious = new Uint8Array([...valid, 0x45, 0x78, 0x69, 0x66, 0x47, 0x50, 0x53]);
    expect([...stripJpegMetadata(malicious)]).toEqual([...valid]);
  });
  it("fails closed on malformed marker lengths", () => {
    expect(() => stripJpegMetadata(new Uint8Array([0xff,0xd8,0xff,0xe1,0x00,0x10]))).toThrow();
  });
  it("fails closed on non-JPEG content", () => {
    expect(() => stripJpegMetadata(new Uint8Array([0x89,0x50,0x4e,0x47]))).toThrow();
  });
});

describe("Cloudflare Images async output contract", () => {
  it("awaits output, strips metadata and returns only the transformed JPEG", async () => {
    const transformed = jpeg([
      segment(0xe1, [0x45, 0x58, 0x49, 0x46]),
      segment(0xdb, [0x00, 0x02]),
    ]);
    const output = vi.fn(async () => ({
      response: () => new Response(transformed, { headers: { "content-type": "image/jpeg" } }),
    }));
    const transform = vi.fn(() => ({ output }));
    const info = vi.fn(async () => ({ width: 1600, height: 1200 }));
    cfContext.current = { env: { IMAGES: { info, input: () => ({ transform }) } } };
    process.env.VB_IMAGE_PROCESSOR = "cloudflare";

    const result = await normalizeOutfitPhoto(Buffer.from("fake-private-photo").toString("base64"));
    expect([...result]).toEqual([...jpeg([segment(0xdb, [0x00, 0x02])])]);
    expect(transform).toHaveBeenCalledWith({
      width: 1280, height: 1280, fit: "scale-down", metadata: "none",
    });
    expect(output).toHaveBeenCalledWith({ format: "image/jpeg", quality: 82, anim: false });
  });

  it("fails closed on an Images binding error (does not fall back to unprocessed bytes)", async () => {
    cfContext.current = { env: { IMAGES: {
      info: async () => ({ width: 500, height: 500 }),
      input: () => ({ transform: () => ({ output: async () => { throw new Error("Conversion failed"); } }) }),
    } } };
    process.env.VB_IMAGE_PROCESSOR = "cloudflare";
    await expect(normalizeOutfitPhoto(Buffer.from("private-photo").toString("base64")))
      .rejects.toThrow("Conversion failed");
  });

  it("rejects decompression bombs before invoking transformations", async () => {
    const output = vi.fn();
    cfContext.current = { env: { IMAGES: {
      info: async () => ({ width: 10000, height: 10000 }),
      input: output,
    } } };
    process.env.VB_IMAGE_PROCESSOR = "cloudflare";
    await expect(normalizeOutfitPhoto(Buffer.from("private-photo").toString("base64")))
      .rejects.toThrow("Invalid source dimensions");
    expect(output).not.toHaveBeenCalled();
  });
});
