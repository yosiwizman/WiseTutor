"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  Database,
  Loader2,
  NotebookPen,
} from "lucide-react";
import { apiUrl, wsUrl } from "@/lib/api";
import {
  invalidateKnowledgeCaches,
  listKnowledgeBases,
  listRagProviders,
} from "@/lib/knowledge-api";
import { OwnerInspectSelector, ReadOnlyInspectBanner } from "@/components/OwnerInspectSelector";
import {
  getNotebookDetail,
  invalidateNotebookCaches,
  listNotebooks,
} from "@/lib/notebook-api";
import KnowledgeBaseCreate from "@/components/knowledge/KnowledgeBaseCreate";
import KnowledgeBaseUpload from "@/components/knowledge/KnowledgeBaseUpload";
import KnowledgeBaseList from "@/components/knowledge/KnowledgeBaseList";
import NotebookManager from "@/components/knowledge/NotebookManager";

const MarkdownRenderer = dynamic(() => import("@/components/common/MarkdownRenderer"), {
  ssr: false,
});
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

interface RAGProvider {
  id: string;
  name: string;
  description: string;
}

interface KnowledgeTaskResponse {
  task_id?: string;
}

interface ProcessState {
  taskId: string | null;
  label: string;
  logs: string[];
  executing: boolean;
  error: string | null;
}

type ProcessKind = "create" | "upload";

const EMPTY_PROCESS_STATE: ProcessState = {
  taskId: null,
  label: "",
  logs: [],
  executing: false,
  error: null,
};

const resolveKbStatus = (kb: KnowledgeBase): string => kb.status ?? kb.statistics?.status ?? "unknown";

const kbNeedsReindex = (kb: KnowledgeBase): boolean =>
  Boolean(kb.statistics?.needs_reindex) || resolveKbStatus(kb) === "needs_reindex";

const kbIsUploadable = (kb: KnowledgeBase): boolean =>
  resolveKbStatus(kb) === "ready" && !kbNeedsReindex(kb);

export default function KnowledgePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [tab, setTab] = useState<"knowledge" | "notebooks">("knowledge");
  const [knowledgeBases, setKnowledgeBases] = useState<KnowledgeBase[]>([]);
  const [notebooks, setNotebooks] = useState<NotebookInfo[]>([]);
  const [providers, setProviders] = useState<RAGProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [uploadingKb, setUploadingKb] = useState<string | null>(null);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressInfo>>({});
  const [selectedNotebookId, setSelectedNotebookId] = useState<string | null>(null);
  const [selectedNotebook, setSelectedNotebook] = useState<NotebookDetail | null>(null);
  const [loadingNotebookDetail, setLoadingNotebookDetail] = useState(false);
  const [createProcess, setCreateProcess] = useState<ProcessState>(EMPTY_PROCESS_STATE);
  const [uploadProcess, setUploadProcess] = useState<ProcessState>(EMPTY_PROCESS_STATE);
  const [inspectAsUser, setInspectAsUser] = useState<string | null>(null);
  const isInspecting = inspectAsUser !== null;
  const socketsRef = useRef<Record<string, WebSocket>>({});
  const logSourcesRef = useRef<Record<ProcessKind, EventSource | null>>({
    create: null,
    upload: null,
  });

  const getProcessSetter = (kind: ProcessKind) =>
    kind === "create" ? setCreateProcess : setUploadProcess;

  const closeTaskLogStream = (kind: ProcessKind) => {
    logSourcesRef.current[kind]?.close();
    logSourcesRef.current[kind] = null;
  };

  const closeProgressSocket = (kbName: string) => {
    socketsRef.current[kbName]?.close();
    delete socketsRef.current[kbName];
  };

  const closeAllProgressSockets = () => {
    Object.values(socketsRef.current).forEach((socket) => socket.close());
    socketsRef.current = {};
  };

  const openTaskLogStream = (kind: ProcessKind, taskId: string, label: string) => {
    closeTaskLogStream(kind);
    const setProcess = getProcessSetter(kind);
    setProcess({
      taskId,
      label,
      logs: [],
      executing: true,
      error: null,
    });

    const source = new EventSource(apiUrl(`/api/v1/knowledge/tasks/${taskId}/stream`));
    logSourcesRef.current[kind] = source;

    let settled = false;

    source.addEventListener("log", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { line?: string };
        if (!payload.line) return;
        setProcess((prev) => ({
          ...prev,
          taskId,
          label,
          logs: [...prev.logs, payload.line!],
        }));
      } catch {
        // Ignore malformed log events.
      }
    });

    source.addEventListener("complete", () => {
      settled = true;
      setProcess((prev) => ({ ...prev, taskId, label, executing: false }));
      closeTaskLogStream(kind);
    });

    source.addEventListener("failed", (event) => {
      settled = true;
      let detail = "Task failed";
      try {
        const payload = JSON.parse((event as MessageEvent).data) as { detail?: string };
        detail = payload.detail || detail;
      } catch {
        // Ignore malformed failure events.
      }
      setProcess((prev) => ({
        ...prev,
        taskId,
        label,
        executing: false,
        error: detail,
      }));
      closeTaskLogStream(kind);
    });

    source.onerror = () => {
      if (settled) return;
      setProcess((prev) => {
        if (!prev.executing) return prev;
        return {
          ...prev,
          taskId,
          label,
          executing: false,
          error: prev.error || "Process log stream disconnected.",
        };
      });
      closeTaskLogStream(kind);
    };
  };

  const loadAll = async () => {
    setLoading(true);
    setPageError(null);
    try {
      const [kbs, providerData, nextNotebooks] = await Promise.all([
        listKnowledgeBases({ asUser: inspectAsUser, force: true }),
        listRagProviders(),
        listNotebooks(),
      ]);
      setKnowledgeBases(kbs);
      setProviders(
        providerData.length
          ? providerData
          : [
              {
                id: "llamaindex",
                name: "LlamaIndex",
                description: "Pure vector retrieval, fastest processing speed.",
              },
            ],
      );
      setNotebooks(nextNotebooks);
      if (!selectedNotebookId && nextNotebooks.length > 0) {
        void loadNotebookDetail(nextNotebooks[0].id);
      } else if (selectedNotebookId) {
        const stillExists = nextNotebooks.some((item: NotebookInfo) => item.id === selectedNotebookId);
        if (stillExists) {
          void loadNotebookDetail(selectedNotebookId);
        } else {
          setSelectedNotebookId(null);
          setSelectedNotebook(null);
        }
      }

      for (const kb of kbs) {
        const status = kb.status ?? kb.statistics?.status;
        const progress = kb.progress ?? kb.statistics?.progress;
        const progressStage = (progress as ProgressInfo | undefined)?.stage;
        if (
          status &&
          status !== "ready" &&
          status !== "error" &&
          progressStage !== "completed" &&
          progressStage !== "error"
        ) {
          setProgressMap((prev) => ({ ...prev, [kb.name]: progress || prev[kb.name] || {} }));
          const taskId = (progress as ProgressInfo | undefined)?.task_id;
          subscribeProgress(kb.name, taskId || undefined);
        }
      }
    } catch (error) {
      setPageError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
    return () => {
      closeAllProgressSockets();
      closeTaskLogStream("create");
      closeTaskLogStream("upload");
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inspectAsUser]);

  const subscribeProgress = (kbName: string, expectedTaskId?: string) => {
    closeProgressSocket(kbName);

    const query = expectedTaskId ? `?task_id=${encodeURIComponent(expectedTaskId)}` : "";
    const socket = new WebSocket(wsUrl(`/api/v1/knowledge/${kbName}/progress/ws${query}`));
    socketsRef.current[kbName] = socket;

    socket.onmessage = (event) => {
      try {
        const rawData = JSON.parse(event.data) as {
          type?: string;
          data?: ProgressInfo;
          message?: string;
        };
        const progress =
          rawData?.type === "progress" && rawData.data ? rawData.data : (rawData as ProgressInfo);
        if (!progress || typeof progress !== "object") return;
        if (expectedTaskId && progress.task_id && progress.task_id !== expectedTaskId) return;

        setProgressMap((prev) => ({ ...prev, [kbName]: progress }));
        const stage = progress.stage;
        if (stage === "completed" || stage === "error") {
          closeProgressSocket(kbName);
          if (expectedTaskId) {
            void loadAll();
          }
        }
      } catch {
        // Ignore malformed progress events.
      }
    };

    socket.onerror = () => {
      closeProgressSocket(kbName);
    };

    socket.onclose = () => {
      delete socketsRef.current[kbName];
    };
  };

  const createKnowledgeBase = async (
    name: string,
    provider: string,
    files: File[],
    fileInputRef: HTMLInputElement | null
  ) => {
    if (!name.trim() || !files.length) return;
    const kbName = name.trim();
    const fileCount = files.length;
    setCreating(true);
    try {
      const form = new FormData();
      form.append("name", kbName);
      form.append("rag_provider", provider);
      files.forEach((file) => form.append("files", file));

      const res = await fetch(apiUrl("/api/v1/knowledge/create"), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.detail || "Failed to create knowledge base");
      }

      const data = (await res.json()) as KnowledgeTaskResponse;
      invalidateKnowledgeCaches();
      if (data.task_id) {
        openTaskLogStream("create", data.task_id, `Create ${kbName}`);
        subscribeProgress(kbName, data.task_id);
        setProgressMap((prev) => ({
          ...prev,
          [kbName]: {
            task_id: data.task_id,
            stage: "initializing",
            message: "Initializing knowledge base...",
            current: 0,
            total: fileCount,
            progress_percent: 0,
          },
        }));
      } else {
        subscribeProgress(kbName);
      }

      await loadAll();
    } catch (error) {
      setCreateProcess((prev) => ({
        ...prev,
        executing: false,
        error: error instanceof Error ? error.message : String(error),
        label: prev.label || `Create ${kbName}`,
      }));
    } finally {
      setCreating(false);
    }
  };

  const uploadToKnowledgeBase = async (
    kbName: string,
    files: File[],
    fileInputRef: HTMLInputElement | null
  ) => {
    if (!kbName || !files.length) return;
    const targetKb = kbName;
    const fileCount = files.length;
    setUploadingKb(kbName);
    try {
      const form = new FormData();
      files.forEach((file) => form.append("files", file));

      const res = await fetch(apiUrl(`/api/v1/knowledge/${targetKb}/upload`), {
        method: "POST",
        body: form,
      });
      if (!res.ok) {
        let detail: unknown = null;
        try {
          const body = await res.json();
          detail = body?.detail;
        } catch {
          // non-JSON error body; leave detail null and fall through
        }
        // Backend may return detail as a string OR as a structured object
        // ({code, message, filename, ...} for PDF preflight rejections).
        // Render the object fields in a readable form so the user sees the
        // truthful error, not "[object Object]".
        const readable =
          typeof detail === "string"
            ? detail
            : (detail as { message?: string; code?: string } | null)?.message ||
              (detail as { message?: string; code?: string } | null)?.code ||
              (detail ? JSON.stringify(detail) : null) ||
              "Failed to upload files";
        throw new Error(readable);
      }

      const data = (await res.json()) as KnowledgeTaskResponse;
      invalidateKnowledgeCaches();
      if (data.task_id) {
        openTaskLogStream("upload", data.task_id, `Upload to ${targetKb}`);
        subscribeProgress(targetKb, data.task_id);
        setProgressMap((prev) => ({
          ...prev,
          [targetKb]: {
            task_id: data.task_id,
            stage: "processing_documents",
            message: `Processing ${fileCount} files...`,
            current: 0,
            total: fileCount,
            progress_percent: 0,
          },
        }));
      } else {
        subscribeProgress(targetKb);
      }

      await loadAll();
    } catch (error) {
      setUploadProcess((prev) => ({
        ...prev,
        executing: false,
        error: error instanceof Error ? error.message : String(error),
        label: prev.label || `Upload to ${targetKb}`,
      }));
    } finally {
      setUploadingKb(null);
    }
  };

  const setDefaultKnowledgeBase = async (kbName: string) => {
    await fetch(apiUrl(`/api/v1/knowledge/default/${kbName}`), { method: "PUT" });
    invalidateKnowledgeCaches();
    await loadAll();
  };

  const deleteKnowledgeBase = async (kbName: string) => {
    if (!window.confirm(t('Delete knowledge base "{{name}}"?', { name: kbName }))) return;
    await fetch(apiUrl(`/api/v1/knowledge/${kbName}`), { method: "DELETE" });
    invalidateKnowledgeCaches();
    await loadAll();
  };

  const createNotebook = async (name: string, description: string) => {
    if (!name.trim()) return;
    await fetch(apiUrl("/api/v1/notebook/create"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
      }),
    });
    invalidateNotebookCaches();
    await loadAll();
  };

  const loadNotebookDetail = async (notebookId: string) => {
    setSelectedNotebookId(notebookId);
    setLoadingNotebookDetail(true);
    try {
      const notebook = (await getNotebookDetail(notebookId)) as NotebookDetail;
      setSelectedNotebook(notebook);
    } catch {
      setSelectedNotebook(null);
    } finally {
      setLoadingNotebookDetail(false);
    }
  };

  const openNotebookRecord = (record: NotebookRecord) => {
    const sessionId = String(record.metadata?.session_id || "");
    if (!sessionId) return;
    if (record.type === "chat") {
      router.push(`/?session=${encodeURIComponent(sessionId)}`);
      return;
    }
    if (record.type === "guided_learning") {
      router.push(`/guide?session=${encodeURIComponent(sessionId)}`);
    }
  };

  const combinedKbs = useMemo(
    () =>
      knowledgeBases.map((kb) => ({
        ...kb,
        status: kb.status ?? kb.statistics?.status,
        progress: progressMap[kb.name] || kb.progress || kb.statistics?.progress,
      })),
    [knowledgeBases, progressMap],
  );

  return (
    <div className="h-full overflow-y-auto bg-[var(--background)] [scrollbar-gutter:stable]">
      <div className="mx-auto max-w-5xl px-6 py-8 pb-10">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
              {t("Knowledge")}
            </h1>
            <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
              {t("Manage your knowledge bases and notebooks in one place.")}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <OwnerInspectSelector value={inspectAsUser} onChange={setInspectAsUser} />
          </div>

          <div className="inline-flex shrink-0 rounded-lg border border-[var(--border)] bg-[var(--muted)] p-0.5">
            {[
              { key: "knowledge", label: t("Knowledge Bases"), icon: Database },
              { key: "notebooks", label: t("Notebooks"), icon: NotebookPen },
            ].map((item) => (
              <button
                key={item.key}
                onClick={() => setTab(item.key as "knowledge" | "notebooks")}
                className={`inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-[13px] font-medium transition-all ${
                  tab === item.key
                    ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm"
                    : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {isInspecting && inspectAsUser && (
          <ReadOnlyInspectBanner targetId={inspectAsUser} users={null} />
        )}

        {pageError && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
            {pageError}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--muted-foreground)]" />
          </div>
        ) : tab === "knowledge" ? (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Create KB */}
              <KnowledgeBaseCreate
                providers={providers}
                creating={creating}
                process={createProcess}
                onCreateKnowledgeBase={createKnowledgeBase}
              />

              {/* Upload to existing KB */}
              <KnowledgeBaseUpload
                knowledgeBases={combinedKbs}
                uploadingKb={uploadingKb}
                process={uploadProcess}
                onUpload={uploadToKnowledgeBase}
              />
            </div>

            {/* KB list */}
            <KnowledgeBaseList
              knowledgeBases={combinedKbs}
              onSetDefault={setDefaultKnowledgeBase}
              onDelete={deleteKnowledgeBase}
              isInspecting={isInspecting}
            />

            {/*
              PHASE 3 EXTENSION POINT: AI Librarian Panel

              This is the designated mount point for the AI Librarian feature (Phase 3).
              When Phase 3 is implemented, add the LibrarianPanel component here:

              <LibrarianPanel
                knowledgeBases={combinedKbs}
                isInspecting={isInspecting}
              />

              The Librarian will provide AI-powered assistance for knowledge management,
              including automated organization, summarization, and query assistance.
            */}
          </div>
        ) : (
          <NotebookManager
            notebooks={notebooks}
            onCreateNotebook={createNotebook}
            onLoadNotebookDetail={loadNotebookDetail}
            onOpenRecord={openNotebookRecord}
            selectedNotebookId={selectedNotebookId}
            selectedNotebook={selectedNotebook}
            loadingNotebookDetail={loadingNotebookDetail}
            isInspecting={isInspecting}
          />
        )}
      </div>
    </div>
  );
}
