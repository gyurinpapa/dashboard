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
import type { MetaAdsCanonicalContext, MetaAdsAdDailyInsight } from "../src/lib/media-sync/meta-ads-canonical-row";
import type { MetaAdsPreparedStagingRow } from "../src/lib/media-sync/meta-ads-staging-contract";
import type {
  MetaAdsProjectionTarget, MetaAdsStagingProjectionDependencies, MetaAdsProjectionPhase,
} from "../src/lib/media-sync/meta-ads-staging-projection-contract";
import type { MediaSyncJobRecord } from "../src/lib/media-sync/types";

// This standalone test process never reads real credentials or a .env file.
// Existing repositories eagerly construct a client at import time. Reserved
// .invalid host + synthetic key permit construction, with ALL I/O denied below.
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://meta-fixture.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "fixture-only-not-a-secret";
let networkAttempts = 0;
const denyNetwork = () => { networkAttempts += 1; throw new Error("OFFLINE_NETWORK_FORBIDDEN"); };
globalThis.fetch = denyNetwork;
for (const [target, keys] of [
  [http, ["request", "get"]], [https, ["request", "get"]],
  [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
  [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
  [dgram.Socket.prototype, ["send", "connect"]],
] as const) for (const key of keys) Object.defineProperty(target, key, { configurable: true, writable: true, value: denyNetwork });
syncBuiltinESMExports();

const PRIMARY = "44444444-4444-4444-8444-444444444444";
const SECONDARY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRIMARY_SNAPSHOT = "77777777-7777-4777-8777-777777777777";
const SECONDARY_SNAPSHOT = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
// Fixed vectors from the repository SQL expression (UTF-8 SHA-256):
// job_id:report_id:snapshot_id:6:0:5:0:5. Never import the implementation's
// calculator here. These are completion tokens, not dataset content hashes.
const SQL_COMPLETION_TOKENS: Readonly<Record<string, string>> = {
  [PRIMARY]: "3a1b5ad38f7dd61363348c332c24fab05c7d6f3690b34af5d7cab8ec08b0a4a0",
  [SECONDARY]: "9a28e04ba950579f7f0d4e239ff306cac18e4e7a45d50e866691884ace063631",
};
const FINISHED = "2026-09-19T00:01:00.000Z";
const APPEND = "append_media_sync_staging_batch";
const PREPARE = "prepare_media_sync_snapshot_materialization";
const BATCH = "materialize_media_sync_snapshot_batch";
const COMPLETE = "complete_media_sync_snapshot_materialization";
const ACTIVATE = "activate_media_sync_snapshot";
const FINALIZE = "finalize_media_sync_job";

function initialJob(): MediaSyncJobRecord {
  return {
    id: "11111111-1111-4111-8111-111111111111", workspace_id: "22222222-2222-4222-8222-222222222222",
    advertiser_id: "33333333-3333-4333-8333-333333333333", report_id: PRIMARY,
    connection_id: "55555555-5555-4555-8555-555555555555", created_by: "66666666-6666-4666-8666-666666666666",
    provider: "meta_ads", external_account_id: "12345678901234567890", date_from: "2026-09-01", date_to: "2026-09-07",
    data_level: "creative", mode: "snapshot_replace", status: "processing", progress: 0,
    raw_rows: 0, normalized_rows: 0, inserted_rows: 0, failed_rows: 0,
    previous_ingestion_id: "88888888-8888-4888-8888-888888888888", snapshot_ingestion_id: null,
    attempt_count: 1, error: null, error_detail: null, started_at: "2026-09-19T00:00:01.000Z", finished_at: null,
    created_at: "2026-09-19T00:00:00.000Z", updated_at: "2026-09-19T00:00:01.000Z",
  };
}

type Payload = Record<string, unknown>;
type MockProjection = {
  target: MetaAdsProjectionTarget; snapshot: string;
  rows: Map<number, MetaAdsPreparedStagingRow>; complete: boolean;
  current: string | null; published: string | null;
};

// Deliberately a MOCK digest. No claim of PostgreSQL jsonb/fingerprint parity.
function mockDigest(rows: readonly MetaAdsPreparedStagingRow[]) {
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function createMock() {
  const seed = initialJob();
  const common = { workspaceId: seed.workspace_id, advertiserId: seed.advertiser_id, createdBy: seed.created_by };
  const targets: MetaAdsProjectionTarget[] = [
    { ...common, reportId: PRIMARY, previousIngestionId: seed.previous_ingestion_id, publishedIngestionId: "99999999-9999-4999-8999-999999999999" },
    { ...common, reportId: SECONDARY, previousIngestionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", publishedIngestionId: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" },
  ];
  const state = {
    job: seed, targets, staging: new Map<number, MetaAdsPreparedStagingRow>(), projections: new Map<string, MockProjection>(),
    events: [] as string[], payloads: [] as { name: string; payload: Payload }[],
    connectionLastSyncAt: null as string | null,
    fail: null as { name: string; reportId?: string; afterCommit?: boolean } | null,
    mutateResult: null as ((name: string, payload: Payload, result: Payload) => void) | null,
  };
  const storedRows = () => [...state.staging.values()].sort((a, b) => a.row_index - b.row_index);
  const projectionRows = (projection: MockProjection) => [...projection.rows.values()].sort((a, b) => a.row_index - b.row_index);
  const dependencies: MetaAdsStagingProjectionDependencies = {
    loadTargets: async () => { state.events.push("targets"); return structuredClone(state.targets); },
    checkpoint: async ({ totalRows }) => {
      state.events.push("checkpoint");
      assert.equal(state.staging.size, totalRows);
      state.job = { ...state.job, raw_rows: totalRows, normalized_rows: totalRows, inserted_rows: totalRows, progress: 70 };
      return structuredClone(state.job);
    },
    readStagingProof: async ({ job, expectedRows }) => {
      state.events.push("summary");
      const rows = storedRows();
      return {
        datasetFingerprint: mockDigest(rows),
        summary: {
          jobId: job.id, expectedRows, totalRows: rows.length,
          minRowIndex: rows[0]?.row_index ?? null, maxRowIndex: rows.at(-1)?.row_index ?? null,
          distinctRowIndexes: new Set(rows.map((row) => row.row_index)).size, rowsInExpectedRange: rows.length,
          missingExpectedRows: expectedRows - rows.length, outOfRangeRows: 0, scopeMismatchRows: 0,
          blankRowKeyRows: 0, missingFingerprintRows: 0, canonicalMismatchRows: 0,
          dateWindowCount: 1, dateWindowSummaries: [{
            dateWindowIndex: 0, rowCount: rows.length, minRowIndex: 0, maxRowIndex: rows.length - 1,
            minDate: rows[0]?.date ?? "", maxDate: rows.at(-1)?.date ?? "",
          }], isComplete: rows.length === expectedRows,
        },
      };
    },
    loadProjectionAuthority: async ({ job, reportId, snapshotIngestionId }) => {
      state.events.push(`authority:${reportId}`);
      const projection = state.projections.get(reportId)!;
      assert.equal(projection.snapshot, snapshotIngestionId);
      return { ...structuredClone(projection.target), jobId: job.id, snapshotIngestionId };
    },
    invokeRpc: async (name, args) => {
      const payload = args.p_payload as Payload;
      state.events.push(`${name}:${String(payload.report_id)}`);
      state.payloads.push({ name, payload: structuredClone(payload) });
      const fault = state.fail?.name === name && (!state.fail.reportId || state.fail.reportId === payload.report_id);
      if (fault && !state.fail?.afterCommit) return { data: null, error: { message: "MOCK_CONFLICT" } };
      assert.equal(payload.provider, "meta_ads", "Meta must never be rewritten as Naver");
      for (const [key, expected] of Object.entries({ job_id: seed.id, workspace_id: seed.workspace_id,
        advertiser_id: seed.advertiser_id, connection_id: seed.connection_id, external_account_id: seed.external_account_id,
        date_from: seed.date_from, date_to: seed.date_to })) assert.equal(payload[key], expected);
      let result: Payload;
      if (name === APPEND) {
        assert.equal(state.projections.size, 0, "No append after projection creation");
        assert.equal(payload.report_id, PRIMARY);
        assert.equal(payload.date_window_index, 0);
        const incoming = payload.rows as MetaAdsPreparedStagingRow[];
        let inserted = 0;
        for (const row of incoming) {
          assert.equal(row.device, "");
          const existing = state.staging.get(row.row_index);
          if (existing) assert.deepEqual(row, existing, "Conflicting retry must not replace a canonical row");
          else { state.staging.set(row.row_index, structuredClone(row)); inserted += 1; }
        }
        result = { submitted_rows: incoming.length, inserted_rows: inserted, duplicate_rows: incoming.length - inserted,
          first_row_index: incoming[0]?.row_index ?? null, last_row_index: incoming.at(-1)?.row_index ?? null };
      } else {
        const target = targets.find((item) => item.reportId === payload.report_id)!;
        assert.ok(target, "Unknown projection target");
        assert.equal(payload.expected_rows, state.staging.size);
        if (name === PREPARE) {
          const existing = state.projections.get(target.reportId);
          const snapshot = target.reportId === PRIMARY ? PRIMARY_SNAPSHOT : SECONDARY_SNAPSHOT;
          if (!existing) state.projections.set(target.reportId, {
            target: structuredClone(target), snapshot, rows: new Map(), complete: false,
            current: target.previousIngestionId, published: target.publishedIngestionId,
          });
          if (target.reportId === PRIMARY) state.job.snapshot_ingestion_id = snapshot;
          result = { job: structuredClone(state.job), snapshot_ingestion_id: snapshot, expected_rows: state.staging.size,
            next_row_index: existing?.rows.size ?? 0, idempotent: Boolean(existing) };
        } else {
          const projection = state.projections.get(target.reportId)!;
          assert.ok(projection);
          assert.equal(payload.snapshot_ingestion_id, projection.snapshot);
          if (name === BATCH) {
            const start = payload.batch_start as number;
            const end = Math.min(start + (payload.batch_size as number), state.staging.size);
            let inserted = 0;
            for (let index = start; index < end; index++) {
              const row = state.staging.get(index)!;
              assert.ok(row, "Missing staging index");
              if (!projection.rows.has(index)) { projection.rows.set(index, structuredClone(row)); inserted += 1; }
            }
            result = { job: structuredClone(state.job), snapshot_ingestion_id: projection.snapshot,
              batch_start: start, batch_end_exclusive: end, expected_batch_rows: end - start, inserted_rows: inserted,
              materialized_batch_rows: end - start, next_row_index: projection.rows.size,
              complete: projection.rows.size === state.staging.size, idempotent: inserted === 0 };
          } else if (name === COMPLETE) {
            const alreadyComplete = projection.complete;
            assert.deepEqual(projectionRows(projection), storedRows());
            projection.complete = true;
            result = { job: structuredClone(state.job), snapshot_ingestion_id: projection.snapshot, row_count: projection.rows.size,
              staging_fingerprint: SQL_COMPLETION_TOKENS[target.reportId], materialized_fingerprint: SQL_COMPLETION_TOKENS[target.reportId], idempotent: alreadyComplete };
          } else if (name === ACTIVATE) {
            assert.ok([...state.projections.values()].every((item) => item.complete));
            assert.equal(payload.previous_ingestion_id, projection.target.previousIngestionId);
            assert.ok(projection.current === projection.target.previousIngestionId || projection.current === projection.snapshot, "Pointer conflict");
            const idempotent = projection.current === projection.snapshot;
            projection.current = projection.snapshot;
            result = { job: structuredClone(state.job), previous_ingestion_id: projection.target.previousIngestionId,
              snapshot_ingestion_id: projection.snapshot, current_ingestion_id: projection.current,
              published_ingestion_id: projection.published, row_count: projection.rows.size,
              staging_fingerprint: SQL_COMPLETION_TOKENS[target.reportId], materialized_fingerprint: SQL_COMPLETION_TOKENS[target.reportId], idempotent };
          } else {
            assert.equal(name, FINALIZE);
            assert.equal(target.reportId, PRIMARY);
            assert.equal(payload.previous_ingestion_id, seed.previous_ingestion_id);
            assert.equal(state.projections.size, targets.length);
            assert.ok([...state.projections.values()].every((item) => item.complete && item.current === item.snapshot));
            state.job = { ...state.job, status: "done", progress: 100, finished_at: FINISHED, updated_at: FINISHED };
            state.connectionLastSyncAt = FINISHED;
            result = { job: structuredClone(state.job), snapshot_ingestion_id: projection.snapshot, current_ingestion_id: projection.current,
              published_ingestion_id: projection.published, row_count: projection.rows.size,
              staging_fingerprint: SQL_COMPLETION_TOKENS[target.reportId], materialized_fingerprint: SQL_COMPLETION_TOKENS[target.reportId],
              finished_at: FINISHED, connection_id: seed.connection_id, connection_last_sync_at: FINISHED, connection_updated: true, idempotent: false };
          }
        }
      }
      if (fault && state.fail?.afterCommit) throw new Error("MOCK_RESPONSE_LOST_AFTER_COMMIT");
      state.mutateResult?.(name, payload, result);
      return { data: [result], error: null };
    },
  };
  return { state, dependencies, storedRows };
}

async function main() {
  const { convertMetaAdsDailyInsightsToCanonicalRows } = await import("../src/lib/media-sync/meta-ads-canonical-row");
  const { prepareMetaAdsStagingRows, prepareMetaAdsStagingBatch } = await import("../src/lib/media-sync/meta-ads-staging-contract");
  const { runMetaAdsStagingProjectionContract: run, MetaAdsStagingProjectionError } = await import("../src/lib/media-sync/meta-ads-staging-projection-contract");
  const fixture = JSON.parse(readFileSync("scripts/fixtures/meta-ads-ad-daily-insights.json", "utf8")) as {
    context: MetaAdsCanonicalContext; records: MetaAdsAdDailyInsight[];
  };
  const context = fixture.context;
  const rows = convertMetaAdsDailyInsightsToCanonicalRows(fixture);
  const input = { job: initialJob(), context, rows, appendBatchSize: 2, materializationBatchSize: 2 };
  const baseline = JSON.stringify(input);
  const mock = createMock();
  // The legacy repository's diagnostic logs are noisy; do not alter its code.
  const log = console.log;
  const errorLog = console.error;
  console.log = (...args: unknown[]) => { if (!String(args[0]).startsWith("[media-sync-materialization]")) log(...args); };
  console.error = (...args: unknown[]) => { if (!String(args[0]).startsWith("[media-sync-materialization]")) errorLog(...args); };
  try {
    const result = await run(input, mock.dependencies);
    assert.equal(result.status, "mock_contract_completed");
    assert.equal(result.totalRows, 6); assert.equal(result.rawRows, 6); assert.equal(result.projectionCount, 2);
    assert.equal(result.finalization.job.raw_rows, 6, "Fanout must not multiply RAW");
    assert.equal(mock.state.connectionLastSyncAt, FINISHED);
    assert.equal(JSON.stringify(input), baseline, "Caller inputs remain unchanged");
    assert.deepEqual(mock.storedRows(), prepareMetaAdsStagingRows({ context, rows }).rows);
    assert.deepEqual(mock.storedRows().map((row) => row.row_index), [0, 1, 2, 3, 4, 5]);
    assert.equal(mock.state.payloads.filter((call) => call.name === APPEND).length, 3);
    assert.equal(mock.state.payloads.filter((call) => call.name === BATCH).length, 6);
    assert.equal(mock.state.payloads.filter((call) => call.name === FINALIZE).length, 1);
    assert.equal(mock.state.events.filter((event) => event === "targets").length, 3);
    assert.deepEqual(mock.state.payloads.filter((call) => call.name === ACTIVATE).map((call) => call.payload.report_id), [SECONDARY, PRIMARY]);
    const firstActivation = mock.state.events.findIndex((event) => event.startsWith(ACTIVATE));
    for (const target of mock.state.targets) {
      assert.ok(mock.state.events.indexOf(`authority:${target.reportId}`) < firstActivation);
      assert.ok(mock.state.events.indexOf(`${COMPLETE}:${target.reportId}`) < firstActivation);
      const projection = mock.state.projections.get(target.reportId)!;
      assert.equal(projection.current, projection.snapshot);
      assert.equal(projection.published, target.publishedIngestionId);
      assert.deepEqual([...projection.rows.values()], mock.storedRows());
    }
    assert.notEqual(result.projections[0].previousIngestionId, result.projections[1].previousIngestionId);
    assert.notEqual(result.projections[0].snapshotIngestionId, result.projections[1].snapshotIngestionId);
    assert.equal(mock.state.job.snapshot_ingestion_id, PRIMARY_SNAPSHOT);
    assert.notEqual(SQL_COMPLETION_TOKENS[PRIMARY], SQL_COMPLETION_TOKENS[SECONDARY]);
    assert.equal(result.finalization.stagingFingerprint, SQL_COMPLETION_TOKENS[PRIMARY]);
    assert.equal(result.finalization.materializedFingerprint, SQL_COMPLETION_TOKENS[PRIMARY]);
    const datasetProof = await mock.dependencies.readStagingProof({ job: mock.state.job, context, expectedRows: 6 });
    for (const token of Object.values(SQL_COMPLETION_TOKENS)) assert.notEqual(datasetProof.datasetFingerprint, token);
    assert.deepEqual(prepareMetaAdsStagingBatch({ context, rows: rows.slice(2, 4), rowStartIndex: 2 }), mock.storedRows().slice(2, 4));
    assert.throws(() => prepareMetaAdsStagingBatch({ context, rows, rowStartIndex: Number.MAX_SAFE_INTEGER }));
    assert.throws(() => prepareMetaAdsStagingBatch({ context, rows: [rows[0], rows[0]], rowStartIndex: 0 }));
    log("META_MULTI_BATCH_GLOBAL_INDEX_RAW_SINGLE_DATASET=PASS");
    log("META_TWO_PROJECTIONS_AUTHORITY_MIRROR_AND_PUBLISHED_POINTERS=PASS");

    let failures = 0;
    async function failure(
      candidate: ReturnType<typeof createMock>, phase: MetaAdsProjectionPhase,
      overrideInput = input, deps = candidate.dependencies,
    ) {
      let caught: unknown;
      try { await run(overrideInput, deps); } catch (error) { caught = error; }
      assert.ok(caught instanceof MetaAdsStagingProjectionError, "Expected a contained contract failure");
      assert.equal(caught.phase, phase);
      if (phase !== "finalize") {
        assert.equal(candidate.state.payloads.filter((call) => call.name === FINALIZE).length, 0);
        assert.equal(candidate.state.connectionLastSyncAt, null);
        assert.notEqual(candidate.state.job.status, "done");
      }
      if (["preflight", "append", "checkpoint", "summary", "materialize", "authority"].includes(phase)) {
        assert.equal(candidate.state.payloads.filter((call) => call.name === ACTIVATE).length, 0);
        assert.equal(caught.activationMayBePartial, false);
      }
      failures += 1;
      return caught;
    }
    for (const key of ["invokeRpc", "loadTargets", "checkpoint", "readStagingProof", "loadProjectionAuthority"] as const) {
      const candidate = createMock();
      await failure(candidate, "preflight", input, { ...candidate.dependencies, [key]: undefined } as unknown as MetaAdsStagingProjectionDependencies);
      assert.equal(candidate.state.events.length, 0);
    }
    for (const change of [
      { provider: "google_ads" }, { status: "pending" }, { data_level: "keyword" }, { raw_rows: 1 },
      { workspace_id: "invalid" }, { external_account_id: "wrong" }, { date_to: "2026-09-06" },
      { snapshot_ingestion_id: PRIMARY_SNAPSHOT }, { automation_contract: "daily_report_v2" },
    ]) await failure(createMock(), "preflight", { ...input, job: { ...input.job, ...change } as MediaSyncJobRecord });
    await failure(createMock(), "preflight", { ...input, rows: [] });
    await failure(createMock(), "preflight", { ...input, appendBatchSize: 0 });
    for (const transform of [
      (targets: MetaAdsProjectionTarget[]) => targets.slice(1),
      (targets: MetaAdsProjectionTarget[]) => [targets[0], targets[0]],
      (targets: MetaAdsProjectionTarget[]) => [targets[0], { ...targets[1], workspaceId: targets[1].advertiserId }],
      (targets: MetaAdsProjectionTarget[]) => [targets[0], { ...targets[1], createdBy: targets[1].advertiserId }],
    ]) {
      const candidate = createMock(); candidate.state.targets = transform(candidate.state.targets);
      await failure(candidate, "preflight"); assert.equal(candidate.state.payloads.length, 0);
    }
    for (const [name, phase] of [[APPEND, "append"], [BATCH, "materialize"], [COMPLETE, "materialize"]] as const) {
      const candidate = createMock(); candidate.state.fail = { name }; await failure(candidate, phase);
    }
    {
      const candidate = createMock();
      await failure(candidate, "checkpoint", input, { ...candidate.dependencies, checkpoint: async (args) =>
        ({ ...await candidate.dependencies.checkpoint(args), raw_rows: 7 }) });
    }
    for (const patch of [
      { isComplete: false }, { totalRows: 7 }, { canonicalMismatchRows: 1 }, { missingFingerprintRows: 1 },
      { distinctRowIndexes: 5 }, { scopeMismatchRows: 1 }, { dateWindowSummaries: [] },
    ]) {
      const candidate = createMock();
      await failure(candidate, "summary", input, { ...candidate.dependencies, readStagingProof: async (args) => {
        const proof = await candidate.dependencies.readStagingProof(args); return { ...proof, summary: { ...proof.summary, ...patch } };
      } });
    }
    {
      const candidate = createMock(); let calls = 0;
      await failure(candidate, "summary", input, { ...candidate.dependencies, readStagingProof: async (args) => {
        const proof = await candidate.dependencies.readStagingProof(args);
        return ++calls === 2 ? { ...proof, datasetFingerprint: "f".repeat(64) } : proof;
      } });
      assert.equal(candidate.state.projections.size, 2);
    }
    // Old generic fingerprint-shaped proofs cannot silently satisfy the new
    // dataset proof contract, even when they carry a valid completion token.
    {
      const candidate = createMock();
      await failure(candidate, "summary", input, { ...candidate.dependencies, readStagingProof: async (args) => {
        const proof = await candidate.dependencies.readStagingProof(args);
        return { summary: proof.summary, fingerprint: SQL_COMPLETION_TOKENS[PRIMARY] } as unknown as typeof proof;
      } });
    }
    let completionTokenFailures = 0;
    for (const [name, phase] of [[COMPLETE, "materialize"], [ACTIVATE, "activate"], [FINALIZE, "finalize"]] as const) {
      for (const reportId of name === FINALIZE ? [PRIMARY] : [PRIMARY, SECONDARY]) {
        for (const corruption of ["other-report", "other-snapshot", "other-job", "wrong-count", "dataset-digest", "malformed", "missing", "disagree"] as const) {
          const candidate = createMock();
          const otherReport = reportId === PRIMARY ? SECONDARY : PRIMARY;
          candidate.state.mutateResult = (operation, payload, response) => {
            if (operation !== name || payload.report_id !== reportId) return;
            let wrongToken: unknown;
            if (corruption === "other-report") wrongToken = SQL_COMPLETION_TOKENS[otherReport];
            else if (corruption === "dataset-digest") wrongToken = mockDigest(candidate.storedRows());
            else if (corruption === "malformed") wrongToken = "not-a-sha256-token";
            else if (corruption === "missing") wrongToken = undefined;
            else if (corruption === "disagree") wrongToken = SQL_COMPLETION_TOKENS[otherReport];
            else {
              const count = corruption === "wrong-count" ? 7 : 6;
              const snapshot = reportId === PRIMARY ? PRIMARY_SNAPSHOT : SECONDARY_SNAPSHOT;
              const otherSnapshot = reportId === PRIMARY ? SECONDARY_SNAPSHOT : PRIMARY_SNAPSHOT;
              wrongToken = createHash("sha256").update([
                corruption === "other-job" ? input.job.workspace_id : input.job.id,
                reportId, corruption === "other-snapshot" ? otherSnapshot : snapshot,
                count, 0, count - 1, 0, count - 1,
              ].join(":"), "utf8").digest("hex");
            }
            response.staging_fingerprint = wrongToken;
            if (corruption !== "disagree") response.materialized_fingerprint = wrongToken;
          };
          const error = await failure(candidate, phase);
          if (!["malformed", "missing", "disagree"].includes(corruption)) {
            assert.ok(error.cause instanceof Error);
            assert.match(error.cause.message, /Projection completion token/);
          }
          if (phase === "activate") {
            assert.equal(error.activationMayBePartial, true);
            assert.deepEqual(error.activatedReportIds, reportId === SECONDARY ? [] : [SECONDARY]);
            assert.equal(candidate.state.projections.get(reportId)!.current,
              reportId === PRIMARY ? PRIMARY_SNAPSHOT : SECONDARY_SNAPSHOT,
              "Rejecting a post-commit token must not imply rollback");
          } else if (phase === "finalize") {
            assert.deepEqual(error.activatedReportIds, [SECONDARY, PRIMARY]);
            assert.equal(candidate.state.job.status, "done", "An invalid response does not undo a committed finalization");
            assert.equal(candidate.state.connectionLastSyncAt, FINISHED);
            assert.equal(candidate.state.payloads.filter((call) => call.name === FINALIZE).length, 1, "No automatic finalization retry");
          }
          completionTokenFailures += 1;
        }
      }
    }
    assert.equal(completionTokenFailures, 40);
    for (const patch of [
      { jobId: input.job.workspace_id }, { workspaceId: input.job.advertiser_id }, { reportId: PRIMARY },
      { snapshotIngestionId: PRIMARY_SNAPSHOT }, { previousIngestionId: input.job.previous_ingestion_id },
    ]) {
      const candidate = createMock();
      await failure(candidate, "authority", input, { ...candidate.dependencies, loadProjectionAuthority: async (args) => {
        const authority = await candidate.dependencies.loadProjectionAuthority(args);
        return args.reportId === SECONDARY ? { ...authority, ...patch } : authority;
      } });
    }
    {
      const candidate = createMock();
      candidate.state.mutateResult = (name, payload, result) => {
        if (name === COMPLETE && payload.report_id === SECONDARY) {
          result.staging_fingerprint = "f".repeat(64); result.materialized_fingerprint = "f".repeat(64);
        }
      };
      await failure(candidate, "materialize");
    }
    {
      const candidate = createMock();
      candidate.state.mutateResult = (name, payload, result) => {
        if (name === PREPARE && payload.report_id === SECONDARY) (result.job as MediaSyncJobRecord).snapshot_ingestion_id = SECONDARY_SNAPSHOT;
      };
      await failure(candidate, "materialize");
    }
    for (const afterCommit of [false, true]) {
      const candidate = createMock(); candidate.state.fail = { name: ACTIVATE, reportId: PRIMARY, afterCommit };
      const error = await failure(candidate, "activate");
      assert.equal(error.activationMayBePartial, true);
      assert.deepEqual(error.activatedReportIds, [SECONDARY]);
      assert.equal(candidate.state.projections.get(SECONDARY)!.current, SECONDARY_SNAPSHOT);
      assert.equal(candidate.state.projections.get(PRIMARY)!.current, afterCommit ? PRIMARY_SNAPSHOT : candidate.state.targets[0].previousIngestionId);
    }
    {
      const candidate = createMock();
      await failure(candidate, "activate", input, { ...candidate.dependencies, loadProjectionAuthority: async (args) => {
        const authority = await candidate.dependencies.loadProjectionAuthority(args);
        if (args.reportId === SECONDARY) candidate.state.projections.get(SECONDARY)!.current = PRIMARY_SNAPSHOT;
        return authority;
      } });
    }
    {
      const candidate = createMock(); candidate.state.fail = { name: FINALIZE };
      const error = await failure(candidate, "finalize");
      assert.equal(error.activationMayBePartial, true);
      assert.deepEqual(error.activatedReportIds, [SECONDARY, PRIMARY]);
      assert.equal(candidate.state.connectionLastSyncAt, null);
      assert.equal(candidate.state.job.status, "processing");
    }
    for (const driftAt of [2, 3]) {
      const candidate = createMock(); let calls = 0;
      const error = await failure(candidate, driftAt === 2 ? "authority" : "finalize", input, {
        ...candidate.dependencies,
        loadTargets: async (job) => {
          const targets = await candidate.dependencies.loadTargets(job);
          return ++calls === driftAt ? targets.slice(0, 1) : targets;
        },
      });
      assert.equal(candidate.state.payloads.filter((call) => call.name === FINALIZE).length, 0);
      assert.equal(candidate.state.connectionLastSyncAt, null);
      assert.equal(error.activationMayBePartial, driftAt === 3);
    }

    // Exercise missing dependency/projection gates on the actual common functions.
    const { appendMediaSyncStagingBatch: append } = await import("../src/lib/media-sync/media-sync-staging-repository");
    const { materializeMediaSyncSnapshot: materialize } = await import("../src/lib/media-sync/media-sync-snapshot-materialization-repository");
    const { activateMediaSyncSnapshot: activate } = await import("../src/lib/media-sync/media-sync-snapshot-activation-repository");
    const { finalizeMediaSyncJob: finalize } = await import("../src/lib/media-sync/media-sync-finalization-repository");
    const processing = { ...mock.state.job, status: "processing" as const, progress: 70, finished_at: null };
    const proof = await mock.dependencies.readStagingProof({ job: processing, context, expectedRows: 6 });
    let unintendedCalls = 0;
    const shouldNotRun = { invokeRpc: async () => { unintendedCalls += 1; throw new Error("Unexpected mock call"); } };
    await assert.rejects(append({ job: initialJob(), rows, rowStartIndex: 0, dateWindowIndex: 0, metaContext: context }), { code: "INVALID_INPUT" });
    await assert.rejects(append({ job: initialJob(), rows, rowStartIndex: 0, dateWindowIndex: 0 }, shouldNotRun), { code: "INVALID_INPUT" });
    await assert.rejects(materialize({ job: processing, summary: proof.summary, targetReportId: PRIMARY }), { code: "INVALID_INPUT" });
    await assert.rejects(materialize({ job: processing, summary: proof.summary, dependencies: shouldNotRun }), { code: "INVALID_INPUT" });
    await assert.rejects(activate({ job: processing, expectedRows: 6, projection: result.projections[0] }), { code: "INVALID_INPUT" });
    await assert.rejects(activate({ job: processing, expectedRows: 6, dependencies: shouldNotRun }), { code: "INVALID_INPUT" });
    await assert.rejects(finalize({ job: processing, expectedRows: 6 }), { code: "INVALID_INPUT" });
    assert.equal(unintendedCalls, 0);

    // Re-sending an exact batch preserves payload/key/index; it does not create a job.
    const duplicate = createMock();
    const batchInput = { job: initialJob(), rows: rows.slice(0, 2), rowStartIndex: 0, dateWindowIndex: 0, metaContext: context };
    assert.equal((await append(batchInput, duplicate.dependencies)).insertedRows, 2);
    assert.equal((await append(batchInput, duplicate.dependencies)).duplicateRows, 2);
    const corruptRows = [{ ...rows[0], cost: 999 }, rows[1]];
    await assert.rejects(append({ ...batchInput, rows: corruptRows }, duplicate.dependencies));
    assert.equal(duplicate.storedRows()[0].row.cost, 12.345);
    const { getMediaProviderSyncCapability } = await import("../src/lib/media-sync/media-provider-sync-capabilities");
    assert.deepEqual(getMediaProviderSyncCapability("meta_ads"), { syncRuntimeEnabled: false, allowedDataLevels: [] });
    assert.equal(networkAttempts, 0);
    log(`META_PROJECTION_NEGATIVE_SCENARIOS=${failures}`);
    log("META_SQL_COMPLETION_TOKEN_FIXED_VECTORS=PASS");
    log("META_DATASET_PROOF_SEPARATE_FROM_PROJECTION_TOKEN=PASS");
    log(`META_COMPLETION_TOKEN_NEGATIVE_SCENARIOS=${completionTokenFailures}`);
    log("META_MISSING_DEPENDENCY_GATES=7/7");
    log("META_PARTIAL_ACTIVATION_REPORTED_NO_FALSE_ROLLBACK_OR_FINALIZATION=PASS");
    log("META_EXACT_BATCH_REPLAY_AND_CONFLICT=PASS");
    log("META_RUNTIME_STILL_DISABLED=PASS");
    log("NETWORK_ATTEMPTS=0");
    log("POSTGRES_FINGERPRINT_PARITY=NOT_TESTED");
    log("LIVE_DB_AND_ATOMIC_FANOUT=NOT_TESTED");
    log("META_STAGING_PROJECTION_MOCK_CONTRACT=PASS");
  } finally { console.log = log; console.error = errorLog; }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
