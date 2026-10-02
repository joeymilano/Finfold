import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";
const externalTarget = Boolean(process.env.PLAYWRIGHT_BASE_URL);

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure"
  },
  webServer: externalTarget
    ? undefined
    : {
        command: "npm run dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      },
  projects: [
    {
      name: "smoke-chromium",
      testMatch: /smoke\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] }
    },
    {
      name: "staging-auth",
      testMatch: /auth\.setup\.ts/,
      // Authentication setup handles dedicated staging credentials. Never
      // retain a trace, screenshot, or video from this project: Playwright's
      // DOM snapshots can otherwise preserve filled password values when a
      // login fails before navigation completes.
      use: {
        ...devices["Desktop Chrome"],
        trace: "off",
        screenshot: "off",
        video: "off"
      }
    },
    {
      name: "staging-chromium",
      testMatch: /staging\/.*\.spec\.ts/,
      dependencies: ["staging-auth"],
      use: {
        ...devices["Desktop Chrome"],
        storageState: "playwright/.auth/primary.json"
      }
    }
  ]
});
