/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/admin_oversight_v1/latest");
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

test("owner sees inspect control on /memory and can inspect Bella read-only", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/memory`);
    await page.waitForLoadState("networkidle");

    const ctrl = page.getByTestId("owner-inspect-control");
    await expect(ctrl).toBeVisible({ timeout: 15000 });

    await page.getByTestId("owner-inspect-select").selectOption("bella");
    const banner = page.getByTestId("owner-inspect-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toHaveAttribute("data-inspect-target", "bella");

    // Read-only: write controls are disabled while inspecting.
    await expect(page.getByTestId("memory-save")).toBeDisabled();
    await expect(page.getByTestId("memory-refresh")).toBeDisabled();
    await expect(page.getByTestId("memory-clear")).toBeDisabled();

    await page.screenshot({
      path: path.join(EVID, "owner_memory_inspecting_bella.png"),
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("owner sees inspect control on /knowledge and can inspect Bella read-only", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/knowledge`);
    await page.waitForLoadState("networkidle");

    const ctrl = page.getByTestId("owner-inspect-control");
    await expect(ctrl).toBeVisible({ timeout: 15000 });

    await page.getByTestId("owner-inspect-select").selectOption("bella");
    const banner = page.getByTestId("owner-inspect-banner");
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toHaveAttribute("data-inspect-target", "bella");

    await page.screenshot({
      path: path.join(EVID, "owner_knowledge_inspecting_bella.png"),
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("child does NOT see inspect control on /memory", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/memory`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("owner-inspect-control")).toHaveCount(0);
    await page.screenshot({
      path: path.join(EVID, "child_memory_no_inspect.png"),
      fullPage: false,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("child does NOT see inspect control on /knowledge", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/knowledge`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByTestId("owner-inspect-control")).toHaveCount(0);
    await page.screenshot({
      path: path.join(EVID, "child_knowledge_no_inspect.png"),
      fullPage: false,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("child cross-user inspect HTTP returns 403", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    for (const url of [
      `${API}/api/v1/memory?as_user=mrw`,
      `${API}/api/v1/knowledge/list?as_user=mrw`,
      `${API}/api/v1/knowledge/whatever?as_user=mrw`,
    ]) {
      const r = await ctx.request.get(url);
      expect(r.status()).toBe(403);
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
});
