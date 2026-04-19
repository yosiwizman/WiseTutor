"use client";

import { useTranslation } from "react-i18next";
import { BookOpen, Star, Trash2 } from "lucide-react";

interface ProgressInfo {
  task_id?: string;
  stage?: string;
  message?: string;
  current?: number;
  total?: number;
  percent?: number;
  progress_percent?: number;
}

interface KnowledgeBase {
  name: string;
  is_default?: boolean;
  status?: string;
  progress?: ProgressInfo;
  statistics?: {
    raw_documents?: number;
    rag_provider?: string;
    needs_reindex?: boolean;
    status?: string;
    progress?: ProgressInfo;
  };
}

interface KnowledgeBaseListProps {
  knowledgeBases: KnowledgeBase[];
  onSetDefault: (kbName: string) => void;
  onDelete: (kbName: string) => void;
  isInspecting?: boolean;
}

const resolveKbStatus = (kb: KnowledgeBase): string => kb.status ?? kb.statistics?.status ?? "unknown";

const kbNeedsReindex = (kb: KnowledgeBase): boolean =>
  Boolean(kb.statistics?.needs_reindex) || resolveKbStatus(kb) === "needs_reindex";

export default function KnowledgeBaseList({
  knowledgeBases,
  onSetDefault,
  onDelete,
  isInspecting = false,
}: KnowledgeBaseListProps) {
  const { t } = useTranslation();

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <BookOpen size={15} className="text-[var(--muted-foreground)]" />
        <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
          {t("Knowledge bases")}
        </h2>
      </div>

      <div className="space-y-3">
        {knowledgeBases.map((kb) => {
          const progress = kb.progress;
          const status = resolveKbStatus(kb);
          const needsReindex = kbNeedsReindex(kb);
          const displayStatus =
            needsReindex
              ? t("needs reindex")
              : status !== "ready"
                ? status.replaceAll("_", " ")
                : null;
          const percent =
            progress?.progress_percent ??
            progress?.percent ??
            ((progress?.current ?? 0) && (progress?.total ?? 0)
              ? Math.round(((progress?.current ?? 0) / (progress?.total ?? 1)) * 100)
              : 0);

          return (
            <div
              key={kb.name}
              className="group rounded-lg border border-[var(--border)] bg-[var(--background)] p-4 transition-colors hover:border-[var(--foreground)]/10"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[14px] font-medium text-[var(--foreground)]">
                      {kb.name}
                    </h3>
                    {kb.is_default && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-[var(--muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--muted-foreground)]">
                        <Star size={10} /> {t("Default")}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-[var(--muted-foreground)]">
                    <span>{t("Provider")}: {kb.statistics?.rag_provider || "llamaindex"}</span>
                    <span>{t("Documents")}: {kb.statistics?.raw_documents ?? 0}</span>
                    {displayStatus && (
                      <span
                        className={
                          needsReindex
                            ? "font-medium text-amber-600 dark:text-amber-400"
                            : "capitalize"
                        }
                      >
                        {t("Status")}: {displayStatus}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  {!kb.is_default && (
                    <button
                      onClick={() => onSetDefault(kb.name)}
                      disabled={isInspecting}
                      className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {t("Set default")}
                    </button>
                  )}
                  <button
                    onClick={() => onDelete(kb.name)}
                    disabled={isInspecting}
                    className="rounded-md border border-[var(--border)] p-1.5 text-[var(--muted-foreground)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600 dark:hover:border-red-900 dark:hover:bg-red-950/30 dark:hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>

              {progress?.message && (
                <div className="mt-3 rounded-lg bg-[var(--muted)] p-3">
                  <div className="text-[12px] text-[var(--foreground)]">
                    {progress.message}
                  </div>
                  {percent > 0 && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--border)]">
                      <div
                        className="h-full rounded-full bg-[var(--primary)] transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {!knowledgeBases.length && (
          <div className="rounded-lg border border-dashed border-[var(--border)] px-6 py-10 text-center text-[13px] text-[var(--muted-foreground)]">
            {t("No knowledge bases yet. Create one to get started.")}
          </div>
        )}
      </div>
    </section>
  );
}
