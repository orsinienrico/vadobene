import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Copertura della logica dominio (solo con `pnpm test:coverage`, mai nel
    // run di default). Esclusi i wrapper verso servizi esterni e i client.
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/supabase/**",
        "src/lib/analytics.ts",
        "src/lib/anthropic.ts",
        "src/lib/stripe.ts",
        "src/lib/email.ts",
        "src/lib/resize.ts",
      ],
      // Threshold misurata localmente (94.37% lines reale dopo l'esclusione di
      // anthropic.ts — review 2026-09-26). La soglia lascia margine alle
      // modifiche concorrenti: NON alzarla senza rimisurare.
      thresholds: { lines: 75 },
    },
  },
  resolve: {
    alias: { "@": resolve(__dirname, "src") },
  },
});
