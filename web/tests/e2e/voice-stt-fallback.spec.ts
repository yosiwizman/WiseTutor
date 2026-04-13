import { test, expect, chromium, type Page } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const BELLA_PIN = process.env.WT_BELLA_PIN || "5678";

/**
 * Phase 5 Slice 2 — Whisper local fallback UI wiring tests.
 *
 * These tests force the browser-native Web Speech adapter to report
 * unsupported and enable the Whisper fallback deterministic seam. The
 * fallback adapter path is then driven by window.__wt_test_fallback_driver
 * instead of real MediaRecorder + backend round-trip. This proves the
 * engine-selection, append, error, and cleanup logic without any real
 * audio or model.
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

async function injectFallbackOnly(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
      supported: false,
    };
    (window as unknown as { __wt_test_fallback: { supported: boolean } }).__wt_test_fallback = {
      supported: true,
    };
  });
}

async function openComposer(page: Page) {
  await page.goto(APP);
  const mic = page.getByTestId("chat-composer-mic");
  await mic.waitFor({ state: "visible", timeout: 20000 });
  return mic;
}

test("fallback: browser-native unsupported but Whisper fallback active; transcript appends", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectFallbackOnly(page);
    const mic = await openComposer(page);
    await expect(mic).toHaveAttribute("data-engine", "whisper-fallback");
    await expect(mic).toHaveAttribute("data-supported", "true");
    await expect(mic).toBeEnabled();

    await mic.click();
    await expect(mic).toHaveAttribute("data-state", "listening");

    await page.evaluate(() => {
      (window as any).__wt_test_fallback_driver.emitFinal("fallback transcript one");
      (window as any).__wt_test_fallback_driver.emitEnd();
    });

    await expect(mic).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("chat-composer-input")).toHaveValue(
      "fallback transcript one",
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: does not auto-send", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectFallbackOnly(page);
    const mic = await openComposer(page);

    // Fail the test if any chat-submit WebSocket frame is sent.
    const wsFrames: string[] = [];
    page.on("websocket", (ws) => {
      ws.on("framesent", (f) => wsFrames.push(String(f.payload || "")));
    });

    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_fallback_driver.emitFinal("should stay as draft");
      (window as any).__wt_test_fallback_driver.emitEnd();
    });

    await expect(page.getByTestId("chat-composer-input")).toHaveValue("should stay as draft");
    // No submit-shaped frame should have been sent. Chat WS frames use
    // {"type":"message"} or {"type":"start_turn"}; ping/pong and other
    // connection traffic is fine.
    const submitFrames = wsFrames.filter(
      (p) => p.includes('"type":"message"') || p.includes('"type":"start_turn"'),
    );
    expect(submitFrames, `unexpected submit frames: ${submitFrames.join(" | ")}`).toHaveLength(
      0,
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: backend error renders visible error state; composer untouched", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectFallbackOnly(page);
    const mic = await openComposer(page);

    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_fallback_driver.emitBackendError();
    });

    await expect(mic).toHaveAttribute("data-state", "error-generic");
    await expect(page.getByTestId("chat-composer-input")).toHaveValue("");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: user-switched event stops the fallback adapter and clears interim", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectFallbackOnly(page);
    const mic = await openComposer(page);

    await mic.click();
    await expect(mic).toHaveAttribute("data-state", "listening");
    await page.evaluate(() => window.dispatchEvent(new Event("wt:user-switched")));
    await expect(mic).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("chat-composer-input")).toHaveValue("");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("failover: native generic error rebinds to Whisper fallback; next click transcribes via fallback", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    // Native supported + fallback supported. We will force a native
    // runtime error and assert the engine rebinds.
    await page.addInitScript(() => {
      (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
        supported: true,
      };
      (window as unknown as { __wt_test_fallback: { supported: boolean } }).__wt_test_fallback = {
        supported: true,
      };
    });
    const mic = await openComposer(page);
    await expect(mic).toHaveAttribute("data-engine", "browser-native");
    await expect(mic).toHaveAttribute("data-failed-over", "false");

    await mic.click();
    await expect(mic).toHaveAttribute("data-state", "listening");
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitGenericError();
    });

    // Recovered: engine rebound, state cleared to idle, flag flipped.
    await expect(mic).toHaveAttribute("data-engine", "whisper-fallback");
    await expect(mic).toHaveAttribute("data-failed-over", "true");
    await expect(mic).toHaveAttribute("data-state", "idle");
    await expect(mic).toBeEnabled();

    // Next click drives the fallback seam and appends the transcript.
    await mic.click();
    await expect(mic).toHaveAttribute("data-state", "listening");
    await page.evaluate(() => {
      (window as any).__wt_test_fallback_driver.emitFinal("recovered via fallback");
      (window as any).__wt_test_fallback_driver.emitEnd();
    });
    await expect(page.getByTestId("chat-composer-input")).toHaveValue(
      "recovered via fallback",
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("failover: no auto-send after native→fallback rebind", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
        supported: true,
      };
      (window as unknown as { __wt_test_fallback: { supported: boolean } }).__wt_test_fallback = {
        supported: true,
      };
    });
    const mic = await openComposer(page);

    const wsFrames: string[] = [];
    page.on("websocket", (ws) => {
      ws.on("framesent", (f) => wsFrames.push(String(f.payload || "")));
    });

    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitGenericError();
    });
    await expect(mic).toHaveAttribute("data-engine", "whisper-fallback");

    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_fallback_driver.emitFinal("post-failover draft");
      (window as any).__wt_test_fallback_driver.emitEnd();
    });

    await expect(page.getByTestId("chat-composer-input")).toHaveValue("post-failover draft");
    const submitFrames = wsFrames.filter(
      (p) => p.includes('"type":"message"') || p.includes('"type":"start_turn"'),
    );
    expect(submitFrames, `unexpected submit frames: ${submitFrames.join(" | ")}`).toHaveLength(
      0,
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("failover: permission-denied on native does NOT fall back; stays a terminal permission error", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
        supported: true,
      };
      (window as unknown as { __wt_test_fallback: { supported: boolean } }).__wt_test_fallback = {
        supported: true,
      };
    });
    const mic = await openComposer(page);
    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitPermissionDenied();
    });
    await expect(mic).toHaveAttribute("data-state", "error-permission");
    await expect(mic).toHaveAttribute("data-engine", "browser-native");
    await expect(mic).toHaveAttribute("data-failed-over", "false");
    await expect(page.getByTestId("chat-composer-mic-status")).toHaveAttribute(
      "data-status-kind",
      "permission",
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("failover: fires at most once per mount (subsequent fallback generic error does not loop)", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
        supported: true,
      };
      (window as unknown as { __wt_test_fallback: { supported: boolean } }).__wt_test_fallback = {
        supported: true,
      };
    });
    const mic = await openComposer(page);

    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitGenericError();
    });
    await expect(mic).toHaveAttribute("data-engine", "whisper-fallback");

    // Now drive the fallback into a backend error — should surface as a
    // visible error, NOT swap back to native, NOT loop.
    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_fallback_driver.emitBackendError();
    });
    await expect(mic).toHaveAttribute("data-state", "error-generic");
    await expect(mic).toHaveAttribute("data-engine", "whisper-fallback");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("fallback: both engines unsupported keeps button disabled with unsupported message", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
        supported: false,
      };
      (window as unknown as { __wt_test_fallback: { supported: boolean } }).__wt_test_fallback =
        { supported: false };
    });
    const mic = await openComposer(page);
    await expect(mic).toHaveAttribute("data-engine", "unsupported");
    await expect(mic).toBeDisabled();
    await expect(page.getByTestId("chat-composer-mic-status")).toHaveAttribute(
      "data-status-kind",
      "unsupported",
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});
