import { createMetaPageScope, freezeMetaPage, metaPageJson, validateMetaPageCheckpoint } from "./meta-ads-page-checkpoint-contract";
import { metaHash } from "./meta-ads-insights-request";
import type { MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import type { MetaAdsInsightsOptions } from "./meta-ads-ad-daily-insights-collector";
import type { MediaSyncJobRecord } from "./types";

export type MetaCompletionClaimErrorCode = "INVALID_INPUT" | "INVALID_CHECKPOINT" | "CLAIM_CHANGED" |
  "EXECUTION_CHANGED" | "CHECKPOINT_CHANGED" | "TARGET_CHANGED" | "MATERIALIZATION_INCOMPLETE" | "POINTER_CONFLICT";
export class MetaCompletionClaimError extends Error {
  constructor(readonly code: MetaCompletionClaimErrorCode) {
    super(`Meta completion claim ${code}.`); this.name = "MetaCompletionClaimError";
  }
}
export type MetaCompletionTarget = Readonly<{
  reportId: string; previousIngestionId: string | null; publishedIngestionId: string | null;
  snapshotIngestionId: string; completionToken: string;
}>;
export type MetaCompletionClaimInput = Readonly<{
  /** Original collecting identity retained across restart, never the newly reclaimed job. */
  originalJob: MediaSyncJobRecord; context: MetaAdsCanonicalContext; collectorOptions?: MetaAdsInsightsOptions;
  checkpoint: unknown; targets: readonly MetaCompletionTarget[];
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const TARGET_KEYS = ["reportId", "previousIngestionId", "publishedIngestionId", "snapshotIngestionId", "completionToken"];
function requireValue(ok: unknown, code: MetaCompletionClaimErrorCode): asserts ok {
  if (!ok) throw new MetaCompletionClaimError(code);
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), "INVALID_INPUT");
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, names: string[]) {
  requireValue(Object.keys(value).sort().join() === [...names].sort().join(), "INVALID_INPUT");
}
function uuid(value: unknown): value is string { return typeof value === "string" && UUID.test(value); }
function nullableUuid(value: unknown) { return value === null || uuid(value); }
function instant(value: unknown): bigint {
  requireValue(typeof value === "string", "INVALID_INPUT");
  // Match PG's six-digit precision, including offset-equivalent representations.
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(match && Number.isFinite(Date.parse(value)), "INVALID_INPUT");
  return BigInt(Date.parse(value)) * BigInt(1000) + BigInt((match[2] ?? "").padEnd(6, "0").slice(3));
}

/** Pure contract, not an authorization token or a production write path.
 * inspect() cannot prevent a reclaim between inspection and a separate RPC.
 * Future DB wrappers must lock the job, check the claim against the persisted
 * page/handoff receipt, and run the transition in the SAME transaction, including
 * done/idempotent retries. Never derive expected claim from a newly loaded job.
 * No fallback to the existing unfenced activation/finalization RPCs is provided.
 */
export function createMetaCompletionClaimContract(input: MetaCompletionClaimInput) {
  try {
    requireValue(typeof window === "undefined", "INVALID_INPUT");
    const supplied = object(input);
    requireValue(Object.keys(supplied).every(k =>
      ["originalJob", "context", "collectorOptions", "checkpoint", "targets"].includes(k)), "INVALID_INPUT");
    const scope = createMetaPageScope(input.originalJob, input.context, input.collectorOptions);
    const checkpoint = validateMetaPageCheckpoint(input.checkpoint, scope);
    requireValue(checkpoint.phase === "collected" && checkpoint.totalRows > 0, "INVALID_CHECKPOINT");
    const job = scope.job, total = checkpoint.totalRows, started = instant(job.started_at), created = instant(job.created_at);
    requireValue(Array.isArray(input.targets) && input.targets.length >= 1 && input.targets.length <= 100, "INVALID_INPUT");
    const targets = input.targets.map(value => {
      const t = object(value); keys(t, TARGET_KEYS);
      requireValue(uuid(t.reportId) && uuid(t.snapshotIngestionId) && nullableUuid(t.previousIngestionId) &&
        nullableUuid(t.publishedIngestionId) && t.snapshotIngestionId !== t.previousIngestionId &&
        t.snapshotIngestionId !== t.publishedIngestionId, "TARGET_CHANGED");
      requireValue(t.completionToken === metaHash(`${job.id}:${t.reportId}:${t.snapshotIngestionId}:${total}:0:${total - 1}:0:${total - 1}`),
        "MATERIALIZATION_INCOMPLETE");
      return structuredClone(value);
    }).sort((a, b) => a.reportId.localeCompare(b.reportId));
    requireValue(new Set(targets.map(t => t.reportId)).size === targets.length &&
      new Set(targets.map(t => t.snapshotIngestionId)).size === targets.length, "TARGET_CHANGED");
    const primary = targets.find(t => t.reportId === job.report_id);
    requireValue(primary && primary.previousIngestionId === job.previous_ingestion_id, "TARGET_CHANGED");
    const expected = freezeMetaPage({ version: 1 as const, kind: "meta_completion_claim_candidate" as const,
      jobId: job.id, attemptCount: job.attempt_count, startedAt: job.started_at, scope: scope.key,
      checkpointRevision: checkpoint.revision, checkpointDigest: checkpoint.digest, expectedRows: total, targets });
    function inspect(evidence: unknown) {
      try {
        const e = object(evidence); keys(e, ["scope", "job", "checkpoint", "targets"]);
        const current = object(e.job);
        // Compare claim before status, including completed/idempotent retries.
        requireValue(current.attempt_count === job.attempt_count && instant(current.started_at) === started, "CLAIM_CHANGED");
        for (const name of ["id", "workspace_id", "advertiser_id", "report_id", "connection_id", "created_by", "provider",
          "external_account_id", "date_from", "date_to", "data_level", "mode", "previous_ingestion_id"] as const) {
          requireValue(current[name] === job[name], "EXECUTION_CHANGED");
        }
        requireValue(instant(current.created_at) === created && current.snapshot_ingestion_id === primary.snapshotIngestionId &&
          current.raw_rows === total && current.normalized_rows === total && current.inserted_rows === total && current.failed_rows === 0 &&
          current.error === null && metaPageJson(current.error_detail) === metaPageJson(job.error_detail) &&
          current.execution_contract == null && current.automation_contract == null && current.sync_segment_progress == null,
        "EXECUTION_CHANGED");
        instant(current.updated_at);
        requireValue(e.scope === scope.key && metaPageJson(e.checkpoint) === metaPageJson(checkpoint), "CHECKPOINT_CHANGED");
        requireValue(Array.isArray(e.targets) && e.targets.length === targets.length, "TARGET_CHANGED");
        const observed = e.targets.map(value => object(value));
        requireValue(observed.every(t => uuid(t.reportId)) && new Set(observed.map(t => t.reportId)).size === targets.length, "TARGET_CHANGED");
        observed.sort((a, b) => (a.reportId as string).localeCompare(b.reportId as string));
        let active = 0, previous = 0;
        for (let i = 0; i < targets.length; i++) {
          const t = observed[i], baseline = targets[i];
          keys(t, [...TARGET_KEYS, "currentIngestionId", "rowCount", "status"]);
          requireValue(TARGET_KEYS.every(k => t[k] === baseline[k as keyof MetaCompletionTarget]), "TARGET_CHANGED");
          requireValue(t.status === "success" && t.rowCount === total, "MATERIALIZATION_INCOMPLETE");
          if (t.currentIngestionId === baseline.snapshotIngestionId) active++;
          else if (t.currentIngestionId === baseline.previousIngestionId) previous++;
          else throw new MetaCompletionClaimError("POINTER_CONFLICT");
        }
        requireValue(active === targets.length || previous === targets.length, "POINTER_CONFLICT");
        const done = current.status === "done";
        requireValue(done ? current.progress === 100 && current.finished_at !== null && active === targets.length :
          current.status === "processing" && current.progress === Math.max(job.progress, 70) && current.finished_at === null,
        "EXECUTION_CHANGED");
        if (done) requireValue(instant(current.finished_at) >= started, "EXECUTION_CHANGED");
        return freezeMetaPage({ stage: done ? "completed" as const : active ? "ready_for_finalization" as const : "ready_for_activation" as const,
          expectedClaim: expected, activationAllowed: false as const, finalizationAllowed: false as const,
          requiresAtomicDatabaseFence: true as const });
      } catch (error) {
        if (error instanceof MetaCompletionClaimError) throw error;
        throw new MetaCompletionClaimError("INVALID_INPUT");
      }
    }
    return Object.freeze({ expected, inspect });
  } catch (error) {
    if (error instanceof MetaCompletionClaimError) throw error;
    throw new MetaCompletionClaimError("INVALID_INPUT");
  }
}
