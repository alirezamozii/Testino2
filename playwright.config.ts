import { defineConfig, devices } from "@playwright/test";

/**
 * Testino E2E test configuration — future-proof by design.
 *
 * • Every spec must assert REAL behaviour (no screenshot-only "audits"):
 *   freeze detection, modal interactivity, DB round-trips, console hygiene.
 * • Runs against:
 *    - a production build served on :3100 (default, used by CI), or
 *    - an already-running dev server via TESTINO_BASE_URL=http://localhost:3000
 * • Projects:
 *    - desktop  (1280×800)   — full journeys
 *    - mobile   (360×800)    — smoke + overflow specs (journeys skipped)
 *    - tablet   (768×1024)   — smoke + overflow specs (journeys skipped)
 */

const BASE_URL = process.env.TESTINO_BASE_URL ?? "http://127.0.0.1:3100";
const useWebServer = !process.env.TESTINO_BASE_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: process.env.CI ? 1 : 2,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: { timeout: 12_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    video: "off",
  },
  outputDir: "artifacts/test-results",
  webServer: useWebServer
    ? {
        // serve.mjs honours PORT; without PORT pinning Playwright once waited
        // on :3100 while the server started on :3000 and every run died.
        command: "npm start",
        url: "http://127.0.0.1:3100",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: { PORT: "3100", NODE_ENV: "production" },
      }
    : undefined,
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 5"] },
      testIgnore: /journey-/,
    },
    {
      name: "tablet",
      // iPad layout metrics on chromium — CI installs only chromium (webkit binary
      // is not downloaded there, which previously failed every tablet test in 3ms).
      use: {
        ...devices["iPad (gen 7)"],
        browserName: "chromium",
        defaultBrowserType: "chromium",
        viewport: { width: 768, height: 1024 },
      },
      testIgnore: /journey-/,
    },
  ],
});
