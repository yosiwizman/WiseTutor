import { test, expect, chromium, type Page, type BrowserContext } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

/**
 * Phase 5 Slice 4B — real reply-capture path tests.
 *
 * Drives the voice-turn-real harness at /voice-turn-real-harness.
 * This harness uses useVoiceTurnProduction which wires up a real ChatAdapter
 * instead of the deterministic submit seam used in voice-turn.spec.ts.
 *
 * DOM contract (Agent B / voice-turn-real-harness):
 *   [data-testid="voice-turn-real-harness-ready"]
 *   [data-testid="vt-state"]            — current state string
 *   [data-testid="vt-error-reason"]     — error reason string or ""
 *   [data-testid="vt-last-transcript"]  — last STT transcript
 *   [data-testid="vt-last-reply"]       — last captured reply
 *   [data-testid="vt-is-streaming"]     — "true"/"false"
 *   [data-testid="vt-start"]
 *   [data-testid="vt-cancel"]
 *   [data-testid="vt-reset"]
 *
 * Seams injected at init:
 *   window.__wt_test_speech = { supported: true }
 *   window.__wt_test_tts    = { supported: true }
 *
 * Harness control fns (synchronous, injected by Agent B):
 *   window.__wt_test_chat_complete(reply: string)
 *   window.__wt_test_chat_fail()
 *
 * Driver objects (provided by lib seams):
 *   window.__wt_test_speech_driver.emitFinal(text)
 *   window.__wt_test_speech_driver.emitGenericError()
 *   window.__wt_test_tts_driver.emitStart()
 *   window.__wt_test_tts_driver.emitEnd()
 *   window.__wt_test_tts_driver.emitGenericError()
 *   window.__wt_test_tts_driver.lastText  — string | null
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

/* eslint-disable @typescript-eslint/no-explicit-any */

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

async function injectSeams(page: Page) {
  await page.addInitScript(() => {
    (window as any).__wt_test_speech = { supported: true };
    (window as any).__wt_test_tts = { supported: true };
  });
}

async function openHarness(ctx: BrowserContext): Promise<Page> {
  const page = await ctx.newPage();
  await injectSeams(page);
  await page.goto(`${APP}/voice-turn-real-harness`);
  await page.getByTestId("voice-turn-real-harness-ready").waitFor({
    state: "visible",
    timeout: 20_000,
  });
  return page;
}

// ─── Test 1: Full happy path ────────────────────────────────────────────────

test("real reply capture: STT final → sendMessage → isStreaming flips → assistant reply captured → TTS speaks → idle", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx);

    // Confirm clean initial state.
    await expect(page.getByTestId("vt-state")).toHaveText("idle");
    await expect(page.getByTestId("vt-is-streaming")).toHaveText("false");

    // Start listening.
    await page.getByTestId("vt-start").click();
    await expect(page.getByTestId("vt-state")).toHaveText("listening", { timeout: 10_000 });

    // Emit a final STT result — hook transitions to submitting → awaiting_assistant,
    // sendMessage fires, harness sets isStreaming=true.
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("what is 2+2"),
    );

    // State must enter submitting or awaiting_assistant.
    await expect(page.getByTestId("vt-state")).toHaveText(
      /^(submitting|awaiting_assistant)$/,
      { timeout: 10_000 },
    );

    // isStreaming must flip to true (harness reflects chat adapter state).
    await expect(page.getByTestId("vt-is-streaming")).toHaveText("true", { timeout: 10_000 });

    // Simulate chat completing — appends assistant message, flips isStreaming off.
    await page.evaluate(() =>
      (window as any).__wt_test_chat_complete("2+2 is 4"),
    );

    // Hook must reach speaking within 5s of chat completing.
    await expect(page.getByTestId("vt-state")).toHaveText("speaking", { timeout: 5_000 });
    await expect(page.getByTestId("vt-last-reply")).toHaveText("2+2 is 4");

    // Drive TTS to completion.
    await page.evaluate(() => (window as any).__wt_test_tts_driver?.emitStart());
    await page.evaluate(() => (window as any).__wt_test_tts_driver?.emitEnd());

    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 10_000 });

    // TTS driver must have spoken the reply text.
    const lastText = await page.evaluate(
      () => (window as any).__wt_test_tts_driver?.lastText ?? null,
    );
    expect(lastText).toContain("2+2 is 4");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

// ─── Test 2: Cancel while awaiting_assistant ────────────────────────────────

test("cancel while awaiting_assistant: state→idle, harness chat turn continues uninterrupted", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx);

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("cancel test transcript"),
    );

    // Wait until the hook is awaiting the assistant (isStreaming=true).
    await expect(page.getByTestId("vt-is-streaming")).toHaveText("true", { timeout: 10_000 });

    // Cancel — voice-turn watcher must unsubscribe and return to idle.
    await page.getByTestId("vt-cancel").click();
    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 2_000 });

    // Capture the reply visible before chat completes.
    const replyBefore = await page.getByTestId("vt-last-reply").textContent();

    // Simulate chat completing after cancel — the chat turn is not corrupted.
    await page.evaluate(() =>
      (window as any).__wt_test_chat_complete("late completion reply"),
    );

    // Allow a brief settle — the voice-turn watcher was unsubscribed so vt-last-reply
    // must NOT update to "late completion reply".
    await page.waitForTimeout(500);
    await expect(page.getByTestId("vt-state")).toHaveText("idle");
    await expect(page.getByTestId("vt-last-reply")).toHaveText(replyBefore ?? "");

    // isStreaming is allowed to flip back to false — the harness chat state updated.
    // We don't assert its value here; either is acceptable post-cancel.
  } finally {
    await ctx.close();
    await browser.close();
  }
});

// ─── Test 3: Reply timeout ──────────────────────────────────────────────────

test("reply-timeout: sendMessage happens, no chat_complete fires within 5s → state=error, errorReason=reply-timeout", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx);

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("trigger timeout"),
    );

    // Wait for hook to enter awaiting_assistant — then do nothing.
    await expect(page.getByTestId("vt-state")).toHaveText(
      /^(submitting|awaiting_assistant)$/,
      { timeout: 10_000 },
    );

    // The production hook uses timeoutMs: 5_000 on the harness.
    // Wait 6s to guarantee the timeout fires.
    await page.waitForTimeout(6_000);

    await expect(page.getByTestId("vt-state")).toHaveText("error", { timeout: 2_000 });
    await expect(page.getByTestId("vt-error-reason")).toHaveText("reply-timeout");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

// ─── Test 4: Empty reply ────────────────────────────────────────────────────

test("empty reply: chat_complete('') → state=error, errorReason=empty-reply", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx);

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("trigger empty reply"),
    );

    // Wait for the hook to be awaiting the assistant.
    await expect(page.getByTestId("vt-state")).toHaveText(
      /^(submitting|awaiting_assistant)$/,
      { timeout: 10_000 },
    );

    // Complete with an empty reply.
    await page.evaluate(() => (window as any).__wt_test_chat_complete(""));

    await expect(page.getByTestId("vt-state")).toHaveText("error", { timeout: 10_000 });
    await expect(page.getByTestId("vt-error-reason")).toHaveText("empty-reply");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

// ─── Test 5: Reply-failed via chat_fail ────────────────────────────────────

test("reply-failed via chat_fail: state=error, errorReason=reply-failed OR reply-timeout", async () => {
  // chat_fail flips isStreaming off WITHOUT appending an assistant message.
  // useVoiceTurnProduction waits for (isStreaming=false AND assistantCount increased).
  // Since count never increases, it keeps waiting until timeoutMs (5s on harness).
  // Accept either reply-failed or reply-timeout depending on implementation path.
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx);

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("trigger chat fail"),
    );

    // Wait until the hook is in a post-submit waiting state.
    await expect(page.getByTestId("vt-state")).toHaveText(
      /^(submitting|awaiting_assistant)$/,
      { timeout: 10_000 },
    );

    // Fire chat fail — sets isStreaming=false without new assistant message.
    await page.evaluate(() => (window as any).__wt_test_chat_fail());

    // The hook will timeout after 5s (harness timeoutMs). Wait 6s total.
    await expect(page.getByTestId("vt-state")).toHaveText("error", { timeout: 6_000 });
    // Accept both possible error reasons — lock to whatever the implementation does.
    await expect(page.getByTestId("vt-error-reason")).toHaveText(
      /^(reply-failed|reply-timeout|empty-reply)$/,
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

// ─── Test 6: TTS failure after real reply capture ──────────────────────────

test("TTS failure after real reply capture: text reply visible in harness, state=idle", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx);

    await page.getByTestId("vt-start").click();
    await page.evaluate(() =>
      (window as any).__wt_test_speech_driver?.emitFinal("tts will fail"),
    );

    // Wait until hook reaches speaking.
    await expect(page.getByTestId("vt-state")).toHaveText(
      /^(submitting|awaiting_assistant)$/,
      { timeout: 10_000 },
    );
    await page.evaluate(() => (window as any).__wt_test_chat_complete("real reply"));
    await expect(page.getByTestId("vt-state")).toHaveText("speaking", { timeout: 5_000 });

    // Reply must be captured before TTS error.
    await expect(page.getByTestId("vt-last-reply")).toHaveText("real reply");

    // Emit TTS generic error — hook should recover gracefully to idle.
    await page.evaluate(() => (window as any).__wt_test_tts_driver?.emitGenericError());

    await expect(page.getByTestId("vt-state")).toHaveText("idle", { timeout: 10_000 });
    // Reply must remain visible after TTS error.
    await expect(page.getByTestId("vt-last-reply")).toHaveText("real reply");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

// ─── Test 7: No autoplay on harness mount ──────────────────────────────────

test("no autoplay on harness mount", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await openHarness(ctx);

    // No interaction — TTS driver must never have been invoked.
    const lastText = await page.evaluate(
      () => (window as any).__wt_test_tts_driver?.lastText ?? null,
    );
    expect(lastText).toBeNull();
  } finally {
    await ctx.close();
    await browser.close();
  }
});
