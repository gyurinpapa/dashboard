import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import type { MediaSyncJobRecord } from "../src/lib/media-sync/types";
import type { MetaPageCheckpoint } from "../src/lib/media-sync/meta-ads-page-checkpoint-contract";
import type { MetaAdsCanonicalContext } from "../src/lib/media-sync/meta-ads-canonical-row";

let networkAttempts = 0;
const deny = () => { networkAttempts++; throw new Error("META_TEST_NETWORK_FORBIDDEN"); };
globalThis.fetch = deny;
for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
  [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
  [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
  [dgram.Socket.prototype, ["send", "connect"]]] as const) {
  for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
}
syncBuiltinESMExports();

async function main() {
  const c = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const h = await import("../src/lib/media-sync/meta-ads-materialization-handoff-contract");
  const { metaHash } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const fixture: { context: MetaAdsCanonicalContext; pages: unknown[] } =
    JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
  const job: MediaSyncJobRecord = {
    id: "11111111-1111-4111-8111-111111111111", workspace_id: "22222222-2222-4222-8222-222222222222",
    advertiser_id: "33333333-3333-4333-8333-333333333333", report_id: "44444444-4444-4444-8444-444444444444",
    connection_id: "55555555-5555-4555-8555-555555555555", created_by: "66666666-6666-4666-8666-666666666666",
    provider: "meta_ads", external_account_id: fixture.context.externalAccountId,
    date_from: fixture.context.dateFrom, date_to: fixture.context.dateTo,
    data_level: "creative", mode: "snapshot_replace", status: "processing", progress: 0,
    raw_rows: 0, normalized_rows: 0, inserted_rows: 0, failed_rows: 0,
    previous_ingestion_id: "88888888-8888-4888-8888-888888888888", snapshot_ingestion_id: null,
    attempt_count: 1, error: null, error_detail: { fixture: "preserve" },
    started_at: "2026-09-19T00:00:01.000Z", finished_at: null,
    created_at: "2026-09-19T00:00:00.000Z", updated_at: "2026-09-19T00:00:01.000Z",
  };
  const options = { pageSize: 4, maxRetries: 0 };
  const scope = c.createMetaPageScope(job, fixture.context, options);
  const initial = c.initialMetaPageCheckpoint(scope);
  let state = initial;
  const intermediate: MetaPageCheckpoint[] = [];
  for (const raw of fixture.pages) {
    const page = await collect({ context: fixture.context, accessToken: "fixture-only", cursor: state.cursor },
      { fetchImpl: async () => new Response(JSON.stringify(raw)) }, options);
    const pending = c.prepareMetaPageCheckpoint(scope, state, page);
    intermediate.push(pending);
    const n = pending.pending!.rows.length;
    state = c.confirmMetaPageAppend(scope, pending, { submittedRows: n, insertedRows: n, duplicateRows: 0,
      firstRowIndex: n ? state.nextRowIndex : null, lastRowIndex: n ? state.nextRowIndex + n - 1 : null });
    intermediate.push(state);
  }
  assert.equal(state.totalRows, 6); assert.equal(state.fetchedRows, 7);

  function inputFor(checkpoint = state, collectorOptions = options) {
    const total = checkpoint.totalRows;
    const currentJob = { ...job, raw_rows: total, normalized_rows: total, inserted_rows: total };
    const s = c.createMetaPageScope(currentJob, fixture.context, collectorOptions);
    const summary: Record<string, unknown> = { job_id: job.id, expected_rows: total, total_rows: total,
      min_row_index: 0, max_row_index: total - 1, distinct_row_indexes: total, duplicate_ad_day_rows: 0,
      scope_mismatch_rows: 0, blank_row_key_rows: 0, missing_fingerprint_rows: 0, date_window_count: 1,
      min_date: fixture.context.dateFrom, max_date: fixture.context.dateTo,
      is_structurally_complete: true, canonical_validation: "REQUIRES_BOUNDED_VALIDATION" };
    // Synthetic SQL-result evidence. These hashes are fixtures, not PostgreSQL
    // content fingerprints; this suite proves only the pure handoff contract.
    const batches: Record<string, unknown>[] = Array.from({ length: Math.ceil(total / 2000) }, (_, i) => ({
      job_id: job.id, batch_start: i * 2000, batch_rows: Math.min(2000, total - i * 2000),
      batch_max_row_index: Math.min(total, (i + 1) * 2000) - 1, canonical_mismatch_rows: 0,
      batch_content_fingerprint: metaHash(`fixture-only:${i}:${total}`), is_valid: true,
    }));
    return { job: currentJob, context: structuredClone(fixture.context), collectorOptions,
      checkpoint, evidence: { scope: s.key, checkpointRevision: checkpoint.revision,
        checkpointDigest: checkpoint.digest, jobBefore: structuredClone(currentJob), jobAfter: structuredClone(currentJob),
        summaryBefore: structuredClone(summary), summaryAfter: structuredClone(summary),
        batchesBefore: structuredClone(batches), batchesAfter: structuredClone(batches) } };
  }
  let cases = 0;
  function reject(value: unknown, code?: string) {
    assert.throws(() => h.createMetaMaterializationHandoff(value as Parameters<typeof h.createMetaMaterializationHandoff>[0]),
      (error: unknown) => {
        assert.ok(error instanceof h.MetaMaterializationHandoffError);
        if (code) assert.equal(error.code, code);
        assert.equal(error.message.includes("fixture-only"), false);
        return true;
      }); cases++;
  }
  const input = inputFor(), snapshot = structuredClone(input);
  const candidate = h.createMetaMaterializationHandoff(input);
  assert.equal(candidate.expectedRows, 6); assert.equal(candidate.canonicalStagingRows, 6);
  assert.equal(candidate.fetchedRows, 7); assert.equal(candidate.materializationAllowed, false);
  assert.equal(candidate.requiresAtomicDatabaseHandoff, true);
  assert.equal(candidate.materializationBatchSize, 2000);
  assert.deepEqual(input, snapshot);
  assert.equal(Object.isFrozen(input), false);
  assert.ok(Object.isFrozen(candidate.binding) && Object.isFrozen(candidate.validationBatches[0]));
  assert.deepEqual(candidate, h.createMetaMaterializationHandoff(structuredClone(input)));
  input.evidence.batchesBefore[0].batch_content_fingerprint = "f".repeat(64);
  assert.notEqual(candidate.validationBatches[0].contentFingerprint, "f".repeat(64));
  cases++;
  for (const value of [null, [], {}, { ...inputFor(), accessToken: "fixture-only" }]) reject(value);
  for (const checkpoint of [initial, ...intermediate.filter(s => s.phase !== "collected")]) {
    reject(inputFor(checkpoint), "COLLECTION_INCOMPLETE");
  }
  const emptyPage = await collect({ context: fixture.context, accessToken: "fixture-only" },
    { fetchImpl: async () => new Response('{"data":[]}') }, options);
  const empty = c.confirmMetaPageAppend(scope, c.prepareMetaPageCheckpoint(scope, initial, emptyPage),
    { submittedRows: 0, insertedRows: 0, duplicateRows: 0, firstRowIndex: null, lastRowIndex: null });
  reject(inputFor(empty), "EMPTY_DATASET_UNSUPPORTED");
  for (const patch of [{ digest: "0".repeat(64) }, { totalRows: 7 }, { nextRowIndex: 5 },
    { revision: 99 }, { scope: "0".repeat(64) }, { pending: {} }, { cursor: {} }]) {
    reject({ ...inputFor(), checkpoint: { ...state, ...patch } }, "INVALID_CHECKPOINT");
  }
  for (const field of ["scope", "checkpointDigest", "checkpointRevision"] as const) {
    reject({ ...inputFor(), evidence: { ...inputFor().evidence, [field]: "wrong" } }, "EVIDENCE_SCOPE_MISMATCH");
  }
  reject({ ...inputFor(), evidence: null }, "EVIDENCE_SCOPE_MISMATCH");
  reject({ ...inputFor(), evidence: { ...inputFor().evidence, approved: true } }, "EVIDENCE_SCOPE_MISMATCH");
  for (const patch of [{ attempt_count: 2 }, { started_at: "2026-09-19T00:00:02.000Z" },
    { workspace_id: job.advertiser_id }, { report_id: job.advertiser_id }, { connection_id: job.advertiser_id },
    { previous_ingestion_id: null }]) {
    for (const position of ["jobBefore", "jobAfter"] as const) {
      const x = inputFor(); Object.assign(x.evidence[position], patch); reject(x, "EVIDENCE_SCOPE_MISMATCH");
    }
    const x = inputFor(); Object.assign(x.job, patch); reject(x, "INVALID_CHECKPOINT");
  }
  for (const patch of [{ provider: "google_ads" }, { provider: "naver_searchad" }, { status: "done" },
    { snapshot_ingestion_id: job.advertiser_id }, { failed_rows: 1 }, { finished_at: job.started_at },
    { raw_rows: 7 }, { normalized_rows: -1 }, { inserted_rows: 1.5 }]) {
    const x = inputFor(); Object.assign(x.evidence.jobAfter, patch); reject(x, "INVALID_SCOPE");
  }
  for (const total of [0, 5, 7]) {
    const x = inputFor(); Object.assign(x.evidence.jobAfter, { raw_rows: total, normalized_rows: total, inserted_rows: total });
    reject(x, "COUNTERS_MISMATCH");
  }
  const changedOptions = inputFor(); changedOptions.collectorOptions = { ...options, pageSize: 5 };
  reject(changedOptions, "INVALID_CHECKPOINT");
  const changedContext = inputFor(); changedContext.context = { ...changedContext.context, currency: "USD" };
  reject(changedContext, "INVALID_CHECKPOINT");
  const changedPolicy = inputFor(); changedPolicy.context = { ...changedPolicy.context,
    metricPolicy: { ...changedPolicy.context.metricPolicy, actionReportTime: "fixture.other" } };
  reject(changedPolicy, "INVALID_CHECKPOINT");
  for (const [key, value] of Object.entries({ job_id: job.report_id, expected_rows: 7, total_rows: 7,
    min_row_index: 1, max_row_index: 6, distinct_row_indexes: 5, duplicate_ad_day_rows: 1,
    scope_mismatch_rows: 1, blank_row_key_rows: 1, missing_fingerprint_rows: 1, date_window_count: 2,
    min_date: "2026-02-30", max_date: "2026-09-08", is_structurally_complete: false, canonical_validation: "SKIPPED" })) {
    for (const field of ["summaryBefore", "summaryAfter"] as const) {
      const x = inputFor(); x.evidence[field][key] = value; reject(x, "STAGING_INCOMPLETE");
    }
  }
  for (const [key, value] of Object.entries({ job_id: job.report_id, batch_start: 1, batch_rows: "6",
    batch_max_row_index: 6, canonical_mismatch_rows: 1, batch_content_fingerprint: "not-a-hash", is_valid: false })) {
    for (const field of ["batchesBefore", "batchesAfter"] as const) {
      const x = inputFor(); x.evidence[field][0][key] = value; reject(x, "VALIDATION_INCOMPLETE");
    }
  }
  const changedContent = inputFor(); changedContent.evidence.batchesAfter[0].batch_content_fingerprint = "f".repeat(64);
  reject(changedContent, "STAGING_CHANGED");
  const changedDate = inputFor(); changedDate.evidence.summaryAfter.min_date = "2026-09-02";
  reject(changedDate, "STAGING_CHANGED");
  const noBatches = inputFor(); noBatches.evidence.batchesAfter = []; reject(noBatches, "VALIDATION_INCOMPLETE");
  const extraBatch = inputFor(); extraBatch.evidence.batchesAfter.push({ ...extraBatch.evidence.batchesAfter[0] });
  reject(extraBatch, "VALIDATION_INCOMPLETE");
  const missingField = inputFor(); delete missingField.evidence.summaryBefore.duplicate_ad_day_rows;
  reject(missingField, "STAGING_INCOMPLETE");
  const extraField = inputFor(); extraField.evidence.batchesBefore[0].secret = "fixture-only";
  reject(extraField, "VALIDATION_INCOMPLETE");

  // Synthetic terminal states exercise partition edges without calling a DB.
  for (const total of [1, 1999, 2000, 2001, 10000]) {
    const largeOptions = { pageSize: 2000, maxRetries: 0 };
    const s = c.createMetaPageScope(job, fixture.context, largeOptions);
    const pages = Math.ceil(total / largeOptions.pageSize);
    const body = { version: 1 as const, scope: s.key, revision: pages * 2, phase: "collected" as const,
      nextRowIndex: total, totalRows: total, fetchedRows: total, completedPages: pages, cursor: null, pending: null };
    const terminal = { ...body, digest: metaHash(c.metaPageJson({ namespace: "meta_page_checkpoint_v1", body })) };
    const x = inputFor(terminal, largeOptions);
    const result = h.createMetaMaterializationHandoff(x);
    assert.equal(result.validationBatches.reduce((n, b) => n + b.rows, 0), total); cases++;
    if (total > 2000) {
      for (const mutation of ["missing", "overlap", "reorder"] as const) {
        const broken = structuredClone(x);
        if (mutation === "missing") broken.evidence.batchesAfter.pop();
        if (mutation === "overlap") broken.evidence.batchesAfter[1].batch_start = 1999;
        if (mutation === "reorder") broken.evidence.batchesAfter.reverse();
        reject(broken, "VALIDATION_INCOMPLETE");
      }
    }
  }
  assert.equal(networkAttempts, 0);
  console.log(`META_MATERIALIZATION_HANDOFF_CONTRACT=PASS CASES=${cases}`);
  console.log("CANONICAL_ROWS=6 FETCHED_ROWS=7 NETWORK_ATTEMPTS=0 DB_EXECUTIONS=0 MATERIALIZATION=DISABLED");
  console.log("ATOMIC_DB_HANDOFF=NOT_IMPLEMENTED SQL_RUNTIME=NOT_TESTED");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
