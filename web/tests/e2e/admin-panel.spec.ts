/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/phase3_admin/latest");
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

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

test("Admin panel visible to Mr W, hidden from Bella", async () => {
  const browser = await chromium.launch();
  const mrwCtx = await browser.newContext();
  const bellaCtx = await browser.newContext();
  try {
    await apiLogin(mrwCtx, "mrw", MRW_PIN);
    await apiLogin(bellaCtx, "bella", BELLA_PIN);
    const mrwPage = await mrwCtx.newPage();
    const bellaPage = await bellaCtx.newPage();
    await mrwPage.goto(`${APP}/settings`);
    await bellaPage.goto(`${APP}/settings`);
    await mrwPage.waitForLoadState("networkidle");
    await bellaPage.waitForLoadState("networkidle");
    await expect(mrwPage.getByTestId("admin-panel")).toBeVisible({ timeout: 15000 });
    await expect(bellaPage.getByTestId("admin-panel")).toHaveCount(0);
    await mrwPage.screenshot({ path: path.join(EVID, "mrw_admin_panel.png"), fullPage: true });
    await bellaPage.screenshot({ path: path.join(EVID, "bella_no_admin.png"), fullPage: false });
  } finally {
    await mrwCtx.close();
    await bellaCtx.close();
    await browser.close();
  }
});

test("Mr W resets Bella's PIN from Admin panel; Bella signs in with new PIN, old PIN fails", async () => {
  const NEW = "8642";
  const browser = await chromium.launch();
  const mrwCtx = await browser.newContext();
  try {
    await apiLogin(mrwCtx, "mrw", MRW_PIN);
    const page = await mrwCtx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("admin-panel").waitFor({ state: "visible", timeout: 15000 });
    await page.getByTestId("admin-owner-pin").fill(MRW_PIN);
    await page.getByTestId("admin-new-pin-bella").fill(NEW);
    await page.getByTestId("admin-reset-pin-bella").click();
    await expect(page.getByTestId("admin-flash")).toContainText("Reset PIN for bella", { timeout: 15000 });
    await page.screenshot({ path: path.join(EVID, "mrw_after_reset.png"), fullPage: false });

    // New Bella context: log in with new PIN
    const bellaNew = await browser.newContext();
    const r1 = await bellaNew.request.post(`${APP}/api/v1/users/switch`, {
      data: { user_id: "bella", pin: NEW },
      headers: { "Content-Type": "application/json" },
    });
    expect(r1.ok()).toBeTruthy();
    // Old PIN fails
    const bellaOld = await browser.newContext();
    const r2 = await bellaOld.request.post(`${APP}/api/v1/users/switch`, {
      data: { user_id: "bella", pin: BELLA_PIN },
      headers: { "Content-Type": "application/json" },
    });
    expect(r2.status()).toBe(403);

    await bellaNew.close();
    await bellaOld.close();
  } finally {
    // Restore Bella's PIN to the known value via owner-override
    const resetCtx = await browser.newContext();
    await apiLogin(resetCtx, "mrw", MRW_PIN);
    await resetCtx.request.post(`${APP}/api/v1/users/bella/pin`, {
      data: { current_pin: MRW_PIN, new_pin: BELLA_PIN },
      headers: { "Content-Type": "application/json" },
    });
    await resetCtx.close();
    await mrwCtx.close();
    await browser.close();
  }
});

test("Mr W changes Bella's allowed_capabilities from Admin panel", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("admin-panel").waitFor({ state: "visible", timeout: 15000 });
    // Toggle off deep_research (already off by default for Bella) and toggle
    // on visualize, then save.
    const vizBox = page.getByTestId("admin-cap-bella-visualize").locator("input[type=checkbox]");
    const isOn = await vizBox.isChecked();
    if (!isOn) {
      await vizBox.click();
    }
    await page.getByTestId("admin-save-caps-bella").click();
    await expect(page.getByTestId("admin-flash")).toContainText("Updated allowed capabilities", { timeout: 15000 });
    await page.screenshot({ path: path.join(EVID, "mrw_caps_saved.png"), fullPage: false });

    // Verify via API
    const check = await (await ctx.request.fetch(`${APP}/api/v1/users/bella/preferences`)).json();
    expect(check.preferences.allowed_capabilities).toContain("visualize");

    // Restore Bella's caps
    await ctx.request.put(`${APP}/api/v1/users/bella/preferences`, {
      data: { allowed_capabilities: ["chat", "deep_question", "math_animator"] },
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});
