import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";

// Fixture export only. No env/credential imports and no permitted network path.
const deny = () => { throw new Error("META_FIXTURE_NETWORK_FORBIDDEN"); };
globalThis.fetch = deny;
for (const [target, keys] of [
  [http, ["request", "get"]], [https, ["request", "get"]],
  [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
  [tls, ["connect"]], [dns, ["lookup", "resolve"]],
  [dns.promises, ["lookup", "resolve"]], [dgram.Socket.prototype, ["send", "connect"]],
] as const) for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
syncBuiltinESMExports();

import type { MediaSyncJobRecord } from "../src/lib/media-sync/types";

// Same deterministic synthetic identities as the existing Python harness.
function uid(label: string): string {
  const ns = Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex");
  const bytes = createHash("sha1").update(ns).update("https://meta-fixture.invalid/" + label).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const s = bytes.toString("hex"); return `${s.slice(0,8)}-${s.slice(8,12)}-${s.slice(12,16)}-${s.slice(16,20)}-${s.slice(20)}`;
}
export async function buildMetaPageFixture() {
  const c = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const r = await import("../src/lib/media-sync/meta-ads-page-checkpoint-repository");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const wire = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
  const job: MediaSyncJobRecord = {
    id: uid("meta_ads-job"), workspace_id: uid("workspace"), advertiser_id: uid("advertiser"),
    report_id: uid("meta-primary"), connection_id: uid("meta_ads-connection"), created_by: uid("user"),
    provider: "meta_ads", external_account_id: wire.context.externalAccountId, date_from: wire.context.dateFrom,
    date_to: wire.context.dateTo, data_level: "creative", mode: "snapshot_replace", status: "processing", progress: 0,
    raw_rows: 0, normalized_rows: 0, inserted_rows: 0, failed_rows: 0, previous_ingestion_id: uid("meta-primary-previous"),
    snapshot_ingestion_id: null, attempt_count: 1, error: null, error_detail: { fixture_marker: "preserve" },
    started_at: "2026-09-19T00:00:00+00:00", finished_at: null, created_at: "2026-09-19T00:00:00+00:00",
    updated_at: "2026-09-19T00:00:00+00:00",
  };
  const input = { job, context: wire.context, collectorOptions: { pageSize: 4, maxRetries: 0 } };
  const scope = c.createMetaPageScope(job, input.context, input.collectorOptions);
  const envelope = r.metaPageDatabaseEnvelope(scope);
  let state = c.initialMetaPageCheckpoint(scope);
  const steps = [];
  for (const raw of wire.pages) {
    const page = await collect({ context: scope.context, accessToken: "fixture-only", cursor: state.cursor },
      { fetchImpl: async () => new Response(JSON.stringify(raw)) }, scope.options);
    const pending = c.prepareMetaPageCheckpoint(scope, state, page);
    const n = pending.pending!.rows.length;
    const confirmed = c.confirmMetaPageAppend(scope, pending, { submittedRows: n, insertedRows: n,
      duplicateRows: 0, firstRowIndex: n ? state.nextRowIndex : null, lastRowIndex: n ? state.nextRowIndex+n-1 : null });
    const appendPayload = { ...envelope, expected_revision: pending.revision, pending_id: pending.pending!.id,
      append_payload: { job_id: job.id, report_id: job.report_id, workspace_id: job.workspace_id, advertiser_id: job.advertiser_id,
        connection_id: job.connection_id, provider: "meta_ads", external_account_id: job.external_account_id,
        date_from: job.date_from, date_to: job.date_to, date_window_index: 0, rows: pending.pending!.rows } };
    steps.push({ pending, confirmed, prepare: { ...envelope, expected_revision: steps.length ? state.revision : null,
      ...r.metaPageDatabaseEvidence(pending) }, append: appendPayload,
      confirm: { ...envelope, expected_revision: pending.revision, ...r.metaPageDatabaseEvidence(confirmed) } });
    state = confirmed;
  }
  assert.equal(state.phase, "collected"); assert.equal(state.totalRows, 6); assert.equal(state.fetchedRows, 7);
  const emptyPage = await collect({ context: scope.context, accessToken: "fixture-only" },
    { fetchImpl: async () => new Response(JSON.stringify({ data: [] })) }, scope.options);
  const emptyPending = c.prepareMetaPageCheckpoint(scope, c.initialMetaPageCheckpoint(scope), emptyPage);
  const emptyFinal = c.confirmMetaPageAppend(scope, emptyPending, { submittedRows: 0, insertedRows: 0,
    duplicateRows: 0, firstRowIndex: null, lastRowIndex: null });
  return { input, scope, envelope, steps, wirePages: wire.pages, final: state,
    empty: { prepare: { ...envelope, expected_revision: null, ...r.metaPageDatabaseEvidence(emptyPending) },
      confirm: { ...envelope, expected_revision: 1, ...r.metaPageDatabaseEvidence(emptyFinal) }, final: emptyFinal } };
}

// Guarded Python harness uses a fresh Node process per page, including recovery.
// The only IPC operations are fixed-name injected RPCs; no DB client is imported.
async function rpcWorker() {
  const { createInterface } = await import("node:readline");
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity });
  const lines = reader[Symbol.asyncIterator]();
  const next = async () => { const line = await lines.next(); assert.equal(line.done, false); return JSON.parse(line.value); };
  const init = await next();
  const { createMetaAdsPageCheckpointRepository } = await import("../src/lib/media-sync/meta-ads-page-checkpoint-repository");
  const { runMetaAdsStagingOrchestrator } = await import("../src/lib/media-sync/meta-ads-staging-orchestrator");
  const { collectMetaAdsAdDailyInsightsPage } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  let sequence = 0;
  const ports = createMetaAdsPageCheckpointRepository(init.input, async (name, args) => {
    const id = ++sequence;
    process.stdout.write(JSON.stringify({ type: "rpc", id, name, payload: args.p_payload }) + "\n");
    const reply = await next(); assert.equal(reply.id, id);
    return { data: reply.data, error: reply.error ?? null };
  });
  try {
    const result = await runMetaAdsStagingOrchestrator({ ...init.input, accessToken: "fixture-only-never-stored" }, {
      ...ports, collectPage: (request, options) => collectMetaAdsAdDailyInsightsPage(request, {
        fetchImpl: async () => {
          const index = (request.cursor as { pageIndex: number } | null)?.pageIndex ?? 0;
          assert.ok(init.wirePages[index]);
          return new Response(JSON.stringify(init.wirePages[index]));
        },
      }, options),
    });
    process.stdout.write(JSON.stringify({ type: "result", result }) + "\n");
  } catch {
    process.stdout.write(JSON.stringify({ type: "failure", code: "META_PAGE_WORKER_FAILED" }) + "\n");
    process.exitCode = 1;
  } finally { reader.close(); process.stdin.pause(); }
}
if (process.argv[1]?.endsWith("export-meta-ads-page-checkpoint-fixture.ts")) {
  (process.argv.includes("--rpc-worker") ? rpcWorker() : buildMetaPageFixture().then((fixture) => {
    process.stdout.write(JSON.stringify(fixture) + "\n");
  })).catch(() => { process.stderr.write("META_PAGE_FIXTURE_FAILED\n"); process.exitCode = 1; });
}
