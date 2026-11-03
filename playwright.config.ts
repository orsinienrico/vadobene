import { defineConfig, devices } from "@playwright/test";

// iPhone 14: 390×844, DPR 3 (CLAUDE.md).
// Il channel arriva da PLAYWRIGHT_CHANNEL: vuoto/assente → chromium bundled
// di Playwright (CI, `npx playwright install chromium`); "chrome" → Chrome di
// sistema, usato in locale dove il download CDN è bloccato.
const channel = process.env.PLAYWRIGHT_CHANNEL?.trim() || undefined;

const iphone14 = {
  ...devices["iPhone 14"],
  defaultBrowserType: "chromium" as const,
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  // Worker unico: la suite è mobile-first e i test di giurì sono sensibili al
  // timing (timer + realtime mock): il carico parallelo li rende flaky.
  workers: 1,
  // In CI un retry assorbe i falsi negativi (flakiness di rete/pageload).
  retries: process.env.CI ? 1 : 0,
  outputDir: "./test-results",
  use: {
    ...iphone14,
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(channel ? { launchOptions: { channel } } : {}),
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
    // Senza env Supabase reale (CI mock e locale senza .env.local): URL finto,
    // così il bundle client ha un supabase-js funzionante e i mock e2e
    // intercettano **/rest/v1/**. Con env reale (smoke @real) non si tocca nulla.
    env: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? {}
      : {
          NEXT_PUBLIC_SUPABASE_URL: "https://mock.supabase.co",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: "mock-anon-key",
        },
  },
  projects: [{ name: "iphone-14", use: { ...iphone14 } }],
});
