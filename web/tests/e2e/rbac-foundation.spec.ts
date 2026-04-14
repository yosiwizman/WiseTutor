/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/rbac_v1/latest");
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
test.setTimeout(60_000);

test("owner sees AdminPanel + active-profile badge on /settings", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");

    const badge = page.getByTestId("active-profile-badge");
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveAttribute("data-active-user-id", "mrw");
    await expect(badge).toHaveAttribute("data-active-user-role", "owner");

    await expect(page.getByTestId("admin-panel")).toBeVisible({ timeout: 15000 });

    await page.screenshot({
      path: path.join(EVID, "owner_settings_with_badge.png"),
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("child sees badge but NOT AdminPanel on /settings", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");

    const badge = page.getByTestId("active-profile-badge");
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveAttribute("data-active-user-id", "bella");
    await expect(badge).toHaveAttribute("data-active-user-role", "child");

    await expect(page.getByTestId("admin-panel")).toHaveCount(0);

    await page.screenshot({
      path: path.join(EVID, "child_settings_no_admin.png"),
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("active-profile badge present on /knowledge for child", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/knowledge`);
    await page.waitForLoadState("networkidle");
    const badge = page.getByTestId("active-profile-badge");
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveAttribute("data-active-user-id", "bella");
    await page.screenshot({ path: path.join(EVID, "child_knowledge_badge.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("active-profile badge present on /memory for owner", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/memory`);
    await page.waitForLoadState("networkidle");
    const badge = page.getByTestId("active-profile-badge");
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveAttribute("data-active-user-id", "mrw");
    await page.screenshot({ path: path.join(EVID, "owner_memory_badge.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("child upsert against /api/v1/users is rejected (403)", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    const r = await ctx.request.post(`${API}/api/v1/users`, {
      data: {
        user_id: "intruder_via_ui",
        display_name: "Intruder",
        role: "owner",
        pin: "0000",
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status()).toBe(403);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
