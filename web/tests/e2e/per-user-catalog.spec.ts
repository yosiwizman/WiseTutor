/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/phase3_catalog/latest");
fs.mkdirSync(EVID, { recursive: true });

const MRW_PIN = process.env.WT_MRW_PIN || "2468";
const BELLA_PIN = process.env.WT_BELLA_PIN || "1357";

async function login(context: BrowserContext, user_id: string, pin: string) {
  const r = await context.request.post(`${APP}/api/v1/users/switch`, {
    data: { user_id, pin },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`login ${user_id} → ${r.status()}`);
}

test.describe.configure({ mode: "serial" });
test.setTimeout(120_000);

test("per-user catalog: independent active selections + no cross-context mutation", async () => {
  const browser = await chromium.launch();
  const ctxMrw = await browser.newContext();
  const ctxBella = await browser.newContext();
  try {
    await login(ctxMrw, "mrw", MRW_PIN);
    await login(ctxBella, "bella", BELLA_PIN);

    // Mr W switches to Anthropic / claude-opus-4-6
    const r1 = await ctxMrw.request.post(`${APP}/api/v1/settings/active`, {
      data: {
        service: "llm",
        profile_id: "llm-profile-anthropic",
        model_id: "llm-model-anthropic-opus46",
      },
      headers: { "Content-Type": "application/json" },
    });
    expect(r1.ok()).toBeTruthy();

    const diagMrw = await (await ctxMrw.request.fetch(`${APP}/api/v1/settings/diagnostics`)).json();
    const diagBella = await (await ctxBella.request.fetch(`${APP}/api/v1/settings/diagnostics`)).json();

    expect(diagMrw.llm.binding).toBe("anthropic");
    expect(diagMrw.llm.model).toBe("claude-opus-4-6");

    // Bella must NOT have flipped to Anthropic just because Mr W did.
    expect(diagBella.llm.binding).not.toBe("anthropic");
    expect(diagBella.llm.model).not.toBe("claude-opus-4-6");
    expect(diagMrw.llm.model).not.toBe(diagBella.llm.model);

    const pageMrw = await ctxMrw.newPage();
    const pageBella = await ctxBella.newPage();
    await pageMrw.goto(APP);
    await pageBella.goto(APP);
    await pageMrw.waitForLoadState("networkidle");
    await pageBella.waitForLoadState("networkidle");
    await pageMrw.screenshot({ path: path.join(EVID, "01_mrw_anthropic.png") });
    await pageBella.screenshot({ path: path.join(EVID, "02_bella_local.png") });

    // Write the proof as JSON too
    fs.writeFileSync(
      path.join(EVID, "per_user_catalog_proof.json"),
      JSON.stringify(
        {
          generated_at: new Date().toISOString(),
          mrw: { binding: diagMrw.llm.binding, model: diagMrw.llm.model },
          bella: { binding: diagBella.llm.binding, model: diagBella.llm.model },
          isolated: diagMrw.llm.model !== diagBella.llm.model,
        },
        null,
        2,
      ),
    );
  } finally {
    await ctxMrw.close();
    await ctxBella.close();
    await browser.close();
  }
});
