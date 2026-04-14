/* eslint-disable i18n/no-literal-ui-text */
/**
 * PDF INGESTION OVERHAUL v1 — UI proof.
 *
 * Proves, through the real shipped Knowledge upload UI (not a raw API
 * probe), that:
 *   1. a normal text-based PDF uploaded by Mr W reaches the backend
 *      pipeline, completes processing (live Ollama embedding on
 *      ai-desktop), and becomes visible in Mr W's per-user KB scope;
 *   2. encrypted / image-only / malformed PDFs are refused by the
 *      backend preflight and the user sees a readable, truthful error
 *      message in the UI error panel — NOT "[object Object]".
 *
 * Completion proof path: the upload action itself runs through the
 * real UI (file input + Upload button). Completion is verified via
 * the shipped /api/v1/knowledge/list read surface (raw_documents > 0
 * on the caller-owned KB) because the UI surfaces only stage/progress,
 * not a persistent per-document list today.
 *
 * Live-model requirement: this spec requires a real embedding provider
 * reachable at the backend's configured EMBEDDING_HOST (Ollama on
 * ai-desktop). Hosted CI has no embedding model and explicitly excludes
 * this project; it runs locally on ai-desktop only.
 */
import { test, expect, chromium, BrowserContext } from "@playwright/test";
import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";

const APP = process.env.DEEPTUTOR_APP || "http://localhost:3782";
const API = process.env.NEXT_PUBLIC_API_BASE || "http://localhost:8001";
const MRW_PIN = process.env.WT_MRW_PIN || "2468";
const EVID =
  process.env.EVIDENCE_DIR ||
  path.resolve(__dirname, "../../../artifacts/pdf_ingestion_ui/latest");

fs.mkdirSync(EVID, { recursive: true });

/** Build deterministic PDF fixtures once per file. Uses the repo venv's
 * PyMuPDF binding (same as the backend preflight). */
function buildFixtures(): {
  text: string;
  encrypted: string;
  imageOnly: string;
  malformed: string;
} {
  const dir = path.join(EVID, "fixtures");
  fs.mkdirSync(dir, { recursive: true });
  const py = "/home/ai-desktop/projects/WiseTutor/.venv/bin/python";
  const script = `
import fitz, sys
out = sys.argv[1]
# text
d = fitz.open()
for _ in range(2):
    p = d.new_page()
    p.insert_text((72,100), "The quick brown fox jumps over the lazy dog. " * 20, fontsize=11)
d.save(out + "/text.pdf"); d.close()
# encrypted
d = fitz.open(); p = d.new_page(); p.insert_text((72,100), "Secret body.", fontsize=11)
d.save(out + "/enc.pdf", encryption=fitz.PDF_ENCRYPT_AES_256, owner_pw="x", user_pw="x"); d.close()
# image-only
d = fitz.open(); p = d.new_page(); p.draw_rect(fitz.Rect(72,100,300,300), color=(0,0,0), fill=(1,1,1))
d.save(out + "/img.pdf"); d.close()
# malformed
open(out + "/bad.pdf","wb").write(b"%PDF-1.4\\nnot-a-real-pdf\\n%%EOF\\n")
`;
  execFileSync(py, ["-c", script, dir], { stdio: "pipe" });
  return {
    text: path.join(dir, "text.pdf"),
    encrypted: path.join(dir, "enc.pdf"),
    imageOnly: path.join(dir, "img.pdf"),
    malformed: path.join(dir, "bad.pdf"),
  };
}

async function apiLogin(ctx: BrowserContext, user_id: string, pin: string) {
  const r = await ctx.request.post(`${APP}/api/v1/users/switch`, {
    data: { user_id, pin },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`login ${user_id} → ${r.status()}`);
}

/** Seed an empty-ish KB via the shipped create endpoint (requires at
 * least one file). Returns the KB name. */
async function seedKb(ctx: BrowserContext, name: string): Promise<void> {
  const seed = path.join(EVID, "seed.txt");
  if (!fs.existsSync(seed)) fs.writeFileSync(seed, "seed content for ui proof\n");
  const form = new FormData();
  form.append("name", name);
  form.append("files", new Blob([fs.readFileSync(seed)], { type: "text/plain" }), "seed.txt");
  const r = await ctx.request.post(`${API}/api/v1/knowledge/create`, {
    multipart: {
      name,
      files: { name: "seed.txt", mimeType: "text/plain", buffer: fs.readFileSync(seed) },
    },
  });
  if (!r.ok()) throw new Error(`seedKb ${name} → ${r.status()} ${await r.text()}`);
  // Wait up to 60s for the KB to become "ready" in the list.
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const list = await ctx.request.get(`${API}/api/v1/knowledge/list`);
    const arr = (await list.json()) as Array<{ name: string; status?: string }>;
    const row = arr.find((k) => k.name === name);
    if (row?.status === "ready") return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`seedKb ${name} did not reach ready in 60s`);
}

async function getKbRawDocs(ctx: BrowserContext, name: string): Promise<number> {
  const list = await ctx.request.get(`${API}/api/v1/knowledge/list`);
  const arr = (await list.json()) as Array<{
    name: string;
    statistics?: { raw_documents?: number };
  }>;
  const row = arr.find((k) => k.name === name);
  return row?.statistics?.raw_documents ?? 0;
}

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const FIXTURES = buildFixtures();
const KB_NAME = `pdfui${Date.now().toString(36)}`;

test("seed KB exists and is ready", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    await seedKb(ctx, KB_NAME);
    expect(await getKbRawDocs(ctx, KB_NAME)).toBeGreaterThanOrEqual(1);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

test("UI upload of a normal text-based PDF completes and is visible in owner KB", async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const before = await getKbRawDocs(ctx, KB_NAME);

    const page = await ctx.newPage();
    await page.goto(`${APP}/knowledge`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("upload-target-select").selectOption(KB_NAME);
    await page.getByTestId("upload-file-input").setInputFiles(FIXTURES.text);
    await page.getByTestId("upload-submit").click();

    // Wait up to 90s for completion to register via the shipped read surface.
    const deadline = Date.now() + 90_000;
    let after = before;
    while (Date.now() < deadline) {
      after = await getKbRawDocs(ctx, KB_NAME);
      if (after > before) break;
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: path.join(EVID, "text_pdf_uploaded.png"), fullPage: true });
    expect(after).toBeGreaterThan(before);
    // Error panel must NOT be present for the successful path.
    await expect(page.getByTestId("upload-error")).toHaveCount(0);
  } finally {
    await ctx.close();
    await browser.close();
  }
});

async function assertErrorVisible(
  fixturePath: string,
  expectedCodeFragment: string,
  artifactName: string,
) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  try {
    await apiLogin(ctx, "mrw", MRW_PIN);
    const page = await ctx.newPage();
    await page.goto(`${APP}/knowledge`);
    await page.waitForLoadState("networkidle");
    await page.getByTestId("upload-target-select").selectOption(KB_NAME);
    await page.getByTestId("upload-file-input").setInputFiles(fixturePath);
    await page.getByTestId("upload-submit").click();

    const err = page.getByTestId("upload-error");
    await expect(err).toBeVisible({ timeout: 30_000 });
    const text = (await err.textContent())?.trim() ?? "";
    await page.screenshot({ path: path.join(EVID, artifactName), fullPage: true });
    // Truthfulness: readable, non-empty, NOT the [object Object] regression.
    expect(text).not.toBe("");
    expect(text.toLowerCase()).not.toContain("[object object]");
    // Contains the backend code or its human-readable message fragment.
    expect(text.toLowerCase()).toContain(expectedCodeFragment.toLowerCase());
  } finally {
    await ctx.close();
    await browser.close();
  }
}

test("UI upload of an encrypted PDF surfaces a readable error", async () => {
  // Backend shape: detail = {code: "encrypted_pdf_unsupported",
  //   message: "PDF is password-protected", ...}
  await assertErrorVisible(FIXTURES.encrypted, "password-protected", "encrypted_pdf_error.png");
});

test("UI upload of an image-only PDF surfaces a readable error", async () => {
  // Backend shape: detail = {code: "pdf_no_extractable_text",
  //   message: "PDF has N extractable chars ... — looks image-only or scanned", ...}
  await assertErrorVisible(FIXTURES.imageOnly, "image-only", "imageonly_pdf_error.png");
});

test("UI upload of a malformed PDF surfaces a readable error", async () => {
  // Backend shape: detail = {code: "malformed_pdf",
  //   message: "cannot open PDF: ...", ...}
  await assertErrorVisible(FIXTURES.malformed, "cannot open", "malformed_pdf_error.png");
});
