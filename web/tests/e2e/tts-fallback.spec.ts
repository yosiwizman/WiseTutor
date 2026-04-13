import { test, expect, chromium, type Page, type BrowserContext } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

/**
 * Phase 5 Slice 3B — Piper local TTS fallback tests.
 *
 * Drives the deterministic Piper seam (`window.__wt_test_tts_piper` +
 * `window.__wt_test_tts_piper_driver`). The seam is activated by setting
 * `__wt_test_tts = { supported: false }` (native TTS unsupported) AND
 * `__wt_test_tts_piper = { supported: true }`. The driver exposes
 * `emitStart()`, `emitEnd()`, `emitBackendError()`, and `lastText`.
 *
 * NOT covered here (intentionally): real audible Piper output — that is
 * Tier 3 until a human verifies audio on a device with Piper installed.
 * Piper binary is not installed on this machine; backend endpoint
 * `POST /api/v1/voice/synthesize` is wired but produces a 503 when the
 * binary is absent. Hosted CI only runs the deterministic seam.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

type PiperDriver = {
  emitStart: () => void;
  emitEnd: () => void;
  emitBackendError: () => void;
  lastText: string | null;
};

declare global {
  interface Window {
    __wt_test_tts: { supported: boolean };
    __wt_test_tts_piper: { supported: boolean };
    __wt_test_tts_piper_driver: PiperDriver | undefined;
    __wt_test_tts_driver: { emitStart: () => void; emitEnd: () => void; lastText: string | null } | undefined;
    __wt_test_speech: { supported: boolean };
    __wt_test_fallback: { supported: boolean };
  }
}

async function injectPiperSeam(page: Page) {
  await page.addInitScript(() => {
    // Force native TTS unsupported so the hook falls through to Piper.
    (window as Window).__wt_test_tts = { supported: false };
    // Declare Piper seam supported.
    (window as Window).__wt_test_tts_piper = { supported: true };
    // Keep STT/fallback seams dormant.
    (window as Window).__wt_test_speech = { supported: false };
    (window as Window).__wt_test_fallback = { supported: false };
  });
}

async function injectBothUnsupported(page: Page) {
  await page.addInitScript(() => {
    (window as Window).__wt_test_tts = { supported: false };
    (window as Window).__wt_test_tts_piper = { supported: false };
    (window as Window).__wt_test_speech = { supported: false };
    (window as Window).__wt_test_fallback = { supported: false };
  });
}

async function openHarnessWithPiper(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await injectPiperSeam(page);
  await page.goto(`${APP}/tts-harness`);
  await page.getByTestId("tts-harness-ready").waitFor({ state: "visible", timeout: 20000 });
  return page;
}

async function openHarnessWithBothUnsupported(ctx: BrowserContext) {
  const page = await ctx.newPage();
  await injectBothUnsupported(page);
  await page.goto(`${APP}/tts-harness`);
  await page.getByTestId("tts-harness-ready").waitFor({ state: "visible", timeout: 20000 });
  return page;
}

// ─── Test cases ────────────────────────────────────────────────────────────────

test("fallback: native unsupported + Piper seam supported → engine=piper-fallback, listen starts playback via fallback", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarnessWithPiper(ctx);
    const btn0 = page.getByTestId("assistant-tts-0");

    // Button must exist and report piper-fallback as engine.
    await expect(btn0).toBeVisible();
    await expect(btn0).toHaveAttribute("data-engine", "piper-fallback");
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");

    // Click → driver.emitStart → state should flip to speaking.
    await btn0.click();
    await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "speaking");

    // lastText must contain the first harness message body.
    const lastText = await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.lastText ?? null);
    expect(lastText).toContain("alpha message body");

    // driver.emitEnd → state returns to idle.
    await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.emitEnd());
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: toggle stops playback", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarnessWithPiper(ctx);
    const btn0 = page.getByTestId("assistant-tts-0");

    // First click starts.
    await btn0.click();
    await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "speaking");

    // Second click on the same button → hook cancel path → idle.
    await btn0.click();
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: single-active — speaking btn1 cancels btn0 without fatal", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarnessWithPiper(ctx);
    const btn0 = page.getByTestId("assistant-tts-0");
    const btn1 = page.getByTestId("assistant-tts-1");

    // Start btn0.
    await btn0.click();
    await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "speaking");

    // Click btn1 — should cancel btn0 and start btn1.
    await btn1.click();
    await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");
    await expect(btn1).toHaveAttribute("data-tts-state", "speaking");

    // lastText should now reflect the second harness message.
    const lastText = await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.lastText ?? null);
    expect(lastText).toContain("beta");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: backend error renders data-tts-state=error-generic", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarnessWithPiper(ctx);
    const btn0 = page.getByTestId("assistant-tts-0");

    await btn0.click();
    await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.emitBackendError());
    await expect(btn0).toHaveAttribute("data-tts-state", "error-generic");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: user-switched cleanup — active Piper playback cancels", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarnessWithPiper(ctx);
    const btn0 = page.getByTestId("assistant-tts-0");

    await btn0.click();
    await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.emitStart());
    await expect(btn0).toHaveAttribute("data-tts-state", "speaking");

    // Fire the user-switched event — hook must cancel.
    await page.evaluate(() => window.dispatchEvent(new Event("wt:user-switched")));
    await expect(btn0).toHaveAttribute("data-tts-state", "idle");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: no autoplay — rendering harness does not call Piper speak", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarnessWithPiper(ctx);

    // lastText must be null — no speak() call should have happened on render.
    const lastText = await page.evaluate(() => (window as Window).__wt_test_tts_piper_driver?.lastText ?? null);
    expect(lastText).toBeNull();
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("composition: both seams disabled → engine=unsupported; button hidden", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarnessWithBothUnsupported(ctx);

    // With both native and Piper unsupported, no TTS buttons should render.
    await expect(page.getByTestId("assistant-tts-0")).toHaveCount(0);
    await expect(page.getByTestId("assistant-tts-1")).toHaveCount(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
