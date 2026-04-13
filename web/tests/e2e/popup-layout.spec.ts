import { ensureSignedIn } from "./_auth_helper";
/* eslint-disable i18n/no-literal-ui-text */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";

const API = process.env.DEEPTUTOR_API || "http://localhost:8001";
const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const EVID = process.env.EVIDENCE_DIR || path.resolve(__dirname, "../../../artifacts/popup_fix/latest");

fs.mkdirSync(EVID, { recursive: true });

async function setActive(page: Page, profile_id: string, model_id: string) {
  await ensureSignedIn(page, API);
  const r = await page.context().request.post(`${API}/api/v1/settings/active`, {
    data: { service: "llm", profile_id, model_id },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`setActive ${r.status()}`);
}

async function openPopup(page: Page) {
  const trig = page.getByTestId("runtime-badge-trigger");
  await trig.waitFor({ state: "visible", timeout: 15000 });
  await trig.click();
  const pop = page.getByTestId("runtime-badge-popup");
  await pop.waitFor({ state: "visible", timeout: 10000 });
  return pop;
}

async function assertFullyInViewport(page: Page) {
  const box = await page.getByTestId("runtime-badge-popup").boundingBox();
  const vp = page.viewportSize();
  if (!box || !vp) throw new Error("could not measure popup/viewport");
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
  // Sanity: the verify button (last element) must be inside viewport.
  const btn = page.getByTestId("runtime-badge-popup").getByRole("button", { name: /verify/i });
  const bb = await btn.first().boundingBox();
  if (!bb) throw new Error("verify button not found");
  expect(bb.y + bb.height).toBeLessThanOrEqual(vp.height);
}

test.describe.configure({ mode: "serial" });

const providerCases = [
  { file: "popup_open_openai_desktop.png",    label: "OpenAI",    profile: "llm-profile-openai",    model: "llm-model-openai-gpt54" },
  { file: "popup_open_anthropic_desktop.png", label: "Anthropic", profile: "llm-profile-anthropic", model: "llm-model-anthropic-opus46" },
  { file: "popup_open_ollama_desktop.png",    label: "Ollama",    profile: "llm-profile-ollama",    model: "llm-model-ollama-qwen72b" },
];

for (const c of providerCases) {
  test(`popup fits viewport — provider=${c.label}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await setActive(page, c.profile, c.model);
    await ensureSignedIn(page, API); await page.goto(APP);
    await page.waitForLoadState("networkidle");
    await openPopup(page);
    await assertFullyInViewport(page);
    await page.screenshot({ path: path.join(EVID, c.file), fullPage: false });
  });
}

const sizeCases = [
  { file: "popup_open_1280x900.png",  width: 1280, height: 900 },
  { file: "popup_open_1366x768.png",  width: 1366, height: 768 },
  { file: "popup_open_1440x900.png",  width: 1440, height: 900 },
];

for (const s of sizeCases) {
  test(`popup fits viewport — size=${s.width}x${s.height}`, async ({ page }) => {
    await page.setViewportSize({ width: s.width, height: s.height });
    await setActive(page, "llm-profile-openai", "llm-model-openai-gpt54");
    await ensureSignedIn(page, API); await page.goto(APP);
    await page.waitForLoadState("networkidle");
    await openPopup(page);
    await assertFullyInViewport(page);
    await page.screenshot({ path: path.join(EVID, s.file), fullPage: false });
  });
}
