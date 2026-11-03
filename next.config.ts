import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ignorato da Vercel (che usa il proprio builder), richiesto per l'immagine
  // runtime Docker: produce .next/standalone con server.js minimale.
  output: "standalone",
};

export default nextConfig;
