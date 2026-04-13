import type { BrowserContext, Page } from "@playwright/test";

/** Sign a context in as Mr W so subsequent page loads bypass the UserGate. */
export async function signInAsMrW(context: BrowserContext, apiBase: string) {
  const pin = process.env.WT_MRW_PIN || "1234";
  const r = await context.request.post(`${apiBase}/api/v1/users/switch`, {
    data: { user_id: "mrw", pin },
    headers: { "Content-Type": "application/json" },
  });
  if (!r.ok()) throw new Error(`signInAsMrW failed: ${r.status()}`);
}

export async function ensureSignedIn(page: Page, apiBase: string) {
  await signInAsMrW(page.context(), apiBase);
}
