/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/phase3_caps/latest");
fs.mkdirSync(EVID, { recursive: true });

const MRW_PIN = process.env.WT_MRW_PIN || "2468";
const BELLA_PIN = process.env.WT_BELLA_PIN || "1357";

async function login(ctx: BrowserContext, user_id: string, pin: string) {
  const r = await ctx.request.post(`${APP}/api/v1/users/switch`, {
    data: { user_id, pin },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`login ${user_id} → ${r.status()}`);
}

async function openCapMenu(page: any) {
  await page.getByTestId("chat-composer-input").waitFor({ state: "visible", timeout: 15000 });
  await page.getByTestId("composer-cap-trigger").click();
  await page.waitForTimeout(200);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("Bella does NOT see Deep Research / Deep Solve in the composer picker", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await login(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.waitForLoadState("networkidle");
    await openCapMenu(page);
    // Allowed for Bella
    await expect(page.getByTestId("composer-cap-chat")).toBeVisible();
    await expect(page.getByTestId("composer-cap-deep_question")).toBeVisible();
    await expect(page.getByTestId("composer-cap-math_animator")).toBeVisible();
    // Disallowed for Bella
    await expect(page.getByTestId("composer-cap-deep_solve")).toHaveCount(0);
    await expect(page.getByTestId("composer-cap-deep_research")).toHaveCount(0);
    await expect(page.getByTestId("composer-cap-visualize")).toHaveCount(0);
    await page.screenshot({ path: path.join(EVID, "bella_picker_filtered.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Mr W DOES see owner-allowed capabilities", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await login(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(APP);
    await page.waitForLoadState("networkidle");
    await openCapMenu(page);
    for (const k of ["chat", "deep_solve", "deep_question", "deep_research", "math_animator", "visualize"]) {
      await expect(page.getByTestId(`composer-cap-${k}`)).toBeVisible();
    }
    await page.screenshot({ path: path.join(EVID, "mrw_picker_full.png"), fullPage: false });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Bella crafted WS request with deep_research is rejected with explicit payload", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await login(ctx, "bella", BELLA_PIN);
    const t = await (await ctx.request.fetch(`${APP}/api/v1/users/ws-token`)).json();
    const page = await ctx.newPage();
    const rejection = await page.evaluate(async (token: string) => {
      return await new Promise<any>((resolve, reject) => {
        const ws = new WebSocket(`ws://localhost:8001/api/v1/ws?wt_uid_token=${encodeURIComponent(token)}`);
        ws.onmessage = (ev) => {
          try {
            const m = JSON.parse(ev.data);
            const meta = m.metadata || {};
            if (meta.turn_terminal) {
              ws.close();
              resolve(m);
            }
          } catch {}
        };
        ws.onerror = () => reject(new Error("ws error"));
        ws.onopen = () =>
          ws.send(JSON.stringify({
            type: "message", content: "probe",
            capability: "deep_research", language: "en",
          }));
        setTimeout(() => reject(new Error("ws timeout")), 20000);
      });
    }, t.token);
    // Save the exact rejection payload for the evidence bundle.
    fs.writeFileSync(
      path.join(EVID, "bella_deep_research_rejection.json"),
      JSON.stringify(rejection, null, 2),
    );
    expect(rejection?.metadata?.status).toBe("rejected");
    expect(rejection?.metadata?.reason).toBe("capability_not_allowed");
    expect(rejection?.metadata?.requested_capability).toBe("deep_research");
  } finally {
    await ctx.close();
    await browser.close();
  }
});
