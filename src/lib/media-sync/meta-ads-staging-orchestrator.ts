import { MetaPageCheckpointError, createMetaPageScope, initialMetaPageCheckpoint,
  validateMetaPageCheckpoint, prepareMetaPageCheckpoint, confirmMetaPageAppend,
  metaPageJson, requireMetaPage, freezeMetaPage, type MetaPageCheckpoint, type MetaPageScope,
} from "./meta-ads-page-checkpoint-contract";
import type { MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import type { MetaAdsInsightsOptions, collectMetaAdsAdDailyInsightsPage } from "./meta-ads-ad-daily-insights-collector";
import type { AppendMediaSyncStagingBatchInput, AppendMediaSyncStagingBatchResult } from "./media-sync-staging-repository";
import type { MediaSyncJobRecord } from "./types";

/** Mandatory ports only. No Supabase/fetch/worker/credential fallback.
 * Future durable storage must enforce atomic revision CAS and claim fencing.
 * Append must atomically verify row index/key/content on exact replay.
 * Mocks test this required contract; they do not prove a production DB provides it.
 */
export type MetaAdsStagingOrchestratorDependencies = Readonly<{
  loadCheckpoint: (storageKey: string) => Promise<unknown | null>;
  compareAndSetCheckpoint: (input: Readonly<{
    storageKey: string; expectedRevision: number | null; next: MetaPageCheckpoint;
  }>) => Promise<boolean>;
  collectPage: (input: Parameters<typeof collectMetaAdsAdDailyInsightsPage>[0],
    options: MetaAdsInsightsOptions) => ReturnType<typeof collectMetaAdsAdDailyInsightsPage>;
  appendBatch: (input: AppendMediaSyncStagingBatchInput) => Promise<AppendMediaSyncStagingBatchResult>;
}>;
async function read(scope: MetaPageScope, deps: MetaAdsStagingOrchestratorDependencies): Promise<MetaPageCheckpoint | null> {
  let value: unknown;
  try { value = await deps.loadCheckpoint(scope.storageKey); }
  catch { throw new MetaPageCheckpointError("CHECKPOINT_UNCONFIRMED"); }
  return value === null ? null : validateMetaPageCheckpoint(value, scope);
}
async function persist(scope: MetaPageScope, expectedRevision: number | null, next: MetaPageCheckpoint,
  deps: MetaAdsStagingOrchestratorDependencies): Promise<MetaPageCheckpoint> {
  let acknowledged: boolean | undefined;
  try { acknowledged = await deps.compareAndSetCheckpoint({ storageKey: scope.storageKey, expectedRevision, next }); }
  catch { /* A lost acknowledgement is not evidence of rollback. Always read back. */ }
  const observed = await read(scope, deps);
  if (observed && metaPageJson(observed) === metaPageJson(next)) return observed;
  if (observed && observed.revision > (expectedRevision ?? 0)) throw new MetaPageCheckpointError("CHECKPOINT_CONFLICT");
  throw new MetaPageCheckpointError(acknowledged === false ? "CHECKPOINT_CONFLICT" : "CHECKPOINT_UNCONFIRMED");
}

/** Process/resume at most one page, with stable pending content across append retries.
 * Collection completion never performs counters finalization, projection activation or a job retry.
 */
export async function runMetaAdsStagingOrchestrator(input: Readonly<{
  job: MediaSyncJobRecord; context: MetaAdsCanonicalContext; accessToken: string;
  collectorOptions?: MetaAdsInsightsOptions;
}>, dependencies: MetaAdsStagingOrchestratorDependencies) {
  requireMetaPage(input && typeof input === "object" && dependencies, "MISSING_DEPENDENCY");
  for (const name of ["loadCheckpoint", "compareAndSetCheckpoint", "collectPage", "appendBatch"] as const) {
    requireMetaPage(typeof dependencies[name] === "function", "MISSING_DEPENDENCY");
  }
  const scope = createMetaPageScope(input.job, input.context, input.collectorOptions);
  const stored = await read(scope, dependencies);
  let checkpoint = stored ?? initialMetaPageCheckpoint(scope);
  const resumedPending = checkpoint.phase === "pending";
  const terminal = checkpoint.phase === "collected" || checkpoint.phase === "empty";
  if (!terminal) {
    if (checkpoint.phase === "collecting") {
      let page;
      try {
        page = await dependencies.collectPage({ context: scope.context, accessToken: input.accessToken,
          cursor: checkpoint.cursor }, scope.options);
      } catch { throw new MetaPageCheckpointError("COLLECT_FAILED"); }
      const prepared = prepareMetaPageCheckpoint(scope, checkpoint, page);
      checkpoint = await persist(scope, stored ? checkpoint.revision : null, prepared, dependencies);
    }
    requireMetaPage(checkpoint.pending, "INVALID_CHECKPOINT");
    const count = checkpoint.pending.rows.length;
    let append: AppendMediaSyncStagingBatchResult = {
      submittedRows: 0, insertedRows: 0, duplicateRows: 0, firstRowIndex: null, lastRowIndex: null,
    };
    if (count) {
      try {
        append = await dependencies.appendBatch({ job: scope.job, metaContext: scope.context,
          rows: checkpoint.pending.rows.map((entry) => entry.row), rowStartIndex: checkpoint.nextRowIndex, dateWindowIndex: 0 });
      } catch { throw new MetaPageCheckpointError("APPEND_UNCONFIRMED"); }
    }
    const advanced = confirmMetaPageAppend(scope, checkpoint, append);
    checkpoint = await persist(scope, checkpoint.revision, advanced, dependencies);
  }
  return freezeMetaPage({ checkpoint, resumedPending, alreadyComplete: terminal,
    collectionComplete: checkpoint.phase === "collected" || checkpoint.phase === "empty",
    canonicalStagingRows: checkpoint.totalRows,
    readyForStagingValidation: checkpoint.phase === "collected",
    emptyDatasetUnsupported: checkpoint.phase === "empty", materializationAllowed: false as const });
}
