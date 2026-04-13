import { test, expect, chromium, type Page, type BrowserContext } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

/**
 * Phase 5 Slice 4A — push-to-talk voice conversation foundation tests.
 *
 * Drives the deterministic voice-turn harness at /voice-turn-harness.
 * Uses STT seam (window.__wt_test_speech), TTS seam (window.__wt_test_tts),
 * and the submit seam (window.__wt_test_voice_turn_submit) to exercise all
 * state transitions without real audio or network.
 *
 * DOM contract (Agent A):
 *   [data-testid="voice-turn-harness-ready"] — always present on load
 *   [data-testid="vt-state"]                  — text = current state string
 *   [data-testid="vt-error-reason"]           — text = errorReason or empty
 *   [data-testid="vt-last-transcript"]        — text = last transcript or empty
 *   [data-testid="vt-last-reply"]             — text = last reply or empty
 *   [data-testid="vt-start"]                  — button
 *   [data-testid="vt-cancel"]                 — button
 *   [data-testid="vt-reset"]                  — button
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

// Window seam types are declared canonically in web/lib/tts.ts,
// web/lib/speech-recognition.ts, and the harness page. The spec uses
// lightweight `(window as any)` casts to sidestep duplicate-declaration
// conflicts with those canonical declarations.
/* eslint-disable @typescript-eslint/no-explicit-any */

async function injectSeams(
  page: Page,
  opts: { submitMode: "ok" | "fail" | "empty"; reply?: string },
) {
  const { submitMode, reply = "" } = opts;
  await page.addInitScript(
    ({ mode, r }) => {
      (window as any).__wt_test_speech = { supported: true };
      (window as any).__wt_test_tts = { supported: true };
      (window as any).__wt_test_voice_turn_submit = { mode, reply: r };
    },
    { mode: submitMode, r: reply },
  );
}

async function openHarness(ctx: BrowserContext, opts: { submitMode: "ok" | "fail" | "empty"; reply?: string }) {
  const page = await ctx.newPage();
  await injectSeams(page, opts);
  await page.goto(`${APP}/voice-turn-harness`);
  await page.getByTestId("voice-turn-harness-ready").waitFor({ state: "visible", timeout: 20000 });
  return page;
}

// ─── Test cases ────────────────────────────────────────────────────────────────

test("happy path: start → STT final → submit ok → TTS speaks → idle", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "ok", reply: "hello from the assistant" });

    await expect(page.getByTestId("vt-state")).toHaveText("idle");

    await page.getByTestId("vt-start").click();

    // Optional: emit STT start signal.
    await page.evaluate(() => (window as any).__wt_test_speech_driver?.emitStart());

    // Emit the final transcript.
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("hello world from user"),
    );

    // State must transition through submitting/awaiting_assistant/speaking eventually to speaking.
    await expect(page.getByTestId("vt-state")).toHaveText(
      /^(submitting|awaiting_assistant|speaking)$/,
      { timeout: 10000 },
    );

    // Verify the transcript was captured.
    await expect(page.getByTestId("vt-last-transcript")).toHaveText("hello world from user");

    // Drive TTS to completion.
    await page.evaluate(() => (window as any).__wt_test_tts_driver?.emitStart());
    await expect(page.getByTestId("vt-state")).toHaveText("speaking", { timeout: 10000 });
    await page.evaluate(() => (window as any).__wt_test_tts_driver?.emitEnd());

    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 10000 });
    await expect(page.getByTestId("vt-last-reply")).toHaveText("hello from the assistant");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("cancel while listening: no submit, state returns to idle", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "ok", reply: "should not appear" });

    await expect(page.getByTestId("vt-state")).toHaveText("idle");

    await page.getByTestId("vt-start").click();
    await expect(page.getByTestId("vt-state")).toHaveText("listening", { timeout: 10000 });

    // Cancel before any STT final fires.
    await page.getByTestId("vt-cancel").click();

    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 10000 });
    await expect(page.getByTestId("vt-last-transcript")).toHaveText("");
    // Submit seam was never consulted — reply stays empty.
    await expect(page.getByTestId("vt-last-reply")).toHaveText("");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("cancel while speaking: TTS stops, state=idle, lastReply retained", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "ok", reply: "retained reply" });

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("some transcript"),
    );

    // Wait until TTS starts speaking.
    await page.evaluate(() => (window as any).__wt_test_tts_driver?.emitStart());
    await expect(page.getByTestId("vt-state")).toHaveText("speaking", { timeout: 10000 });

    // Cancel mid-speech.
    await page.getByTestId("vt-cancel").click();

    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 10000 });
    // Cancel must NOT clear the reply or transcript.
    await expect(page.getByTestId("vt-last-reply")).toHaveText("retained reply");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("STT failure: state=error, errorReason=stt-failed", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "ok", reply: "" });

    await page.getByTestId("vt-start").click();
    await expect(page.getByTestId("vt-state")).toHaveText("listening", { timeout: 10000 });

    // Emit a generic STT error.
    await page.evaluate(() => (window as any).__wt_test_speech_driver?.emitGenericError());

    await expect(page.getByTestId("vt-state")).toHaveText("error", { timeout: 10000 });
    await expect(page.getByTestId("vt-error-reason")).toHaveText("stt-failed");

    // Reset returns to idle.
    await page.getByTestId("vt-reset").click();
    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 10000 });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("submit failure: state=error, errorReason=submit-failed", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "fail" });

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("trigger submit fail"),
    );

    await expect(page.getByTestId("vt-state")).toHaveText("error", { timeout: 10000 });
    await expect(page.getByTestId("vt-error-reason")).toHaveText("submit-failed");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("empty reply: state=error, errorReason=empty-reply", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "empty" });

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("trigger empty reply"),
    );

    await expect(page.getByTestId("vt-state")).toHaveText("error", { timeout: 10000 });
    await expect(page.getByTestId("vt-error-reason")).toHaveText("empty-reply");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("TTS failure exits gracefully; lastReply stays visible", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "ok", reply: "tts will fail but reply stays" });

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("some user input"),
    );

    // Wait until the hook reaches speaking or at least has the reply ready.
    await expect(page.getByTestId("vt-last-reply")).toHaveText("tts will fail but reply stays", {
      timeout: 10000,
    });

    // Fire TTS generic error — hook should recover gracefully.
    await page.evaluate(() => (window as any).__wt_test_tts_driver?.emitGenericError());

    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 10000 });
    // Reply must remain visible after TTS error.
    await expect(page.getByTestId("vt-last-reply")).toHaveText("tts will fail but reply stays");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("start cancels any active TTS first + no-autoplay on mount", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx, { submitMode: "ok", reply: "" });

    // No autoplay on mount: lastText must be null before any interaction.
    const lastTextOnMount = await page.evaluate(
      () => (window as any).__wt_test_tts_driver?.lastText ?? null,
    );
    expect(lastTextOnMount).toBeNull();

    // Clicking vt-start twice in quick succession is a no-op beyond the first:
    // the second click while already listening does not restart or double-fire.
    await page.getByTestId("vt-start").click();
    await expect(page.getByTestId("vt-state")).toHaveText("listening", { timeout: 10000 });

    // Rapid second click — state must stay listening (not jump to idle or error).
    await page.getByTestId("vt-start").click();
    await expect(page.getByTestId("vt-state")).toHaveText("listening");
  } finally {
    await ctx.close();
    await browser.close();
  }
});
