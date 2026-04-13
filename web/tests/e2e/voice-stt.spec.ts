import { test, expect, chromium, type BrowserContext, type Page } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const MRW_PIN = process.env.WT_MRW_PIN || "1234";
const BELLA_PIN = process.env.WT_BELLA_PIN || "5678";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

/**
 * Inject the deterministic speech-recognition seam BEFORE app JS runs.
 * Setting `supported: true` makes the mic button active without a real
 * microphone; Playwright drives it via window.__wt_test_speech_driver.
 */
async function injectSpeechSeam(page: Page, supported: boolean) {
  await page.addInitScript((s) => {
    (window as unknown as { __wt_test_speech: { supported: boolean } }).__wt_test_speech = {
      supported: s,
    };
  }, supported);
}

async function switchTo(context: BrowserContext, userId: "mrw" | "bella", pin: string) {
  const r = await context.request.post(`${API}/api/v1/users/switch`, {
    data: { user_id: userId, pin },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`switch ${userId} failed: ${r.status()}`);
}

async function openComposer(page: Page) {
  await page.goto(APP);
  const mic = page.getByTestId("chat-composer-mic");
  await mic.waitFor({ state: "visible", timeout: 20000 });
  return mic;
}

test("Mr W: mic button inserts final transcript into composer", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectSpeechSeam(page, true);
    const mic = await openComposer(page);
    await expect(mic).toHaveAttribute("data-state", "idle");

    await mic.click();
    await expect(mic).toHaveAttribute("data-state", "listening");

    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitInterim("hello");
    });
    await expect(page.getByTestId("chat-composer-mic-status")).toHaveText(/hello/);

    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitFinal("hello Mr W");
      (window as any).__wt_test_speech_driver.emitEnd();
    });

    await expect(mic).toHaveAttribute("data-state", "idle");
    await expect(page.getByTestId("chat-composer-input")).toHaveValue("hello Mr W");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Mr W: existing draft is preserved; transcript appends with space separator", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectSpeechSeam(page, true);
    const mic = await openComposer(page);
    const input = page.getByTestId("chat-composer-input");
    await input.fill("draft:");
    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitFinal("spoken tail");
      (window as any).__wt_test_speech_driver.emitEnd();
    });
    await expect(input).toHaveValue("draft: spoken tail");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Bella: mic button works and inserts transcript for a child user", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await switchTo(ctx, "bella", BELLA_PIN);
    const page = await ctx.newPage();
    await injectSpeechSeam(page, true);
    const mic = await openComposer(page);
    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitFinal("Bella speaking");
      (window as any).__wt_test_speech_driver.emitEnd();
    });
    await expect(page.getByTestId("chat-composer-input")).toHaveValue("Bella speaking");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Two contexts do not leak transcript or listening state across users", async () => {
  const browser = await chromium.launch();
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  try {
    await signInAsMrW(ctxA, API);
    await switchTo(ctxB, "bella", BELLA_PIN);
    const pageA = await ctxA.newPage();
    const pageB = await ctxB.newPage();
    await injectSpeechSeam(pageA, true);
    await injectSpeechSeam(pageB, true);
    await openComposer(pageA);
    await openComposer(pageB);

    await pageA.getByTestId("chat-composer-mic").click();
    await pageA.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitFinal("alpha only");
      (window as any).__wt_test_speech_driver.emitEnd();
    });

    await expect(pageA.getByTestId("chat-composer-input")).toHaveValue("alpha only");
    await expect(pageB.getByTestId("chat-composer-input")).toHaveValue("");
    await expect(pageB.getByTestId("chat-composer-mic")).toHaveAttribute("data-state", "idle");
  } finally {
    await ctxA.close();
    await ctxB.close();
    await browser.close();
  }
});

test("Permission denied renders a visible error state; composer untouched", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectSpeechSeam(page, true);
    const mic = await openComposer(page);
    await mic.click();
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitPermissionDenied();
    });
    await expect(mic).toHaveAttribute("data-state", "error-permission");
    const status = page.getByTestId("chat-composer-mic-status");
    await expect(status).toHaveAttribute("data-status-kind", "permission");
    await expect(page.getByTestId("chat-composer-input")).toHaveValue("");
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Unsupported browser: mic button is disabled and shows an explanatory message", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectSpeechSeam(page, false);
    const mic = await openComposer(page);
    await expect(mic).toBeDisabled();
    await expect(mic).toHaveAttribute("data-supported", "false");
    await expect(page.getByTestId("chat-composer-mic-status")).toHaveAttribute(
      "data-status-kind",
      "unsupported",
    );
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("Stop button mid-listen cancels cleanly; composer reflects whatever final arrived", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    await injectSpeechSeam(page, true);
    const mic = await openComposer(page);
    await mic.click();
    await expect(mic).toHaveAttribute("data-state", "listening");
    await page.evaluate(() => {
      (window as any).__wt_test_speech_driver.emitInterim("will be cancelled");
    });
    await mic.click(); // user taps stop
    await expect(mic).toHaveAttribute("data-state", "idle");
    // interim never promoted to final; composer stays empty
    await expect(page.getByTestId("chat-composer-input")).toHaveValue("");
  } finally {
    await ctx.close();
    await browser.close();
  }
});
