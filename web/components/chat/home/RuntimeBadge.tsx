"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, CircleCheck, CircleAlert, Loader2, Info } from "lucide-react";

type Model = { id: string; name: string; model: string };
type Profile = {
  id: string;
  name: string;
  binding: string;
  base_url: string;
  api_key?: string;
  models: Model[];
};
type LLMService = {
  active_profile_id: string | null;
  active_model_id: string | null;
  profiles: Profile[];
};
type VerifyInfo = { ok: boolean; at: string; error: string | null } | null;
type Diag = {
  llm: {
    model: string;
    binding: string;
    provider_name: string;
    base_url?: string;
    api_key_present: boolean;
    last_verified?: VerifyInfo;
  };
};

const API_BASE =
  (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_API_BASE as string)) ||
  "http://localhost:8001";

const POPUP_WIDTH = 340;
const MARGIN = 10;

type Pos = { top: number; left: number; placement: "top" | "bottom" };

function computePosition(trigger: DOMRect, popupHeight: number): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceAbove = trigger.top;
  const spaceBelow = vh - trigger.bottom;
  // Prefer opening upward (composer lives at the bottom). Flip if not enough room.
  const placement: "top" | "bottom" =
    spaceAbove >= popupHeight + MARGIN || spaceAbove >= spaceBelow ? "top" : "bottom";
  let top =
    placement === "top"
      ? trigger.top - popupHeight - 8
      : trigger.bottom + 8;
  // Clamp top to viewport
  top = Math.max(MARGIN, Math.min(top, vh - popupHeight - MARGIN));
  // Anchor right edge to the trigger's right edge, then shift left if off-screen.
  let left = trigger.right - POPUP_WIDTH;
  if (left + POPUP_WIDTH + MARGIN > vw) left = vw - POPUP_WIDTH - MARGIN;
  if (left < MARGIN) left = MARGIN;
  return { top, left, placement };
}

export function RuntimeBadge() {
  const [llm, setLlm] = useState<LLMService | null>(null);
  const [diag, setDiag] = useState<Diag | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"idle" | "switching" | "verifying">("idle");
  const [lastError, setLastError] = useState<string | null>(null);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  const loadCatalog = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/settings/catalog`);
      const j = await r.json();
      setLlm(j?.catalog?.services?.llm ?? null);
    } catch {}
  }, []);
  const loadDiag = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/settings/diagnostics`);
      setDiag(await r.json());
    } catch {}
  }, []);

  useEffect(() => {
    loadCatalog();
    loadDiag();
  }, [loadCatalog, loadDiag]);

  // Outside click / escape closes.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (
        (popupRef.current && popupRef.current.contains(t)) ||
        (triggerRef.current && triggerRef.current.contains(t))
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Measure + reposition on open and on resize/scroll.
  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const trig = triggerRef.current?.getBoundingClientRect();
      if (!trig) return;
      const h = popupRef.current?.offsetHeight ?? 360;
      setPos(computePosition(trig, h));
    };
    reposition();
    const raf = requestAnimationFrame(reposition); // after popup mounts with actual height
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open]);

  const activeProfile = useMemo(
    () => llm?.profiles.find((p) => p.id === llm.active_profile_id) ?? null,
    [llm]
  );
  const activeModel = useMemo(
    () => activeProfile?.models.find((m) => m.id === llm?.active_model_id) ?? null,
    [activeProfile, llm]
  );

  const verified = diag?.llm?.last_verified;
  const state: "green" | "yellow" | "red" | "gray" =
    !activeProfile || !activeModel
      ? "gray"
      : verified
      ? verified.ok
        ? "green"
        : "red"
      : "yellow";
  const dot =
    state === "green"
      ? "bg-emerald-500"
      : state === "yellow"
      ? "bg-amber-400"
      : state === "red"
      ? "bg-rose-500"
      : "bg-neutral-400";

  async function switchProfile(profileId: string) {
    const p = llm?.profiles.find((x) => x.id === profileId);
    if (!p || !p.models.length) return;
    await switchActive(profileId, p.models[0].id);
  }
  async function switchActive(profile_id: string, model_id: string) {
    setBusy("switching");
    setLastError(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/settings/active`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "llm", profile_id, model_id }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      await loadCatalog();
      await loadDiag();
    } catch (e: any) {
      setLastError(e?.message || "switch failed");
    } finally {
      setBusy("idle");
    }
  }
  async function verify() {
    setBusy("verifying");
    setLastError(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/settings/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: "llm" }),
      });
      const j = await r.json();
      if (!j.ok) setLastError((j.error || "").slice(0, 160));
      await loadDiag();
    } catch (e: any) {
      setLastError(e?.message || "verify failed");
    } finally {
      setBusy("idle");
    }
  }

  const verifiedAt = verified?.at ? new Date(verified.at).toLocaleTimeString() : null;

  const popup = open ? (
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Runtime truth"
      data-testid="runtime-badge-popup"
      style={{
        position: "fixed",
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        width: POPUP_WIDTH,
        maxHeight: `calc(100vh - ${MARGIN * 2}px)`,
        overflowY: "auto",
        zIndex: 2147483000,
        visibility: pos ? "visible" : "hidden",
      }}
      className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3.5 shadow-2xl text-[12px] text-[var(--foreground)]"
    >
      <div className="flex items-start gap-1.5 text-[11px] text-[var(--muted-foreground)] mb-2.5 leading-snug">
        <Info size={12} className="mt-[1px] shrink-0" />
        <span>Runtime truth from backend diagnostics — not the model&apos;s self-report.</span>
      </div>

      <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mb-1">Provider</label>
      <select
        value={llm?.active_profile_id ?? ""}
        onChange={(e) => switchProfile(e.target.value)}
        disabled={busy !== "idle"}
        className="w-full mb-2.5 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1.5 text-[12px]"
      >
        {llm?.profiles.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} ({p.binding})
          </option>
        ))}
      </select>

      <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mb-1">Model</label>
      <select
        value={llm?.active_model_id ?? ""}
        onChange={(e) => activeProfile && switchActive(activeProfile.id, e.target.value)}
        disabled={busy !== "idle" || !activeProfile}
        className="w-full mb-3 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-1.5 text-[12px]"
      >
        {activeProfile?.models.map((m) => (
          <option key={m.id} value={m.id}>
            {m.model}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px] mb-3">
        <div className="text-[var(--muted-foreground)]">Binding</div>
        <div className="font-mono">{diag?.llm?.binding ?? "—"}</div>
        <div className="text-[var(--muted-foreground)]">Base URL</div>
        <div className="font-mono truncate" title={diag?.llm?.base_url ?? "—"}>{diag?.llm?.base_url ?? "—"}</div>
        <div className="text-[var(--muted-foreground)]">API key</div>
        <div>{diag?.llm?.api_key_present ? "present" : "missing"}</div>
        <div className="text-[var(--muted-foreground)]">Last verified</div>
        <div>
          {verifiedAt ? (
            <span className={verified?.ok ? "text-emerald-600" : "text-rose-600"}>
              {verified?.ok ? "ok" : "failed"} · {verifiedAt}
            </span>
          ) : (
            <span className="text-amber-600">not yet verified</span>
          )}
        </div>
      </div>

      <button
        onClick={verify}
        disabled={busy !== "idle"}
        className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-2 text-[12px] font-medium hover:bg-[var(--muted)]/30 disabled:opacity-60"
      >
        {busy === "verifying" ? (
          <><Loader2 size={13} className="animate-spin" /> Verifying…</>
        ) : verified?.ok ? (
          <><CircleCheck size={13} className="text-emerald-600" /> Verify again</>
        ) : (
          <><CircleAlert size={13} /> Verify connection</>
        )}
      </button>
      {lastError && (
        <div className="mt-2 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-[11px] text-rose-600 break-words">
          {lastError}
        </div>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        data-testid="runtime-badge-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Runtime truth (backend diagnostics, not model self-report)"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]/40 bg-[var(--card)]/50 px-2 py-[3px] text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition"
      >
        <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
        <span className="truncate max-w-[10rem]">
          {activeProfile?.name ?? "No provider"} · {activeModel?.model ?? "—"}
        </span>
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {mounted && popup ? createPortal(popup, document.body) : null}
    </>
  );
}
