import { test, expect, chromium } from "@playwright/test";
import { signInAsMrW } from "./_auth_helper";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

test("connections: sidebar entry visible and navigates to /connections", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    const errors: string[] = [];
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await signInAsMrW(ctx, API);
    await page.goto(APP);
    await page.getByRole("link", { name: /connections/i }).click();
    await expect(page).toHaveURL(/\/connections$/);
    await expect(page.getByTestId("connections-page-ready")).toBeVisible();
    expect(errors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("connections: Gmail card renders with truthful 'Not available yet' status", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    const errors: string[] = [];
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await signInAsMrW(ctx, API);
    await page.goto(`${APP}/connections`);
    await page.getByTestId("connections-page-ready").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByTestId("connection-card-gmail")).toBeVisible();
    await expect(page.getByTestId("connection-card-gmail")).toHaveAttribute("data-status", "not-available");
    await expect(page.getByTestId("connection-card-gmail")).toContainText("Not available yet");
    await expect(page.getByTestId("connection-card-gmail")).toContainText("Gmail");
    expect(errors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("connections: Calendar card renders with truthful 'Not available yet' status", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    const errors: string[] = [];
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await signInAsMrW(ctx, API);
    await page.goto(`${APP}/connections`);
    await page.getByTestId("connections-page-ready").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByTestId("connection-card-gcal")).toBeVisible();
    await expect(page.getByTestId("connection-card-gcal")).toHaveAttribute("data-status", "not-available");
    await expect(page.getByTestId("connection-card-gcal")).toContainText("Not available yet");
    await expect(page.getByTestId("connection-card-gcal")).toContainText("Google Calendar");
    expect(errors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("connections: no Connect button exists on either card (fake-state guardrail)", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    const errors: string[] = [];
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await signInAsMrW(ctx, API);
    await page.goto(`${APP}/connections`);
    await page.getByTestId("connections-page-ready").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.getByTestId("connection-card-gmail").locator("button")).toHaveCount(0);
    await expect(page.getByTestId("connection-card-gcal").locator("button")).toHaveCount(0);
    expect(errors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("connections: no DeepTutor text and no broken pageerror on the connections page", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    const errors: string[] = [];
    const page = await ctx.newPage();
    page.on("pageerror", (err) => errors.push(err.message));
    await signInAsMrW(ctx, API);
    await page.goto(`${APP}/connections`);
    await page.getByTestId("connections-page-ready").waitFor({ state: "visible", timeout: 20_000 });
    await expect(page.locator("text=/DeepTutor/i")).toHaveCount(0);
    expect(errors).toHaveLength(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});
