/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/profile_lifecycle_v1/latest");
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

async function ownerEnableBella() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    await ctx.request.post(`${API}/api/v1/users/bella/enable`);
  } finally {
    await ctx.close();
    await browser.close();
  }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test.beforeEach(async () => {
  await ownerEnableBella();
});

test.afterEach(async () => {
  // Always re-enable Bella, even on test failure, so unrelated specs that
  // run in parallel against the same backend (rbac-foundation,
  // admin-oversight) never hit a disabled-Bella race.
  await ownerEnableBella();
});

test.afterAll(async () => {
  await ownerEnableBella();
});

test("owner sees Disable control on AdminPanel; child does not see AdminPanel at all", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  const childCtx = await browser.newContext();
  try {
    await apiLogin(ownerCtx, "mrw", MRW_PIN);
    await apiLogin(childCtx, "bella", BELLA_PIN);

    const ownerPage = await ownerCtx.newPage();
    await ownerPage.goto(`${APP}/settings`);
    await ownerPage.waitForLoadState("networkidle");
    await expect(ownerPage.getByTestId("admin-panel")).toBeVisible({ timeout: 15000 });
    await expect(ownerPage.getByTestId("admin-toggle-disable-bella")).toBeVisible();

    const childPage = await childCtx.newPage();
    await childPage.goto(`${APP}/settings`);
    await childPage.waitForLoadState("networkidle");
    await expect(childPage.getByTestId("admin-panel")).toHaveCount(0);
    await expect(childPage.getByTestId("admin-toggle-disable-bella")).toHaveCount(0);

    await ownerPage.screenshot({ path: path.join(EVID, "owner_admin_with_disable.png"), fullPage: true });
    await childPage.screenshot({ path: path.join(EVID, "child_settings_no_admin.png"), fullPage: false });
  } finally {
    await ownerCtx.close();
    await childCtx.close();
    await browser.close();
  }
});

test("owner disables Bella; Bella's stale session sees blocked-state UX and is denied protected APIs", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  const childCtx = await browser.newContext();
  try {
    await apiLogin(ownerCtx, "mrw", MRW_PIN);
    // Acquire a real Bella cookie BEFORE disable, then disable her —
    // simulates the realistic case of a logged-in child whose owner
    // revokes access mid-session.
    await apiLogin(childCtx, "bella", BELLA_PIN);
    const r = await ownerCtx.request.post(`${API}/api/v1/users/bella/disable`);
    expect(r.status()).toBe(200);

    // /active is special-cased: 403 + detail=disabled (drives the UX).
    const activeResp = await childCtx.request.get(`${API}/api/v1/users/active`);
    expect(activeResp.status()).toBe(403);
    const body = await activeResp.json().catch(() => ({}));
    const detail = body?.detail;
    const detailKind = typeof detail === "string" ? detail : detail?.detail;
    expect(detailKind).toBe("disabled");
    if (typeof detail === "object" && detail !== null) {
      expect(detail?.user_id).toBe("bella");
    }

    // Protected reads return 401 (resolve_request_user -> None for disabled).
    const memResp = await childCtx.request.get(`${API}/api/v1/memory`);
    expect(memResp.status()).toBe(401);
    const kbResp = await childCtx.request.get(`${API}/api/v1/knowledge/list`);
    expect(kbResp.status()).toBe(401);

    // The UI shows the takeover blocked-state.
    const childPage = await childCtx.newPage();
    await childPage.goto(`${APP}/`);
    const blocked = childPage.getByTestId("user-gate-disabled");
    await expect(blocked).toBeVisible({ timeout: 15000 });
    await expect(blocked).toHaveAttribute("data-disabled-user-id", "bella");
    await childPage.screenshot({ path: path.join(EVID, "bella_blocked_state.png"), fullPage: true });
  } finally {
    await ownerCtx.close();
    await childCtx.close();
    await browser.close();
  }
});

test("owner re-enables Bella via AdminPanel; Bella regains access", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  try {
    await apiLogin(ownerCtx, "mrw", MRW_PIN);

    // Pre-disable Bella so the UI button reads "Re-enable".
    await ownerCtx.request.post(`${API}/api/v1/users/bella/disable`);

    const ownerPage = await ownerCtx.newPage();
    await ownerPage.goto(`${APP}/settings`);
    await ownerPage.waitForLoadState("networkidle");
    const disabledBadge = ownerPage.getByTestId("admin-status-bella");
    await expect(disabledBadge).toBeVisible({ timeout: 15000 });

    // Click the toggle (now reads "Re-enable").
    const btn = ownerPage.getByTestId("admin-toggle-disable-bella");
    await expect(btn).toContainText(/re-enable/i);
    await btn.click();

    // Status badge disappears after re-enable + reload.
    await expect(ownerPage.getByTestId("admin-status-bella")).toHaveCount(0, { timeout: 15000 });

    // Bella can now acquire a fresh session.
    const childCtx = await browser.newContext();
    try {
      await apiLogin(childCtx, "bella", BELLA_PIN);
      const r = await childCtx.request.get(`${API}/api/v1/memory`);
      expect(r.status()).toBe(200);
      await ownerPage.screenshot({ path: path.join(EVID, "owner_after_reenable.png"), fullPage: true });
    } finally {
      await childCtx.close();
    }
  } finally {
    await ownerCtx.close();
    await browser.close();
  }
});

test("child cannot disable owner via direct HTTP (defense in depth)", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    const r = await ctx.request.post(`${API}/api/v1/users/mrw/disable`);
    expect(r.status()).toBe(403);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
