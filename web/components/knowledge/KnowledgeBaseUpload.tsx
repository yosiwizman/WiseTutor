"use client";

import dynamic from "next/dynamic";
import { useRef, useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Loader2, Upload } from "lucide-react";

const ProcessLogs = dynamic(() => import("@/components/common/ProcessLogs"), {
  ssr: false,
});

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

interface ProcessState {
  taskId: string | null;
  label: string;
  logs: string[];
  executing: boolean;
  error: string | null;
}

interface KnowledgeBaseUploadProps {
  knowledgeBases: KnowledgeBase[];
  uploadingKb: string | null;
  process: ProcessState;
  onUpload: (
    kbName: string,
    files: File[],
    fileInputRef: HTMLInputElement | null
  ) => void;
}

const resolveKbStatus = (kb: KnowledgeBase): string =>
  kb.status ?? kb.statistics?.status ?? "unknown";

const kbNeedsReindex = (kb: KnowledgeBase): boolean =>
  Boolean(kb.statistics?.needs_reindex) || resolveKbStatus(kb) === "needs_reindex";

const kbIsUploadable = (kb: KnowledgeBase): boolean =>
  resolveKbStatus(kb) === "ready" && !kbNeedsReindex(kb);

export default function KnowledgeBaseUpload({
  knowledgeBases,
  uploadingKb,
  process,
  onUpload,
}: KnowledgeBaseUploadProps) {
  const { t } = useTranslation();
  const [uploadTarget, setUploadTarget] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const uploadFileRef = useRef<HTMLInputElement>(null);

  // Auto-select uploadTarget when knowledgeBases change (preserve original behavior)
  useEffect(() => {
    const preferredUploadTarget =
      knowledgeBases.find((kb) => kb.is_default && kbIsUploadable(kb))?.name ??
      knowledgeBases.find((kb) => kbIsUploadable(kb))?.name ??
      "";

    setUploadTarget((prev) => {
      if (prev && knowledgeBases.some((kb) => kb.name === prev && kbIsUploadable(kb))) {
        return prev;
      }
      return preferredUploadTarget;
    });
  }, [knowledgeBases]);

  const hasUploadableKb = useMemo(
    () => knowledgeBases.some((kb) => kbIsUploadable(kb)),
    [knowledgeBases],
  );

  const uploadTargetKb = useMemo(
    () => knowledgeBases.find((kb) => kb.name === uploadTarget) ?? null,
    [knowledgeBases, uploadTarget],
  );

  const uploadBlockedReason = useMemo(() => {
    if (!uploadTargetKb) return null;
    if (kbNeedsReindex(uploadTargetKb)) {
      return t("This knowledge base is in legacy index format and needs reindex before upload.");
    }
    const status = resolveKbStatus(uploadTargetKb);
    if (status !== "ready") {
      return t("This knowledge base is currently {{status}} and cannot accept uploads yet.", {
        status: status.replaceAll("_", " ")
      });
    }
    return null;
  }, [uploadTargetKb, t]);

  const uploadDisabled =
    !uploadTarget || !uploadFiles.length || !!uploadingKb || Boolean(uploadBlockedReason);

  const handleUpload = () => {
    if (!uploadTarget || !uploadFiles.length) return;
    onUpload(uploadTarget, uploadFiles, uploadFileRef.current);
    // Reset form
    setUploadFiles([]);
    if (uploadFileRef.current) uploadFileRef.current.value = "";
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Upload size={15} className="text-[var(--muted-foreground)]" />
        <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
          {t("Upload documents")}
        </h2>
      </div>

      <div className="space-y-3">
        <select
          data-testid="upload-target-select"
          value={uploadTarget}
          onChange={(event) => setUploadTarget(event.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none"
        >
          <option value="">{t("Select a knowledge base")}</option>
          {knowledgeBases.map((kb) => {
            const status = resolveKbStatus(kb);
            const needsReindex = kbNeedsReindex(kb);
            const uploadable = kbIsUploadable(kb);
            let suffix = "";
            if (needsReindex) {
              suffix = ` (${t("needs reindex")})`;
            } else if (status !== "ready") {
              suffix = ` (${status.replaceAll("_", " ")})`;
            }
            return (
              <option key={kb.name} value={kb.name} disabled={!uploadable}>
                {kb.name}
                {suffix}
              </option>
            );
          })}
        </select>

        {!hasUploadableKb && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {t("No ready knowledge base is available for upload. Create a new KB or reindex legacy KBs first.")}
          </div>
        )}

        {uploadBlockedReason && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
            {uploadBlockedReason}
          </div>
        )}

        <button
          type="button"
          onClick={() => uploadFileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[13px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--foreground)]/25 hover:text-[var(--foreground)]"
        >
          <FileUp size={15} />
          {uploadFiles.length
            ? uploadFiles.length > 1
              ? t("{n} files selected", { n: uploadFiles.length })
              : t("{n} file selected", { n: uploadFiles.length })
            : t("Choose files...")}
        </button>
        <input
          ref={uploadFileRef}
          data-testid="upload-file-input"
          type="file"
          multiple
          className="hidden"
          onChange={(event) =>
            setUploadFiles(Array.from(event.target.files || []))
          }
        />

        {!!uploadFiles.length && (
          <div className="flex flex-wrap gap-1.5">
            {uploadFiles.map((file) => (
              <span
                key={file.name}
                className="rounded-md bg-[var(--muted)] px-2 py-0.5 text-[11px] text-[var(--muted-foreground)]"
              >
                {file.name}
              </span>
            ))}
          </div>
        )}

        <button
          data-testid="upload-submit"
          onClick={handleUpload}
          disabled={uploadDisabled}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--foreground)] transition-colors hover:bg-[var(--muted)] disabled:cursor-not-allowed disabled:opacity-40"
        >
          {uploadingKb ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Upload size={14} />
          )}
          {t("Upload")}
        </button>

        {(process.taskId || process.logs.length > 0 || process.executing) && (
          <div className="space-y-2">
            {process.label && (
              <div className="text-[11px] text-[var(--muted-foreground)]">
                {process.label}
                {process.taskId ? ` · ${process.taskId}` : ""}
              </div>
            )}
            <ProcessLogs
              logs={process.logs}
              executing={process.executing}
              title={t("Upload Process")}
            />
          </div>
        )}

        {process.error && (
          <div
            data-testid="upload-error"
            className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
          >
            {process.error}
          </div>
        )}
      </div>
    </section>
  );
}
