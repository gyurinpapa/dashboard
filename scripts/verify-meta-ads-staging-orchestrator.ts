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
  const { runMetaAdsStagingOrchestrator: run } = await import("../src/lib/media-sync/meta-ads-staging-orchestrator");
  const c = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const { appendMediaSyncStagingBatch: append } = await import("../src/lib/media-sync/media-sync-staging-repository");
  const { prepareMetaAdsStagingBatch: prepare } = await import("../src/lib/media-sync/meta-ads-staging-contract");
  const fixture = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
  const input = { job: initialJob(), context: fixture.context, accessToken: "fixture-no-persist-secret", collectorOptions: { pageSize: 4, maxRetries: 0 } };
  type Dependencies = Parameters<typeof run>[1];
  type Checkpoint = import("../src/lib/media-sync/meta-ads-page-checkpoint-contract").MetaPageCheckpoint;
  type Row = import("../src/lib/media-sync/meta-ads-staging-contract").MetaAdsPreparedStagingRow;
  const make = () => {
    const expectedStorageKey = c.createMetaPageScope(input.job, input.context, input.collectorOptions).storageKey;
    const state = { checkpoint: null as Checkpoint | null, rows: new Map<number, Row>(), calls: [] as string[],
      fetchCount: 0, casCount: 0, appendCount: 0, failCAS: 0, lostCAS: 0, failRead: false,
      failAppend: false, lostAppend: false, badAppend: false, changeAPI: false, failCollect: false,
      responseLostAndReadFails: false, pages: structuredClone(fixture.pages), appendPayloads: [] as string[] };
    const dependencies: Dependencies = {
      loadCheckpoint: async (storageKey) => {
        assert.equal(storageKey, expectedStorageKey);
        state.calls.push("load");
        if (state.failRead) { state.failRead = false; throw new Error(input.accessToken); }
        return structuredClone(state.checkpoint);
      },
      compareAndSetCheckpoint: async ({ storageKey, expectedRevision, next }) => {
        assert.equal(storageKey, expectedStorageKey);
        state.calls.push("cas:" + next.phase); state.casCount++;
        if (state.casCount === state.failCAS) throw new Error(input.accessToken);
        if ((state.checkpoint?.revision ?? null) !== expectedRevision) return false;
        state.checkpoint = structuredClone(next);
        if (state.casCount === state.lostCAS) {
          if (state.responseLostAndReadFails) state.failRead = true;
          throw new Error(input.accessToken);
        }
        return true;
      },
      collectPage: async (request, options) => {
        state.calls.push("collect");
        if (state.failCollect) throw new Error(input.accessToken);
        return collect(request, { fetchImpl: async (url) => {
          state.fetchCount++;
          const after = new URL(String(url)).searchParams.get("after");
          const index = after === null ? 0 : after === "fixture-page-2" ? 1 : 2;
          const page = structuredClone(state.pages[index]);
          if (state.changeAPI && page.data[0]) page.data[0].spend = "999";
          return new Response(JSON.stringify(page));
        } }, options);
      },
      appendBatch: async (request) => {
        state.calls.push("append"); state.appendCount++;
        const prepared = prepare({ context: request.metaContext!, rows: request.rows, rowStartIndex: request.rowStartIndex });
        state.appendPayloads.push(c.metaPageJson(prepared));
        if (state.failAppend) { state.failAppend = false; throw new Error(input.accessToken); }
        // Exercise the existing repository serializer and result checks with an explicit mock RPC.
        const result = await append(request, { invokeRpc: async (name, args) => {
          assert.equal(name, "append_media_sync_staging_batch");
          const payload = args.p_payload as { rows: Row[]; provider: string; date_window_index: number };
          assert.equal(payload.provider, "meta_ads"); assert.equal(payload.date_window_index, 0);
          const next = new Map(state.rows); let inserted = 0; let duplicates = 0;
          for (const row of payload.rows) {
            const existing = next.get(row.row_index);
            if (existing) {
              if (c.metaPageJson(existing) !== c.metaPageJson(row)) throw new Error("ROW_CONTENT_CONFLICT");
              duplicates++;
            } else {
              if ([...next.values()].some((old) => old.row_key === row.row_key)) throw new Error("ROW_KEY_CONFLICT");
              next.set(row.row_index, structuredClone(row)); inserted++;
            }
          }
          state.rows = next;
          return { data: [{ submitted_rows: payload.rows.length, inserted_rows: inserted, duplicate_rows: duplicates,
            first_row_index: payload.rows[0]?.row_index ?? null, last_row_index: payload.rows.at(-1)?.row_index ?? null }], error: null };
        } });
        if (state.lostAppend) { state.lostAppend = false; throw new Error(input.accessToken); }
        return state.badAppend ? { ...result, lastRowIndex: 999 } : result;
      },
    };
    return { state, dependencies };
  };
  let cases = 0;
  async function rejects(fn: () => Promise<unknown>, code: string) {
    await assert.rejects(fn, (error) => {
      assert.ok(error instanceof c.MetaPageCheckpointError); assert.equal(error.code, code);
      assert.ok(!String(error).includes(input.accessToken)); assert.equal(error.cause, undefined); return true;
    }); cases++;
  }
  const good = make();
  const first = await run(input, good.dependencies);
  assert.equal(first.canonicalStagingRows, 2); assert.equal(first.collectionComplete, false);
  assert.equal(first.materializationAllowed, false);
  const emptyPage = await run(input, good.dependencies);
  assert.equal(emptyPage.canonicalStagingRows, 2); assert.equal(good.state.appendCount, 1);
  const final = await run(input, good.dependencies);
  assert.equal(final.collectionComplete, true); assert.equal(final.readyForStagingValidation, true);
  assert.equal(final.canonicalStagingRows, 6); assert.equal(final.checkpoint.fetchedRows, 7);
  assert.equal(final.materializationAllowed, false); assert.deepEqual([...good.state.rows.keys()], [0, 1, 2, 3, 4, 5]);
  assert.ok(!JSON.stringify(good.state.checkpoint).includes(input.accessToken));
  const callsBefore = good.state.fetchCount + good.state.appendCount + good.state.casCount;
  const replay = await run(input, good.dependencies);
  assert.equal(replay.alreadyComplete, true); assert.deepEqual(replay.checkpoint, final.checkpoint);
  assert.equal(good.state.fetchCount + good.state.appendCount + good.state.casCount, callsBefore); cases++;
  for (const mode of ["failAppend", "lostAppend"] as const) {
    const mock = make(); mock.state[mode] = true;
    await rejects(() => run(input, mock.dependencies), "APPEND_UNCONFIRMED");
    assert.equal(mock.state.checkpoint?.phase, "pending");
    mock.state.changeAPI = true;
    const result = await run(input, mock.dependencies);
    assert.equal(result.resumedPending, true); assert.equal(result.canonicalStagingRows, 2);
    assert.equal(mock.state.fetchCount, 1); assert.equal(mock.state.rows.size, 2);
    assert.equal(mock.state.appendPayloads[0], mock.state.appendPayloads[1]); cases++;
  }
  for (const failCAS of [1, 2]) {
    const mock = make(); mock.state.failCAS = failCAS;
    await rejects(() => run(input, mock.dependencies), "CHECKPOINT_UNCONFIRMED");
    assert.equal(mock.state.rows.size, failCAS === 1 ? 0 : 2);
    if (failCAS === 2) { mock.state.changeAPI = true; assert.equal(mock.state.checkpoint?.phase, "pending"); }
    const result = await run(input, mock.dependencies);
    assert.equal(result.canonicalStagingRows, 2); assert.equal(mock.state.rows.size, 2);
    assert.equal(mock.state.fetchCount, failCAS === 1 ? 2 : 1); cases++;
  }
  for (const lostCAS of [1, 2]) {
    const mock = make(); mock.state.lostCAS = lostCAS;
    const result = await run(input, mock.dependencies);
    assert.equal(result.canonicalStagingRows, 2); assert.equal(mock.state.fetchCount, 1); cases++;
  }
  for (const lostCAS of [1, 2]) {
    const mock = make(); mock.state.lostCAS = lostCAS; mock.state.responseLostAndReadFails = true;
    await rejects(() => run(input, mock.dependencies), "CHECKPOINT_UNCONFIRMED");
    const recovered = await run(input, mock.dependencies);
    assert.equal(recovered.canonicalStagingRows, 2);
    assert.equal(mock.state.rows.size, 2); cases++;
  }
  const malformed = make(); malformed.state.badAppend = true;
  await rejects(() => run(input, malformed.dependencies), "INVALID_APPEND_RESULT");
  assert.equal(malformed.state.checkpoint?.phase, "pending");
  malformed.state.badAppend = false; await run(input, malformed.dependencies); assert.equal(malformed.state.fetchCount, 1); cases++;
  const failed = make(); failed.state.failCollect = true;
  await rejects(() => run(input, failed.dependencies), "COLLECT_FAILED");
  assert.equal(failed.state.checkpoint, null); assert.equal(failed.state.appendCount, 0);
  const corrupt = make(); corrupt.state.failAppend = true;
  await rejects(() => run(input, corrupt.dependencies), "APPEND_UNCONFIRMED");
  const checkpoint = structuredClone(corrupt.state.checkpoint!);
  corrupt.state.checkpoint = { ...checkpoint, pending: { ...checkpoint.pending!, id: "f".repeat(64) } };
  await rejects(() => run(input, corrupt.dependencies), "INVALID_CHECKPOINT"); assert.equal(corrupt.state.appendCount, 1);
  const zero = make(); zero.state.pages = [{ data: [] }];
  const zeroResult = await run(input, zero.dependencies);
  assert.equal(zeroResult.emptyDatasetUnsupported, true); assert.equal(zeroResult.readyForStagingValidation, false);
  assert.equal(zeroResult.materializationAllowed, false); assert.equal(zero.state.appendCount, 0); cases++;
  const dropped = make(); dropped.state.pages = [{ data: [fixture.pages[0].data[1]] }];
  const dropResult = await run(input, dropped.dependencies);
  assert.equal(dropResult.emptyDatasetUnsupported, true); assert.equal(dropResult.checkpoint.fetchedRows, 1);
  assert.equal(dropResult.checkpoint.totalRows, 0); assert.equal(dropped.state.appendCount, 0); cases++;
  for (const name of ["loadCheckpoint", "compareAndSetCheckpoint", "collectPage", "appendBatch"] as const) {
    const mock = make(); const deps = { ...mock.dependencies, [name]: undefined } as unknown as Dependencies;
    await rejects(() => run(input, deps), "MISSING_DEPENDENCY"); assert.deepEqual(mock.state.calls, []);
  }
  // Both callers load revision 0 before either can prepare a page.
  // Equal content can be acknowledged idempotently; different content must lose CAS before append.
  for (const differentContent of [false, true]) {
    const mock = make(); const originalCollect = mock.dependencies.collectPage;
    let arrived = 0; let release!: () => void;
    const barrier = new Promise<void>((resolve) => { release = resolve; });
    const dependencies: Dependencies = { ...mock.dependencies, collectPage: async (request, options) => {
      const page = await originalCollect(request, options); const order = ++arrived;
      if (arrived === 2) release(); await barrier;
      if (differentContent && order === 2) {
        return { ...page, rows: [{ ...page.rows[0], cost: 999 }, ...page.rows.slice(1)] };
      }
      return page;
    } };
    const outcomes = await Promise.allSettled([run(input, dependencies), run(input, dependencies)]);
    assert.ok(outcomes.some((outcome) => outcome.status === "fulfilled"));
    for (const outcome of outcomes) if (outcome.status === "rejected") {
      assert.ok(outcome.reason instanceof c.MetaPageCheckpointError);
      assert.equal(outcome.reason.code, "CHECKPOINT_CONFLICT");
    }
    assert.equal(mock.state.rows.size, 2); assert.equal(mock.state.checkpoint?.totalRows, 2);
    assert.equal(mock.state.checkpoint?.revision, 2);
    if (differentContent) {
      assert.equal(outcomes.filter((outcome) => outcome.status === "rejected").length, 1);
      assert.equal(mock.state.appendCount, 1);
    }
    cases++;
  }
  const foreignClaim = make(); await run(input, foreignClaim.dependencies);
  const beforeCalls = foreignClaim.state.fetchCount + foreignClaim.state.appendCount;
  await rejects(() => run({ ...input, job: { ...input.job, attempt_count: 2 } }, foreignClaim.dependencies), "INVALID_CHECKPOINT");
  assert.equal(foreignClaim.state.fetchCount + foreignClaim.state.appendCount, beforeCalls);
  const lyingStore = make();
  await rejects(() => run(input, { ...lyingStore.dependencies, compareAndSetCheckpoint: async () => true }), "CHECKPOINT_UNCONFIRMED");
  assert.equal(lyingStore.state.appendCount, 0);
  assert.equal(networkAttempts, 0);
  console.log(`META_STAGING_ORCHESTRATOR_MOCK=PASS CASES=${cases}`);
  console.log("PENDING_PAGE_REPLAY_AND_RESPONSE_LOSS=PASS MOCK_CAS_RACES=PASS EMPTY_PAGES=PASS CANONICAL_STAGING_ROWS=6 FETCHED_ROWS=7");
  console.log("NETWORK_ATTEMPTS=0 DB_EXECUTIONS=0 DURABLE_DB_RESUME=NOT_TESTED MATERIALIZATION=DISABLED");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
