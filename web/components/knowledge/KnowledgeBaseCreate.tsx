"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { FileUp, Loader2, Plus } from "lucide-react";

const ProcessLogs = dynamic(() => import("@/components/common/ProcessLogs"), {
  ssr: false,
});

interface RAGProvider {
  id: string;
  name: string;
  description: string;
}

interface ProcessState {
  taskId: string | null;
  label: string;
  logs: string[];
  executing: boolean;
  error: string | null;
}

interface KnowledgeBaseCreateProps {
  providers: RAGProvider[];
  creating: boolean;
  process: ProcessState;
  onCreateKnowledgeBase: (
    name: string,
    provider: string,
    files: File[],
    fileInputRef: HTMLInputElement | null
  ) => void;
}

export default function KnowledgeBaseCreate({
  providers,
  creating,
  process,
  onCreateKnowledgeBase,
}: KnowledgeBaseCreateProps) {
  const { t } = useTranslation();
  const [newKbName, setNewKbName] = useState("");
  const [newKbFiles, setNewKbFiles] = useState<File[]>([]);
  const [selectedProvider, setSelectedProvider] = useState(
    providers.length > 0 ? providers[0].id : "llamaindex"
  );
  const createFileRef = useRef<HTMLInputElement>(null);

  const handleCreate = () => {
    if (!newKbName.trim() || !newKbFiles.length) return;
    onCreateKnowledgeBase(newKbName.trim(), selectedProvider, newKbFiles, createFileRef.current);
    // Reset form
    setNewKbName("");
    setNewKbFiles([]);
    if (createFileRef.current) createFileRef.current.value = "";
  };

  return (
    <section className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Plus size={15} className="text-[var(--muted-foreground)]" />
        <h2 className="text-[14px] font-semibold text-[var(--foreground)]">
          {t("Create knowledge base")}
        </h2>
      </div>

      <div className="space-y-3">
        <input
          value={newKbName}
          onChange={(event) => setNewKbName(event.target.value)}
          placeholder={t("Knowledge base name")}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none transition-colors focus:border-[var(--foreground)]/25"
        />

        <select
          value={selectedProvider}
          onChange={(event) => setSelectedProvider(event.target.value)}
          className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[13px] text-[var(--foreground)] outline-none"
        >
          {providers.map((provider) => (
            <option key={provider.id} value={provider.id}>
              {provider.name}
            </option>
          ))}
        </select>

        {/* Styled file upload area */}
        <button
          type="button"
          onClick={() => createFileRef.current?.click()}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] bg-[var(--background)] px-4 py-3 text-[13px] text-[var(--muted-foreground)] transition-colors hover:border-[var(--foreground)]/25 hover:text-[var(--foreground)]"
        >
          <FileUp size={15} />
          {newKbFiles.length
            ? newKbFiles.length > 1
              ? t("{n} files selected", { n: newKbFiles.length })
              : t("{n} file selected", { n: newKbFiles.length })
            : t("Choose files...")}
        </button>
        <input
          ref={createFileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => setNewKbFiles(Array.from(event.target.files || []))}
        />

        {!!newKbFiles.length && (
          <div className="flex flex-wrap gap-1.5">
            {newKbFiles.map((file) => (
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
          onClick={handleCreate}
          disabled={creating || !newKbName.trim() || !newKbFiles.length}
          className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-3.5 py-1.5 text-[13px] font-medium text-[var(--primary-foreground)] transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus size={14} />}
          {t("Create")}
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
              title={t("Create Process")}
            />
          </div>
        )}

        {process.error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {process.error}
          </div>
        )}
      </div>
    </section>
  );
}
