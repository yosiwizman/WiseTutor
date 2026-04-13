"use client";

import { Calendar, Mail } from "lucide-react";
import { useTranslation } from "react-i18next";

export default function ConnectionsPage() {
  const { t } = useTranslation();

  return (
    <div className="p-6 max-w-2xl mx-auto" data-testid="connections-page-ready">
      <h1 className="text-2xl font-semibold text-[var(--foreground)] mb-2">
        {t("Connections")}
      </h1>
      <p className="text-[var(--muted-foreground)] text-sm mb-6">
        {t(
          "Connect Gmail and Google Calendar so WiseTutor can help with messages and schedules. Real connections will land in a future update."
        )}
      </p>

      <div className="flex flex-col gap-4">
        {/* Gmail card */}
        <div
          className="rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-5"
          data-testid="connection-card-gmail"
          data-status="not-available"
        >
          <div className="flex items-center gap-3 mb-3">
            <Mail size={20} className="text-[var(--muted-foreground)]" />
            <span className="font-medium text-[var(--foreground)]">Gmail</span>
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {t("Not available yet")}
            </span>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("Gmail connection is coming soon. No action needed right now.")}
          </p>
        </div>

        {/* Google Calendar card */}
        <div
          className="rounded-xl border border-[var(--border)] bg-[var(--secondary)] p-5"
          data-testid="connection-card-gcal"
          data-status="not-available"
        >
          <div className="flex items-center gap-3 mb-3">
            <Calendar size={20} className="text-[var(--muted-foreground)]" />
            <span className="font-medium text-[var(--foreground)]">Google Calendar</span>
            <span className="ml-auto text-xs font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              {t("Not available yet")}
            </span>
          </div>
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("Google Calendar connection is coming soon. No action needed right now.")}
          </p>
        </div>
      </div>
    </div>
  );
}
