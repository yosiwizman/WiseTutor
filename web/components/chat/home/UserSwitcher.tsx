"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, UserRound, Lock } from "lucide-react";

type PublicUser = {
  id: string;
  display_name: string;
  role: string;
  theme: string;
  pin_set: boolean;
  last_seen_at: string | null;
};

type UserList = { active_user_id: string; users: PublicUser[] };

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_API_BASE as string)) || "http://localhost:8001";

const POPUP_WIDTH = 300;
const MARGIN = 10;

type Pos = { top: number; left: number };

function computePosition(trigger: DOMRect, popupHeight: number): Pos {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const spaceAbove = trigger.top;
  const top =
    spaceAbove >= popupHeight + MARGIN
      ? trigger.top - popupHeight - 8
      : Math.min(trigger.bottom + 8, vh - popupHeight - MARGIN);
  let left = trigger.right - POPUP_WIDTH;
  if (left + POPUP_WIDTH + MARGIN > vw) left = vw - POPUP_WIDTH - MARGIN;
  if (left < MARGIN) left = MARGIN;
  return { top: Math.max(MARGIN, top), left };
}

export function UserSwitcher() {
  const [data, setData] = useState<UserList | null>(null);
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState<Pos | null>(null);
  const [mounted, setMounted] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const pinInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => setMounted(true), []);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/users`, { credentials: "include" });
      const j = (await r.json()) as UserList;
      setData(j);
    } catch {}
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (popupRef.current?.contains(t) || triggerRef.current?.contains(t)) return;
      setOpen(false);
      setTarget(null);
      setPin("");
      setErr(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setTarget(null);
        setPin("");
        setErr(null);
      }
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const trig = triggerRef.current?.getBoundingClientRect();
      if (!trig) return;
      const h = popupRef.current?.offsetHeight ?? 260;
      setPos(computePosition(trig, h));
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, target]);

  useEffect(() => {
    if (target) pinInputRef.current?.focus();
  }, [target]);

  const activeUser = data?.users.find((u) => u.id === data.active_user_id) ?? null;

  async function submit() {
    if (!target || pin.length !== 4) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`${API_BASE}/api/v1/users/switch`, {
        credentials: "include",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: target, pin }),
      });
      if (!r.ok) {
        setErr("Wrong PIN");
        return;
      }
      await load();
      setOpen(false);
      setTarget(null);
      setPin("");
      // Force a soft reload so any client-held session list resets.
      window.location.reload();
    } catch (e: any) {
      setErr(e?.message || "switch failed");
    } finally {
      setBusy(false);
    }
  }

  const popup = open ? (
    <div
      ref={popupRef}
      role="dialog"
      aria-label="Profile switcher"
      data-testid="user-switcher-popup"
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
      {!target ? (
        <>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
            Switch profile
          </div>
          <div className="flex flex-col gap-1.5">
            {data?.users.map((u) => {
              const isActive = u.id === data.active_user_id;
              return (
                <button
                  key={u.id}
                  data-testid={`user-row-${u.id}`}
                  onClick={() => {
                    if (isActive) return;
                    setTarget(u.id);
                    setErr(null);
                  }}
                  disabled={isActive}
                  className={
                    "flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-left transition " +
                    (isActive
                      ? "border-emerald-500/40 bg-emerald-500/5 cursor-default"
                      : "border-[var(--border)]/60 hover:bg-[var(--muted)]/30")
                  }
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <UserRound size={13} className="shrink-0" />
                    <div className="min-w-0">
                      <div className="font-medium truncate">{u.display_name}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{u.role}</div>
                    </div>
                  </div>
                  {isActive ? (
                    <span className="text-[10px] text-emerald-600">active</span>
                  ) : (
                    <Lock size={11} className="text-[var(--muted-foreground)]" />
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] leading-snug text-[var(--muted-foreground)]">
            Private memory and chat history are scoped per profile.
          </div>
        </>
      ) : (
        <>
          <div className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)] mb-2">
            Enter PIN for {data?.users.find((u) => u.id === target)?.display_name}
          </div>
          <input
            ref={pinInputRef}
            data-testid="user-switcher-pin"
            type="password"
            inputMode="numeric"
            pattern="\d{4}"
            maxLength={4}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="4-digit PIN"
            className="w-full rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-2 text-center text-[16px] tracking-[0.4em] font-mono outline-none focus:border-[var(--foreground)]/40"
          />
          {err && (
            <div className="mt-2 text-[11px] text-rose-600">{err}</div>
          )}
          <div className="mt-3 flex gap-2">
            <button
              onClick={() => {
                setTarget(null);
                setPin("");
                setErr(null);
              }}
              className="flex-1 rounded-md border border-[var(--border)]/60 px-2 py-1.5 text-[12px] hover:bg-[var(--muted)]/30"
            >
              Cancel
            </button>
            <button
              data-testid="user-switcher-submit"
              onClick={submit}
              disabled={pin.length !== 4 || busy}
              className="flex-1 rounded-md bg-[var(--foreground)] text-[var(--background)] px-2 py-1.5 text-[12px] font-medium disabled:opacity-40"
            >
              {busy ? "Switching…" : "Switch"}
            </button>
          </div>
        </>
      )}
    </div>
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        data-testid="user-switcher-trigger"
        onClick={() => setOpen((v) => !v)}
        title="Active WiseTutor profile"
        className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border)]/40 bg-[var(--card)]/50 px-2 py-[3px] text-[11px] font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition"
      >
        <UserRound size={11} />
        <span className="truncate max-w-[8rem]" data-testid="user-switcher-label">
          {activeUser?.display_name ?? "—"}
        </span>
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {mounted && popup ? createPortal(popup, document.body) : null}
    </>
  );
}
