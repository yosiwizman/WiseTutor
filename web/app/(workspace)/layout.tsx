"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import WorkspaceSidebar from "@/components/sidebar/WorkspaceSidebar";
import { UnifiedChatProvider } from "@/context/UnifiedChatContext";

export default function WorkspaceLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <UnifiedChatProvider>
      {/* h-dvh (dynamic viewport height) instead of h-screen so the
          container shrinks when iOS Safari's URL bar is visible. With
          h-screen = 100vh the bottom sits under Safari's chrome and
          the composer / drawer Settings area get clipped. */}
      <div className="flex h-dvh overflow-hidden">
        <WorkspaceSidebar
          mobileOpen={mobileOpen}
          onCloseMobile={() => setMobileOpen(false)}
        />
        {mobileOpen && (
          <button
            type="button"
            aria-label="Close navigation"
            data-testid="mobile-nav-backdrop"
            onClick={() => setMobileOpen(false)}
            /* sits to the right of the 260px drawer so its clickable
               center is never occluded by the sidebar (Playwright
               actionability relies on the element's center being the
               topmost node at that point). */
            className="fixed bottom-0 right-0 top-0 left-[260px] z-30 bg-black/40 md:hidden"
          />
        )}
        {/* pb-[env(safe-area-inset-bottom)] keeps the composer's
            bottom edge clear of the iOS home indicator. */}
        <main className="relative flex-1 overflow-hidden bg-[var(--background)] pb-[env(safe-area-inset-bottom)]">
          <button
            type="button"
            aria-label="Open navigation"
            data-testid="mobile-nav-toggle"
            onClick={() => setMobileOpen(true)}
            className="absolute left-2 top-2 z-20 inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border)] bg-[var(--background)]/80 text-[var(--muted-foreground)] backdrop-blur hover:text-[var(--foreground)] md:hidden"
          >
            <Menu size={18} />
          </button>
          {children}
        </main>
      </div>
    </UnifiedChatProvider>
  );
}
