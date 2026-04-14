/**
 * quiz-real-path.spec.ts
 *
 * End-to-end test that drives the REAL quiz capability path:
 *   sign in → open workspace → pick Quiz Generation → submit prompt →
 *   wait for QuizViewer → answer all questions → assert quiz-summary renders.
 *
 * Hits real OpenAI (gpt-5.4). Not hermetic — do NOT add to CI.
 * Run locally: PW_SERIAL=1 WT_MRW_PIN=2468 DEEPTUTOR_APP=http://localhost:3782
 *              NEXT_PUBLIC_API_BASE=http://localhost:8001
 *              npx playwright test --project=quiz-real-path --reporter=list
 */

import { test, expect, chromium } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

/**
 * Answer the current question (choice OR written) then click "Check Answer".
 * For choice questions: clicks the first available option button.
 * For written questions: types a short answer into the textarea.
 */
async function answerAndSubmit(page: import("@playwright/test").Page) {
  // Detect question type: choice questions have a round letter-key button.
  const firstChoiceSpan = page
    .locator('button span:first-child')
    .filter({ hasText: /^[A-Da-d]$/ })
    .first();

  const isChoice = await firstChoiceSpan.isVisible({ timeout: 3_000 }).catch(() => false);

  if (isChoice) {
    // Click the parent button (the choice option).
    await firstChoiceSpan.locator("..").click({ timeout: 10_000 });
  } else {
    // Written question — type a short answer into the textarea.
    const ta = page.locator("textarea").first();
    await ta.fill("42", { timeout: 10_000 });
  }

  await page.getByRole("button", { name: /Check Answer/i }).click({ timeout: 10_000 });
}

test("real quiz path: generate -> answer all -> summary renders", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const pageErrors: string[] = [];

  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => pageErrors.push(err.message));

    // 1. Open the workspace.
    await page.goto(APP, { waitUntil: "domcontentloaded", timeout: 30_000 });

    // Wait for the composer to be ready (mic button or send button visible).
    await page.getByTestId("chat-composer-send").waitFor({
      state: "visible",
      timeout: 20_000,
    });

    // 2. Open the capability picker and select Quiz Generation (deep_question).
    await page.getByTestId("composer-cap-trigger").click({ timeout: 10_000 });
    // The menu item has data-testid="composer-cap-deep_question"
    await page.getByTestId("composer-cap-deep_question").click({ timeout: 10_000 });

    // 3. Type a short prompt.
    const textarea = page.getByTestId("chat-composer-input");
    await textarea.fill("Basic arithmetic for an eight year old, three questions");

    // 4. Send.
    const sendBtn = page.getByTestId("chat-composer-send");
    await expect(sendBtn).not.toBeDisabled({ timeout: 5_000 });
    await sendBtn.click();

    // 5. Wait for QuizViewer to appear. The header contains dot-nav buttons with
    //    the question index number (1, 2, 3). Wait for the "1" button meaning Q1
    //    is rendered. LLM generation can take 10-60s — use a generous timeout.
    //    We identify it by the "Check Answer" button which only exists inside QuizViewer.
    await page.getByRole("button", { name: /Check Answer/i }).waitFor({
      state: "visible",
      timeout: 120_000,
    });

    // 6. Determine how many questions were generated (up to dot-nav buttons).
    //    The nav buttons in the header show numbers like "1", "2", "3".
    //    We count them by looking for the numbered dot-nav buttons.
    // Count question-nav buttons: small round buttons showing a number (1, 2, ...)
    // in the QuizViewer header (h-6 w-6 rounded-full).
    // We'll answer questions until "Check Answer" is gone (summary replaces viewer).
    let questionCount = 0;
    const maxQuestions = 10;

    while (questionCount < maxQuestions) {
      const checkAnswerBtn = page.getByRole("button", { name: /Check Answer/i });
      const isVisible = await checkAnswerBtn.isVisible().catch(() => false);
      if (!isVisible) break; // summary already showing or no more questions

      await answerAndSubmit(page);
      questionCount++;

      // After answering, either:
      //   a) There's a "Next" button (more questions) → click it, or
      //   b) The summary renders (completedCount === total).
      const nextBtn = page.getByRole("button", { name: /^Next$/i });
      const summaryEl = page.getByTestId("quiz-summary");

      // Wait briefly for state to settle.
      await page.waitForTimeout(500);

      const summaryVisible = await summaryEl.isVisible().catch(() => false);
      if (summaryVisible) break;

      const nextVisible = await nextBtn.isVisible().catch(() => false);
      if (nextVisible) {
        const isDisabled = await nextBtn.isDisabled().catch(() => false);
        if (!isDisabled) {
          await nextBtn.click({ timeout: 5_000 });
        }
      }
    }

    // 7. Assert quiz-summary is visible.
    const summary = page.getByTestId("quiz-summary");
    await expect(summary).toBeVisible({ timeout: 15_000 });

    // 8. Assert quiz-summary-score has the three data attributes (any values).
    const score = page.getByTestId("quiz-summary-score");
    await expect(score).toBeVisible({ timeout: 5_000 });

    const dataCorrect = await score.getAttribute("data-correct");
    const dataTotal = await score.getAttribute("data-total");
    const dataPercent = await score.getAttribute("data-percent");

    expect(dataCorrect).not.toBeNull();
    expect(dataTotal).not.toBeNull();
    expect(dataPercent).not.toBeNull();
    // Totals must be numeric strings.
    expect(Number(dataTotal)).toBeGreaterThan(0);
    expect(Number(dataCorrect)).toBeGreaterThanOrEqual(0);
    expect(Number(dataPercent)).toBeGreaterThanOrEqual(0);

    // 9. No DeepTutor branding on the quiz page.
    await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);

    // 10. Screenshot — runner-safe output path.
    await page.screenshot({
      path: testInfo.outputPath("quiz-real-path-summary.png"),
      fullPage: true,
    });

    // 11. Fail if any JS errors fired during the test.
    expect(pageErrors, `Page JS errors: ${pageErrors.join("; ")}`).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
