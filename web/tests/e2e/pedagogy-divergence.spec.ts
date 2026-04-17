/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/phase4_pedagogy/latest");
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

async function wsToken(ctx: BrowserContext): Promise<string> {
  const r = await ctx.request.fetch(`${APP}/api/v1/users/ws-token`);
  if (!r.ok()) throw new Error(`ws-token ${r.status()}`);
  return (await r.json()).token;
}

async function sendTurn(ctx: BrowserContext, token: string, prompt: string): Promise<{ reply: string; runtime: any }> {
  const page = await ctx.newPage();
  try {
    return await page.evaluate(
      ({ token, prompt }) => {
        return new Promise<any>((resolve, reject) => {
          const ws = new WebSocket(`ws://localhost:8001/api/v1/ws?wt_uid_token=${encodeURIComponent(token)}`);
          let reply = "";
          let runtime: any = null;
          ws.onmessage = (ev) => {
            try {
              const m = JSON.parse(ev.data);
              const meta = m.metadata || {};
              if (!runtime && meta.runtime) runtime = meta.runtime;
              if (m.type === "content") reply += (m.content || "");
              if (m.type === "done" || meta.turn_terminal) {
                ws.close();
                resolve({ reply, runtime });
              }
            } catch {}
          };
          ws.onerror = () => reject(new Error("ws error"));
          ws.onopen = () =>
            ws.send(JSON.stringify({ type: "message", content: prompt, capability: "chat", language: "en" }));
          setTimeout(() => reject(new Error("ws timeout")), 180000);
        });
      },
      { token, prompt },
    );
  } finally {
    await page.close();
  }
}

async function setPedagogyMode(ctx: BrowserContext, targetId: string, mode: string) {
  await login(ctx, "mrw", MRW_PIN);
  const page = await ctx.newPage();
  try {
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("admin-panel").waitFor({ state: "visible", timeout: 15000 });

    const dropdown = page.getByTestId(`admin-pedagogy-mode-${targetId}`);
    await dropdown.selectOption(mode);

    const saveBtn = page.getByTestId(`admin-save-pedagogy-mode-${targetId}`);
    await saveBtn.click();

    await expect(page.getByTestId("admin-flash")).toContainText("Updated pedagogy mode", { timeout: 15000 });

    await page.screenshot({
      path: path.join(EVID, `admin_set_${targetId}_to_${mode}.png`),
      fullPage: false
    });
  } finally {
    await page.close();
  }
}

test.describe.configure({ mode: "serial" });
test.setTimeout(420_000);

test("Pedagogy mode divergence: guided asks questions, direct gives answers", async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext();
  const bellaCtx = await browser.newContext();

  try {
    // Ensure Bella has a working catalog
    await login(bellaCtx, "bella", BELLA_PIN);
    const openAiCatalog = {
      catalog: {
        version: 1,
        services: {
          llm: {
            active_profile_id: "p-openai",
            active_model_id: "m-mini",
            profiles: [{
              id: "p-openai", name: "OpenAI", binding: "openai",
              base_url: "https://api.openai.com/v1",
              api_key: process.env.OPENAI_API_KEY || "",
              api_version: "", extra_headers: {},
              models: [{ id: "m-mini", name: "gpt-4o-mini", model: "gpt-4o-mini" }],
            }],
          },
          embedding: { active_profile_id: null, active_model_id: null, profiles: [] },
          search: { active_profile_id: null, profiles: [] },
        },
      },
    };

    const existing = await (await bellaCtx.request.fetch(`${APP}/api/v1/settings/catalog`)).json();
    const prof = (existing.catalog.services.llm.profiles || []).find((p: any) => p.binding === "openai");
    const key = prof?.api_key || process.env.OPENAI_API_KEY || "";
    const payload = JSON.parse(JSON.stringify(openAiCatalog));
    payload.catalog.services.llm.profiles[0].api_key = key;
    await bellaCtx.request.put(`${APP}/api/v1/settings/catalog`, {
      data: payload,
      headers: { "Content-Type": "application/json" },
    });

    // Test 1: Set Bella to 'guided' mode and verify response asks a question
    await setPedagogyMode(ownerCtx, "bella", "guided");

    await login(bellaCtx, "bella", BELLA_PIN);
    const tokenGuided = await wsToken(bellaCtx);
    const prompt = "What is 2+2?";
    const guidedResponse = await sendTurn(bellaCtx, tokenGuided, prompt);

    expect(guidedResponse.reply.length, "Guided reply empty").toBeGreaterThan(10);

    // Guided mode should ask a follow-up question (contains '?')
    const guidedHasQuestion = guidedResponse.reply.includes("?");
    expect(guidedHasQuestion, "Guided mode should ask a follow-up question").toBeTruthy();

    // Test 2: Set Bella to 'direct' mode and verify response gives direct answer
    await setPedagogyMode(ownerCtx, "bella", "direct");

    await login(bellaCtx, "bella", BELLA_PIN);
    const tokenDirect = await wsToken(bellaCtx);
    const directResponse = await sendTurn(bellaCtx, tokenDirect, prompt);

    expect(directResponse.reply.length, "Direct reply empty").toBeGreaterThan(10);

    // Direct mode should contain the answer '4'
    const directHasAnswer = directResponse.reply.includes("4");
    expect(directHasAnswer, "Direct mode should contain the answer '4'").toBeTruthy();

    // Responses should be measurably different
    expect(guidedResponse.reply).not.toBe(directResponse.reply);

    // Save proof JSON
    fs.writeFileSync(
      path.join(EVID, "pedagogy_divergence_proof.json"),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          prompt,
          guided: {
            mode: "guided",
            reply: guidedResponse.reply,
            reply_length: guidedResponse.reply.length,
            has_question: guidedHasQuestion,
            runtime: guidedResponse.runtime,
          },
          direct: {
            mode: "direct",
            reply: directResponse.reply,
            reply_length: directResponse.reply.length,
            has_answer: directHasAnswer,
            runtime: directResponse.runtime,
          },
          divergence_verified: guidedResponse.reply !== directResponse.reply,
        },
        null,
        2,
      ),
    );
  } finally {
    // Restore Bella to adaptive mode (default for child)
    try {
      await setPedagogyMode(ownerCtx, "bella", "adaptive");
    } catch { /* best-effort */ }

    await ownerCtx.close();
    await bellaCtx.close();
    await browser.close();
  }
});

test("AdminPanel pedagogy mode controls are visible and functional", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await login(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`);
    await page.waitForLoadState("networkidle");

    await page.getByTestId("admin-panel").waitFor({ state: "visible", timeout: 15000 });

    // Verify pedagogy mode dropdown exists for Bella
    const dropdown = page.getByTestId("admin-pedagogy-mode-bella");
    await expect(dropdown).toBeVisible();

    // Verify all three modes are available
    const options = await dropdown.locator("option").allTextContents();
    expect(options).toContain("guided");
    expect(options).toContain("direct");
    expect(options).toContain("adaptive");

    // Verify save button exists
    const saveBtn = page.getByTestId("admin-save-pedagogy-mode-bella");
    await expect(saveBtn).toBeVisible();

    await page.screenshot({
      path: path.join(EVID, "admin_pedagogy_controls.png"),
      fullPage: false
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});
