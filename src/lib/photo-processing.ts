/**
 * Private outfit photo normalization for Node and Cloudflare Workers.
 * Never forward raw user photo to Supabase/Anthropic. Cloudflare's Images
 * binding re-encodes the image; JPEG metadata marker stripping is defense
 * in depth, not a substitute for runtime verification on real samples.
 */
const MAX_RAW_BYTES = 6 * 1024 * 1024;
const MAX_STORED_BYTES = 6 * 1024 * 1024;
const MAX_PIXELS = 20_000_000;
const MAX_SIDE = 1280;

type TransformResult = { response(): Response };
type ImageChain = {
  transform(options: {
    width: number; height: number; fit: "scale-down"; metadata: "none";
  }): { output(options: { format: "image/jpeg"; quality: number; anim: false }): Promise<TransformResult> };
};
type CloudflareImages = {
  info(stream: ReadableStream<Uint8Array>): Promise<{ width: number; height: number }>;
  input(stream: ReadableStream<Uint8Array>): ImageChain;
};

function imageStream(bytes: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    },
  });
}

/**
 * Strip all JPEG APPn and COM metadata, including markers between progressive
 * JPEG scans. Preserve image-control segments and entropy-coded scan data.
 * The Cloudflare binding already re-encodes with metadata: none: this is an
 * additional fail-closed boundary before a photo leaves the Worker.
 */
export function stripJpegMetadata(source: Uint8Array): Uint8Array {
  if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) {
    throw new Error("Invalid JPEG");
  }
  const pieces: Uint8Array[] = [source.subarray(0, 2)];
  let p = 2;
  let inScan = false;
  let sawScan = false;
  while (p < source.length) {
    if (inScan) {
      const from = p;
      let foundMarker = false;
      while (p < source.length - 1) {
        if (source[p] !== 0xff) { p++; continue; }
        let next = p + 1;
        while (source[next] === 0xff) next++;
        if (next >= source.length) throw new Error("Truncated JPEG scan");
        const marker = source[next];
        if (marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)) {
          // Byte-stuffed FF and legal restart markers are compressed data.
          p = next + 1;
          continue;
        }
        pieces.push(source.subarray(from, p));
        inScan = false;
        foundMarker = true;
        break;
      }
      if (!foundMarker) throw new Error("JPEG scan not terminated");
      continue;
    }

    const markerStart = p;
    if (source[p++] !== 0xff) throw new Error("Malformed JPEG marker");
    while (p < source.length && source[p] === 0xff) p++;
    if (p >= source.length) throw new Error("Truncated JPEG marker");
    const marker = source[p++];
    if (marker === 0xd9) {
      if (!sawScan) throw new Error("Missing JPEG image scan");
      pieces.push(source.subarray(markerStart, p));
      // Intentionally discard bytes appended after the genuine EOI marker.
      const size = pieces.reduce((n, item) => n + item.byteLength, 0);
      const result = new Uint8Array(size);
      let cursor = 0;
      for (const piece of pieces) {
        result.set(piece, cursor);
        cursor += piece.byteLength;
      }
      return result;
    }
    if (marker === 0xd8 || marker === 0x00 || marker === 0x01 ||
        (marker >= 0xd0 && marker <= 0xd7) || p + 2 > source.length) {
      throw new Error("Unexpected JPEG marker");
    }
    const segmentLength = (source[p] << 8) | source[p + 1];
    if (segmentLength < 2 || p + segmentLength > source.length) {
      throw new Error("Invalid JPEG segment");
    }
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) {
      pieces.push(source.subarray(markerStart, p + segmentLength));
    }
    p += segmentLength;
    if (marker === 0xda) {
      sawScan = true;
      inScan = true;
    }
  }
  throw new Error("JPEG end marker missing");
}

function decodeBase64Photo(photo: string): Buffer {
  const encoded = photo.replace(/^data:[^;]+;base64,/i, "");
  if (!encoded || encoded.length % 4 === 1 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("Invalid image encoding");
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.length === 0 || bytes.length > MAX_RAW_BYTES) throw new Error("Image too large");
  return bytes;
}

async function withCloudflareImages(raw: Buffer): Promise<Buffer> {
  const { getCloudflareContext } = await import("@opennextjs/cloudflare");
  const context = getCloudflareContext();
  const images = (context.env as unknown as { IMAGES?: CloudflareImages }).IMAGES;
  if (!images) throw new Error("Cloudflare Images binding not configured");
  const metadata = await images.info(imageStream(new Uint8Array(raw)));
  if (!Number.isFinite(metadata.width) || !Number.isFinite(metadata.height) ||
      metadata.width <= 0 || metadata.height <= 0 ||
      metadata.width * metadata.height > MAX_PIXELS) {
    throw new Error("Invalid source dimensions");
  }
  // The Images binding .output() returns a Promise of the output handle.
  // Calling .response() before awaiting .output() fails at runtime.
  const output = await images.input(imageStream(new Uint8Array(raw)))
    .transform({ width: MAX_SIDE, height: MAX_SIDE, fit: "scale-down", metadata: "none" })
    .output({ format: "image/jpeg", quality: 82, anim: false });
  const result = output.response();
  if (!result.ok || !result.headers.get("content-type")?.startsWith("image/jpeg")) {
    throw new Error("Image transform failed");
  }
  const length = Number(result.headers.get("content-length") || "0");
  if (length > MAX_STORED_BYTES) throw new Error("Processed image too large");
  const converted = new Uint8Array(await result.arrayBuffer());
  if (converted.byteLength === 0 || converted.byteLength > MAX_STORED_BYTES) {
    throw new Error("Processed image too large");
  }
  return Buffer.from(stripJpegMetadata(converted));
}

export async function normalizeOutfitPhoto(photo: string): Promise<Buffer> {
  const raw = decodeBase64Photo(photo);
  if (process.env.VB_IMAGE_PROCESSOR === "cloudflare") {
    // Fail closed: do not fall back to native sharp or store raw user bytes.
    return withCloudflareImages(raw);
  }
  const sharp = (await import("sharp")).default;
  return sharp(raw, { limitInputPixels: MAX_PIXELS, failOn: "error" })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}
