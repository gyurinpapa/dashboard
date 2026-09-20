import { createMetaPageScope, freezeMetaPage, metaPageJson, validateMetaPageCheckpoint } from "./meta-ads-page-checkpoint-contract";
import { metaPageDatabaseEnvelope, type MetaPageRpc } from "./meta-ads-page-checkpoint-repository";
import { metaHash } from "./meta-ads-insights-request";
import type { MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import type { MetaAdsInsightsOptions } from "./meta-ads-ad-daily-insights-collector";
import type { MediaSyncJobRecord } from "./types";

export const META_HANDOFF_RPC = Object.freeze({
  prepare: "prepare_meta_ads_materialization_handoff_v1",
  batch: "materialize_meta_ads_handoff_batch_v1",
  complete: "complete_meta_ads_materialization_handoff_v1",
});
export type MetaHandoffRepositoryErrorCode = "INVALID_INPUT" | "MISSING_DEPENDENCY" |
  "INVALID_CHECKPOINT" | "TARGET_NOT_ALLOWED" | "PREPARE_REQUIRED" | "RPC_UNCONFIRMED" | "INVALID_DATABASE_RESULT";
export class MetaHandoffRepositoryError extends Error {
  constructor(readonly code: MetaHandoffRepositoryErrorCode) {
    super(`Meta handoff repository ${code}.`); this.name = "MetaHandoffRepositoryError";
  }
}
export type MetaHandoffRepositoryInput = Readonly<{
  /** Original collection identity. Retain across restart; never clear a live job's
   * snapshot mirror to make it resemble this pre-materialization record. */
  job: MediaSyncJobRecord; context: MetaAdsCanonicalContext; collectorOptions?: MetaAdsInsightsOptions;
  checkpoint: unknown; targetReportIds: readonly string[];
}>;
type Target = { reportId: string; previousIngestionId: string | null; publishedIngestionId: string | null };
type ValidationBatch = { start: number; rows: number; contentFingerprint: string };
type Prepared = { job: MediaSyncJobRecord; snapshotIngestionId: string; expectedRows: number;
  nextRowIndex: number; idempotent: boolean; handoffCreated: boolean; targets: Target[]; validationBatches: ValidationBatch[] };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const HASH = /^[a-f0-9]{64}$/;
function requireValue(ok: unknown, code: MetaHandoffRepositoryErrorCode = "INVALID_DATABASE_RESULT"): asserts ok {
  if (!ok) throw new MetaHandoffRepositoryError(code);
}
function object(value: unknown): Record<string, unknown> {
  requireValue(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]) {
  requireValue(Object.keys(value).sort().join() === [...expected].sort().join());
}
function uuid(value: unknown): string { requireValue(typeof value === "string" && UUID.test(value)); return value; }
function nullableUuid(value: unknown): string | null { return value === null ? null : uuid(value); }
function integer(value: unknown, max = 100000): number {
  requireValue(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max); return value;
}
function bool(value: unknown): boolean { requireValue(typeof value === "boolean"); return value; }
function instant(value: unknown): string {
  // PostgreSQL may return +00:00 instead of Z. Retain microsecond precision when
  // comparing a returned claim; Date.parse alone would discard the last digits.
  requireValue(typeof value === "string");
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  requireValue(match);
  const millis = Date.parse(value); requireValue(Number.isFinite(millis));
  return String(BigInt(millis) * BigInt(1000) + BigInt((match[2] ?? "").padEnd(6, "0").slice(3)));
}

/** Explicit injected RPC only. No credentials, admin client, fetch, environment,
 * worker, activation or finalization fallback. The SQL receipt is DB authority;
 * local validation and remembered responses cannot authorize a database write.
 */
export function createMetaMaterializationHandoffRepository(input: MetaHandoffRepositoryInput, invokeRpc: MetaPageRpc) {
  requireValue(typeof window === "undefined" && typeof invokeRpc === "function", "MISSING_DEPENDENCY");
  let scope: ReturnType<typeof createMetaPageScope>;
  try { scope = createMetaPageScope(input.job, input.context, input.collectorOptions); }
  catch { throw new MetaHandoffRepositoryError("INVALID_INPUT"); }
  let checkpoint: ReturnType<typeof validateMetaPageCheckpoint>;
  try { checkpoint = validateMetaPageCheckpoint(input.checkpoint, scope); }
  catch { throw new MetaHandoffRepositoryError("INVALID_CHECKPOINT"); }
  requireValue(checkpoint.phase === "collected", "INVALID_CHECKPOINT");
  requireValue(Array.isArray(input.targetReportIds) && input.targetReportIds.length >= 1 && input.targetReportIds.length <= 100 &&
    input.targetReportIds.every(v => typeof v === "string" && UUID.test(v)) &&
    new Set(input.targetReportIds).size === input.targetReportIds.length && input.targetReportIds.includes(scope.job.report_id), "INVALID_INPUT");
  const targets = [...input.targetReportIds].sort();
  const total = checkpoint.totalRows;
  const envelope = freezeMetaPage({ page: metaPageDatabaseEnvelope(scope), checkpoint_revision: checkpoint.revision,
    checkpoint_digest: checkpoint.digest, expected_rows: total, target_report_ids: targets });
  const sessions = new Map<string, Prepared>();
  let receipt: string | undefined;
  let primarySnapshot: string | null = null;
  function target(value: unknown): asserts value is string {
    requireValue(typeof value === "string" && targets.includes(value), "TARGET_NOT_ALLOWED");
  }
  function returnedJob(value: unknown, targetId: string, snapshot: string): MediaSyncJobRecord {
    const j = object(value);
    for (const name of ["id", "workspace_id", "advertiser_id", "report_id", "connection_id", "created_by",
      "provider", "external_account_id", "date_from", "date_to", "data_level", "mode", "attempt_count", "previous_ingestion_id"] as const) {
      requireValue(j[name] === scope.job[name]);
    }
    requireValue(instant(j.started_at) === instant(scope.job.started_at) && instant(j.created_at) === instant(scope.job.created_at));
    instant(j.updated_at);
    requireValue(j.status === "processing" && j.finished_at === null && j.error === null && j.failed_rows === 0 &&
      j.raw_rows === total && j.normalized_rows === total && j.inserted_rows === total &&
      integer(j.progress, 99) === Math.max(scope.job.progress, 70) &&
      j.automation_contract == null && j.sync_segment_progress == null && j.execution_contract == null &&
      metaPageJson(j.error_detail) === metaPageJson(scope.job.error_detail));
    const mirror = nullableUuid(j.snapshot_ingestion_id);
    if (targetId === scope.job.report_id) requireValue(mirror === snapshot);
    if (primarySnapshot !== null) requireValue(mirror === primarySnapshot);
    // A secondary projection never uses the primary snapshot as its own authority.
    if (targetId !== scope.job.report_id && mirror !== null) requireValue(mirror !== snapshot);
    return structuredClone(j) as unknown as MediaSyncJobRecord;
  }
  async function rpc(name: string, targetId: string, extra: Record<string, unknown> = {}) {
    let response;
    try { response = await invokeRpc(name, { p_payload: structuredClone({ ...envelope, target_report_id: targetId, ...extra }) }); }
    catch { sessions.clear(); throw new MetaHandoffRepositoryError("RPC_UNCONFIRMED"); }
    if (!response || response.error != null || !Object.hasOwn(response, "data")) {
      sessions.clear(); throw new MetaHandoffRepositoryError("RPC_UNCONFIRMED");
    }
    return response.data;
  }
  async function checked<T>(fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (error) {
      sessions.clear();
      if (error instanceof MetaHandoffRepositoryError) throw error;
      throw new MetaHandoffRepositoryError("INVALID_DATABASE_RESULT");
    }
  }
  function rememberPrimary(job: MediaSyncJobRecord) {
    if (job.snapshot_ingestion_id !== null) primarySnapshot = job.snapshot_ingestion_id;
  }
  async function prepare(targetReportId: string): Promise<Prepared> {
    target(targetReportId);
    return checked(async () => {
      const result = object(await rpc(META_HANDOFF_RPC.prepare, targetReportId));
      keys(result, ["materialization", "handoff_created", "checkpoint", "targets", "validation_batches"]);
      requireValue(metaPageJson(result.checkpoint) === metaPageJson(checkpoint));
      requireValue(Array.isArray(result.targets) && result.targets.length === targets.length);
      const baselines = result.targets.map((value, i) => {
        const t = object(value); keys(t, ["report_id", "previous_ingestion_id", "published_ingestion_id"]);
        requireValue(t.report_id === targets[i]);
        const previousIngestionId = nullableUuid(t.previous_ingestion_id);
        if (t.report_id === scope.job.report_id) requireValue(previousIngestionId === scope.job.previous_ingestion_id);
        return { reportId: targets[i], previousIngestionId, publishedIngestionId: nullableUuid(t.published_ingestion_id) };
      });
      requireValue(Array.isArray(result.validation_batches) && result.validation_batches.length === Math.ceil(total / 2000));
      const validation = result.validation_batches.map((value, i) => {
        const b = object(value); keys(b, ["job_id", "batch_start", "batch_rows", "batch_max_row_index",
          "canonical_mismatch_rows", "batch_content_fingerprint", "is_valid"]);
        const start = i * 2000, rows = Math.min(2000, total - start);
        requireValue(b.job_id === scope.job.id && b.batch_start === start && b.batch_rows === rows &&
          b.batch_max_row_index === start + rows - 1 && b.canonical_mismatch_rows === 0 && b.is_valid === true &&
          typeof b.batch_content_fingerprint === "string" && HASH.test(b.batch_content_fingerprint));
        return { start, rows, contentFingerprint: b.batch_content_fingerprint };
      });
      const receiptNow = metaPageJson({ targets: baselines, validation });
      requireValue(receipt === undefined || receiptNow === receipt);
      const p = object(result.materialization);
      keys(p, ["job", "snapshot_ingestion_id", "expected_rows", "next_row_index", "idempotent"]);
      const snapshot = uuid(p.snapshot_ingestion_id), next = integer(p.next_row_index, total), idempotent = bool(p.idempotent);
      requireValue(p.expected_rows === total && (next === total || next % 2000 === 0) && (!idempotent || next === total));
      const created = bool(result.handoff_created);
      requireValue(!created || (next === 0 && !idempotent && receipt === undefined));
      const baseline = baselines.find(t => t.reportId === targetReportId)!;
      requireValue(snapshot !== baseline.previousIngestionId && snapshot !== baseline.publishedIngestionId);
      const job = returnedJob(p.job, targetReportId, snapshot);
      const previous = sessions.get(targetReportId);
      requireValue(!previous || previous.snapshotIngestionId === snapshot);
      const prepared = freezeMetaPage({ job, snapshotIngestionId: snapshot, expectedRows: total, nextRowIndex: next,
        idempotent, handoffCreated: created, targets: baselines, validationBatches: validation });
      receipt = receiptNow; rememberPrimary(job); sessions.set(targetReportId, prepared);
      return prepared;
    });
  }
  function session(targetReportId: string, snapshotIngestionId: string): Prepared {
    target(targetReportId);
    const s = sessions.get(targetReportId);
    requireValue(s && s.snapshotIngestionId === snapshotIngestionId, "PREPARE_REQUIRED"); return s;
  }
  async function materializeBatch(input: { targetReportId: string; snapshotIngestionId: string; batchStart: number }) {
    const s = session(input.targetReportId, input.snapshotIngestionId), start = input.batchStart;
    requireValue(Number.isSafeInteger(start) && start >= 0 && start < total && start % 2000 === 0 &&
      (s.idempotent || start === s.nextRowIndex), "INVALID_INPUT");
    return checked(async () => {
      const b = object(await rpc(META_HANDOFF_RPC.batch, input.targetReportId,
        { snapshot_ingestion_id: input.snapshotIngestionId, batch_start: start, batch_size: 2000 }));
      keys(b, ["job", "snapshot_ingestion_id", "batch_start", "batch_end_exclusive", "expected_batch_rows",
        "inserted_rows", "materialized_batch_rows", "next_row_index", "complete", "idempotent"]);
      const end = Math.min(start + 2000, total), count = end - start;
      const inserted = integer(b.inserted_rows, count), idempotent = bool(b.idempotent);
      requireValue(b.snapshot_ingestion_id === input.snapshotIngestionId && b.batch_start === start &&
        b.batch_end_exclusive === end && b.expected_batch_rows === count && b.materialized_batch_rows === count &&
        b.next_row_index === end && b.complete === (end === total) && (!idempotent || inserted === 0));
      const job = returnedJob(b.job, input.targetReportId, input.snapshotIngestionId);
      rememberPrimary(job);
      sessions.set(input.targetReportId, freezeMetaPage({ ...s, job, nextRowIndex: s.idempotent ? total : end }));
      return freezeMetaPage({ job, snapshotIngestionId: input.snapshotIngestionId, batchStart: start, nextRowIndex: end,
        insertedRows: inserted, complete: end === total, idempotent });
    });
  }
  async function complete(input: { targetReportId: string; snapshotIngestionId: string }) {
    const s = session(input.targetReportId, input.snapshotIngestionId);
    requireValue(s.nextRowIndex === total, "PREPARE_REQUIRED");
    return checked(async () => {
      const r = object(await rpc(META_HANDOFF_RPC.complete, input.targetReportId, { snapshot_ingestion_id: input.snapshotIngestionId }));
      keys(r, ["job", "snapshot_ingestion_id", "row_count", "staging_fingerprint", "materialized_fingerprint", "idempotent"]);
      const token = metaHash(`${scope.job.id}:${input.targetReportId}:${input.snapshotIngestionId}:${total}:0:${total - 1}:0:${total - 1}`);
      requireValue(r.snapshot_ingestion_id === input.snapshotIngestionId && r.row_count === total &&
        r.staging_fingerprint === token && r.materialized_fingerprint === token);
      const job = returnedJob(r.job, input.targetReportId, input.snapshotIngestionId), idempotent = bool(r.idempotent);
      rememberPrimary(job); sessions.set(input.targetReportId, freezeMetaPage({ ...s, job, idempotent: true }));
      return freezeMetaPage({ job, snapshotIngestionId: input.snapshotIngestionId, rowCount: total, completionToken: token, idempotent });
    });
  }
  /** At most one 2,000-row write batch. On any uncertain response, stop; the next
   * call always prepares again and uses the DB's committed row_count. No blind
   * batch retry, local checkpoint persistence, collector or new job creation. */
  async function advance(targetReportId: string) {
    const p = await prepare(targetReportId);
    let next = p.nextRowIndex;
    if (next < total) next = (await materializeBatch({ targetReportId, snapshotIngestionId: p.snapshotIngestionId, batchStart: next })).nextRowIndex;
    const completed = next === total ? await complete({ targetReportId, snapshotIngestionId: p.snapshotIngestionId }) : null;
    return freezeMetaPage({ targetReportId, snapshotIngestionId: p.snapshotIngestionId, nextRowIndex: next,
      expectedRows: total, materializationComplete: completed !== null, completion: completed,
      activationAllowed: false as const, finalizationAllowed: false as const });
  }
  return Object.freeze({ prepare, materializeBatch, complete, advance });
}
