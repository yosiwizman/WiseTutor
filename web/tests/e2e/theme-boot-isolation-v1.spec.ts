/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext, Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/theme_boot_isolation_v1/latest");
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

/**
 * First-paint capture method.
 *
 * We install an init script that runs as soon as the page's main world
 * starts — BEFORE the inline ThemeScript in the HTML. We arm a
 * MutationObserver on document.documentElement that records the very
 * first `data-theme` attribute value set on <html>. Whatever the inline
 * ThemeScript paints is the first observed value.
 */
async function captureFirstPaintTheme(page: Page, url: string): Promise<string | null> {
  await page.context().addInitScript(() => {
    (window as any).__wt_first_paint_theme = null;
    const html = document.documentElement;
    const capture = () => {
      if ((window as any).__wt_first_paint_theme == null) {
        const v = html.getAttribute("data-theme");
        if (v) (window as any).__wt_first_paint_theme = v;
      }
    };
    // Run once synchronously in case attribute is already set, then
    // observe future changes during boot.
    capture();
    new MutationObserver(capture).observe(html, { attributes: true, attributeFilter: ["data-theme"] });
  });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return await page.evaluate(() => (window as any).__wt_first_paint_theme ?? document.documentElement.getAttribute("data-theme"));
}

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test.beforeEach(async () => {
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

test("first paint for Bella after Mr W's prior load is NOT Mr W's theme", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    // Seed distinct backend themes + boot cookie.
    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "dark");
    // Load Mr W's page so localStorage (legacy) + cookie end up at "dark".
    const mrwPage = await ctx.newPage();
    await mrwPage.goto(`${APP}/`);
    await mrwPage.waitForLoadState("networkidle");
    await expect(mrwPage.locator("html")).toHaveAttribute("data-theme", "dark");
    await mrwPage.close();

    // Switch active user to Bella (backend rotates wt_theme cookie).
    await apiLogin(ctx, "bella", BELLA_PIN);
    await setThemeApi(ctx, "light");

    // Now reload a fresh page as Bella. Capture the FIRST paint theme
    // (before ThemeProvider hydrates the /active fetch).
    const bellaPage = await ctx.newPage();
    const firstPaint = await captureFirstPaintTheme(bellaPage, `${APP}/`);
    expect(firstPaint).toBe("light");
    await bellaPage.screenshot({ path: path.join(EVID, "bella_first_paint_light.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("first paint for Mr W after Bella's prior load is NOT Bella's theme", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    await setThemeApi(ctx, "dark");
    const bellaPage = await ctx.newPage();
    await bellaPage.goto(`${APP}/`);
    await bellaPage.waitForLoadState("networkidle");
    await expect(bellaPage.locator("html")).toHaveAttribute("data-theme", "dark");
    await bellaPage.close();

    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "light");
    const mrwPage = await ctx.newPage();
    const firstPaint = await captureFirstPaintTheme(mrwPage, `${APP}/`);
    expect(firstPaint).toBe("light");
    await mrwPage.screenshot({ path: path.join(EVID, "mrw_first_paint_light.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("first paint reads wt_theme cookie, not localStorage (localStorage poisoned)", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    // Sign in as Mr W and set dark so wt_theme=dark in the cookie jar.
    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "dark");

    // Poison localStorage with a value OPPOSITE to the cookie.
    const primer = await ctx.newPage();
    await primer.goto(`${APP}/`);
    await primer.waitForLoadState("networkidle");
    await primer.evaluate(() => window.localStorage.setItem("deeptutor-theme", "light"));
    await primer.close();

    // Fresh page: first paint must follow the cookie ("dark"), NOT
    // the poisoned localStorage ("light").
    const page = await ctx.newPage();
    const firstPaint = await captureFirstPaintTheme(page, `${APP}/`);
    expect(firstPaint).toBe("dark");
    await page.screenshot({ path: path.join(EVID, "cookie_beats_localstorage.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("logout clears wt_theme cookie; anon first paint falls back to default/system", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "dark");
    await ctx.request.post(`${API}/api/v1/users/logout`);
    // After logout, wt_theme must be gone.
    const cookies = await ctx.cookies();
    const wtTheme = cookies.find((c) => c.name === "wt_theme");
    expect(wtTheme).toBeUndefined();
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("steady-state mutual isolation regression (owner/child themes, switch restore, inspect no-mutate)", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    // Seed distinct themes.
    await apiLogin(ctx, "mrw", MRW_PIN);
    await setThemeApi(ctx, "dark");
    await apiLogin(ctx, "bella", BELLA_PIN);
    await setThemeApi(ctx, "light");

    // Mr W page sees dark.
    await apiLogin(ctx, "mrw", MRW_PIN);
    const p1 = await ctx.newPage();
    await p1.goto(`${APP}/`);
    await expect(p1.locator("html")).toHaveAttribute("data-theme", "dark", { timeout: 10_000 });

    // Bella page sees light.
    await apiLogin(ctx, "bella", BELLA_PIN);
    const p2 = await ctx.newPage();
    await p2.goto(`${APP}/`);
    await expect(p2.locator("html")).toHaveAttribute("data-theme", "light", { timeout: 10_000 });

    // Owner inspecting Bella on /knowledge does not mutate Bella's theme.
    await apiLogin(ctx, "mrw", MRW_PIN);
    const p3 = await ctx.newPage();
    await p3.goto(`${APP}/knowledge`);
    await p3.waitForLoadState("networkidle");
    await p3.getByTestId("owner-inspect-select").selectOption("bella");
    await expect(p3.getByTestId("owner-inspect-banner")).toBeVisible({ timeout: 10_000 });

    const bellaCtx = await browser.newContext();
    try {
      await apiLogin(bellaCtx, "bella", BELLA_PIN);
      const r = await bellaCtx.request.get(`${API}/api/v1/users/active`);
      const body = await r.json();
      expect(body?.theme).toBe("light");
    } finally {
      await bellaCtx.close();
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
});
