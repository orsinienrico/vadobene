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
  }): { output(options: { format: "image/jpeg"; quality: number; anim: false }): TransformResult };
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

/** Drop JPEG APP1-APP15 and COM marker segments before the scan.
 * APP1 typically contains EXIF/GPS; other APP markers can contain XMP and
 * tracking metadata. Preserve APP0/JFIF, DQT, DHT, SOF, SOS and image data.
 */
export function stripJpegMetadata(source: Uint8Array): Uint8Array {
  if (source.length < 4 || source[0] !== 0xff || source[1] !== 0xd8) {
    throw new Error("Invalid JPEG");
  }
  const parts: Uint8Array[] = [source.subarray(0, 2)];
  let cursor = 2;
  while (cursor < source.length) {
    const start = cursor;
    if (source[cursor++] !== 0xff) throw new Error("Malformed JPEG header");
    while (source[cursor] === 0xff) cursor++;
    const marker = source[cursor++];
    if (marker === 0xda) {
      // Preserve the entire compressed scan unchanged. Validate its length.
      if (cursor + 2 > source.length) throw new Error("Invalid JPEG scan");
      const n = (source[cursor] << 8) | source[cursor + 1];
      if (n < 2 || cursor + n > source.length) throw new Error("Invalid JPEG scan");
      parts.push(source.subarray(start));
      const size = parts.reduce((total, p) => total + p.byteLength, 0);
      const result = new Uint8Array(size);
      let pos = 0;
      for (const part of parts) { result.set(part, pos); pos += part.byteLength; }
      return result;
    }
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x00 ||
        (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 ||
        cursor + 2 > source.length) {
      throw new Error("Unexpected JPEG marker");
    }
    const length = (source[cursor] << 8) | source[cursor + 1];
    if (length < 2 || cursor + length > source.length) throw new Error("Invalid JPEG segment");
    if (!((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe)) {
      parts.push(source.subarray(start, cursor + length));
    }
    cursor += length;
  }
  throw new Error("JPEG scan missing");
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
  const result = await images.input(imageStream(new Uint8Array(raw)))
    .transform({ width: MAX_SIDE, height: MAX_SIDE, fit: "scale-down", metadata: "none" })
    .output({ format: "image/jpeg", quality: 82, anim: false }).response();
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
