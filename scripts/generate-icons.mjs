// Genera le icone PWA da docs/brand/app-icon.svg (BRAND.md §3.3).
// Uso: node scripts/generate-icons.mjs
import sharp from "sharp";
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const svg = readFileSync(resolve(root, "docs/brand/app-icon.svg"));
const outDir = resolve(root, "public/icons");
mkdirSync(outDir, { recursive: true });

const sizes = [
  { file: "icon-192.png", size: 192, padding: 0 },
  { file: "icon-512.png", size: 512, padding: 0 },
  // maskable: area sicura 80% → marchio rimpicciolito su fondo pieno
  { file: "icon-maskable-192.png", size: 192, padding: 0.1 },
  { file: "icon-maskable-512.png", size: 512, padding: 0.1 },
];

for (const { file, size, padding } of sizes) {
  const inner = Math.round(size * (1 - padding * 2));
  const offset = Math.round(size * padding);
  // app-icon.svg ha già il gradiente + marchio; per maskable sostituiamo lo sfondo
  // con un rettangolo pieno a tutto campo e ridimensioniamo il disegno
  const bg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#143543"/><g transform="translate(${offset} ${offset}) scale(${inner / 512})">${svg.toString().replace(/<svg[^>]*>/, "").replace("</svg>", "")}</g></svg>`
  );
  await sharp(padding ? bg : svg).resize(size, size).png().toFile(resolve(outDir, file));
  console.log("icona:", file);
}
