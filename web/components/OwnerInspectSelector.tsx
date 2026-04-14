"use client";

import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || "";

type PublicUser = { id: string; display_name: string; role: string };
type UserList = { active_user_id: string; users: PublicUser[] };

interface Props {
  /** Called with the chosen target user id (null = self). */
  onChange: (asUser: string | null) => void;
  /** Current selection, null = self. */
  value: string | null;
  /** Optional label override. */
  label?: string;
}

/* Owner-only read-only inspect selector for utility pages.
 *
 * Renders a dropdown when the active user is role=owner and there is at
 * least one other (non-owner) profile to inspect. Non-owners see
 * nothing — the visibility gate is the role check, not just CSS, so a
 * child cannot reach the control via DOM inspection.
 *
 * The control is read-only by contract: switching it only changes which
 * user's data is FETCHED. Mutating endpoints in this slice ignore the
 * as_user parameter, so the worst a confused caller can do is read.
 */
export function OwnerInspectSelector({ onChange, value, label = "Inspect as" }: Props) {
  const [users, setUsers] = useState<PublicUser[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/users`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: UserList | null) => {
        if (!cancelled && d) {
          setUsers(d.users);
          setActiveId(d.active_user_id);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!users || !activeId) return null;
  const me = users.find((u) => u.id === activeId);
  if (!me || me.role !== "owner") return null;
  const others = users.filter((u) => u.id !== activeId);
  if (others.length === 0) return null;

  return (
    <div
      data-testid="owner-inspect-control"
      className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--background)]/80 px-3 py-1.5 text-xs text-[var(--foreground)]"
    >
      <span className="text-[var(--muted-foreground)]">{label}:</span>
      <select
        data-testid="owner-inspect-select"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="bg-transparent text-xs font-medium outline-none"
      >
        <option value="">Self ({me.display_name})</option>
        {others.map((u) => (
          <option key={u.id} value={u.id}>
            {u.display_name} ({u.role})
          </option>
        ))}
      </select>
    </div>
  );
}

export function ReadOnlyInspectBanner({ targetId, users }: { targetId: string; users: PublicUser[] | null }) {
  const target = users?.find((u) => u.id === targetId);
  const name = target?.display_name ?? targetId;
  return (
    <div
      data-testid="owner-inspect-banner"
      data-inspect-target={targetId}
      className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-200"
    >
      Inspecting <strong>{name}</strong> read-only. Save / refresh / clear / upload are disabled while inspecting another user.
    </div>
  );
}
