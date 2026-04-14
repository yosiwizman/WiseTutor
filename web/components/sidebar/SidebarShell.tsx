"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Bot,
  Brain,
  GraduationCap,
  MessageSquare,
  PanelLeftClose,
  PanelLeftOpen,
  PenLine,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import SessionList from "@/components/SessionList";
import { TutorBotRecent } from "@/components/sidebar/TutorBotRecent";
import type { SessionSummary } from "@/lib/session-api";

interface NavEntry {
  href: string;
  label: string;
  icon: LucideIcon;
}

const PRIMARY_NAV: NavEntry[] = [
  { href: "/", label: "Chat", icon: MessageSquare },
  { href: "/agents", label: "TutorBot", icon: Bot },
  { href: "/co-writer", label: "Co-Writer", icon: PenLine },
  { href: "/guide", label: "Guided Learning", icon: GraduationCap },
  { href: "/knowledge", label: "Knowledge", icon: BookOpen },
  { href: "/memory", label: "Memory", icon: Brain },
];

const SECONDARY_NAV: NavEntry[] = [{ href: "/settings", label: "Settings", icon: Settings }];
const DEFAULT_SESSION_VIEWPORT_CLASS_NAME = "max-h-[112px]";

interface SidebarShellProps {
  sessions?: SessionSummary[];
  activeSessionId?: string | null;
  loadingSessions?: boolean;
  showSessions?: boolean;
  sessionViewportClassName?: string;
  onNewChat?: () => void;
  onSelectSession?: (sessionId: string) => void | Promise<void>;
  onRenameSession?: (sessionId: string, title: string) => void | Promise<void>;
  onDeleteSession?: (sessionId: string) => void | Promise<void>;
  footerSlot?: ReactNode;
  /**
   * Mobile drawer state. On md+ viewports the sidebar is always visible
   * and these are ignored. On <md viewports the sidebar renders as a
   * fixed left drawer whose visibility tracks `mobileOpen`.
   */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
}

export function SidebarShell({
  sessions = [],
  activeSessionId = null,
  loadingSessions = false,
  showSessions = false,
  sessionViewportClassName = DEFAULT_SESSION_VIEWPORT_CLASS_NAME,
  onNewChat,
  onSelectSession,
  onRenameSession,
  onDeleteSession,
  footerSlot,
  mobileOpen = false,
  onCloseMobile,
}: SidebarShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { t } = useTranslation();
  const [collapsed, setCollapsed] = useState(false);

  const handleNewChat = () => {
    if (onNewChat) {
      onNewChat();
      return;
    }
    router.push("/");
  };

  // Shared mobile-drawer positioning: on <md, sidebar is fixed off-canvas
  // by default and slides in when mobileOpen. On md+, the sidebar is part
  // of the normal flex flow and `mobileOpen` has no effect.
  const mobileDrawerClasses = `fixed inset-y-0 left-0 z-40 transform transition-transform duration-200 ${
    mobileOpen ? "translate-x-0" : "-translate-x-full"
  } md:static md:translate-x-0 md:transition-none`;

  /* ---- Collapsed state (desktop-only visual; mobile ignores collapse) ---- */
  if (collapsed) {
    return (
      <aside
        data-mobile-open={String(mobileOpen)}
        className={`flex w-[260px] md:w-[56px] h-dvh shrink-0 flex-col items-center overflow-y-auto bg-[var(--secondary)] py-3 pb-[env(safe-area-inset-bottom)] ${mobileDrawerClasses}`}
      >
        <button
          onClick={() => (onCloseMobile ? onCloseMobile() : setCollapsed(false))}
          className="mb-4 rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] md:hidden"
          aria-label={t("Close navigation")}
        >
          <PanelLeftOpen size={15} />
        </button>
        <button
          onClick={() => setCollapsed(false)}
          className="mb-4 hidden rounded-md p-1.5 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] md:inline-flex"
          aria-label={t("Expand sidebar")}
        >
          <PanelLeftOpen size={15} />
        </button>

        <button
          onClick={handleNewChat}
          className="mb-3 rounded-lg p-2 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--background)]/60 hover:text-[var(--foreground)]"
          aria-label={t("New Chat")}
        >
          <Plus size={16} strokeWidth={2} />
        </button>

        <nav className="flex flex-col items-center gap-px pt-1">
          {PRIMARY_NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <div key={item.href} className="flex flex-col items-center">
                <Link
                  href={item.href}
                  className={`rounded-lg p-2 transition-colors ${
                    active
                      ? "bg-[var(--background)]/70 text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--background)]/50 hover:text-[var(--foreground)]"
                  }`}
                >
                  <item.icon size={16} strokeWidth={active ? 1.9 : 1.5} />
                </Link>
                {item.href === "/agents" && <TutorBotRecent collapsed />}
              </div>
            );
          })}
        </nav>

        <div className="flex-1" />

        <div className="flex flex-col items-center gap-px pb-1">
          {SECONDARY_NAV.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg p-2 transition-colors ${
                  active
                    ? "bg-[var(--background)]/70 text-[var(--foreground)]"
                    : "text-[var(--muted-foreground)] hover:bg-[var(--background)]/50 hover:text-[var(--foreground)]"
                }`}
              >
                <item.icon size={16} strokeWidth={active ? 1.9 : 1.5} />
              </Link>
            );
          })}
          {footerSlot}
        </div>
      </aside>
    );
  }

  /* ---- Expanded state ---- */
  return (
    <aside
      data-mobile-open={String(mobileOpen)}
      className={`flex w-[260px] md:w-[220px] h-dvh shrink-0 flex-col overflow-y-auto bg-[var(--secondary)] pb-[env(safe-area-inset-bottom)] ${mobileDrawerClasses}`}
    >
      {/* Header: logo + collapse/close toggle */}
      <div className="flex h-12 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo-ver2.png" alt="WiseTutor" width={20} height={20} />
          <span className="text-[15px] font-semibold tracking-tight text-[var(--foreground)]">
            WiseTutor
          </span>
        </Link>
        {/* Mobile: close the drawer. Desktop: collapse to 56px. */}
        <button
          onClick={onCloseMobile}
          className="rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] md:hidden"
          aria-label={t("Close navigation")}
        >
          <PanelLeftClose size={15} />
        </button>
        <button
          onClick={() => setCollapsed(true)}
          className="hidden rounded-md p-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] md:inline-flex"
          aria-label={t("Collapse sidebar")}
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      {/* Primary nav */}
      <nav className="px-2 pt-1">
        <div className="space-y-px">
          {/* New chat */}
          <button
            onClick={handleNewChat}
            className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] text-[var(--muted-foreground)] transition-colors hover:bg-[var(--background)]/60 hover:text-[var(--foreground)]"
          >
            <Plus size={16} strokeWidth={2} />
            <span>{t("New Chat")}</span>
          </button>

          {PRIMARY_NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            const hasSessionsBelow = item.href === "/" && showSessions && onSelectSession && onRenameSession && onDeleteSession;
            const hasBots = item.href === "/agents";
            return (
              <div key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                    active
                      ? "bg-[var(--background)]/70 font-medium text-[var(--foreground)]"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--background)]/50 hover:text-[var(--foreground)]"
                  }`}
                >
                  <item.icon size={16} strokeWidth={active ? 1.9 : 1.5} />
                  <span>{t(item.label)}</span>
                </Link>
                {hasSessionsBelow && (
                  <div className={`${sessionViewportClassName} overflow-y-auto`}>
                    <SessionList
                      sessions={sessions}
                      activeSessionId={activeSessionId}
                      loading={loadingSessions}
                      onSelect={onSelectSession}
                      onRename={onRenameSession}
                      onDelete={onDeleteSession}
                      compact
                    />
                  </div>
                )}
                {hasBots && <TutorBotRecent />}
              </div>
            );
          })}
        </div>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Secondary nav + footer */}
      <div className="border-t border-[var(--border)]/40 px-2 py-2">
        {SECONDARY_NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13.5px] transition-colors ${
                active
                  ? "bg-[var(--background)]/70 font-medium text-[var(--foreground)]"
                  : "text-[var(--muted-foreground)] hover:bg-[var(--background)]/50 hover:text-[var(--foreground)]"
              }`}
            >
              <item.icon size={16} strokeWidth={active ? 1.9 : 1.5} />
              <span>{t(item.label)}</span>
            </Link>
          );
        })}
        {footerSlot}
      </div>
    </aside>
  );
}
