import { test, expect, chromium } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

/**
 * Phase 5 — family-alpha readiness smoke tests.
 *
 * 5 serial cases that validate branding and critical-flow criteria before
 * shipping to family alpha testers. No product code changes — Playwright
 * evidence only.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test("branding: sidebar shows WiseTutor, never DeepTutor", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await page.goto(APP);
    // Wait for sidebar to render — look for nav or aside element
    await page.waitForLoadState("networkidle");

    // No element with exact text "DeepTutor" should be visible
    await expect(page.getByText("DeepTutor", { exact: true })).toHaveCount(0);

    // "WiseTutor" must appear at least once
    await expect(page.getByText("WiseTutor").first()).toBeVisible();

    // Document title must include WiseTutor
    await expect(page).toHaveTitle(/WiseTutor/);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("branding: composer onboarding / empty-state text contains no DeepTutor", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await page.goto(APP);
    // Wait for composer textarea to be visible
    await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 20_000 });

    // Sweep entire page for any substring "DeepTutor" (case-insensitive)
    await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("critical flow: composer is reachable and empty after sign-in", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await page.goto(APP);

    // Composer input is visible and empty
    await expect(page.getByTestId("chat-composer-input")).toBeVisible();
    await expect(page.getByTestId("chat-composer-input")).toHaveValue("");

    // Mic button is visible
    await expect(page.getByTestId("chat-composer-voice-turn")).toBeVisible();

    // Send button exists (may be disabled until text typed — just check presence)
    const sendBtn = page
      .getByRole("button", { name: /send/i })
      .or(page.getByTestId("chat-composer-send"));
    await expect(sendBtn.first()).toBeAttached();
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("critical flow: PTT button present + cycles through states without product code crash", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();

    const pageErrors: Error[] = [];
    page.on("pageerror", (err) => pageErrors.push(err));

    await page.goto(APP);
    await page.getByTestId("chat-composer-voice-turn").waitFor({ state: "visible", timeout: 20_000 });

    const btn = page.getByTestId("chat-composer-voice-turn");

    // Initial state must be idle
    await expect(btn).toHaveAttribute("data-voice-turn-state", "idle");

    // Click — in headless chromium with no mic the adapter may error-out.
    // Any of these states is acceptable; what must NOT happen is a crash.
    await btn.click();
    await page.waitForTimeout(500);
    await expect(btn).toHaveAttribute(
      "data-voice-turn-state",
      /idle|listening|error|submitting|awaiting_assistant|speaking/,
    );

    // Zero unhandled page errors
    expect(pageErrors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("critical flow: settings / top-level navigation does not leak DeepTutor", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();

    // Try navigating to /settings
    const settingsResponse = await page.goto(`${APP}/settings`);
    const status = settingsResponse?.status() ?? 0;

    if (status === 404 || status === 0) {
      // /settings route does not exist — walk sidebar nav entries instead
      await page.goto(APP);
      await page.waitForLoadState("networkidle");

      // Collect all visible nav links in the sidebar
      const navLinks = page.locator("nav a, aside a, [role='navigation'] a");
      const hrefs = await navLinks.evaluateAll((els: Element[]) =>
        els
          .map((el) => (el as HTMLAnchorElement).href)
          .filter((h) => h && !h.startsWith("javascript")),
      );

      for (const href of hrefs) {
        await page.goto(href);
        await page.waitForLoadState("networkidle");
        await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);
      }
    } else {
      // /settings exists — scan it
      await page.waitForLoadState("networkidle");
      await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
});
