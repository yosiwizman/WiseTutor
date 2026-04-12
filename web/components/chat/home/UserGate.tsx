"use client";

import { useCallback, useEffect, useState } from "react";
import { UserRound, Lock, KeyRound, ShieldAlert } from "lucide-react";

type PublicUser = {
  id: string;
  display_name: string;
  role: string;
  theme: string;
  pin_set: boolean;
  pin_is_default: boolean;
  last_seen_at: string | null;
};
type UserList = { active_user_id: string | null; users: PublicUser[] };

const API_BASE =
  typeof window !== "undefined"
    ? window.location.origin
    : (typeof process !== "undefined" && (process.env.NEXT_PUBLIC_API_BASE as string)) || "http://localhost:8001";

const j = (init: RequestInit = {}): RequestInit => ({
  ...init,
  credentials: "include",
  headers: { "Content-Type": "application/json", ...(init.headers || {}) },
});

/**
 * Full-screen overlay that:
 *   1. If no active user → picks a user and enters PIN.
 *   2. If active user still has the seeded default PIN → forces change.
 * Renders `children` only after the gate is clear.
 */
export function UserGate({ children }: { children: React.ReactNode }) {
  const [list, setList] = useState<UserList | null>(null);
  const [activeUser, setActiveUser] = useState<PublicUser | null>(null);
  const [pickUserId, setPickUserId] = useState<string | null>(null);
  const [pin, setPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [newPin2, setNewPin2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/v1/users`, j({ method: "GET" }));
      const jl = (await r.json()) as UserList;
      setList(jl);
      if (jl.active_user_id) {
        const r2 = await fetch(`${API_BASE}/api/v1/users/active`, j({ method: "GET" }));
        if (r2.ok) {
          setActiveUser((await r2.json()) as PublicUser);
        } else {
          setActiveUser(null);
        }
      } else {
        setActiveUser(null);
      }
    } catch {
      setActiveUser(null);
    } finally {
      setReady(true);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function submitPin() {
    if (!pickUserId || pin.length !== 4) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(
        `${API_BASE}/api/v1/users/switch`,
        j({ method: "POST", body: JSON.stringify({ user_id: pickUserId, pin }) })
      );
      if (!r.ok) {
        setErr("Wrong PIN");
        setPin("");
        return;
      }
      setPin("");
      setPickUserId(null);
      await load();
    } catch (e: any) {
      setErr(e?.message || "login failed");
    } finally {
      setBusy(false);
    }
  }

  async function submitRotation() {
    if (!activeUser) return;
    if (newPin.length !== 4 || newPin2.length !== 4) {
      setErr("PIN must be 4 digits");
      return;
    }
    if (newPin !== newPin2) {
      setErr("PINs do not match");
      return;
    }
    if (newPin === "1234" || newPin === "5678" || newPin === "0000") {
      setErr("Pick a less obvious PIN");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      // current_pin = the default seeded one. For rotation from default we
      // already authenticated via the switch above, so we know it. The API
      // requires current_pin to be verified again — we ask the user to confirm
      // by typing it into the prompt below. For first-time rotation we store
      // the just-used PIN from the login step: user re-types their current
      // once in the rotation form.
      const r = await fetch(
        `${API_BASE}/api/v1/users/${activeUser.id}/pin`,
        j({
          method: "POST",
          body: JSON.stringify({ current_pin: pin || "1234", new_pin: newPin }),
        })
      );
      if (!r.ok) {
        setErr("Could not change PIN. Please enter your current PIN below.");
        return;
      }
      setNewPin("");
      setNewPin2("");
      setPin("");
      await load();
    } catch (e: any) {
      setErr(e?.message || "rotation failed");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) return null;

  // Cleared
  if (activeUser && !activeUser.pin_is_default) {
    return <>{children}</>;
  }

  // Login screen
  if (!activeUser) {
    return (
      <div
        data-testid="user-gate-login"
        className="fixed inset-0 z-[2147483600] flex items-center justify-center bg-[var(--background)]/85 backdrop-blur-sm"
      >
        <div className="w-[360px] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
          <div className="flex items-center gap-2 mb-3 text-[13px] font-semibold">
            <UserRound size={14} /> Sign in to WiseTutor
          </div>
          {!pickUserId ? (
            <div className="flex flex-col gap-2">
              {(list?.users ?? []).map((u) => (
                <button
                  key={u.id}
                  data-testid={`user-gate-row-${u.id}`}
                  onClick={() => {
                    setPickUserId(u.id);
                    setErr(null);
                  }}
                  className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)]/60 px-3 py-2 text-left hover:bg-[var(--muted)]/30"
                >
                  <div className="flex items-center gap-2">
                    <UserRound size={13} />
                    <div>
                      <div className="text-[13px] font-medium">{u.display_name}</div>
                      <div className="text-[10px] text-[var(--muted-foreground)]">{u.role}</div>
                    </div>
                  </div>
                  <Lock size={12} className="text-[var(--muted-foreground)]" />
                </button>
              ))}
              <div className="mt-1 text-[11px] text-[var(--muted-foreground)]">
                Each profile has its own private memory and chat history.
              </div>
            </div>
          ) : (
            <>
              <div className="mb-2 text-[11px] text-[var(--muted-foreground)]">
                Enter PIN for {list?.users.find((x) => x.id === pickUserId)?.display_name}
              </div>
              <input
                data-testid="user-gate-pin"
                autoFocus
                type="password"
                inputMode="numeric"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") submitPin();
                }}
                className="w-full rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-2 text-center text-[18px] tracking-[0.4em] font-mono outline-none focus:border-[var(--foreground)]/40"
              />
              {err && <div className="mt-2 text-[11px] text-rose-600">{err}</div>}
              <div className="mt-3 flex gap-2">
                <button
                  onClick={() => {
                    setPickUserId(null);
                    setPin("");
                    setErr(null);
                  }}
                  className="flex-1 rounded-md border border-[var(--border)]/60 px-2 py-2 text-[12px]"
                >
                  Back
                </button>
                <button
                  data-testid="user-gate-submit"
                  onClick={submitPin}
                  disabled={pin.length !== 4 || busy}
                  className="flex-1 rounded-md bg-[var(--foreground)] text-[var(--background)] px-2 py-2 text-[12px] font-medium disabled:opacity-40"
                >
                  {busy ? "…" : "Sign in"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Forced PIN rotation — the user is logged in but still on the seeded default.
  return (
    <div
      data-testid="user-gate-rotate"
      className="fixed inset-0 z-[2147483600] flex items-center justify-center bg-[var(--background)]/85 backdrop-blur-sm"
    >
      <div className="w-[400px] rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
        <div className="flex items-center gap-2 mb-2 text-[13px] font-semibold">
          <ShieldAlert size={14} /> Choose a new PIN
        </div>
        <div className="mb-3 text-[11px] leading-snug text-[var(--muted-foreground)]">
          <b>{activeUser.display_name}</b> is still using the seeded default PIN.
          Chat is locked until you change it. Confirm your current PIN and pick
          a new 4-digit PIN.
        </div>

        <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
          Current PIN
        </label>
        <input
          data-testid="user-gate-current-pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-full mb-2 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-2 text-center tracking-[0.4em] font-mono outline-none"
        />

        <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
          New PIN
        </label>
        <input
          data-testid="user-gate-new-pin"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={newPin}
          onChange={(e) => setNewPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-full mb-2 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-2 text-center tracking-[0.4em] font-mono outline-none"
        />

        <label className="block text-[10px] uppercase tracking-wide text-[var(--muted-foreground)] mb-1">
          Confirm new PIN
        </label>
        <input
          data-testid="user-gate-new-pin2"
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={newPin2}
          onChange={(e) => setNewPin2(e.target.value.replace(/\D/g, "").slice(0, 4))}
          className="w-full mb-2 rounded-md border border-[var(--border)]/60 bg-[var(--background)] px-2 py-2 text-center tracking-[0.4em] font-mono outline-none"
        />
        {err && <div className="mt-1 text-[11px] text-rose-600">{err}</div>}
        <button
          data-testid="user-gate-rotate-submit"
          onClick={submitRotation}
          disabled={pin.length !== 4 || newPin.length !== 4 || newPin2.length !== 4 || busy}
          className="mt-3 w-full rounded-md bg-[var(--foreground)] text-[var(--background)] px-2 py-2 text-[12px] font-medium disabled:opacity-40 inline-flex items-center justify-center gap-1.5"
        >
          <KeyRound size={12} /> {busy ? "Rotating…" : "Change PIN"}
        </button>
        <button
          onClick={async () => {
            await fetch(`${API_BASE}/api/v1/users/logout`, j({ method: "POST" }));
            await load();
          }}
          className="mt-2 w-full rounded-md border border-[var(--border)]/60 px-2 py-1.5 text-[11px]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
