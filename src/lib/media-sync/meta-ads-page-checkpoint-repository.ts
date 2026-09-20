import { createMetaPageScope, validateMetaPageCheckpoint, metaPageJson, requireMetaPage,
  MetaPageCheckpointError, type MetaPageCheckpoint, type MetaPageScope } from "./meta-ads-page-checkpoint-contract";
import { appendMediaSyncStagingBatch } from "./media-sync-staging-repository";
import { prepareMetaAdsStagingBatch } from "./meta-ads-staging-contract";
import type { MetaAdsStagingOrchestratorDependencies } from "./meta-ads-staging-orchestrator";
import type { MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import type { MetaAdsInsightsOptions } from "./meta-ads-ad-daily-insights-collector";
import type { MediaSyncJobRecord } from "./types";

export const META_PAGE_CHECKPOINT_MAX_BYTES = 32 * 1024 * 1024;
export const META_PAGE_RPC = Object.freeze({ load: "load_meta_ads_page_checkpoint_v1",
  cas: "compare_and_set_meta_ads_page_checkpoint_v1", append: "append_meta_ads_checkpoint_page_v1" });
export type MetaPageRpc = (name: string, args: { p_payload: Record<string, unknown> }) =>
  Promise<{ data: unknown; error: unknown }>;
type Ports = Pick<MetaAdsStagingOrchestratorDependencies, "loadCheckpoint" | "compareAndSetCheckpoint" | "appendBatch">;

/** A checksum is evidence of bytes, never authentication. PostgreSQL also checks
 * the decoded document, transition, locked job claim, and staging contents.
 * Explicit invocation only: no Supabase/admin/env/credential/live-fetch fallback.
 */
export function metaPageDatabaseEnvelope(scope: MetaPageScope): Record<string, unknown> {
  const identity = Object.fromEntries(["id", "workspace_id", "advertiser_id", "report_id", "connection_id",
    "created_by", "external_account_id", "date_from", "date_to", "previous_ingestion_id", "created_at",
    "attempt_count", "started_at"].map((k) => [k, scope.job[k as keyof MediaSyncJobRecord]]));
  return { job_id: scope.job.id, storage_key: scope.storageKey, scope: scope.key,
    scope_text: metaPageJson({ version: 1, identity, context: scope.context, options: scope.options }),
    collector_scope: scope.collectorScope,
    collector_text: JSON.stringify({ context: scope.context, pageSize: scope.options.pageSize,
      maxPages: scope.options.maxPages, maxRecords: scope.options.maxRecords }) };
}
export function metaPageDatabaseEvidence(next: MetaPageCheckpoint): Record<string, unknown> {
  requireMetaPage(Buffer.byteLength(metaPageJson(next)) <= META_PAGE_CHECKPOINT_MAX_BYTES, "INVALID_CHECKPOINT");
  const body = Object.fromEntries(Object.entries(next).filter(([key]) => key !== "digest"));
  const pending = next.pending;
  return { next, checkpoint_text: metaPageJson({ namespace: "meta_page_checkpoint_v1", body }),
    pending_text: pending ? metaPageJson({ namespace: "meta_prepared_page_v1", scope: next.scope,
      baseRevision: next.revision - 1, rowStartIndex: next.nextRowIndex,
      page: Object.fromEntries(Object.entries(pending).filter(([key]) => key !== "id")) }) : null };
}

export function createMetaAdsPageCheckpointRepository(input: {
  job: MediaSyncJobRecord; context: MetaAdsCanonicalContext; collectorOptions?: MetaAdsInsightsOptions;
}, invokeRpc: MetaPageRpc): Ports {
  requireMetaPage(typeof window === "undefined" && typeof invokeRpc === "function", "MISSING_DEPENDENCY");
  const scope = createMetaPageScope(input.job, input.context, input.collectorOptions);
  const envelope = metaPageDatabaseEnvelope(scope);
  async function rpc(name: string, extra: Record<string, unknown> = {}): Promise<unknown> {
    try {
      const result = await invokeRpc(name, { p_payload: structuredClone({ ...envelope, ...extra }) });
      requireMetaPage(result && result.error == null && Object.hasOwn(result, "data"), "CHECKPOINT_UNCONFIRMED");
      return result.data;
    } catch { throw new MetaPageCheckpointError("CHECKPOINT_UNCONFIRMED"); }
  }
  const load: Ports["loadCheckpoint"] = async (key) => {
    requireMetaPage(key === scope.storageKey, "INVALID_SCOPE");
    const result = await rpc(META_PAGE_RPC.load);
    return result === null ? null : validateMetaPageCheckpoint(result, scope);
  };
  return {
    loadCheckpoint: load,
    compareAndSetCheckpoint: async ({ storageKey, expectedRevision, next }) => {
      requireMetaPage(storageKey === scope.storageKey, "INVALID_SCOPE");
      requireMetaPage(expectedRevision === null || Number.isSafeInteger(expectedRevision) && expectedRevision >= 0,
        "INVALID_CHECKPOINT");
      const state = validateMetaPageCheckpoint(next, scope);
      requireMetaPage(state.revision === (expectedRevision ?? 0) + 1 &&
        (expectedRevision !== null || state.phase === "pending"), "INVALID_CHECKPOINT");
      const result = await rpc(META_PAGE_RPC.cas, { expected_revision: expectedRevision, ...metaPageDatabaseEvidence(state) });
      requireMetaPage(typeof result === "boolean", "CHECKPOINT_UNCONFIRMED");
      return result;
    },
    appendBatch: async (request) => {
      try {
        const supplied = createMetaPageScope(request.job, request.metaContext!, input.collectorOptions);
        requireMetaPage(supplied.key === scope.key && request.dateWindowIndex === 0, "INVALID_SCOPE");
        const observed = await load(scope.storageKey) as MetaPageCheckpoint | null;
        requireMetaPage(observed?.phase === "pending" && observed.pending, "INVALID_CHECKPOINT");
        const rows = prepareMetaAdsStagingBatch({ context: scope.context, rows: request.rows,
          rowStartIndex: request.rowStartIndex });
        requireMetaPage(rows.length > 0 && metaPageJson(rows) === metaPageJson(observed.pending.rows), "INVALID_PAGE");
        // Reuse the existing serializer/result validation, route its injected RPC
        // exclusively through the claim-fenced Meta wrapper. Never call it directly.
        return await appendMediaSyncStagingBatch(request, { invokeRpc: async (name, args) => {
          requireMetaPage(name === "append_media_sync_staging_batch", "INVALID_SCOPE");
          const data = await rpc(META_PAGE_RPC.append, { expected_revision: observed.revision,
            pending_id: observed.pending!.id, append_payload: args.p_payload });
          return { data: [data], error: null };
        } });
      } catch { throw new MetaPageCheckpointError("APPEND_UNCONFIRMED"); }
    },
  };
}
