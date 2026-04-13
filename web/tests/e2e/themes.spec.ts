/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext, Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/phase4_themes/latest");
fs.mkdirSync(EVID, { recursive: true });

const MRW_PIN = process.env.WT_MRW_PIN || "2468";
const BELLA_PIN = process.env.WT_BELLA_PIN || "1357";

async function login(ctx: BrowserContext, user_id: string, pin: string) {
  const r = await ctx.request.post(`${APP}/api/v1/users/switch`, {
    data: { user_id, pin }, headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`login ${user_id} → ${r.status()}`);
}

async function setTheme(ctx: BrowserContext, user_id: string, theme: string) {
  const r = await ctx.request.put(`${APP}/api/v1/users/${user_id}/preferences`, {
    data: { theme }, headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`setTheme ${user_id}=${theme} → ${r.status()}`);
}

async function readAppliedTheme(page: Page): Promise<{ attr: string | null; bg: string; primary: string }> {
  return await page.evaluate(() => {
    const html = document.documentElement;
    const cs = getComputedStyle(html);
    return {
      attr: html.getAttribute("data-theme"),
      bg: cs.getPropertyValue("--background").trim(),
      primary: cs.getPropertyValue("--primary").trim(),
    };
  });
}

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("two browser contexts hold different themes simultaneously", async () => {
  const browser = await chromium.launch();
  const ctxMrw = await browser.newContext();
  const ctxBella = await browser.newContext();
  try {
    await login(ctxMrw, "mrw", MRW_PIN);
    await login(ctxBella, "bella", BELLA_PIN);
    await setTheme(ctxMrw, "mrw", "dark");
    await setTheme(ctxBella, "bella", "bella");

    const pMrw = await ctxMrw.newPage();
    const pBella = await ctxBella.newPage();
    await pMrw.goto(APP);
    await pBella.goto(APP);
    await pMrw.waitForLoadState("networkidle");
    await pBella.waitForLoadState("networkidle");

    // Give the client-side ThemeProvider a tick to apply.
    await pMrw.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "dark", null, { timeout: 15000 });
    await pBella.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "bella", null, { timeout: 15000 });

    const m = await readAppliedTheme(pMrw);
    const b = await readAppliedTheme(pBella);

    expect(m.attr).toBe("dark");
    expect(b.attr).toBe("bella");
    expect(m.bg).not.toBe(b.bg);
    expect(m.primary).not.toBe(b.primary);

    fs.writeFileSync(
      path.join(EVID, "two_browser_theme_proof.json"),
      JSON.stringify({ generated_at: new Date().toISOString(), mrw: m, bella: b }, null, 2),
    );
    await pMrw.screenshot({ path: path.join(EVID, "mrw_dark.png"), fullPage: false });
    await pBella.screenshot({ path: path.join(EVID, "bella_theme.png"), fullPage: false });
  } finally {
    // Restore to light so downstream tests aren't polluted.
    try { await setTheme(ctxMrw, "mrw", "light"); } catch {}
    try { await setTheme(ctxBella, "bella", "light"); } catch {}
    await ctxMrw.close();
    await ctxBella.close();
    await browser.close();
  }
});

test("reload preserves each user's theme", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await login(ctx, "bella", BELLA_PIN);
    await setTheme(ctx, "bella", "bella");
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "bella", null, { timeout: 15000 });
    // Hard reload
    await page.reload();
    await page.waitForLoadState("networkidle");
    await page.waitForFunction(() => document.documentElement.getAttribute("data-theme") === "bella", null, { timeout: 15000 });
    const after = await readAppliedTheme(page);
    expect(after.attr).toBe("bella");
  } finally {
    await ctx.request.put(`${APP}/api/v1/users/bella/preferences`, {
      data: { theme: "light" }, headers: { "Content-Type": "application/json" },
    });
    await ctx.close();
    await browser.close();
  }
});

test("owner can set Bella's theme from the Admin panel", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await login(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("admin-panel").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("admin-theme-bella").selectOption("bella");
    await page.getByTestId("admin-save-theme-bella").click();
    await expect(page.getByTestId("admin-flash")).toContainText("Updated theme for bella", { timeout: 10000 });
    // Verify via a fresh Bella context
    const bellaCtx = await browser.newContext();
    await login(bellaCtx, "bella", BELLA_PIN);
    const r = await bellaCtx.request.fetch(`${APP}/api/v1/users/active`);
    const u = await r.json();
    expect(u.theme).toBe("bella");
    await page.screenshot({ path: path.join(EVID, "admin_set_bella_theme.png"), fullPage: false });
    await bellaCtx.close();
    // Restore
    await ctx.request.put(`${APP}/api/v1/users/bella/preferences`, {
      data: { theme: "light" }, headers: { "Content-Type": "application/json" },
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Bella can set her own theme from PreferencesPanel", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await login(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("preferences-panel").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("pref-theme").selectOption("dark");
    await page.getByTestId("pref-save").click();
    // Active user reflects the change on this page's context
    await page.waitForFunction(async () => {
      const r = await fetch("/api/v1/users/active", { credentials: "include" });
      const u = await r.json();
      return u.theme === "dark";
    }, null, { timeout: 10000 });
    await page.screenshot({ path: path.join(EVID, "bella_self_theme.png"), fullPage: false });
    // Restore
    await ctx.request.put(`${APP}/api/v1/users/bella/preferences`, {
      data: { theme: "light" }, headers: { "Content-Type": "application/json" },
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});
