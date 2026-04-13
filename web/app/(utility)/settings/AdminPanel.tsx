"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert, KeyRound, Save, RefreshCw } from "lucide-react";

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_API_BASE as string)) || "http://localhost:8001";

type PublicUser = {
  id: string;
  display_name: string;
  role: string;
  theme: string;
  pin_set: boolean;
  pin_is_default: boolean;
  preferences?: {
    tone?: string;
    response_length?: string;
    allowed_capabilities?: string[];
    safety_profile?: string;
  };
};

type ActiveUser = PublicUser;

const ALL_CAPS = [
  "chat",
  "deep_question",
  "deep_solve",
  "deep_research",
  "math_animator",
  "visualize",
];
const SAFETY = ["standard", "child"];

export function AdminPanel() {
  const [me, setMe] = useState<ActiveUser | null>(null);
  const [others, setOthers] = useState<PublicUser[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Admin form state per target user
  const [newPin, setNewPin] = useState<Record<string, string>>({});
  const [ownerPin, setOwnerPin] = useState<string>("");
  const [safety, setSafety] = useState<Record<string, string>>({});
  const [caps, setCaps] = useState<Record<string, Set<string>>>({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const rMe = await fetch(`${API_BASE}/api/v1/users/active`, { credentials: "include" });
      if (!rMe.ok) return;
      const meUser = (await rMe.json()) as ActiveUser;
      setMe(meUser);
      if (meUser.role !== "owner") {
        setOthers([]);
        return;
      }
      const rList = await fetch(`${API_BASE}/api/v1/users`, { credentials: "include" });
      const list = await rList.json();
      const users: PublicUser[] = (list?.users || []).filter((u: PublicUser) => u.id !== meUser.id);
      // Fetch each non-self user's preferences
      const enriched: PublicUser[] = [];
      for (const u of users) {
        try {
          const r = await fetch(`${API_BASE}/api/v1/users/${u.id}/preferences`, { credentials: "include" });
          if (r.ok) {
            const p = (await r.json()).preferences;
            enriched.push({ ...u, preferences: p });
          } else {
            enriched.push(u);
          }
        } catch {
          enriched.push(u);
        }
      }
      setOthers(enriched);
      const initialCaps: Record<string, Set<string>> = {};
      const initialSafety: Record<string, string> = {};
      for (const u of enriched) {
        initialCaps[u.id] = new Set(u.preferences?.allowed_capabilities ?? []);
        initialSafety[u.id] = u.preferences?.safety_profile ?? "standard";
      }
      setCaps(initialCaps);
      setSafety(initialSafety);
    } catch (e: any) {
      setErr(e?.message || "load failed");
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function resetPin(targetId: string) {
    if (!/^\d{4}$/.test(ownerPin)) { setErr("Enter your 4-digit owner PIN above."); return; }
    const tPin = newPin[targetId] || "";
    if (!/^\d{4}$/.test(tPin)) { setErr("New PIN must be 4 digits."); return; }
    setBusy(`pin:${targetId}`);
    setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/users/${targetId}/pin`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_pin: ownerPin, new_pin: tPin }),
      });
      if (!r.ok) {
        setErr(`PIN reset failed (HTTP ${r.status})`);
        return;
      }
      setFlash(`Reset PIN for ${targetId}`);
      setNewPin({ ...newPin, [targetId]: "" });
      setTimeout(() => setFlash(null), 2500);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveSafety(targetId: string) {
    setBusy(`safety:${targetId}`);
    setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/users/${targetId}/preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ safety_profile: safety[targetId] }),
      });
      if (!r.ok) { setErr(`safety update ${r.status}`); return; }
      setFlash(`Updated safety profile for ${targetId}`);
      setTimeout(() => setFlash(null), 2500);
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function saveCaps(targetId: string) {
    setBusy(`caps:${targetId}`);
    setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/users/${targetId}/preferences`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ allowed_capabilities: [...(caps[targetId] || [])] }),
      });
      if (!r.ok) { setErr(`caps update ${r.status}`); return; }
      setFlash(`Updated allowed capabilities for ${targetId}`);
      setTimeout(() => setFlash(null), 2500);
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (!me || me.role !== "owner") return null;

  return (
    <div
      data-testid="admin-panel"
      className="mb-6 rounded-xl border border-[var(--border)] bg-[var(--card)]/40 p-4"
    >
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[14px] font-semibold">Admin</h3>
          <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)]/60 bg-[var(--background)] px-2 py-[2px] text-[11px]">
            <ShieldAlert size={11} /> owner only · visible to {me.display_name}
          </span>
        </div>
        <button onClick={load} className="inline-flex items-center gap-1 rounded-md border border-[var(--border)]/60 px-2 py-1 text-[11px]">
          <RefreshCw size={11} /> Refresh
        </button>
      </div>

      <div className="mb-3">
        <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
          Your PIN (required to authorize admin actions)
        </label>
        <input
          data-testid="admin-owner-pin"
          type="password" inputMode="numeric" maxLength={4}
          value={ownerPin}
          onChange={(e) => setOwnerPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-40 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1.5 text-center tracking-[0.4em] font-mono text-[14px]"
        />
      </div>

      {others.map((u) => (
        <div key={u.id} data-testid={`admin-row-${u.id}`} className="rounded-lg border border-[var(--border)]/60 p-3 mb-2">
          <div className="flex items-center gap-2 mb-2 text-[13px] font-medium">
            <span>{u.display_name}</span>
            <span className="text-[10px] text-[var(--muted-foreground)] font-normal">({u.role})</span>
            <span className="text-[10px] font-mono text-[var(--muted-foreground)]">id: {u.id}</span>
          </div>

          {/* PIN reset */}
          <div className="flex items-center gap-2 mb-3">
            <input
              data-testid={`admin-new-pin-${u.id}`}
              type="password" inputMode="numeric" maxLength={4}
              placeholder="new PIN"
              value={newPin[u.id] ?? ""}
              onChange={(e) => setNewPin({ ...newPin, [u.id]: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              className="w-28 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1 text-center tracking-[0.4em] font-mono text-[13px]"
            />
            <button
              data-testid={`admin-reset-pin-${u.id}`}
              onClick={() => resetPin(u.id)}
              disabled={busy === `pin:${u.id}` || !ownerPin || !(newPin[u.id] || "")}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1 text-[12px] disabled:opacity-40"
            >
              <KeyRound size={12} /> Reset PIN
            </button>
          </div>

          {/* safety profile */}
          <div className="flex items-center gap-2 mb-3 text-[12px]">
            <span className="text-[var(--muted-foreground)] w-28">safety_profile</span>
            <select
              data-testid={`admin-safety-${u.id}`}
              value={safety[u.id] ?? "standard"}
              onChange={(e) => setSafety({ ...safety, [u.id]: e.target.value })}
              className="rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1"
            >
              {SAFETY.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              data-testid={`admin-save-safety-${u.id}`}
              onClick={() => saveSafety(u.id)}
              disabled={busy === `safety:${u.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1 text-[11px]"
            >
              <Save size={11} /> Save
            </button>
          </div>

          {/* allowed capabilities */}
          <div className="text-[12px]">
            <div className="text-[var(--muted-foreground)] mb-1">allowed_capabilities</div>
            <div className="flex flex-wrap gap-2 mb-2">
              {ALL_CAPS.map((c) => {
                const set = caps[u.id] ?? new Set();
                const on = set.has(c);
                return (
                  <label
                    key={c}
                    data-testid={`admin-cap-${u.id}-${c}`}
                    className={
                      "inline-flex items-center gap-1 rounded-full border px-2 py-[2px] cursor-pointer " +
                      (on
                        ? "border-emerald-500/40 bg-emerald-500/5"
                        : "border-[var(--border)]/60")
                    }
                  >
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => {
                        const next = new Set(caps[u.id] ?? []);
                        if (next.has(c)) next.delete(c); else next.add(c);
                        setCaps({ ...caps, [u.id]: next });
                      }}
                    />
                    <span className="font-mono text-[11px]">{c}</span>
                  </label>
                );
              })}
            </div>
            <button
              data-testid={`admin-save-caps-${u.id}`}
              onClick={() => saveCaps(u.id)}
              disabled={busy === `caps:${u.id}`}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1 text-[11px]"
            >
              <Save size={11} /> Save capabilities
            </button>
          </div>
        </div>
      ))}
      {flash && <div data-testid="admin-flash" className="mt-2 text-[11px] text-emerald-600">{flash}</div>}
      {err && <div className="mt-2 text-[11px] text-rose-600">{err}</div>}
    </div>
  );
}
