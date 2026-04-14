"use client";

/**
 * ThemeScript - Initializes theme before React hydration.
 *
 * Priority order for the FIRST PAINT theme:
 *   1. `wt_theme` cookie (authoritative, per-user, rewritten on
 *      /switch and /me/theme; cleared on logout). Not httpOnly so
 *      this inline script can read it synchronously.
 *   2. system preference (prefers-color-scheme).
 *
 * localStorage is intentionally NOT consulted any more. It was the
 * cross-user bleed vector — a prior user's theme could linger and
 * appear during the first paint on another user's reload.
 */
export default function ThemeScript() {
  const themeScript = `
    (function() {
      try {
        var cookieTheme = null;
        var m = document.cookie.match(/(?:^|;\\s*)wt_theme=([^;]+)/);
        if (m) cookieTheme = decodeURIComponent(m[1]);
        var theme = null;
        if (cookieTheme === 'light' || cookieTheme === 'dark' || cookieTheme === 'bella') {
          theme = cookieTheme;
        } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          theme = 'dark';
        } else {
          theme = 'light';
        }
        document.documentElement.setAttribute('data-theme', theme);
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      } catch (e) {
        // Fail silently; ThemeProvider will correct once hydrated.
      }
    })();
  `;

  return (
    <script
      dangerouslySetInnerHTML={{ __html: themeScript }}
      suppressHydrationWarning
    />
  );
}
