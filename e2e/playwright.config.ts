import { defineConfig, devices } from "@playwright/test";
import {
  BASE_URL,
  REPO_ROOT,
  serverCommand,
  serverEnv,
} from "./fixtures/config.js";

/**
 * One isolated API process (fresh SQLite each run) serving the built SPA on a
 * single origin. `workers: 1` + `fullyParallel: false` keeps the run ordered
 * so the guide screenshots tell a coherent story and the shared test state
 * (users, folder names, panel slug) flows step to step.
 */
export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  globalTeardown: "./global-teardown.ts",
  use: {
    baseURL: BASE_URL,
    locale: "es-ES",
    timezoneId: "Europe/Madrid",
    viewport: { width: 1280, height: 900 },
    screenshot: "only-on-failure",
    trace: "on-first-retry",
    ignoreHTTPSErrors: true,
  },
  projects: [
    {
      // Claims the admin role before anything else registers, so admin-only
      // specs have a known account instead of depending on file order.
      name: "setup",
      testDir: "./setup",
      testMatch: /.*\.setup\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "app",
      testMatch: /.*\.app\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      // Extension specs bring their own persistent-context fixture (Chrome
      // can only load an unpacked extension via a persistent context).
      name: "extension",
      testMatch: /.*\.ext\.spec\.ts/,
      dependencies: ["setup"],
    },
  ],
  webServer: {
    command: serverCommand,
    cwd: REPO_ROOT,
    env: serverEnv,
    url: `${BASE_URL}/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
