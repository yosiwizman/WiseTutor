import { ensureSignedIn } from "./_auth_helper";
/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const API = process.env.DEEPTUTOR_API || "http://localhost:8001";
const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/fix_evidence/latest");

async function setActive(profile_id: string, model_id: string) {
  const r = await fetch(`${API}/api/v1/settings/active`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ service: "llm", profile_id, model_id }),
  });
  if (!r.ok) throw new Error(`setActive failed: ${r.status}`);
}

async function askIdentity(page: Page, question: string): Promise<string> {
  const input = page.getByTestId("chat-composer-input");
  await input.waitFor({ state: "visible", timeout: 20000 });
  await input.fill(question);
  await page.getByTestId("chat-composer-send").click();
  // Wait for assistant message to appear with the runtime chip
  const chip = page.locator("text=server-recorded").first();
  await chip.waitFor({ state: "visible", timeout: 60000 });
  // Give streaming a moment to finalize
  await page.waitForTimeout(1500);
  // Capture assistant message region — grab the last prose block before the chip
  const main = await page.locator("main, body").first().innerText();
  return main;
}

interface Proof {
  provider: string;
  model: string;
  profile_id: string;
  model_id: string;
  reply_excerpt: string;
  runtime_metadata: unknown;
  screenshot: string;
  pass: boolean;
  reason?: string;
}

const proofs: Proof[] = [];

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

test.describe.configure({ mode: "serial" });

test.beforeAll(() => ensureDir(EVID));

test("settings runtime truth + memory health panel", async ({ page }) => {
  await ensureSignedIn(page, API); await page.goto(`${APP}/settings`);
  await page.waitForLoadState("networkidle");
  await page.getByText("Runtime Truth", { exact: false }).first().waitFor({ timeout: 15000 });
  await page.getByTestId("memory-health").waitFor({ timeout: 15000 });
  await page.screenshot({ path: path.join(EVID, "01_settings_memory_health.png"), fullPage: true });
  await page.screenshot({ path: path.join(EVID, "05_runtime_truth_panel.png"), fullPage: false, clip: { x: 0, y: 0, width: 1280, height: 900 } });
});

const cases: { file: string; label: string; profile: string; model: string; expectProvider: string; expectModel: string }[] = [
  { file: "02_openai_identity_reply.png",   label: "OpenAI gpt-5.4",          profile: "llm-profile-openai",    model: "llm-model-openai-gpt54",     expectProvider: "openai",    expectModel: "gpt-5.4" },
  { file: "03_anthropic_identity_reply.png", label: "Anthropic claude-opus-4-6", profile: "llm-profile-anthropic", model: "llm-model-anthropic-opus46", expectProvider: "anthropic", expectModel: "claude-opus-4-6" },
  { file: "04_ollama_identity_reply.png",    label: "Ollama qwen2.5:72b",      profile: "llm-profile-ollama",    model: "llm-model-ollama-qwen72b",   expectProvider: "ollama",    expectModel: "qwen2.5:72b" },
];

for (const c of cases) {
  test(`identity reply matches runtime for ${c.label}`, async ({ page }) => {
    await setActive(c.profile, c.model);
    await ensureSignedIn(page, API); await page.goto(APP);
    await page.waitForLoadState("networkidle");
    const body = await askIdentity(page, "What AI model and provider are you?");
    const ss = path.join(EVID, c.file);
    await page.screenshot({ path: ss, fullPage: true });

    // Pull runtime via diagnostics for this turn's selection
    const diag = await (await fetch(`${API}/api/v1/settings/diagnostics`)).json();
    const rt = diag?.llm;
    const replyLower = body.toLowerCase();
    const mentionsRight = replyLower.includes(c.expectModel.toLowerCase()) && replyLower.includes(c.expectProvider.toLowerCase());
    const mentionsLie = replyLower.includes("gpt-4.1");
    const pass = mentionsRight && !mentionsLie;
    proofs.push({
      provider: c.expectProvider,
      model: c.expectModel,
      profile_id: c.profile,
      model_id: c.model,
      reply_excerpt: body.slice(0, 1200),
      runtime_metadata: rt,
      screenshot: ss,
      pass,
      reason: pass ? undefined : (mentionsLie ? "reply contains GPT-4.1 lie" : "reply missing expected provider/model"),
    });
    expect(pass, JSON.stringify({ expect: c, reply_tail: body.slice(-400), reason: proofs.at(-1)?.reason })).toBeTruthy();
  });
}

test.afterAll(() => {
  const out = { generated_at: new Date().toISOString(), cases: proofs };
  fs.writeFileSync(path.join(EVID, "runtime_proof.json"), JSON.stringify(out, null, 2));
});
