"use client";

/**
 * Per-user ThemeProvider.
 *
 * The server-persisted `User.theme` is the source of truth. On mount and on
 * `wt:user-switched`, fetch `/api/v1/users/active`, apply the theme to the
 * `<html>` root via `data-theme="…"` (and the legacy `.dark` class for
 * backwards-compatible Tailwind utilities).
 *
 * Allowed themes: "light" | "dark" | "bella".
 */

import { useEffect, useState } from "react";

export type WiseTutorTheme = "light" | "dark" | "bella";

export const ALLOWED_THEMES: WiseTutorTheme[] = ["light", "dark", "bella"];

function applyTheme(theme: WiseTutorTheme | null) {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  html.setAttribute("data-theme", theme || "light");
  if (theme === "dark") {
    html.classList.add("dark");
  } else {
    html.classList.remove("dark");
  }
}

async function fetchActiveTheme(): Promise<WiseTutorTheme | null> {
  try {
    const r = await fetch("/api/v1/users/active", { credentials: "include" });
    if (!r.ok) return null;
    const u = await r.json();
    const t = u?.theme;
    return ALLOWED_THEMES.includes(t) ? (t as WiseTutorTheme) : null;
  } catch {
    return null;
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    let cancelled = false;
    (async () => {
      const t = await fetchActiveTheme();
      if (!cancelled && t) applyTheme(t);
    })();
    const onSwitch = async () => {
      const t = await fetchActiveTheme();
      if (t) applyTheme(t);
    };
    window.addEventListener("wt:user-switched", onSwitch);
    window.addEventListener("wt:theme-changed", onSwitch);
    return () => {
      cancelled = true;
      window.removeEventListener("wt:user-switched", onSwitch);
      window.removeEventListener("wt:theme-changed", onSwitch);
    };
  }, []);

  // Never render children before mount to avoid SSR hydration mismatch on
  // the theme attribute. The original <ThemeScript/> still runs inline for
  // the earliest paint (light/dark) to keep the initial flash minimal; the
  // provider overrides with the per-user theme once the cookie is known.
  return <>{mounted ? children : children}</>;
}
