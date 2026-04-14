import { test, expect, chromium, devices } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test("mobile: workspace loads without horizontal overflow at iPhone 14 width", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const errors: string[] = [];
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(APP);
    await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 30000 });

    const ok = await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(ok).toBe(true);

    await page.screenshot({ path: testInfo.outputPath("mobile-workspace.png"), fullPage: true });

    if (errors.length > 0) throw new Error(`pageerror: ${errors[0]}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("mobile: sidebar is off-canvas by default", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const errors: string[] = [];
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(APP);
    await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 30000 });

    await expect(page.locator('aside[data-mobile-open]')).toHaveAttribute("data-mobile-open", "false");
    await expect(page.locator('[data-testid="mobile-nav-toggle"]')).toBeVisible();
    const backdrop = page.locator('[data-testid="mobile-nav-backdrop"]');
    const backdropCount = await backdrop.count();
    if (backdropCount > 0) {
      await expect(backdrop).toBeHidden();
    }

    if (errors.length > 0) throw new Error(`pageerror: ${errors[0]}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("mobile: tap the toggle -> sidebar opens -> tap backdrop -> closes", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const errors: string[] = [];
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(APP);
    await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 30000 });

    await page.locator('[data-testid="mobile-nav-toggle"]').click();
    await expect(page.locator('aside[data-mobile-open]')).toHaveAttribute("data-mobile-open", "true");
    await expect(page.locator('[data-testid="mobile-nav-backdrop"]')).toBeVisible();

    const sidebar = page.locator('aside[data-mobile-open]');
    const chatLink = sidebar.getByRole("link", { name: /chat/i });
    const settingsLink = sidebar.getByRole("link", { name: /settings/i });
    const hasChat = (await chatLink.count()) > 0;
    const hasSettings = (await settingsLink.count()) > 0;
    expect(hasChat || hasSettings).toBe(true);

    await page.screenshot({ path: testInfo.outputPath("mobile-sidebar-open.png"), fullPage: true });

    await page.locator('[data-testid="mobile-nav-backdrop"]').click();
    await expect(page.locator('aside[data-mobile-open]')).toHaveAttribute("data-mobile-open", "false");

    if (errors.length > 0) throw new Error(`pageerror: ${errors[0]}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("mobile: composer is visible and tappable", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const errors: string[] = [];
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(APP);
    const composer = page.getByTestId("chat-composer-input");
    await composer.waitFor({ state: "visible", timeout: 30000 });

    await expect(composer).toBeVisible();

    const rect = await composer.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { y: r.y, height: r.height };
    });
    const viewportHeight = page.viewportSize()?.height ?? 844;
    expect(rect.y + rect.height).toBeLessThanOrEqual(viewportHeight);

    await composer.fill("hello from iPhone");
    await expect(composer).toHaveValue("hello from iPhone");

    await page.screenshot({ path: testInfo.outputPath("mobile-composer.png"), fullPage: true });

    if (errors.length > 0) throw new Error(`pageerror: ${errors[0]}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("mobile: settings page is reachable without desktop-only layout", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const errors: string[] = [];
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(APP);
    await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 30000 });

    await page.locator('[data-testid="mobile-nav-toggle"]').click();
    await expect(page.locator('aside[data-mobile-open]')).toHaveAttribute("data-mobile-open", "true");

    const sidebar = page.locator('aside[data-mobile-open]');
    await sidebar.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings$/);

    const ok = await page.evaluate(() =>
      document.documentElement.scrollWidth <= window.innerWidth + 1
    );
    expect(ok).toBe(true);

    await page.screenshot({ path: testInfo.outputPath("mobile-settings.png"), fullPage: true });

    if (errors.length > 0) throw new Error(`pageerror: ${errors[0]}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("mobile: no DeepTutor text and no pageerror", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    ...devices["iPhone 14"],
  });
  const errors: string[] = [];
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto(APP);
    await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 30000 });
    await expect(page.locator('text=/DeepTutor/i')).toHaveCount(0);

    await page.locator('[data-testid="mobile-nav-toggle"]').click();
    await expect(page.locator('aside[data-mobile-open]')).toHaveAttribute("data-mobile-open", "true");
    const sidebar = page.locator('aside[data-mobile-open]');
    await sidebar.getByRole("link", { name: /settings/i }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(page.locator('text=/DeepTutor/i')).toHaveCount(0);

    if (errors.length > 0) throw new Error(`pageerror: ${errors[0]}`);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
