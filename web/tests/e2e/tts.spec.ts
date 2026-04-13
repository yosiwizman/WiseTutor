import { test, expect, chromium, type Page, type BrowserContext } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

/**
 * Phase 5 Slice 3A — browser-native TTS foundation tests.
 *
 * Drives the deterministic TTS seam (`window.__wt_test_tts`). The seam
 * replaces the real SpeechSynthesis API so the test never depends on an
 * audio device and never races against the real speech engine.
 *
 * NOT covered by this spec (intentionally): real audible browser TTS
 * output — that is a Tier 3 observation until a human verifies audio
 * on a real device.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

async function injectTtsSeam(page: Page, supported: boolean) {
  await page.addInitScript((s) => {
    (window as unknown as { __wt_test_tts: { supported: boolean } }).__wt_test_tts = {
      supported: s,
    };
    // Also disable the STT seam so existing voice code stays dormant.
    (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
      supported: false,
    };
    (window as unknown as { __wt_test_fallback: { supported: boolean } }).__wt_test_fallback = {
      supported: false,
    };
  }, supported);
}

/**
 * Seed a fake assistant message into the rendered chat without going
 * through the WS pipeline. We do this by reading and writing the
 * react-query / session store is invasive — instead we just POST a
 * dummy user message, wait for the empty-state to disappear, and then
 * inject a rendered message via the DOM. But the simplest deterministic
 * path is: render a message by exposing a test-only window hook.
 *
 * We avoid adding such a hook. Instead we drive the full app and rely
 * on the existing `assistant-actions-*` DOM signature to appear after
 * a real assistant reply. Since that requires an LLM, for the TTS seam
 * tests we mount a minimal standalone page that renders the action row
 * directly — see web/app/(workspace)/tts-harness/page.tsx.
 */

async function openHarness(ctx: BrowserContext, supported: boolean) {
  const page = await ctx.newPage();
  await injectTtsSeam(page, supported);
  await page.goto(`${APP}/tts-harness`);
  await page.getByTestId("tts-harness-ready").waitFor({ state: "visible", timeout: 20000 });
  return page;
}

test("supported: listen control appears and starts speech; stop cancels", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, true);
    const btn0 = page.getByTestId("assistant-tts-0");
    await expect(btn0).toBeVisible();
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");

    await btn0.click();
    await page.evaluate(() => window.__wt_test_tts_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "speaking");

    // Payload confirmation via the seam's recorded lastText.
    const spoken = await page.evaluate(() => window.__wt_test_tts_driver?.lastText);
    expect(spoken).toContain("alpha message body");

    // Toggle same button → cancels.
    await btn0.click();
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("single-active-utterance: speaking a new message cancels the previous", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, true);
    const btn0 = page.getByTestId("assistant-tts-0");
    const btn1 = page.getByTestId("assistant-tts-1");

    await btn0.click();
    await page.evaluate(() => window.__wt_test_tts_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "speaking");

    await btn1.click();
    await page.evaluate(() => window.__wt_test_tts_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");
    await expect(btn1).toHaveAttribute("data-tts-state", "speaking");

    const spoken = await page.evaluate(() => window.__wt_test_tts_driver?.lastText);
    expect(spoken).toContain("beta message body");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("unsupported: listen control is hidden entirely", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, false);
    await expect(page.getByTestId("assistant-tts-0")).toHaveCount(0);
    await expect(page.getByTestId("assistant-tts-1")).toHaveCount(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("no-autoplay: rendering assistant messages does not call speak()", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, true);
    // lastText must remain null until the user explicitly clicks.
    const spoken = await page.evaluate(() => window.__wt_test_tts_driver?.lastText ?? null);
    expect(spoken).toBeNull();
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("cleanup: wt:user-switched cancels the active utterance", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, true);
    const btn0 = page.getByTestId("assistant-tts-0");

    await btn0.click();
    await page.evaluate(() => window.__wt_test_tts_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "speaking");

    await page.evaluate(() => window.dispatchEvent(new Event("wt:user-switched")));
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");
  } finally {
    await ctx.close();
    await browser.close();
  }
});
