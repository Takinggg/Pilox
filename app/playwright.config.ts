// SPDX-License-Identifier: BUSL-1.1
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "e2e",
  globalSetup: process.env.CI ? "./e2e/global-setup.ts" : undefined,
  fullyParallel: process.env.CI ? false : true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? "github" : "list",
  // Login helper can wait up to ~90s in CI (dev JIT + MFA); keep headroom for assertions.
  timeout: process.env.CI ? 120_000 : 30_000,
  globalTimeout: process.env.CI ? 30 * 60_000 : undefined,
  expect: {
    timeout: process.env.CI ? 15_000 : 5_000,
  },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...(process.env.CI
      ? { actionTimeout: 15_000, navigationTimeout: 30_000 }
      : {}),
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.CI
    ? {
        // Build runs in the GitHub Actions job (`npm run build`) so this only starts the server;
        // bundling inside the webServer hook hit the 300s Playwright timeout on slow runners.
        // `output: "standalone"` — use the standalone entrypoint (not `next start`).
        command: "npm run start:standalone",
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "pipe",
        stderr: "pipe",
      }
    : undefined,
});
