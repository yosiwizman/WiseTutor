import UtilitySidebar from "@/components/sidebar/UtilitySidebar";

export default function UtilityLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    /* h-dvh keeps the container within Safari's actual visible area on
       iOS. On phones the sidebar is hidden (md:block) so settings gets
       full width and Safari's URL bar doesn't clip bottom controls;
       users arrive here via the workspace drawer's Settings link and
       use the browser back button to return. */
    <div className="flex h-dvh overflow-hidden">
      <div className="hidden md:flex">
        <UtilitySidebar />
      </div>
      <main className="flex-1 overflow-y-auto bg-[var(--background)] pb-[env(safe-area-inset-bottom)]">
        {children}
      </main>
    </div>
  );
}
