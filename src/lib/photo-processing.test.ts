import { describe, expect, it } from "vitest";
import { stripJpegMetadata } from "./photo-processing";

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
    expect([...sanitized]).toEqual([...jpeg([segment(0xe0, [0x4a, 0x46]),segment(0xdb, [0x00, 0x02])])]);
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
