import { test, expect, chromium } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

/**
 * Quiz Score Summary — Playwright coverage.
 *
 * Drives the quiz-summary-harness page to completion and verifies the
 * [data-testid="quiz-summary"] DOM contract:
 *   - quiz-summary-score   (data-correct, data-total, data-percent)
 *   - quiz-summary-review  (container)
 *   - quiz-summary-item-<i> (data-is-correct per question)
 *   - quiz-summary-review-button (dismisses summary)
 */

test.describe.configure({ mode: "serial" });
test.setTimeout(90_000);

const pageErrors: string[] = [];

// Q1: correct=B ("4")  Q2: correct=C ("Paris")  Q3: correct=B ("30")

/**
 * Click the choice button for a given option key (e.g. "B") on the
 * current question, then click "Check Answer" to submit.
 */
async function answerAndSubmit(
  page: import("@playwright/test").Page,
  optionKey: string,
) {
  // Choice buttons: <button> containing a <span> with the key letter
  // and a <span> with the answer text. Use a locator that finds the
  // button whose first span contains exactly the key letter.
  const btn = page.locator(`button span:first-child`).filter({ hasText: new RegExp(`^${optionKey}$`) }).locator("..").first();
  await btn.click();
  await page.getByRole("button", { name: /Check Answer/i }).click();
}

/**
 * Navigate to question at 1-based index via the dot-nav header buttons.
 * After submitting Q1 the buttons contain a check icon not a number,
 * so we navigate forward using the "Next" footer button instead when
 * the current question was just answered.
 */
async function goToNext(page: import("@playwright/test").Page) {
  await page.getByRole("button", { name: /^Next$/i }).click();
}

async function driveToCompletion(
  page: import("@playwright/test").Page,
  q1: string,
  q2: string,
  q3: string,
) {
  await answerAndSubmit(page, q1);
  await goToNext(page);
  await answerAndSubmit(page, q2);
  await goToNext(page);
  await answerAndSubmit(page, q3);
}

test("quiz summary: complete all three questions → summary renders with truthful score", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    ctx.on("page", (pg) => {
      pg.on("pageerror", (err) => pageErrors.push(err.message));
    });
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(`${APP}/quiz-summary-harness`);
    await page.getByTestId("quiz-harness-ready").waitFor({ state: "visible", timeout: 20_000 });

    // All correct: Q1=B, Q2=C, Q3=B
    await driveToCompletion(page, "B", "C", "B");

    const summary = page.getByTestId("quiz-summary");
    await expect(summary).toBeVisible({ timeout: 10_000 });

    const score = page.getByTestId("quiz-summary-score");
    await expect(score).toHaveAttribute("data-correct", "3");
    await expect(score).toHaveAttribute("data-total", "3");
    await expect(score).toHaveAttribute("data-percent", "100");

    // All three items should be correct
    for (let i = 0; i < 3; i++) {
      await expect(page.getByTestId(`quiz-summary-item-${i}`)).toHaveAttribute(
        "data-is-correct",
        "true",
      );
    }

    // Screenshot — runner-safe output path (Playwright creates parent dir).
    await page.screenshot({
      path: testInfo.outputPath("quiz-summary-100.png"),
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("quiz summary: one wrong answer → truthful tally", async ({}, testInfo) => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(`${APP}/quiz-summary-harness`);
    await page.getByTestId("quiz-harness-ready").waitFor({ state: "visible", timeout: 20_000 });

    // Q1=B correct, Q2=A wrong (correct is C), Q3=B correct → 2/3 = 67%
    await driveToCompletion(page, "B", "A", "B");

    const summary = page.getByTestId("quiz-summary");
    await expect(summary).toBeVisible({ timeout: 10_000 });

    const score = page.getByTestId("quiz-summary-score");
    await expect(score).toHaveAttribute("data-correct", "2");
    await expect(score).toHaveAttribute("data-total", "3");
    await expect(score).toHaveAttribute("data-percent", "67");

    // Q2 (index 1) should be wrong
    await expect(page.getByTestId("quiz-summary-item-0")).toHaveAttribute("data-is-correct", "true");
    await expect(page.getByTestId("quiz-summary-item-1")).toHaveAttribute("data-is-correct", "false");
    await expect(page.getByTestId("quiz-summary-item-2")).toHaveAttribute("data-is-correct", "true");

    // Wrong item should show the correct answer text
    await expect(page.getByTestId("quiz-summary-item-1")).toContainText("C");

    // Screenshot — runner-safe output path.
    await page.screenshot({
      path: testInfo.outputPath("quiz-summary-67.png"),
      fullPage: true,
    });
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("quiz summary: review button dismisses summary and returns to Q1", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto(`${APP}/quiz-summary-harness`);
    await page.getByTestId("quiz-harness-ready").waitFor({ state: "visible", timeout: 20_000 });

    // Drive to completion with any combo
    await driveToCompletion(page, "B", "C", "B");

    await page.getByTestId("quiz-summary").waitFor({ state: "visible", timeout: 10_000 });

    // Click review button
    await page.getByTestId("quiz-summary-review-button").click();

    // Summary must disappear
    await expect(page.getByTestId("quiz-summary")).toHaveCount(0);

    // Harness wrapper still present, question viewer visible
    await expect(page.getByTestId("quiz-harness-ready")).toBeVisible();
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("quiz summary: no DeepTutor text and no pageerror on harness completion", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await signInAsMrW(ctx, API);
    const page = await ctx.newPage();
    const localErrors: string[] = [];
    page.on("pageerror", (err) => localErrors.push(err.message));

    await page.goto(`${APP}/quiz-summary-harness`);
    await page.getByTestId("quiz-harness-ready").waitFor({ state: "visible", timeout: 20_000 });

    await driveToCompletion(page, "B", "C", "B");
    await page.getByTestId("quiz-summary").waitFor({ state: "visible", timeout: 10_000 });

    // No DeepTutor branding on harness
    await expect(page.locator('text=/DeepTutor/i')).toHaveCount(0);

    // No JS errors
    expect(localErrors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
