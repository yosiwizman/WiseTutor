/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/profile_hard_delete_v1/latest");
fs.mkdirSync(EVID, { recursive: true });

const MRW_PIN = process.env.WT_MRW_PIN || "2468";
const BELLA_PIN = process.env.WT_BELLA_PIN || "1357";
const VICTIM_PIN = "1111";

async function apiLogin(ctx: BrowserContext, user_id: string, pin: string) {
  const r = await ctx.request.post(`${APP}/api/v1/users/switch`, {
    data: { user_id, pin },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`login ${user_id} → ${r.status()}`);
}

function victimId() {
  return `del_victim_${Math.random().toString(36).slice(2, 10)}`;
}

async function createVictimAsOwner(ctx: BrowserContext, user_id: string) {
  const r = await ctx.request.post(`${API}/api/v1/users`, {
    data: { user_id, display_name: `Temp ${user_id}`, role: "user", pin: VICTIM_PIN },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`upsert victim ${user_id} → ${r.status()}`);
}

async function forceDeleteIfStillPresent(ctx: BrowserContext, user_id: string) {
  await ctx.request.delete(`${API}/api/v1/users/${user_id}`);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test("owner deletes non-owner profile through the real UI flow; victim disappears from list", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const uid = victimId();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    await createVictimAsOwner(ctx, uid);

    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");

    // Pre-delete: row is visible with a Delete button.
    await expect(page.getByTestId(`admin-row-${uid}`)).toBeVisible({ timeout: 15_000 });
    const deleteBtn = page.getByTestId(`admin-delete-${uid}`);
    await expect(deleteBtn).toBeVisible();

    // Two dialogs fire in sequence: a confirm() then a prompt() asking
    // for the profile id. Register a single handler that dispatches by
    // dialog.type() and always accepts with the id for the prompt.
    page.on("dialog", async (d) => {
      if (d.type() === "prompt") {
        await d.accept(uid);
      } else {
        await d.accept();
      }
    });
    await deleteBtn.click();

    // Row disappears after the in-page reload.
    await expect(page.getByTestId(`admin-row-${uid}`)).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByTestId(`admin-delete-${uid}`)).toHaveCount(0);
    await page.screenshot({ path: path.join(EVID, "owner_after_delete.png"), fullPage: true });

    // Backend confirms the profile is gone.
    const list = await ctx.request.get(`${API}/api/v1/users`);
    const body = await list.json();
    expect(body.users.map((u: { id: string }) => u.id)).not.toContain(uid);
  } finally {
    await forceDeleteIfStillPresent(ctx, uid);
    await ctx.close();
    await browser.close();
  }
});

test("deleted profile cannot be switched into afterward", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  const victimCtx = await browser.newContext();
  const uid = victimId();
  try {
    await apiLogin(ownerCtx, "mrw", MRW_PIN);
    await createVictimAsOwner(ownerCtx, uid);
    // Owner deletes directly via API (UI flow is covered in test 1).
    expect((await ownerCtx.request.delete(`${API}/api/v1/users/${uid}`)).status()).toBe(200);

    const r = await victimCtx.request.post(`${APP}/api/v1/users/switch`, {
      data: { user_id: uid, pin: VICTIM_PIN },
      headers: { "Content-Type": "application/json" },
    });
    expect(r.status()).toBe(403);
  } finally {
    await forceDeleteIfStillPresent(ownerCtx, uid);
    await ownerCtx.close();
    await victimCtx.close();
    await browser.close();
  }
});

test("owner self-delete is absent or blocked at the UI level", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");

    // AdminPanel deliberately renders ONLY non-self non-owner rows
    // (see AdminPanel.load: others = users.filter(u.id !== meUser.id)),
    // so there is no admin-row-mrw / admin-delete-mrw button at all.
    await expect(page.getByTestId("admin-row-mrw")).toHaveCount(0);
    await expect(page.getByTestId("admin-delete-mrw")).toHaveCount(0);

    // And defense-in-depth via direct HTTP from the same owner context.
    const r = await ctx.request.delete(`${API}/api/v1/users/mrw`);
    expect([400, 403]).toContain(r.status());
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("child user has no delete affordance on /settings", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");

    // AdminPanel itself is owner-only.
    await expect(page.getByTestId("admin-panel")).toHaveCount(0);
    // Any admin-delete-* locator also must be absent.
    await expect(page.locator('[data-testid^="admin-delete-"]')).toHaveCount(0);
    await page.screenshot({ path: path.join(EVID, "child_no_delete.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});
