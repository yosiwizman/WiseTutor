"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

type ActiveUser = { id: string; display_name: string; role: string };

/* Read-only top-right badge for utility pages (Settings / Knowledge /
 * Memory). Does not switch users — that lives in the workspace
 * UserSwitcher. RBAC v1 surface so the active profile is always visible
 * outside the chat. */
export function ActiveProfileBadge() {
  const [user, setUser] = useState<ActiveUser | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/users/active`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => {
        if (!cancelled && u) setUser(u);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  return (
    <div
      data-testid="active-profile-badge"
      data-active-user-id={user.id}
      data-active-user-role={user.role}
      className="fixed right-3 top-3 z-30 inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--background)]/90 px-3 py-1 text-xs text-[var(--foreground)] shadow-sm backdrop-blur"
    >
      <span className="font-medium">{user.display_name}</span>
      <span className="rounded-full bg-[var(--secondary)] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {user.role}
      </span>
    </div>
  );
}
