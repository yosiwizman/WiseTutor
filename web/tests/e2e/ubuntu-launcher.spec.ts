import { test, expect, chromium } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";
import { execSync } from "child_process";
import * as path from "path";

const APP = process.env.DEEPTUTOR_APP || "http://192.168.1.133:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const REPO_DIR = path.resolve(__dirname, "../../../");
const SCREENSHOT_PATH = path.join(
  REPO_DIR,
  "artifacts/ubuntu_launcher/launcher-proof.png",
);

/**
 * Ubuntu Desktop-click launch path proof.
 *
 * Exercises the same code path the Desktop icon Exec= triggers:
 *   1. wt_launch.sh (with WT_LAUNCH_SKIP_BROWSER=1) starts backend + frontend
 *   2. Playwright asserts WiseTutor is reachable at the LAN URL
 *
 * Does NOT click a physical Desktop icon — it invokes the identical script
 * the .desktop Exec= line calls.
 */

test.setTimeout(120_000);

test("ubuntu launcher path: invoking the Desktop-icon Exec= target brings WiseTutor up and the LAN URL renders", async () => {
  // --- Step 1: Run the Desktop-icon Exec= script (skip Chrome pop-up) ---
  const launchScript = path.join(REPO_DIR, "scripts_local/wt_launch.sh");
  const launchOutput = execSync(`WT_LAUNCH_SKIP_BROWSER=1 bash "${launchScript}"`, {
    timeout: 90_000,
    encoding: "utf-8",
  });
  console.log("[launcher output]\n" + launchOutput);

  // Confirm the script reported OK and the skip-browser sentinel
  expect(launchOutput).toMatch(/wt_start\.sh reported OK|WT_LAUNCH_SKIP_BROWSER=1/);

  // --- Step 2: Playwright asserts WiseTutor is reachable ---
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageErrors: Error[] = [];

  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto(APP, { waitUntil: "networkidle", timeout: 60_000 });

    // No "DeepTutor" text anywhere on the page (case-insensitive)
    await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);

    // WiseTutor must appear — the page loaded and is branded correctly
    await expect(page.getByText("WiseTutor").first()).toBeVisible();

    // Document title must include WiseTutor
    await expect(page).toHaveTitle(/WiseTutor/);

    // Save full-page proof screenshot
    await page.screenshot({
      path: SCREENSHOT_PATH,
      fullPage: true,
    });

    // Zero unhandled page errors
    expect(pageErrors, `page errors: ${pageErrors.map((e) => e.message).join("; ")}`).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
