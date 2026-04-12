"use client";

import { useCallback, useEffect, useState } from "react";
import { CircleCheck, CircleAlert, Loader2, RefreshCw, Info } from "lucide-react";

const API_BASE =
  (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_API_BASE as string)) ||
  "http://localhost:8001";

type Verified = { ok: boolean; at: string; error: string | null } | null;
type Diag = {
  llm?: { model?: string; binding?: string; provider_name?: string; base_url?: string; api_key_present?: boolean; last_verified?: Verified };
  embedding?: { model?: string; binding?: string; base_url?: string; api_key_present?: boolean; last_verified?: Verified };
  search?: { provider?: string; configured?: boolean; api_key_present?: boolean; fallback?: string };
  memory?: {
    status?: "clean" | "contaminated" | "unknown" | string;
    profile_chars?: number;
    summary_chars?: number;
    quarantined_generations?: number;
    identity_filter_active?: boolean;
    auto_refresh_enabled?: boolean;
    error?: string;
  };
  verify_cache?: Record<string, { ok: boolean; at: string; error: string | null }>;
};
type Model = { id: string; name: string; model: string };
type Profile = { id: string; name: string; binding: string; base_url: string; api_key?: string; models: Model[] };
type LLM = { active_profile_id: string | null; active_model_id: string | null; profiles: Profile[] };

export function RuntimeTruthPanel() {
  const [diag, setDiag] = useState<Diag | null>(null);
  const [llm, setLlm] = useState<LLM | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const [d, c] = await Promise.all([
        fetch(`${API_BASE}/api/v1/settings/diagnostics`).then((r) => r.json()),
        fetch(`${API_BASE}/api/v1/settings/catalog`).then((r) => r.json()),
      ]);
      setDiag(d);
      setLlm(c?.catalog?.services?.llm ?? null);
    } catch {}
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);

  async function verifyRow(profile_id: string, model_id: string) {
    const k = `llm:${profile_id}:${model_id}`;
    setBusy(k);
    try {
      await fetch(`${API_BASE}/api/v1/settings/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "llm", profile_id, model_id }),
      });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function verifyEmbedding() {
    setBusy("embedding");
    try {
      await fetch(`${API_BASE}/api/v1/settings/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "embedding" }),
      });
      await reload();
    } finally {
      setBusy(null);
    }
  }

  const activeLLM = diag?.llm;
  const activeProfile = llm?.profiles.find((p) => p.id === llm.active_profile_id) || null;

  const rowStatus = (profile_id: string, model_id: string): Verified => {
    const v = diag?.verify_cache?.[`llm:${profile_id}:${model_id}`];
    return v ? { ok: v.ok, at: v.at, error: v.error } : null;
  };

  return (
    <div className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold">Runtime Truth</h3>
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
            <Info size={11} /> from backend diagnostics — not model self-report
          </span>
        </div>
        <button onClick={reload} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)]/60 px-2 py-1 text-[11px] hover:bg-[var(--muted)]/30">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      {/* Active LLM summary */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] mb-4">
        <div className="text-[var(--muted-foreground)]">Active provider</div>
        <div className="font-mono">{activeProfile?.name} [{activeLLM?.binding ?? "—"}]</div>
        <div className="text-[var(--muted-foreground)]">Active model</div>
        <div className="font-mono">{activeLLM?.model ?? "—"}</div>
        <div className="text-[var(--muted-foreground)]">Base URL</div>
        <div className="font-mono truncate">{activeLLM?.base_url ?? "—"}</div>
        <div className="text-[var(--muted-foreground)]">API key</div>
        <div>{activeLLM?.api_key_present ? "present" : <span className="text-amber-600">missing</span>}</div>
        <div className="text-[var(--muted-foreground)]">Last LLM test</div>
        <div>
          {activeLLM?.last_verified ? (
            activeLLM.last_verified.ok ? (
              <span className="text-emerald-600">ok · {new Date(activeLLM.last_verified.at).toLocaleString()}</span>
            ) : (
              <span className="text-rose-600">failed · {new Date(activeLLM.last_verified.at).toLocaleTimeString()}</span>
            )
          ) : (
            <span className="text-amber-600">not yet verified</span>
          )}
        </div>
        <div className="text-[var(--muted-foreground)]">Last embedding test</div>
        <div>
          {diag?.embedding?.last_verified ? (
            diag.embedding.last_verified.ok ? (
              <span className="text-emerald-600">ok · {new Date(diag.embedding.last_verified.at).toLocaleTimeString()}</span>
            ) : (
              <span className="text-rose-600">failed · {new Date(diag.embedding.last_verified.at).toLocaleTimeString()}</span>
            )
          ) : (
            <span className="text-amber-600">not yet verified</span>
          )}
          <button onClick={verifyEmbedding} disabled={busy === "embedding"} className="ml-2 text-[11px] underline">verify</button>
        </div>
      </div>

      {/* Per-profile × per-model verification grid */}
      <div className="rounded-lg border border-[var(--border)]/60 divide-y divide-[var(--border)]/40 overflow-hidden">
        {(llm?.profiles ?? []).map((p) => (
          <div key={p.id} className="p-2">
            <div className="text-[12px] font-semibold mb-1">{p.name} <span className="text-[var(--muted-foreground)] font-normal">[{p.binding}]</span></div>
            <div className="grid gap-1">
              {p.models.map((m) => {
                const st = rowStatus(p.id, m.id);
                const k = `llm:${p.id}:${m.id}`;
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-md bg-[var(--background)]/50 px-2 py-1 text-[12px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`h-2 w-2 rounded-full ${!st ? "bg-amber-400" : st.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
                      <span className="font-mono truncate">{m.model}</span>
                      {st?.at && <span className="text-[10px] text-[var(--muted-foreground)]">{new Date(st.at).toLocaleTimeString()}</span>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {st && !st.ok && st.error && <span className="text-[10px] text-rose-600 truncate max-w-[260px]">{st.error}</span>}
                      <button
                        onClick={() => verifyRow(p.id, m.id)}
                        disabled={busy === k}
                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)]/60 px-2 py-0.5 text-[11px] hover:bg-[var(--muted)]/30"
                      >
                        {busy === k ? <Loader2 size={11} className="animate-spin" /> : st?.ok ? <CircleCheck size={11} className="text-emerald-600" /> : <CircleAlert size={11} />}
                        Verify
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Memory Health */}
      <div data-testid="memory-health" className="mt-4 rounded-lg border border-[var(--border)]/60 p-2 text-[12px]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold">Memory Health</span>
            <span
              className={
                "inline-flex items-center gap-1 rounded-full px-2 py-[2px] text-[10px] font-mono " +
                (diag?.memory?.status === "clean"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : diag?.memory?.status === "contaminated"
                  ? "bg-rose-500/10 text-rose-600"
                  : "bg-amber-400/10 text-amber-600")
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-current" />
              {diag?.memory?.status ?? "unknown"}
            </span>
            <span className="text-[10px] text-[var(--muted-foreground)]">
              identity filter: {diag?.memory?.identity_filter_active ? "on" : "off"} · auto-refresh:{" "}
              {diag?.memory?.auto_refresh_enabled ? "on" : "off"} · quarantined generations:{" "}
              {diag?.memory?.quarantined_generations ?? 0}
            </span>
          </div>
          <button
            onClick={async () => {
              if (!confirm("Quarantine PROFILE.md + SUMMARY.md and reset to clean?")) return;
              await fetch(`${API_BASE}/api/v1/settings/memory/quarantine`, { method: "POST" });
              await reload();
            }}
            className="rounded-md border border-[var(--border)]/60 px-2 py-0.5 text-[11px] hover:bg-[var(--muted)]/30"
          >
            Quarantine & reset
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="mt-4 rounded-lg border border-[var(--border)]/60 p-2 text-[12px]">
        <div className="flex items-center justify-between">
          <div>
            <span className="font-semibold">Search</span>{" "}
            <span className="text-[var(--muted-foreground)]">active: </span>
            <span className="font-mono">{diag?.search?.provider || "duckduckgo"}</span>
            {diag?.search?.provider === "brave" && !diag?.search?.api_key_present && (
              <span className="ml-2 text-amber-600">(Brave selected but no API key — falling back to DuckDuckGo)</span>
            )}
          </div>
          <div className="text-[11px] text-[var(--muted-foreground)]">
            Fallback: <span className="font-mono">{diag?.search?.fallback || "duckduckgo"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
