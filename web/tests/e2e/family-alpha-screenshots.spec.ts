import { test, expect, chromium } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

/**
 * Family-alpha screenshot + visual verification pass.
 *
 * Three serial tests capture full-page screenshots of key surfaces and
 * assert no "DeepTutor" text is present anywhere on the page.
 *
 * Run manually (not a CI gate):
 *   cd web && PW_SERIAL=1 WT_MRW_PIN=2468 WT_BELLA_PIN=1357 \
 *     DEEPTUTOR_APP=http://localhost:3782 \
 *     NEXT_PUBLIC_API_BASE=http://localhost:8001 \
 *     npx playwright test --project=family-alpha-screenshots --reporter=list
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

// Shared pageerror listener — registered inside each test on its page.
function attachPageErrorListener(page: import("@playwright/test").Page) {
  const errors: Error[] = [];
  page.on("pageerror", (err) => errors.push(err));
  return errors;
}

test("capture: first screen (sidebar + workspace hero)", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    const pageErrors = attachPageErrorListener(page);

    await page.goto(APP);
    // Wait for the WiseTutor brand mark in the sidebar as the stable readiness signal.
    await page.getByText("WiseTutor").first().waitFor({ state: "visible", timeout: 20_000 });

    // No DeepTutor text anywhere.
    await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);

    await page.screenshot({
      path: testInfo.outputPath("family-alpha-first-screen.png"),
      fullPage: true,
    });

    expect(pageErrors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("capture: composer row", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    const pageErrors = attachPageErrorListener(page);

    await page.goto(APP);
    // Wait for the composer input as the stable readiness signal.
    await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 20_000 });

    // No DeepTutor text anywhere.
    await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);

    await page.screenshot({
      path: testInfo.outputPath("family-alpha-composer.png"),
      fullPage: true,
    });

    expect(pageErrors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("capture: settings page", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    const pageErrors = attachPageErrorListener(page);

    const settingsResponse = await page.goto(`${APP}/settings`);
    const status = settingsResponse?.status() ?? 0;

    if (status === 404 || status === 0) {
      // /settings route does not exist — try clicking a settings-like sidebar nav item.
      await page.goto(APP);
      await page.waitForLoadState("networkidle");

      const settingsLink = page
        .getByRole("link", { name: /settings/i })
        .or(page.getByRole("button", { name: /settings/i }))
        .first();

      const linkCount = await settingsLink.count();
      if (linkCount === 0) {
        // Neither route nor nav element found — skip with clear reasoning.
        test.skip(
          true,
          "/settings route returned 404 and no settings nav element found in sidebar.",
        );
        return;
      }

      await settingsLink.click();
      await page.waitForLoadState("networkidle");
    } else {
      await page.waitForLoadState("networkidle");
    }

    // No DeepTutor text anywhere.
    await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);

    await page.screenshot({
      path: testInfo.outputPath("family-alpha-settings.png"),
      fullPage: true,
    });

    expect(pageErrors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
