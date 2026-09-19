/**
 * Ridimensiona una foto client-side a max 1280px sul lato lungo
 * (CLAUDE.md: ridimensionare sempre prima dell'upload).
 * Restituisce un data URL JPEG quality 0.85.
 */
export async function resizePhoto(file: File, maxSide = 1280): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas non disponibile");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  return canvas.toDataURL("image/jpeg", 0.85);
}
