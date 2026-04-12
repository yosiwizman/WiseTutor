/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const API = process.env.DEEPTUTOR_API || "http://localhost:8001";
const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/multi_user/latest");

fs.mkdirSync(EVID, { recursive: true });

async function setActiveViaApi(user_id: string, pin: string) {
  const r = await fetch(`${API}/api/v1/users/switch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id, pin }),
  });
  if (!r.ok) throw new Error(`switch failed: ${r.status}`);
}

test.describe.configure({ mode: "serial" });

test("active user label visible + switcher opens", async ({ page }) => {
  await setActiveViaApi("mrw", "1234");
  await page.goto(APP);
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("user-switcher-label")).toHaveText("Mr W");
  await page.getByTestId("user-switcher-trigger").click();
  await expect(page.getByTestId("user-switcher-popup")).toBeVisible();
  await expect(page.getByTestId("user-row-mrw")).toBeVisible();
  await expect(page.getByTestId("user-row-bella")).toBeVisible();
  await page.screenshot({ path: path.join(EVID, "01_switcher_open.png"), fullPage: false });
});

test("wrong PIN is rejected and no switch happens", async ({ page }) => {
  await setActiveViaApi("mrw", "1234");
  await page.goto(APP);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("user-switcher-trigger").click();
  await page.getByTestId("user-row-bella").click();
  await page.getByTestId("user-switcher-pin").fill("9999");
  await page.getByTestId("user-switcher-submit").click();
  await expect(page.locator("text=Wrong PIN")).toBeVisible();
  // Active user should still be Mr W (server-side truth)
  const r = await fetch(`${API}/api/v1/users/active`);
  const j = await r.json();
  expect(j.id).toBe("mrw");
  await page.screenshot({ path: path.join(EVID, "02_wrong_pin_rejected.png"), fullPage: false });
});

test("correct PIN switches and label updates", async ({ page }) => {
  await setActiveViaApi("mrw", "1234");
  await page.goto(APP);
  await page.waitForLoadState("networkidle");
  await page.getByTestId("user-switcher-trigger").click();
  await page.getByTestId("user-row-bella").click();
  await page.getByTestId("user-switcher-pin").fill("5678");
  await page.getByTestId("user-switcher-submit").click();
  // Component does a reload on success.
  await page.waitForLoadState("networkidle");
  await expect(page.getByTestId("user-switcher-label")).toHaveText("Bella", { timeout: 15000 });
  const r = await fetch(`${API}/api/v1/users/active`);
  const j = await r.json();
  expect(j.id).toBe("bella");
  await page.screenshot({ path: path.join(EVID, "03_after_switch_to_bella.png"), fullPage: false });
});
