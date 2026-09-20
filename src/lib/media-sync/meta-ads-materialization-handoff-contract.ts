import { createMetaPageScope, freezeMetaPage, metaPageJson, validateMetaPageCheckpoint } from "./meta-ads-page-checkpoint-contract";
import type { MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import type { MetaAdsInsightsOptions } from "./meta-ads-ad-daily-insights-collector";
import type { MediaSyncJobRecord } from "./types";

export type MetaHandoffErrorCode = "INVALID_INPUT" | "INVALID_SCOPE" | "INVALID_CHECKPOINT" |
  "COLLECTION_INCOMPLETE" | "EMPTY_DATASET_UNSUPPORTED" | "EVIDENCE_SCOPE_MISMATCH" |
  "COUNTERS_MISMATCH" | "STAGING_INCOMPLETE" | "VALIDATION_INCOMPLETE" | "STAGING_CHANGED";

export class MetaMaterializationHandoffError extends Error {
  constructor(readonly code: MetaHandoffErrorCode) {
    super(`Meta materialization handoff ${code}.`);
    this.name = "MetaMaterializationHandoffError";
  }
}

export type MetaMaterializationHandoffInput = Readonly<{
  job: MediaSyncJobRecord;
  context: MetaAdsCanonicalContext;
  collectorOptions?: MetaAdsInsightsOptions;
  checkpoint: unknown;
  evidence: unknown;
}>;

// These fields match summarize_meta_ads_staging_base's existing JSON result.
const SUMMARY_KEYS = ["job_id", "expected_rows", "total_rows", "min_row_index", "max_row_index",
  "distinct_row_indexes", "duplicate_ad_day_rows", "scope_mismatch_rows", "blank_row_key_rows",
  "missing_fingerprint_rows", "date_window_count", "min_date", "max_date", "is_structurally_complete",
  "canonical_validation"];
// These fields match validate_meta_ads_staging_batch_v1's existing JSON result.
const BATCH_KEYS = ["job_id", "batch_start", "batch_rows", "batch_max_row_index",
  "canonical_mismatch_rows", "batch_content_fingerprint", "is_valid"];
const HASH = /^[a-f0-9]{64}$/;

function requireHandoff(ok: unknown, code: MetaHandoffErrorCode): asserts ok {
  if (!ok) throw new MetaMaterializationHandoffError(code);
}
function record(value: unknown, code: MetaHandoffErrorCode): Record<string, unknown> {
  requireHandoff(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, keys: string[], code: MetaHandoffErrorCode) {
  requireHandoff(Object.keys(value).sort().join() === [...keys].sort().join(), code);
}
function validDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const time = Date.parse(value + "T00:00:00.000Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}
function checkSummary(value: unknown, job: MediaSyncJobRecord, total: number) {
  const code = "STAGING_INCOMPLETE";
  const s = record(value, code); exactKeys(s, SUMMARY_KEYS, code);
  requireHandoff(s.job_id === job.id && s.expected_rows === total && s.total_rows === total &&
    s.min_row_index === 0 && s.max_row_index === total - 1 && s.distinct_row_indexes === total &&
    s.duplicate_ad_day_rows === 0 && s.scope_mismatch_rows === 0 && s.blank_row_key_rows === 0 &&
    s.missing_fingerprint_rows === 0 && s.date_window_count === 1 && s.is_structurally_complete === true &&
    s.canonical_validation === "REQUIRES_BOUNDED_VALIDATION" &&
    validDate(s.min_date) && validDate(s.max_date) && s.min_date <= s.max_date &&
    s.min_date >= job.date_from && s.max_date <= job.date_to, code);
  return s;
}
function checkBatches(value: unknown, jobId: string, total: number) {
  const code = "VALIDATION_INCOMPLETE";
  // Fixed 2,000-row partitions, including the shorter final partition. No gaps,
  // duplicates or overlaps; do not trust a caller's single is_valid flag.
  requireHandoff(Array.isArray(value) && value.length === Math.ceil(total / 2000), code);
  return value.map((item: unknown, index: number) => {
    const b = record(item, code); exactKeys(b, BATCH_KEYS, code);
    const start = index * 2000, rows = Math.min(2000, total - start);
    requireHandoff(b.job_id === jobId && b.batch_start === start && b.batch_rows === rows &&
      b.batch_max_row_index === start + rows - 1 && b.canonical_mismatch_rows === 0 && b.is_valid === true &&
      typeof b.batch_content_fingerprint === "string" && HASH.test(b.batch_content_fingerprint), code);
    return { start, rows, contentFingerprint: b.batch_content_fingerprint };
  });
}

/** Pure candidate construction, with no RPC, environment, credential or worker access.
 * Evidence is untrusted input, not authentication or a database lock. Even matching
 * before/after summaries and content hashes do not prove an atomic DB snapshot.
 * A future DB transaction must recheck claim, checkpoint revision/digest, staging,
 * projection authority and counters before starting materialization. This value
 * cannot authorize a write and is not a MediaSyncStagingSummary/completion token.
 */
export function createMetaMaterializationHandoff(input: MetaMaterializationHandoffInput) {
  requireHandoff(typeof window === "undefined", "INVALID_INPUT");
  const supplied = record(input, "INVALID_INPUT");
  requireHandoff(Object.keys(supplied).every(k =>
    ["job", "context", "collectorOptions", "checkpoint", "evidence"].includes(k)), "INVALID_INPUT");
  let scope;
  try { scope = createMetaPageScope(input.job, input.context, input.collectorOptions); }
  catch { throw new MetaMaterializationHandoffError("INVALID_SCOPE"); }
  let state;
  try { state = validateMetaPageCheckpoint(input.checkpoint, scope); }
  catch { throw new MetaMaterializationHandoffError("INVALID_CHECKPOINT"); }
  requireHandoff(state.phase !== "empty", "EMPTY_DATASET_UNSUPPORTED");
  requireHandoff(state.phase === "collected", "COLLECTION_INCOMPLETE");
  const total = state.totalRows;
  const e = record(input.evidence, "EVIDENCE_SCOPE_MISMATCH");
  exactKeys(e, ["scope", "checkpointRevision", "checkpointDigest", "jobBefore", "jobAfter",
    "summaryBefore", "summaryAfter", "batchesBefore", "batchesAfter"], "EVIDENCE_SCOPE_MISMATCH");
  requireHandoff(e.scope === scope.key && e.checkpointRevision === state.revision &&
    e.checkpointDigest === state.digest, "EVIDENCE_SCOPE_MISMATCH");
  // Check both observations against the checkpoint's immutable identity, including
  // attempt_count/started_at, context/options and primary compatibility mirror.
  for (const observed of [input.job, e.jobBefore, e.jobAfter]) {
    let observedScope;
    try { observedScope = createMetaPageScope(observed as MediaSyncJobRecord, input.context, input.collectorOptions); }
    catch { throw new MetaMaterializationHandoffError("INVALID_SCOPE"); }
    requireHandoff(observedScope.key === scope.key, "EVIDENCE_SCOPE_MISMATCH");
    const job = observedScope.job;
    requireHandoff(job.raw_rows === total && job.normalized_rows === total && job.inserted_rows === total,
      "COUNTERS_MISMATCH");
  }
  const before = checkSummary(e.summaryBefore, scope.job, total);
  const after = checkSummary(e.summaryAfter, scope.job, total);
  const batchesBefore = checkBatches(e.batchesBefore, scope.job.id, total);
  const batchesAfter = checkBatches(e.batchesAfter, scope.job.id, total);
  requireHandoff(metaPageJson(before) === metaPageJson(after) &&
    metaPageJson(batchesBefore) === metaPageJson(batchesAfter), "STAGING_CHANGED");
  return freezeMetaPage({
    version: 1 as const, kind: "meta_materialization_handoff_candidate" as const,
    binding: { jobId: scope.job.id, storageKey: scope.storageKey, scope: scope.key,
      attemptCount: scope.job.attempt_count, startedAt: scope.job.started_at,
      checkpointRevision: state.revision, checkpointDigest: state.digest },
    expectedRows: total, canonicalStagingRows: total,
    // Traversal count is diagnostic only; RAW/expected_rows always use totalRows.
    fetchedRows: state.fetchedRows,
    validationBatches: batchesBefore,
    materializationBatchSize: 2000 as const,
    requiresAtomicDatabaseHandoff: true as const, materializationAllowed: false as const,
  });
}
