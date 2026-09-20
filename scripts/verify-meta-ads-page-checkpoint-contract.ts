import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
// Deny real I/O before importing application modules. No env files or DB imports.
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

import type { MediaSyncJobRecord } from "../src/lib/media-sync/types";

function initialJob(): MediaSyncJobRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111", workspace_id: "22222222-2222-4222-8222-222222222222",
    advertiser_id: "33333333-3333-4333-8333-333333333333", report_id: "44444444-4444-4444-8444-444444444444",
    connection_id: "55555555-5555-4555-8555-555555555555", created_by: "66666666-6666-4666-8666-666666666666",
    provider: "meta_ads", external_account_id: "12345678901234567890", date_from: "2026-09-01", date_to: "2026-09-07",
    data_level: "creative", mode: "snapshot_replace", status: "processing", progress: 0,
    raw_rows: 0, normalized_rows: 0, inserted_rows: 0, failed_rows: 0,
    previous_ingestion_id: "88888888-8888-4888-8888-888888888888", snapshot_ingestion_id: null,
    attempt_count: 1, error: null, error_detail: null, started_at: "2026-09-19T00:00:01.000Z", finished_at: null,
    created_at: "2026-09-19T00:00:00.000Z", updated_at: "2026-09-19T00:00:01.000Z",
  };
}

async function main() {
  const c = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const fixture = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
  const options = { pageSize: 4, maxRetries: 0 };
  const scope = c.createMetaPageScope(initialJob(), fixture.context, options);
  const initial = c.initialMetaPageCheckpoint(scope);
  const page = await collect({ context: scope.context, accessToken: "fixture-only" },
    { fetchImpl: async () => new Response(JSON.stringify(fixture.pages[0])) }, options);
  const pending = c.prepareMetaPageCheckpoint(scope, initial, page);
  const append = { submittedRows: 2, insertedRows: 2, duplicateRows: 0, firstRowIndex: 0, lastRowIndex: 1 };
  const committed = c.confirmMetaPageAppend(scope, pending, append);
  assert.equal(initial.phase, "collecting"); assert.equal(initial.revision, 0);
  assert.equal(pending.phase, "pending"); assert.equal(pending.nextRowIndex, 0);
  assert.equal(committed.phase, "collecting"); assert.equal(committed.totalRows, 2); assert.equal(committed.fetchedRows, 3);
  assert.deepEqual(committed, c.confirmMetaPageAppend(scope, pending, { ...append, insertedRows: 0, duplicateRows: 2 }));
  const reorder = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(reorder);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reorder(v)]));
    return value;
  };
  assert.equal(c.metaPageJson(c.validateMetaPageCheckpoint(reorder(pending), scope)), c.metaPageJson(pending));
  assert.ok(Object.isFrozen(pending.pending?.rows[0].row.provider_meta));
  let cases = 4;
  function rejects(fn: () => unknown, code: string) {
    assert.throws(fn, (error) => { assert.ok(error instanceof c.MetaPageCheckpointError); assert.equal(error.code, code); return true; }); cases++;
  }
  const changes: Array<(v: Record<string, unknown>) => void> = [
    (v) => { v.version = 2; }, (v) => { v.scope = "wrong"; }, (v) => { v.revision = 5; },
    (v) => { v.phase = "done"; }, (v) => { v.nextRowIndex = 4; }, (v) => { v.totalRows = -1; },
    (v) => { v.completedPages = 1; }, (v) => { v.pending = null; }, (v) => { v.accessToken = "forbidden"; },
  ];
  for (const change of changes) {
    const value = structuredClone(pending) as unknown as Record<string, unknown>; change(value);
    rejects(() => c.validateMetaPageCheckpoint(value, scope), "INVALID_CHECKPOINT");
  }
  const value = structuredClone(pending);
  for (const changed of [
    { ...value, pending: { ...value.pending, id: "0".repeat(64) } },
    { ...value, pending: { ...value.pending, rows: [{ ...value.pending!.rows[0], row_index: 8 }, value.pending!.rows[1]] } },
    { ...value, pending: { ...value.pending, rows: [{ ...value.pending!.rows[0], row: { ...value.pending!.rows[0].row, cost: 99 } }, value.pending!.rows[1]] } },
  ]) rejects(() => c.validateMetaPageCheckpoint(changed, scope), "INVALID_CHECKPOINT");
  for (const changed of [{ ...append, submittedRows: 3 }, { ...append, insertedRows: 3 },
    { ...append, insertedRows: 1 }, { ...append, duplicateRows: -1 }, { ...append, firstRowIndex: 1 },
    { ...append, lastRowIndex: null }]) rejects(() => c.confirmMetaPageAppend(scope, pending, changed), "INVALID_APPEND_RESULT");
  for (const changed of [{ ...page, canonicalRows: 3 }, { ...page, completedPageCount: 2 },
    { ...page, fetchedRows: 0 }, { ...page, status: "completed" as const }, { ...page, retryCount: 2 },
    { ...page, cursor: { ...page.cursor!, scope: "wrong" } },
    { ...page, rows: [{ ...page.rows[0], external_account_id: "wrong" }, ...page.rows.slice(1)] }]) {
    rejects(() => c.prepareMetaPageCheckpoint(scope, initial, changed), "INVALID_PAGE");
  }
  for (const altered of [{ ...initialJob(), provider: "google_ads" as const },
    { ...initialJob(), snapshot_ingestion_id: "77777777-7777-4777-8777-777777777777" },
    { ...initialJob(), status: "done" as const }, { ...initialJob(), failed_rows: 1 }]) {
    rejects(() => c.createMetaPageScope(altered, fixture.context, options), "INVALID_SCOPE");
  }
  for (const altered of [{ ...initialJob(), attempt_count: 2 },
    { ...initialJob(), workspace_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }]) {
    const alteredScope = c.createMetaPageScope(altered, fixture.context, options);
    assert.equal(alteredScope.storageKey, scope.storageKey);
    rejects(() => c.validateMetaPageCheckpoint(pending, alteredScope), "INVALID_CHECKPOINT");
  }
  const changedPolicy = c.createMetaPageScope(initialJob(), { ...fixture.context,
    metricPolicy: { ...fixture.context.metricPolicy, actionReportTime: "fixture.other" } }, options);
  rejects(() => c.validateMetaPageCheckpoint(pending, changedPolicy), "INVALID_CHECKPOINT");
  rejects(() => c.prepareMetaPageCheckpoint(scope, pending, page), "INVALID_CHECKPOINT");
  rejects(() => c.confirmMetaPageAppend(scope, initial, append), "INVALID_CHECKPOINT");
  rejects(() => c.validateMetaPageCheckpoint({ ...committed, totalRows: 3, nextRowIndex: 3 }, scope), "INVALID_CHECKPOINT");
  assert.equal(networkAttempts, 0);
  console.log(`META_PAGE_CHECKPOINT_CONTRACT=PASS CASES=${cases}`);
  console.log("ORDER_INDEPENDENT_PENDING_DIGEST=PASS COUNTS_USE_CANONICAL_ROWS=PASS NETWORK_ATTEMPTS=0 DB_EXECUTIONS=0");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
