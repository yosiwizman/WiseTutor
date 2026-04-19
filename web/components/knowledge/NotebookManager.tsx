"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowRight,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  GraduationCap,
  Loader2,
  MessageSquare,
  NotebookPen,
  PenLine,
  Plus,
  Search,
} from "lucide-react";
import dynamic from "next/dynamic";

const MarkdownRenderer = dynamic(() => import("@/components/common/MarkdownRenderer"), {
  ssr: false,
});

interface NotebookInfo {
  id: string;
  name: string;
  description?: string;
  record_count?: number;
  color?: string;
  icon?: string;
  updated_at?: number;
}

interface NotebookRecord {
  id: string;
  type: string;
  title: string;
  summary?: string;
  user_query?: string;
  output: string;
  metadata?: Record<string, unknown>;
  created_at?: number;
}

interface NotebookDetail extends NotebookInfo {
  records: NotebookRecord[];
}

interface NotebookManagerProps {
  notebooks: NotebookInfo[];
  onCreateNotebook: (name: string, description: string) => Promise<void>;
  onLoadNotebookDetail: (notebookId: string) => Promise<void>;
  onOpenRecord: (record: NotebookRecord) => void;
  selectedNotebookId: string | null;
  selectedNotebook: NotebookDetail | null;
  loadingNotebookDetail: boolean;
  isInspecting?: boolean;
}

export default function NotebookManager({
  notebooks,
  onCreateNotebook,
  onLoadNotebookDetail,
  onOpenRecord,
  selectedNotebookId,
  selectedNotebook,
  loadingNotebookDetail,
  isInspecting = false,
}: NotebookManagerProps) {
  const { t } = useTranslation();
  const [newNotebookName, setNewNotebookName] = useState("");
  const [newNotebookDescription, setNewNotebookDescription] = useState("");
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);

  const handleCreateNotebook = async () => {
    if (!newNotebookName.trim()) return;
    await onCreateNotebook(newNotebookName.trim(), newNotebookDescription.trim());
    setNewNotebookName("");
    setNewNotebookDescription("");
  };

  const formatTimestamp = (value?: number) => {
    if (!value) return t("Unknown time");
    return new Date(value * 1000).toLocaleString();
  };

  const getRecordBadge = (type: string) => {
    switch (type) {
      case "chat":
        return { label: t("Chat"), color: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300", icon: MessageSquare };
      case "guided_learning":
        return { label: t("Guided Learning"), color: "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300", icon: GraduationCap };
      case "co_writer":
        return { label: t("Co-Writer"), color: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: PenLine };
      case "research":
        return { label: t("Research"), color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300", icon: Search };
      default:
        return { label: type, color: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400", icon: NotebookPen };
    }
  };

  return (
    <div className="space-y-5">
      {/* Create notebook */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <Plus size={15} className="text-[var(--muted-foreground)]" />
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
            {t("Create notebook")}
          </h2>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={newNotebookName}
            onChange={(event) => setNewNotebookName(event.target.value)}
            placeholder={t("Notebook name")}
            disabled={isInspecting}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--foreground)]/25 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <input
            value={newNotebookDescription}
            onChange={(event) => setNewNotebookDescription(event.target.value)}
            placeholder={t("Description")}
            disabled={isInspecting}
            className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--foreground)]/25 disabled:cursor-not-allowed disabled:opacity-40"
          />
          <button
            onClick={handleCreateNotebook}
            disabled={!newNotebookName.trim() || isInspecting}
            className="rounded-lg bg-[var(--primary)] px-3.5 py-2 text-[13px] font-medium text-[var(--primary-foreground)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t("Create")}
          </button>
        </div>
      </section>

      {/* Notebook list */}
      <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <NotebookPen size={15} className="text-[var(--muted-foreground)]" />
          <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
            {t("Notebooks")}
          </h2>
        </div>

        <div className="grid gap-5 xl:grid-cols-[280px_minmax(0,1fr)]">
          <div className="xl:sticky xl:top-8 xl:max-h-[calc(100vh-12rem)] space-y-3 overflow-y-auto pr-1">
            {notebooks.map((notebook) => {
              const active = selectedNotebookId === notebook.id;
              return (
                <button
                  key={notebook.id}
                  onClick={() => void onLoadNotebookDetail(notebook.id)}
                  className={`w-full rounded-xl border p-4 text-left transition-all ${
                    active
                      ? "border-indigo-200 bg-indigo-50/70 shadow-[0_8px_24px_rgba(99,102,241,0.08)] dark:border-indigo-800 dark:bg-indigo-950/25"
                      : "border-[var(--border)] bg-[var(--background)] hover:border-[var(--foreground)]/12 hover:bg-[var(--muted)]/18"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="mt-1 h-3 w-3 rounded-full"
                      style={{ backgroundColor: notebook.color || "#6366f1" }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-[14px] font-semibold text-[var(--foreground)]">
                        {notebook.name}
                      </div>
                      {notebook.description && (
                        <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--muted-foreground)]">
                          {notebook.description}
                        </p>
                      )}
                      <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--muted-foreground)]">
                        <span>{notebook.record_count ?? 0} {t("records")}</span>
                        <span>{notebook.updated_at ? formatTimestamp(notebook.updated_at) : ""}</span>
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {!notebooks.length && (
              <div className="rounded-xl border border-dashed border-[var(--border)] px-6 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
                {t("No notebooks yet. Create one to organize outputs.")}
              </div>
            )}
          </div>

          <div className="flex min-h-[560px] flex-col overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] p-4 xl:h-[calc(100vh-12rem)]">
            {loadingNotebookDetail ? (
              <div className="flex min-h-[320px] items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
              </div>
            ) : selectedNotebook ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="mb-3 flex shrink-0 items-center justify-between gap-4 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: selectedNotebook.color || "#6366f1" }}
                    />
                    <h3 className="text-[15px] font-semibold text-[var(--foreground)]">
                      {selectedNotebook.name}
                    </h3>
                    {selectedNotebook.description && (
                      <span className="text-[12px] text-[var(--muted-foreground)]">
                        — {selectedNotebook.description}
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] tabular-nums text-[var(--muted-foreground)]">
                    {selectedNotebook.records?.length || 0} {t("records")}
                  </span>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                  <div className="divide-y divide-[var(--border)]">
                    {selectedNotebook.records?.map((record) => {
                      const badge = getRecordBadge(record.type);
                      const BadgeIcon = badge.icon;
                      const expanded = expandedRecordId === record.id;
                      const canOpenSession =
                        (record.type === "chat" || record.type === "guided_learning") &&
                        Boolean(record.metadata?.session_id);
                      const sessionLabel =
                        record.type === "chat" ? t("Open chat session") : t("Open guided learning session");

                      return (
                        <div key={record.id} className="group">
                          {/* Collapsed row — always visible */}
                          <button
                            onClick={() => setExpandedRecordId(expanded ? null : record.id)}
                            className="flex w-full items-center gap-3 px-1 py-3.5 text-left transition-colors hover:bg-[var(--muted)]/30"
                          >
                            <span className="shrink-0 text-[var(--muted-foreground)]">
                              {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </span>
                            <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.color}`}>
                              <BadgeIcon size={11} />
                              {badge.label}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--foreground)]">
                              {record.title}
                            </span>
                            <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted-foreground)]">
                              {formatTimestamp(record.created_at)}
                            </span>
                          </button>

                          {/* Expanded detail */}
                          {expanded && (
                            <div className="pb-4 pl-8 pr-1">
                              {record.summary && (
                                <p className="mb-3 text-[13px] leading-6 text-[var(--foreground)]/85">
                                  {record.summary}
                                </p>
                              )}
                              {record.type !== "chat" && record.user_query && (
                                <div className="mb-3 flex items-baseline gap-2 text-[12px]">
                                  <span className="shrink-0 font-medium text-[var(--muted-foreground)]">{t("Query:")}</span>
                                  <span className="text-[var(--foreground)]/70">{record.user_query}</span>
                                </div>
                              )}

                              {canOpenSession && (
                                <button
                                  onClick={() => onOpenRecord(record)}
                                  className="mb-3 inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3.5 py-2 text-[12px] font-medium text-[var(--foreground)] transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:hover:border-indigo-700 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-300"
                                >
                                  <ExternalLink size={13} />
                                  {sessionLabel}
                                  <ArrowRight size={13} />
                                </button>
                              )}

                              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--muted)]/30 p-3">
                                <MarkdownRenderer
                                  content={record.output || ""}
                                  variant="prose"
                                  className="text-[12px] leading-5 text-[var(--foreground)]"
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {!selectedNotebook.records?.length && (
                      <div className="px-6 py-12 text-center text-[13px] text-[var(--muted-foreground)]">
                        {t("This notebook is empty for now.")}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-[13px] text-[var(--muted-foreground)]">
                {t("Select a notebook to inspect its saved records.")}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
