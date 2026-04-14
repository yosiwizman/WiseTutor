/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/knowledge_isolation_v2/latest");
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

test("child cannot reach operational knowledge HTTP endpoints (UI-context probe)", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    // Owner-only inspect on /list with as_user must 403 from the
    // child context — same shape the UI sees.
    const list = await ctx.request.get(`${API}/api/v1/knowledge/list?as_user=mrw`);
    expect(list.status()).toBe(403);
    // Cross-user-write attempts are simply ignored on writes; verify
    // self-config write does not leak across when child sets it.
    const cfgWrite = await ctx.request.put(
      `${API}/api/v1/knowledge/ui_isolation_demo/config?as_user=mrw`,
      { data: { rag_provider: "llamaindex", search_mode: "ui_bella_only" }, headers: { "Content-Type": "application/json" } },
    );
    expect(cfgWrite.status()).toBe(200);
    // Mr W in a fresh context must not see Bella's value.
    const ownerCtx = await browser.newContext();
    try {
      await apiLogin(ownerCtx, "mrw", MRW_PIN);
      const cfgRead = await ownerCtx.request.get(`${API}/api/v1/knowledge/ui_isolation_demo/config`);
      expect(cfgRead.status()).toBe(200);
      const body = await cfgRead.json();
      expect(body?.config?.search_mode).not.toBe("ui_bella_only");
    } finally {
      await ownerCtx.close();
    }
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Knowledge UI does not bleed configs across users when switching active profile", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    // 1) Mr W writes a distinctive config value while logged in.
    await apiLogin(ctx, "mrw", MRW_PIN);
    const seedW = await ctx.request.put(
      `${API}/api/v1/knowledge/ui_bleed_demo/config`,
      { data: { rag_provider: "llamaindex", search_mode: "owner_only_value" }, headers: { "Content-Type": "application/json" } },
    );
    expect(seedW.status()).toBe(200);

    const ownerPage = await ctx.newPage();
    await ownerPage.goto(`${APP}/knowledge`);
    await ownerPage.waitForLoadState("networkidle");
    await ownerPage.screenshot({ path: path.join(EVID, "owner_knowledge_loaded.png"), fullPage: true });

    // 2) Switch the SAME browser context to Bella by re-issuing /switch.
    const r = await ctx.request.post(`${API}/api/v1/users/switch`, {
      data: { user_id: "bella", pin: BELLA_PIN },
      headers: { "Content-Type": "application/json" },
    });
    expect(r.ok()).toBe(true);

    const childPage = await ctx.newPage();
    await childPage.goto(`${APP}/knowledge`);
    await childPage.waitForLoadState("networkidle");

    // The active-profile badge now reads Bella, NOT Mr W.
    const badge = childPage.getByTestId("active-profile-badge");
    await expect(badge).toBeVisible({ timeout: 15000 });
    await expect(badge).toHaveAttribute("data-active-user-id", "bella");

    // The owner-inspect control is GONE for Bella.
    await expect(childPage.getByTestId("owner-inspect-control")).toHaveCount(0);

    // 3) A direct config probe in Bella's context must NOT see Mr W's value.
    const cfg = await ctx.request.get(`${API}/api/v1/knowledge/ui_bleed_demo/config`);
    expect(cfg.status()).toBe(200);
    const body = await cfg.json();
    expect(body?.config?.search_mode).not.toBe("owner_only_value");

    await childPage.screenshot({ path: path.join(EVID, "child_knowledge_after_switch.png"), fullPage: true });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("owner inspect of /knowledge stays read-only (existing contract)", async () => {
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
    await expect(page.getByTestId("owner-inspect-banner")).toBeVisible({ timeout: 5000 });

    // Direct probe: owner inspecting Bella's KB list returns 200 (read OK).
    const list = await ctx.request.get(`${API}/api/v1/knowledge/list?as_user=bella`);
    expect(list.status()).toBe(200);

    // But owner cannot WRITE into Bella's scope via as_user (verified
    // earlier from child side too) — confirm sentinel isolation.
    await ctx.request.put(
      `${API}/api/v1/knowledge/ro_check_kb/config?as_user=bella`,
      { data: { rag_provider: "llamaindex", search_mode: "owner_attempted_write" }, headers: { "Content-Type": "application/json" } },
    );
    const childCtx = await browser.newContext();
    try {
      await apiLogin(childCtx, "bella", BELLA_PIN);
      const cfg = await childCtx.request.get(`${API}/api/v1/knowledge/ro_check_kb/config`);
      expect(cfg.status()).toBe(200);
      const body = await cfg.json();
      expect(body?.config?.search_mode).not.toBe("owner_attempted_write");
    } finally {
      await childCtx.close();
    }
    await page.screenshot({ path: path.join(EVID, "owner_inspect_readonly_kb.png"), fullPage: true });
  } finally {
    await ctx.close();
    await browser.close();
  }
});
