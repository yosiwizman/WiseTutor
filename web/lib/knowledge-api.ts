import { apiUrl } from "@/lib/api";
import { invalidateClientCache, withClientCache } from "@/lib/client-cache";

const KNOWLEDGE_CACHE_PREFIX = "knowledge:";

export interface KnowledgeBaseSummary {
  name: string;
  is_default?: boolean;
  status?: string;
  progress?: Record<string, unknown>;
  statistics?: Record<string, unknown>;
}

export interface RagProviderSummary {
  id: string;
  name: string;
  description: string;
}

export async function listKnowledgeBases(options?: { force?: boolean; asUser?: string | null }) {
  // When inspecting another user's KBs (owner-only oversight), bypass the
  // client cache entirely so target switches always re-fetch and never bleed
  // one user's list into another's view.
  const asUser = options?.asUser ?? null;
  const path = asUser
    ? `/api/v1/knowledge/list?as_user=${encodeURIComponent(asUser)}`
    : "/api/v1/knowledge/list";
  if (asUser) {
    const response = await fetch(apiUrl(path), { cache: "no-store" });
    const data = await response.json();
    return Array.isArray(data)
      ? (data as KnowledgeBaseSummary[])
      : Array.isArray(data?.knowledge_bases)
        ? (data.knowledge_bases as KnowledgeBaseSummary[])
        : [];
  }
  return withClientCache<KnowledgeBaseSummary[]>(
    `${KNOWLEDGE_CACHE_PREFIX}list`,
    async () => {
      const response = await fetch(apiUrl(path), {
        cache: "no-store",
      });
      const data = await response.json();
      return Array.isArray(data)
        ? data
        : Array.isArray(data?.knowledge_bases)
          ? data.knowledge_bases
          : [];
    },
    {
      force: options?.force,
    },
  );
}

export async function listRagProviders(options?: { force?: boolean }) {
  return withClientCache<RagProviderSummary[]>(
    `${KNOWLEDGE_CACHE_PREFIX}providers`,
    async () => {
      const response = await fetch(apiUrl("/api/v1/knowledge/rag-providers"), {
        cache: "no-store",
      });
      const data = await response.json();
      return Array.isArray(data?.providers) ? data.providers : [];
    },
    {
      force: options?.force,
    },
  );
}

export function invalidateKnowledgeCaches() {
  invalidateClientCache(KNOWLEDGE_CACHE_PREFIX);
}
