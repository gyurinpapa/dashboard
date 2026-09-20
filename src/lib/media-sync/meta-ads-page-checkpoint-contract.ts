import { metaBound, metaHash, metaRequestContext } from "./meta-ads-insights-request";
import { assertMetaAdsStagingContextScope, prepareMetaAdsStagingBatch, type MetaAdsPreparedStagingRow } from "./meta-ads-staging-contract";
import type { MetaAdsCanonicalContext } from "./meta-ads-canonical-row";
import type { MetaAdsInsightsCursor, MetaAdsInsightsOptions, collectMetaAdsAdDailyInsightsPage } from "./meta-ads-ad-daily-insights-collector";
import type { AppendMediaSyncStagingBatchResult } from "./media-sync-staging-repository";
import type { MediaSyncJobRecord } from "./types";

export type MetaPageErrorCode = "INVALID_SCOPE" | "INVALID_CHECKPOINT" | "INVALID_PAGE" |
  "INVALID_APPEND_RESULT" | "CHECKPOINT_CONFLICT" | "CHECKPOINT_UNCONFIRMED" |
  "MISSING_DEPENDENCY" | "COLLECT_FAILED" | "APPEND_UNCONFIRMED";
export class MetaPageCheckpointError extends Error {
  constructor(readonly code: MetaPageErrorCode) {
    super(`Meta page checkpoint ${code}.`); this.name = "MetaPageCheckpointError";
  }
}
export function requireMetaPage(ok: unknown, code: MetaPageErrorCode): asserts ok {
  if (!ok) throw new MetaPageCheckpointError(code);
}
export type MetaCollectedPage = Awaited<ReturnType<typeof collectMetaAdsAdDailyInsightsPage>>;
export type MetaPageScope = Readonly<{
  key: string; storageKey: string; collectorScope: string; job: MediaSyncJobRecord;
  context: MetaAdsCanonicalContext; options: Required<MetaAdsInsightsOptions>;
}>;
export type MetaPendingPage = Readonly<{
  id: string; rows: readonly MetaAdsPreparedStagingRow[]; nextCursor: MetaAdsInsightsCursor | null;
  fetchedRows: number; completedPageCount: number;
}>;
export type MetaPageCheckpoint = Readonly<{
  version: 1; scope: string; revision: number; digest: string;
  phase: "collecting" | "pending" | "collected" | "empty";
  nextRowIndex: number; totalRows: number; fetchedRows: number; completedPages: number;
  cursor: MetaAdsInsightsCursor | null; pending: MetaPendingPage | null;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH = /^[a-f0-9]{64}$/;
function object(value: unknown, code: MetaPageErrorCode): Record<string, unknown> {
  requireMetaPage(value && typeof value === "object" && !Array.isArray(value) &&
    [Object.prototype, null].includes(Object.getPrototypeOf(value)), code);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, names: string[], code: MetaPageErrorCode) {
  requireMetaPage(Object.keys(value).sort().join() === names.sort().join(), code);
}
function integer(value: unknown, max: number, code: MetaPageErrorCode): asserts value is number {
  requireMetaPage(typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max, code);
}
export function freezeMetaPage<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value)) freezeMetaPage(nested);
    Object.freeze(value);
  }
  return value;
}
// Order-independent JSON evidence for this contract only; not a PostgreSQL row fingerprint,
// a completion token, or authentication against a malicious storage implementation.
export function metaPageJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    const encoded = JSON.stringify(value);
    requireMetaPage(encoded !== undefined, "INVALID_CHECKPOINT"); return encoded;
  }
  if (Array.isArray(value)) return "[" + value.map(metaPageJson).join(",") + "]";
  const record = object(value, "INVALID_CHECKPOINT");
  return "{" + Object.keys(record).sort().map((key) => JSON.stringify(key) + ":" + metaPageJson(record[key])).join(",") + "}";
}
function checkpointDigest(value: object): string {
  const body = Object.fromEntries(Object.entries(value).filter(([key]) => key !== "digest"));
  return metaHash(metaPageJson({ namespace: "meta_page_checkpoint_v1", body }));
}
function seal(value: Omit<MetaPageCheckpoint, "digest">): MetaPageCheckpoint {
  return { ...value, digest: checkpointDigest(value) };
}
export function createMetaPageScope(job: MediaSyncJobRecord, context: MetaAdsCanonicalContext,
  options: MetaAdsInsightsOptions = {}): MetaPageScope {
  try {
    requireMetaPage(job && job.provider === "meta_ads" && job.status === "processing" &&
      job.data_level === "creative" && job.mode === "snapshot_replace" && job.snapshot_ingestion_id === null &&
      job.finished_at === null && job.error === null && job.failed_rows === 0 &&
      job.automation_contract == null && job.sync_segment_progress == null &&
      (job as MediaSyncJobRecord & { execution_contract?: unknown }).execution_contract == null, "INVALID_SCOPE");
    for (const name of ["id", "workspace_id", "advertiser_id", "report_id", "connection_id", "created_by"] as const) {
      requireMetaPage(typeof job[name] === "string" && UUID.test(job[name]), "INVALID_SCOPE");
    }
    requireMetaPage(job.previous_ingestion_id === null || UUID.test(job.previous_ingestion_id), "INVALID_SCOPE");
    requireMetaPage(Number.isSafeInteger(job.attempt_count) && job.attempt_count > 0 &&
      typeof job.started_at === "string" && Number.isFinite(Date.parse(job.started_at)), "INVALID_SCOPE");
    for (const name of ["raw_rows", "normalized_rows", "inserted_rows"] as const) integer(job[name], 100000, "INVALID_SCOPE");
    requireMetaPage(job.raw_rows === job.normalized_rows && job.raw_rows === job.inserted_rows, "INVALID_SCOPE");
    const ctx = metaRequestContext(context); assertMetaAdsStagingContextScope(ctx, job);
    const opts: Required<MetaAdsInsightsOptions> = {
      pageSize: metaBound(options.pageSize ?? 500, 1, 2000), maxPages: metaBound(options.maxPages ?? 1000, 1, 1000),
      maxRecords: metaBound(options.maxRecords ?? 10000, 1, 100000), maxRetries: metaBound(options.maxRetries ?? 3, 0, 3),
      requestTimeoutMs: metaBound(options.requestTimeoutMs ?? 10000, 1, 30000),
      maxResponseBytes: metaBound(options.maxResponseBytes ?? 4 * 1024 * 1024, 128, 8 * 1024 * 1024),
    };
    // Matches the collector's public serialized cursor contract.
    const collectorScope = metaHash(JSON.stringify({ context: ctx, pageSize: opts.pageSize,
      maxPages: opts.maxPages, maxRecords: opts.maxRecords }));
    const identity = Object.fromEntries(["id", "workspace_id", "advertiser_id", "report_id", "connection_id",
      "created_by", "external_account_id", "date_from", "date_to", "previous_ingestion_id", "created_at",
      "attempt_count", "started_at"].map((name) => [name, job[name as keyof MediaSyncJobRecord]]));
    // This offline contract resumes within the same claim; reclaim/claim fencing needs a DB design.
    return freezeMetaPage({ key: metaHash(metaPageJson({ version: 1, identity, context: ctx, options: opts })),
      // Lookup must stay job-bound when claim/options change, so stored scope drift is rejected.
      storageKey: metaHash("meta_page_checkpoint_store_v1:" + job.id.toLowerCase()),
      collectorScope, job: structuredClone(job), context: ctx, options: opts });
  } catch { throw new MetaPageCheckpointError("INVALID_SCOPE"); }
}
export function initialMetaPageCheckpoint(scope: MetaPageScope): MetaPageCheckpoint {
  requireMetaPage(scope.job.inserted_rows === 0, "INVALID_CHECKPOINT");
  return freezeMetaPage(seal({ version: 1, scope: scope.key, revision: 0, phase: "collecting", nextRowIndex: 0,
    totalRows: 0, fetchedRows: 0, completedPages: 0, cursor: null, pending: null }));
}
function cursorValue(value: unknown, scope: MetaPageScope, pages: number, fetched: number,
  code: MetaPageErrorCode): MetaAdsInsightsCursor {
  const v = object(value, code);
  keys(v, ["version", "scope", "after", "pageIndex", "seenCursors", "seenRows"], code);
  requireMetaPage(v.version === 1 && v.scope === scope.collectorScope && v.pageIndex === pages &&
    pages > 0 && pages < scope.options.maxPages && typeof v.after === "string" &&
    /^[A-Za-z0-9_.~+/=-]{1,4096}$/.test(v.after), code);
  for (const [field, length] of [["seenCursors", pages], ["seenRows", fetched]] as const) {
    const values = v[field];
    requireMetaPage(Array.isArray(values) && values.length === length &&
      values.every((item) => typeof item === "string" && HASH.test(item)) && new Set(values).size === length, code);
  }
  requireMetaPage((v.seenCursors as string[]).at(-1) === metaHash(v.after), code);
  return structuredClone(v) as unknown as MetaAdsInsightsCursor;
}
function pendingId(scope: MetaPageScope, state: MetaPageCheckpoint, page: Omit<MetaPendingPage, "id">): string {
  return metaHash(metaPageJson({ namespace: "meta_prepared_page_v1", scope: scope.key,
    baseRevision: state.revision, rowStartIndex: state.nextRowIndex, page }));
}
function pageData(scope: MetaPageScope, state: MetaPageCheckpoint, page: MetaCollectedPage): Omit<MetaPendingPage, "id"> {
  const code = "INVALID_PAGE";
  requireMetaPage(page && Array.isArray(page.rows) && page.rows.length <= scope.options.pageSize &&
    page.canonicalRows === page.rows.length && page.pageCount === 1 &&
    page.completedPageCount === state.completedPages + 1 && page.completedPageCount <= scope.options.maxPages &&
    Number.isSafeInteger(page.requestCount) && Number.isSafeInteger(page.retryCount) && page.retryCount >= 0 &&
    page.retryCount <= scope.options.maxRetries && page.requestCount === page.retryCount + 1, code);
  integer(page.fetchedRows, scope.options.pageSize, code);
  requireMetaPage(page.fetchedRows >= page.rows.length && state.fetchedRows + page.fetchedRows <= scope.options.maxRecords &&
    state.totalRows + page.rows.length <= scope.options.maxRecords, code);
  requireMetaPage(page.cursor === null ? page.isComplete === true && page.status === "completed" :
    page.isComplete === false && page.status === "partial", code);
  const next = page.cursor === null ? null : cursorValue(page.cursor, scope, page.completedPageCount,
    state.fetchedRows + page.fetchedRows, code);
  if (next && state.cursor) {
    for (const field of ["seenRows", "seenCursors"] as const) {
      requireMetaPage(state.cursor[field].every((hash, index) => next[field][index] === hash), code);
    }
  }
  const previous = new Set(state.cursor?.seenRows ?? []);
  const added = next ? new Set(next.seenRows.slice(state.fetchedRows)) : null;
  let rows: readonly MetaAdsPreparedStagingRow[];
  try { rows = prepareMetaAdsStagingBatch({ context: scope.context, rows: page.rows, rowStartIndex: state.nextRowIndex }); }
  catch { throw new MetaPageCheckpointError(code); }
  for (const item of rows) {
    const hash = metaHash(JSON.stringify([item.row.external_account_id, item.row.external_ad_id, item.row.date]));
    requireMetaPage(!previous.has(hash) && (added === null || added.has(hash)), code);
  }
  return { rows, nextCursor: next, fetchedRows: page.fetchedRows, completedPageCount: page.completedPageCount };
}
export function validateMetaPageCheckpoint(value: unknown, scope: MetaPageScope): MetaPageCheckpoint {
  const code = "INVALID_CHECKPOINT";
  const v = object(value, code);
  keys(v, ["version", "scope", "revision", "digest", "phase", "nextRowIndex", "totalRows", "fetchedRows",
    "completedPages", "cursor", "pending"], code);
  requireMetaPage(typeof v.digest === "string" && HASH.test(v.digest) && v.digest === checkpointDigest(v), code);
  requireMetaPage(v.version === 1 && v.scope === scope.key &&
    ["collecting", "pending", "collected", "empty"].includes(v.phase as string), code);
  integer(v.completedPages, scope.options.maxPages, code);
  integer(v.totalRows, scope.options.maxRecords, code); integer(v.fetchedRows, scope.options.maxRecords, code);
  requireMetaPage(v.nextRowIndex === v.totalRows && v.totalRows <= v.fetchedRows &&
    v.fetchedRows <= v.completedPages * scope.options.pageSize &&
    v.revision === v.completedPages * 2 + (v.phase === "pending" ? 1 : 0) && scope.job.inserted_rows <= v.totalRows, code);
  const terminal = v.phase === "collected" || v.phase === "empty";
  if (terminal) {
    requireMetaPage(v.completedPages > 0 && v.cursor === null && v.pending === null &&
      (v.phase === "empty" ? v.totalRows === 0 : v.totalRows > 0), code);
  } else if (v.completedPages === 0) {
    requireMetaPage(v.cursor === null && v.fetchedRows === 0 && v.totalRows === 0, code);
  } else cursorValue(v.cursor, scope, v.completedPages, v.fetchedRows, code);
  if (v.phase === "collecting") requireMetaPage(v.pending === null && v.completedPages < scope.options.maxPages, code);
  const state = structuredClone(v) as unknown as MetaPageCheckpoint;
  if (state.phase === "pending") {
    const pending = object(state.pending, code);
    keys(pending, ["id", "rows", "nextCursor", "fetchedRows", "completedPageCount"], code);
    requireMetaPage(Array.isArray(pending.rows), code);
    const base = { ...state, phase: "collecting" as const, revision: state.revision - 1, pending: null };
    try {
      const data = pageData(scope, base, { rows: pending.rows.map((item) => object(item, code).row),
        canonicalRows: pending.rows.length, pageCount: 1, requestCount: 1, retryCount: 0,
        cursor: pending.nextCursor, fetchedRows: pending.fetchedRows, completedPageCount: pending.completedPageCount,
        isComplete: pending.nextCursor === null, status: pending.nextCursor === null ? "completed" : "partial",
      } as MetaCollectedPage);
      requireMetaPage(metaPageJson(pending.rows) === metaPageJson(data.rows) &&
        pending.id === pendingId(scope, base, data), code);
    } catch { throw new MetaPageCheckpointError(code); }
  } else requireMetaPage(state.pending === null, code);
  return freezeMetaPage(state);
}
export function prepareMetaPageCheckpoint(scope: MetaPageScope, state: MetaPageCheckpoint,
  page: MetaCollectedPage): MetaPageCheckpoint {
  const base = validateMetaPageCheckpoint(state, scope);
  requireMetaPage(base.phase === "collecting", "INVALID_CHECKPOINT");
  const data = pageData(scope, base, page);
  return validateMetaPageCheckpoint(seal({ ...base, revision: base.revision + 1, phase: "pending",
    pending: { id: pendingId(scope, base, data), ...data } }), scope);
}
export function confirmMetaPageAppend(scope: MetaPageScope, state: MetaPageCheckpoint,
  result: AppendMediaSyncStagingBatchResult): MetaPageCheckpoint {
  const current = validateMetaPageCheckpoint(state, scope);
  requireMetaPage(current.phase === "pending" && current.pending, "INVALID_CHECKPOINT");
  const page = current.pending; const count = page.rows.length;
  requireMetaPage(result && result.submittedRows === count, "INVALID_APPEND_RESULT");
  for (const value of [result.insertedRows, result.duplicateRows]) integer(value, count, "INVALID_APPEND_RESULT");
  requireMetaPage(result.insertedRows + result.duplicateRows === count &&
    result.firstRowIndex === (count ? current.nextRowIndex : null) &&
    result.lastRowIndex === (count ? current.nextRowIndex + count - 1 : null), "INVALID_APPEND_RESULT");
  const total = current.totalRows + count;
  return validateMetaPageCheckpoint(seal({ ...current, revision: current.revision + 1,
    phase: page.nextCursor ? "collecting" : total ? "collected" : "empty",
    nextRowIndex: total, totalRows: total, fetchedRows: current.fetchedRows + page.fetchedRows,
    completedPages: page.completedPageCount, cursor: page.nextCursor, pending: null }), scope);
}
