import { defineConfig, devices } from "@playwright/test";

/**
 * 3100 by default. Overridable so a second checkout (a git worktree on another
 * branch, with its own DATABASE_URL and MINIO_BUCKET in its .env) can run the
 * suite at the same time without the two global setups wiping each other.
 */
const PORT = Number(process.env.GILION_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  // Serial by default: the dev server compiles routes on demand and three
  // workers hammering it turns every first-hit navigation into a timeout.
  // CI, which runs against a warm build, can raise this.
  fullyParallel: false,
  workers: 1,
  // The dev server compiles each route on first hit, so a test that walks
  // several screens can spend most of its budget waiting on the bundler.
  // 30s is not enough for the multi-screen flows; the app itself is fast.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  forbidOnly: !!process.env.CI,
  // One retry locally, two in CI.
  //
  // Sign-in on this project intermittently fails to render or complete on a
  // loaded machine: /login occasionally never shows its email field, and the
  // very same test passes on the next attempt. It was narrowed to that one
  // step — a healthy sign-in measures 0.5–1.3s — but not to a fault in the
  // app, and it has produced false failures across several specs.
  //
  // A retry is the honest tool for environment noise, and it does not hide a
  // real break: a genuine failure fails on the retry too. What it must not
  // become is a way to live with a flaky PRODUCT, so anything that only ever
  // passes on retry is worth chasing rather than accepting.
  retries: process.env.CI ? 2 : 1,
  reporter: "list",
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: "on-first-retry",
    locale: "he-IL",
    timezoneId: "Asia/Jerusalem",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
