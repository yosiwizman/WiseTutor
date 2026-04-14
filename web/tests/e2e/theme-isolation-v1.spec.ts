/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/theme_isolation_v1/latest");
fs.mkdirSync(EVID, { recursive: true });

const MRW_PIN = process.env.WT_MRW_PIN || "2468";
const BELLA_PIN = process.env.WT_BELLA_PIN || "1357";

async function apiLogin(ctx: BrowserContext, user_id: string, pin: string) {
  const r = await ctx.request.post(`${APP}/api/v1/users/switch`, {
    data: { user_id, pin },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`login ${user_id} → ${r.status()}`);
}

async function setThemeApi(ctx: BrowserContext, theme: string) {
  const r = await ctx.request.put(`${API}/api/v1/users/me/theme`, {
    data: { theme },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`setTheme ${theme} → ${r.status()}`);
}

async function readActiveTheme(ctx: BrowserContext): Promise<string | null> {
  const r = await ctx.request.get(`${API}/api/v1/users/active`);
  if (!r.ok()) return null;
  const body = await r.json();
  return body?.theme ?? null;
}

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test.beforeEach(async () => {
  // Reset both users to "light" so every test starts clean.
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "light");
    await apiLogin(ctx, "bella", BELLA_PIN);
    await setThemeApi(ctx, "light");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("child changing theme does NOT change owner's theme", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  const childCtx = await browser.newContext();
  try {
    await apiLogin(ownerCtx, "mrw", MRW_PIN);
    await apiLogin(childCtx, "bella", BELLA_PIN);

    // Seed: owner at light, child at light.
    expect(await readActiveTheme(ownerCtx)).toBe("light");
    expect(await readActiveTheme(childCtx)).toBe("light");

    // Child switches to dark.
    await setThemeApi(childCtx, "dark");
    expect(await readActiveTheme(childCtx)).toBe("dark");

    // Owner theme is untouched.
    expect(await readActiveTheme(ownerCtx)).toBe("light");
  } finally {
    await ownerCtx.close();
    await childCtx.close();
    await browser.close();
  }
});

test("owner changing theme does NOT change child's theme", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  const childCtx = await browser.newContext();
  try {
    await apiLogin(ownerCtx, "mrw", MRW_PIN);
    await apiLogin(childCtx, "bella", BELLA_PIN);

    await setThemeApi(ownerCtx, "dark");
    expect(await readActiveTheme(ownerCtx)).toBe("dark");
    expect(await readActiveTheme(childCtx)).toBe("light");
  } finally {
    await ownerCtx.close();
    await childCtx.close();
    await browser.close();
  }
});

test("switching active user in the same browser restores that user's own saved theme on page load", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    // Seed different themes on the backend.
    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "dark");
    await apiLogin(ctx, "bella", BELLA_PIN);
    await setThemeApi(ctx, "light");

    // Switch to Mr W in the same context and reload — ThemeProvider
    // must apply dark on the <html> element.
    await apiLogin(ctx, "mrw", MRW_PIN);
    const mrwPage = await ctx.newPage();
    await mrwPage.goto(`${APP}/`);
    await mrwPage.waitForLoadState("networkidle");
    // Wait for ThemeProvider to apply.
    await expect(mrwPage.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 10_000 });
    await mrwPage.screenshot({ path: path.join(EVID, "mrw_theme_dark.png"), fullPage: false });

    // Switch to Bella and reload — ThemeProvider must apply light.
    await apiLogin(ctx, "bella", BELLA_PIN);
    const bellaPage = await ctx.newPage();
    await bellaPage.goto(`${APP}/`);
    await bellaPage.waitForLoadState("networkidle");
    await expect(bellaPage.locator("html")).toHaveAttribute("data-theme", "light", { timeout: 10_000 });
    await bellaPage.screenshot({ path: path.join(EVID, "bella_theme_light.png"), fullPage: false });

    // Switch back to Mr W — still dark, no cross-user overwrite.
    await apiLogin(ctx, "mrw", MRW_PIN);
    const mrwPage2 = await ctx.newPage();
    await mrwPage2.goto(`${APP}/`);
    await mrwPage2.waitForLoadState("networkidle");
    await expect(mrwPage2.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 10_000 });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("owner inspect target selection does not silently mutate child's theme", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  const childCtx = await browser.newContext();
  try {
    await apiLogin(ownerCtx, "mrw", MRW_PIN);
    await apiLogin(childCtx, "bella", BELLA_PIN);

    // Baseline.
    expect(await readActiveTheme(childCtx)).toBe("light");

    // Owner opens /knowledge and selects Bella as inspect target.
    const page = await ownerCtx.newPage();
    await page.goto(`${APP}/knowledge`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("owner-inspect-select").selectOption("bella");
    await expect(page.getByTestId("owner-inspect-banner")).toBeVisible({ timeout: 10_000 });

    // Bella's theme must still be light — inspect is read-only.
    expect(await readActiveTheme(childCtx)).toBe("light");
  } finally {
    await ownerCtx.close();
    await childCtx.close();
    await browser.close();
  }
});

test("no cross-user theme bleed via shared localStorage on reload", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    // Seed distinct backend themes.
    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "light");
    await apiLogin(ctx, "bella", BELLA_PIN);
    await setThemeApi(ctx, "dark");

    // Load Bella's page so localStorage ends up at "dark".
    const bellaPage = await ctx.newPage();
    await bellaPage.goto(`${APP}/`);
    await bellaPage.waitForLoadState("networkidle");
    await expect(bellaPage.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 10_000 });
    await bellaPage.close();

    // Switch to Mr W and reload. Even if ThemeScript briefly applies
    // localStorage's stale "dark", ThemeProvider must overwrite to
    // light once /active resolves. We assert the steady-state.
    await apiLogin(ctx, "mrw", MRW_PIN);
    const mrwPage = await ctx.newPage();
    await mrwPage.goto(`${APP}/`);
    await mrwPage.waitForLoadState("networkidle");
    await expect(mrwPage.locator("html")).toHaveAttribute("data-theme", "light", { timeout: 10_000 });

    // And localStorage is now overwritten to "light" — next reload
    // paints the correct theme without flash.
    const ls = await mrwPage.evaluate(() => window.localStorage.getItem("deeptutor-theme"));
    expect(ls).toBe("light");
    await mrwPage.screenshot({ path: path.join(EVID, "mrw_after_bella_reload_no_bleed.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});
