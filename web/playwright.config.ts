import { defineConfig, devices } from "@playwright/test";

const BASE_URL =
  process.env.WEB_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE ||
  "http://localhost:3000";
const SERIAL_MODE = process.env.PW_SERIAL === "1";

export default defineConfig({
  testDir: "./tests",
  fullyParallel: !SERIAL_MODE,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: SERIAL_MODE ? 1 : undefined,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "ui-audit",
      testMatch: "**/*.audit.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "identity-truth",
      testMatch: "**/identity-truth.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "popup-layout",
      testMatch: "**/popup-layout.spec.ts",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "user-switcher",
      testMatch: "**/user-switcher.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
    {
      name: "two-browser-isolation",
      testMatch: "**/two-browser-isolation.spec.ts",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
});
