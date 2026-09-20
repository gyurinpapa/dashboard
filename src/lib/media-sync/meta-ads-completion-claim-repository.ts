import { createMetaCompletionClaimContract, type MetaCompletionClaimInput } from "./meta-ads-completion-claim-contract";
import { createMetaPageScope, metaPageJson } from "./meta-ads-page-checkpoint-contract";
import { metaPageDatabaseEnvelope, type MetaPageRpc } from "./meta-ads-page-checkpoint-repository";

export const META_COMPLETION_RPC = Object.freeze({
  activate: "activate_meta_ads_claim_snapshot_v1", finalize: "finalize_meta_ads_claim_job_v1",
});
export class MetaCompletionRepositoryError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "RPC_UNCONFIRMED" | "INVALID_DATABASE_RESULT") {
    super(`Meta completion repository ${code}.`); this.name = "MetaCompletionRepositoryError";
  }
}
function check(ok: unknown): asserts ok {
  if (!ok) throw new MetaCompletionRepositoryError("INVALID_DATABASE_RESULT");
}
function record(value: unknown, keys?: string[]): Record<string, unknown> {
  check(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  if (keys) check(Object.keys(value).sort().join() === [...keys].sort().join());
  return value as Record<string, unknown>;
}
function instant(value: unknown): bigint {
  check(typeof value === "string");
  const m = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  check(m && Number.isFinite(Date.parse(value)));
  return BigInt(Date.parse(value)) * BigInt(1000) + BigInt((m[2] ?? "").padEnd(6, "0").slice(3));
}

/** Only injected claim-fenced RPCs. SQL remains the transition authority, including
 * done replays. Never load the staging checkpoint after handoff: that RPC is frozen.
 * Retain the original job and collected receipt across restart; do not derive a new claim.
 */
export function createMetaCompletionClaimRepository(input: MetaCompletionClaimInput, invokeRpc: MetaPageRpc) {
  let copied: MetaCompletionClaimInput;
  let contract: ReturnType<typeof createMetaCompletionClaimContract>;
  let scope: ReturnType<typeof createMetaPageScope>;
  try {
    if (typeof window !== "undefined" || typeof invokeRpc !== "function") throw new Error();
    copied = structuredClone(input);
    contract = createMetaCompletionClaimContract(copied);
    scope = createMetaPageScope(copied.originalJob, copied.context, copied.collectorOptions);
  } catch { throw new MetaCompletionRepositoryError("INVALID_INPUT"); }
  const expected = contract.expected, targets = expected.targets;
  const primary = targets.find(t => t.reportId === scope.job.report_id)!;
  const payload = { page: metaPageDatabaseEnvelope(scope), attempt_count: expected.attemptCount,
    started_at: expected.startedAt, checkpoint_revision: expected.checkpointRevision,
    checkpoint_digest: expected.checkpointDigest, expected_rows: expected.expectedRows };
  function job(value: unknown, final: boolean) {
    const j = record(value), original = scope.job;
    for (const key of ["id", "workspace_id", "advertiser_id", "report_id", "connection_id", "created_by", "provider",
      "external_account_id", "date_from", "date_to", "data_level", "mode", "previous_ingestion_id", "attempt_count"] as const) {
      check(j[key] === original[key]);
    }
    check(instant(j.started_at) === instant(original.started_at) && instant(j.created_at) === instant(original.created_at));
    instant(j.updated_at);
    check(j.snapshot_ingestion_id === primary.snapshotIngestionId && j.raw_rows === expected.expectedRows &&
      j.normalized_rows === expected.expectedRows && j.inserted_rows === expected.expectedRows && j.failed_rows === 0 &&
      j.error === null && metaPageJson(j.error_detail) === metaPageJson(original.error_detail) &&
      j.execution_contract == null && j.automation_contract == null && j.sync_segment_progress == null);
    if (final || j.status === "done") {
      check(j.status === "done" && j.progress === 100 && instant(j.finished_at) >= instant(original.started_at));
    } else check(j.status === "processing" && j.progress === Math.max(original.progress, 70) && j.finished_at === null);
    return j;
  }
  async function call(final: boolean) {
    let response;
    try { response = await invokeRpc(final ? META_COMPLETION_RPC.finalize : META_COMPLETION_RPC.activate,
      { p_payload: structuredClone(payload) }); }
    catch { throw new MetaCompletionRepositoryError("RPC_UNCONFIRMED"); }
    if (!response || response.error != null || !Object.hasOwn(response, "data")) throw new MetaCompletionRepositoryError("RPC_UNCONFIRMED");
    try {
      const r = record(response.data, final ? ["job", "snapshot_ingestion_id", "current_ingestion_id", "published_ingestion_id",
        "row_count", "staging_fingerprint", "materialized_fingerprint", "finished_at", "connection_id",
        "connection_last_sync_at", "connection_updated", "idempotent"] : ["job", "projection_count", "projections", "idempotent"]);
      const j = job(r.job, final);
      check(typeof r.idempotent === "boolean");
      if (final) {
        check(r.snapshot_ingestion_id === primary.snapshotIngestionId && r.current_ingestion_id === primary.snapshotIngestionId &&
          r.published_ingestion_id === primary.publishedIngestionId && r.row_count === expected.expectedRows &&
          r.staging_fingerprint === primary.completionToken && r.materialized_fingerprint === primary.completionToken &&
          r.connection_id === scope.job.connection_id && typeof r.connection_updated === "boolean" &&
          instant(r.finished_at) === instant(j.finished_at) && instant(r.connection_last_sync_at) >= instant(r.finished_at));
      } else {
        check(r.projection_count === targets.length && Array.isArray(r.projections) && r.projections.length === targets.length);
        const projections = r.projections.map(value => record(value, ["report_id", "previous_ingestion_id",
          "snapshot_ingestion_id", "published_ingestion_id", "expected_rows", "completion_token"]));
        check(new Set(projections.map(p => p.report_id)).size === targets.length);
        for (const t of targets) {
          const p = projections.find(p => p.report_id === t.reportId);
          check(p && p.previous_ingestion_id === t.previousIngestionId && p.snapshot_ingestion_id === t.snapshotIngestionId &&
            p.published_ingestion_id === t.publishedIngestionId && p.expected_rows === expected.expectedRows && p.completion_token === t.completionToken);
        }
      }
      // No raw response, job.error_detail or credential is exposed by this boundary.
      return Object.freeze({ jobId: scope.job.id, status: j.status as "processing" | "done", progress: j.progress as number,
        canonicalRows: expected.expectedRows, projectionCount: targets.length, idempotent: r.idempotent,
        finishedAt: j.finished_at as string | null });
    } catch { throw new MetaCompletionRepositoryError("INVALID_DATABASE_RESULT"); }
  }
  return Object.freeze({ activate: () => call(false), finalize: () => call(true) });
}
