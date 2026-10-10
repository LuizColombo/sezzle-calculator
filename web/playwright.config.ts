import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against the real stack (nginx + Go API) started with
 * `docker compose up`. They do not start it themselves, so the same command
 * works locally and in CI.
 */
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${process.env.WEB_PORT ?? "8080"}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
