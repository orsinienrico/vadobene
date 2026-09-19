import { defineConfig, devices } from "@playwright/test";

// iPhone 14: 390×844, DPR 3 (CLAUDE.md). Canale chrome: il download CDN
// dei browser Playwright è bloccato in rete, si usa il Chrome di sistema.
const iphone14 = {
  ...devices["iPhone 14"],
  defaultBrowserType: "chromium" as const,
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: 0,
  outputDir: "./test-results",
  use: {
    ...iphone14,
    baseURL: "http://localhost:3000",
    screenshot: "only-on-failure",
    video: "off",
    launchOptions: {
      channel: "chrome",
    },
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [{ name: "iphone-14", use: { ...iphone14 } }],
});
