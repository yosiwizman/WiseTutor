"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRound, Save } from "lucide-react";

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_API_BASE as string)) || "http://localhost:8001";

type ActiveUser = { id: string; display_name: string; role: string };
type Prefs = {
  tone?: string;
  response_length?: string;
  safety_profile?: string;
  allowed_capabilities?: string[];
  display_name_override?: string | null;
};

const TONES = ["short", "direct", "friendly", "warm", "formal"];
const LENGTHS = ["short", "medium", "long"];
const SAFETY = ["standard", "child"];

export function PreferencesPanel() {
  const [user, setUser] = useState<ActiveUser | null>(null);
  const [prefs, setPrefs] = useState<Prefs>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<"idle" | "ok" | "error">("idle");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const ru = await fetch(`${API_BASE}/api/v1/users/active`, { credentials: "include" });
      if (!ru.ok) return;
      const u = (await ru.json()) as ActiveUser;
      setUser(u);
      const rp = await fetch(`${API_BASE}/api/v1/users/${u.id}/preferences`, { credentials: "include" });
      if (rp.ok) {
        setPrefs(((await rp.json()) as { preferences: Prefs }).preferences || {});
      }
    } catch (e: any) {
      setErr(e?.message || "load failed");
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    if (!user) return;
    setBusy(true);
    setErr(null);
    setSaved("idle");
    try {
      const r = await fetch(`${API_BASE}/api/v1/users/${user.id}/preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(prefs),
      });
      if (!r.ok) {
        setErr(`save ${r.status}`);
        setSaved("error");
        return;
      }
      const j = (await r.json()) as { preferences: Prefs };
      setPrefs(j.preferences);
      setSaved("ok");
      setTimeout(() => setSaved("idle"), 2000);
    } finally {
      setBusy(false);
    }
  }

  if (!user) return null;

  return (
    <div
      data-testid="preferences-panel"
      className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold">Preferences</h3>
          <span
            data-testid="preferences-editing-as"
            className="inline-flex items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--background)] px-2 py-[2px] text-[11px] font-mono"
          >
            <UserRound size={11} /> editing as {user.display_name} ({user.role})
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 text-[12px]">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Tone</span>
          <select
            data-testid="pref-tone"
            value={prefs.tone ?? ""}
            onChange={(e) => setPrefs({ ...prefs, tone: e.target.value || undefined })}
            className="rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1.5"
          >
            <option value="">(default)</option>
            {TONES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Response length</span>
          <select
            data-testid="pref-length"
            value={prefs.response_length ?? ""}
            onChange={(e) => setPrefs({ ...prefs, response_length: e.target.value || undefined })}
            className="rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1.5"
          >
            <option value="">(default)</option>
            {LENGTHS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Safety profile</span>
          <select
            data-testid="pref-safety"
            value={prefs.safety_profile ?? ""}
            onChange={(e) => setPrefs({ ...prefs, safety_profile: e.target.value || undefined })}
            className="rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1.5"
          >
            <option value="">(default)</option>
            {SAFETY.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">Display name override</span>
          <input
            data-testid="pref-display-override"
            value={prefs.display_name_override ?? ""}
            onChange={(e) => setPrefs({ ...prefs, display_name_override: e.target.value || null })}
            className="rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1.5"
            placeholder={user.display_name}
          />
        </label>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          data-testid="pref-save"
          onClick={save}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-3 py-1.5 text-[12px] font-medium hover:bg-[var(--muted)]/30 disabled:opacity-60"
        >
          <Save size={12} /> {busy ? "Saving…" : "Save preferences"}
        </button>
        {saved === "ok" && <span className="text-[11px] text-emerald-600">saved</span>}
        {saved === "error" && <span className="text-[11px] text-rose-600">save failed</span>}
        {err && <span className="text-[11px] text-rose-600">{err}</span>}
      </div>

      <div className="mt-3 text-[11px] text-[var(--muted-foreground)]">
        Allowed capabilities: {(prefs.allowed_capabilities || []).join(", ") || "(role defaults)"}
      </div>
    </div>
  );
}
