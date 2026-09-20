import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { MetaPageCheckpoint } from "../src/lib/media-sync/meta-ads-page-checkpoint-contract";
import type { MetaPageRpc } from "../src/lib/media-sync/meta-ads-page-checkpoint-repository";
import type { MetaCompletionTarget } from "../src/lib/media-sync/meta-ads-completion-claim-contract";
import type { MetaAdsServerExecutionInput, MetaAdsServerExecutionDependencies } from "../src/lib/media-sync/meta-ads-server-execution";
import type { MediaConnectionRecord } from "../src/lib/media-sync/types";

type Dict = Record<string, unknown>;
const object = (value: unknown) => value as Dict;
let cases = 0;
async function main() {
  assert.equal(process.env.META_SERVER_FIXTURE, "1");
  assert.deepEqual(Object.keys(process.env).sort(), ["PATH", "NODE_ENV", "META_SERVER_FIXTURE", "MEDIA_CREDENTIAL_ENCRYPTION_KEY"].sort());
  // This existing fixture module blocks sockets/DNS/fetch before app imports.
  const { buildMetaPageFixture } = await import("./export-meta-ads-page-checkpoint-fixture");
  const f = await buildMetaPageFixture();
  const m = await import("../src/lib/media-sync/meta-ads-server-execution");
  const pr = await import("../src/lib/media-sync/meta-ads-page-checkpoint-repository");
  const hr = await import("../src/lib/media-sync/meta-ads-materialization-handoff-repository");
  const cr = await import("../src/lib/media-sync/meta-ads-completion-claim-repository");
  const pc = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const crypto = await import("../src/lib/media-sync/meta-ads-credentials");
  const { metaHash } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const { getMediaProviderSyncCapability } = await import("../src/lib/media-sync/media-provider-sync-capabilities");
  const primary = f.input.job.report_id, secondary = "11111111-1111-4111-8111-111111111111";
  const ids = [primary, secondary].sort();
  const snapshots = new Map([[primary, "22222222-2222-4222-8222-222222222222"], [secondary, "33333333-3333-4333-8333-333333333333"]]);
  const published = new Map([[primary, "44444444-4444-4444-8444-444444444444"], [secondary, null]]);
  const token = "SYNTHETIC_META_SERVER_SECRET", key = Buffer.alloc(32, 47).toString("base64");
  assert.equal(process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY, key);
  const j = f.input.job;
  const credentialScope = { connectionId: j.connection_id, workspaceId: j.workspace_id, advertiserId: j.advertiser_id,
    provider: "meta_ads" as const, externalAccountId: j.external_account_id };
  const ciphertext = crypto.encryptMetaAdsCredentials({ version: 1, access_token: token }, credentialScope);
  const connection: MediaConnectionRecord = { id: j.connection_id, workspace_id: j.workspace_id, advertiser_id: j.advertiser_id,
    provider: "meta_ads", external_account_id: j.external_account_id, external_account_name: "Fixture account",
    credential_ciphertext: ciphertext, credential_version: 1, status: "active", connected_at: j.created_at,
    last_verified_at: null, last_sync_at: null, last_error: null,
    meta: { currency: f.input.context.currency, timezone: f.input.context.timeZone },
    created_by: j.created_by, created_at: j.created_at, updated_at: j.updated_at };
  const initial: MetaAdsServerExecutionInput = { originalJob: j, connection,
    policy: { version: 1, scope: credentialScope, currency: f.input.context.currency,
      timeZone: f.input.context.timeZone, metricPolicy: f.input.context.metricPolicy },
    targetReportIds: ids, collectorOptions: f.input.collectorOptions };
  const accountMetadata = { id: `act_${j.external_account_id}`, account_id: j.external_account_id,
    currency: f.input.context.currency, timezone_name: f.input.context.timeZone };
  const allRpcs: string[] = [...Object.values(pr.META_PAGE_RPC), ...Object.values(hr.META_HANDOFF_RPC), ...Object.values(cr.META_COMPLETION_RPC)];
  const finished = "2026-09-20T00:00:00.123456Z";
  function make(large = false, empty = false) {
    const input = { ...structuredClone(initial), collectorOptions: large ? { pageSize: 2000, maxRetries: 0 } : initial.collectorOptions };
    const scope = pc.createMetaPageScope(input.originalJob, f.input.context, input.collectorOptions);
    const envelope = pr.metaPageDatabaseEnvelope(scope);
    const state = { checkpoint: null as MetaPageCheckpoint | null, rows: new Map<number, Dict>(),
      receipt: false, mirror: null as string | null, claim: j.attempt_count, started: j.started_at,
      status: "processing", activated: false, fetches: 0, written: 0, activations: 0, finalizations: 0,
      accountReads: 0, events: [] as string[], accountReply: undefined as typeof fetch | undefined,
      next: new Map<string, number>(), completed: new Set<string>(), calls: [] as Array<{ name: string; p: Dict }>,
      fail: "", lose: "", tamper: undefined as undefined | ((name: string, data: Dict) => unknown) };
    const job = () => ({ ...structuredClone(input.originalJob), attempt_count: state.claim, started_at: state.started,
      raw_rows: state.rows.size, normalized_rows: state.rows.size, inserted_rows: state.rows.size,
      progress: state.status === "done" ? 100 : state.receipt ? 70 : 0, snapshot_ingestion_id: state.mirror,
      status: state.status, finished_at: state.status === "done" ? finished : null,
      updated_at: state.status === "done" ? finished : j.updated_at });
    const baselines = () => ids.map(report_id => ({ report_id,
      previous_ingestion_id: report_id === primary ? j.previous_ingestion_id : null,
      published_ingestion_id: published.get(report_id)! }));
    const completionToken = (report: string) => metaHash(`${j.id}:${report}:${snapshots.get(report)}:${state.rows.size}:0:${state.rows.size - 1}:0:${state.rows.size - 1}`);
    const invokeRpc: MetaPageRpc = async (name, { p_payload: p }) => {
      assert.ok(allRpcs.includes(name));
      for (const secret of [token, key, ciphertext]) assert.ok(!JSON.stringify(p).includes(secret));
      state.events.push(`rpc:${name}`);
      state.calls.push({ name, p: structuredClone(p) });
      if (state.claim !== j.attempt_count || state.started !== j.started_at) return { data: null, error: { message: token } };
      const isPage = Object.values(pr.META_PAGE_RPC).includes(name as typeof pr.META_PAGE_RPC.load);
      if (isPage) {
        // Actual SQL freezes this path at handoff and rejects done. A successful
        // completion replay MUST NOT accidentally use this loader.
        if (state.receipt || state.status !== "processing") return { data: null, error: { message: "STAGING_FROZEN" } };
        for (const [k, v] of Object.entries(envelope)) assert.deepEqual(p[k], v);
      } else {
        assert.deepEqual(p.page, envelope);
        assert.equal(p.expected_rows, state.checkpoint?.totalRows);
        assert.equal(p.checkpoint_revision, state.checkpoint?.revision);
        assert.equal(p.checkpoint_digest, state.checkpoint?.digest);
      }
      if (state.fail === name) { state.fail = ""; throw new Error(token); }
      let data: unknown;
      if (name === pr.META_PAGE_RPC.load) data = structuredClone(state.checkpoint);
      else if (name === pr.META_PAGE_RPC.cas) {
        const next = p.next as MetaPageCheckpoint;
        assert.deepEqual(p.checkpoint_text, pr.metaPageDatabaseEvidence(next).checkpoint_text);
        if ((state.checkpoint?.revision ?? null) !== p.expected_revision) data = false;
        else { state.checkpoint = structuredClone(next); data = true; }
      } else if (name === pr.META_PAGE_RPC.append) {
        assert.equal(p.expected_revision, state.checkpoint?.revision); assert.equal(p.pending_id, state.checkpoint?.pending?.id);
        const rows = object(p.append_payload).rows as Dict[];
        assert.deepEqual(rows, state.checkpoint?.pending?.rows);
        let inserted = 0;
        for (const row of rows) {
          const index = row.row_index as number;
          if (state.rows.has(index)) assert.deepEqual(state.rows.get(index), row);
          else { state.rows.set(index, structuredClone(row)); inserted++; }
        }
        data = { submitted_rows: rows.length, inserted_rows: inserted, duplicate_rows: rows.length - inserted,
          first_row_index: rows[0]?.row_index ?? null, last_row_index: rows.at(-1)?.row_index ?? null };
      } else if (Object.values(hr.META_HANDOFF_RPC).includes(name as typeof hr.META_HANDOFF_RPC.prepare)) {
        assert.deepEqual(p.target_report_ids, ids); assert.equal(state.checkpoint?.phase, "collected");
        if (state.status !== "processing") return { data: null, error: { message: token } };
        const report = p.target_report_id as string, snapshot = snapshots.get(report)!;
        assert.ok(ids.includes(report));
        const total = state.rows.size;
        if (name === hr.META_HANDOFF_RPC.prepare) {
          const created = !state.receipt; state.receipt = true;
          if (!state.next.has(report)) state.next.set(report, 0);
          if (report === primary) state.mirror = snapshot;
          data = { materialization: { job: job(), snapshot_ingestion_id: snapshot, expected_rows: total,
            next_row_index: state.next.get(report), idempotent: state.completed.has(report) }, handoff_created: created,
            checkpoint: structuredClone(state.checkpoint), targets: baselines(),
            validation_batches: Array.from({ length: Math.ceil(total / 2000) }, (_, i) => ({ job_id: j.id,
              batch_start: i * 2000, batch_rows: Math.min(2000, total - i * 2000),
              batch_max_row_index: Math.min(total, (i + 1) * 2000) - 1, canonical_mismatch_rows: 0,
              batch_content_fingerprint: metaHash(`fixture:${i}:${total}`), is_valid: true })) };
        } else if (name === hr.META_HANDOFF_RPC.batch) {
          assert.equal(p.batch_size, 2000); assert.equal(p.snapshot_ingestion_id, snapshot);
          const start = p.batch_start as number, end = Math.min(start + 2000, total);
          assert.equal(start, state.next.get(report));
          state.next.set(report, end); state.written += end - start;
          data = { job: job(), snapshot_ingestion_id: snapshot, batch_start: start, batch_end_exclusive: end,
            expected_batch_rows: end - start, inserted_rows: end - start, materialized_batch_rows: end - start,
            next_row_index: end, complete: end === total, idempotent: false };
        } else {
          assert.equal(p.snapshot_ingestion_id, snapshot); assert.equal(state.next.get(report), total);
          const idempotent = state.completed.has(report); state.completed.add(report);
          data = { job: job(), snapshot_ingestion_id: snapshot, row_count: total,
            staging_fingerprint: completionToken(report), materialized_fingerprint: completionToken(report), idempotent };
        }
      } else {
        assert.deepEqual(Object.keys(p).sort(), ["page", "attempt_count", "started_at", "checkpoint_revision", "checkpoint_digest", "expected_rows"].sort());
        assert.equal(p.attempt_count, j.attempt_count); assert.equal(p.started_at, j.started_at);
        if (state.completed.size !== ids.length) return { data: null, error: { message: token } };
        if (name === cr.META_COMPLETION_RPC.activate) {
          const idempotent = state.activated;
          if (!idempotent) state.activations++;
          state.activated = true;
          data = { job: job(), projection_count: ids.length, idempotent,
            projections: baselines().map(b => ({ ...b, snapshot_ingestion_id: snapshots.get(b.report_id),
              expected_rows: state.rows.size, completion_token: completionToken(b.report_id) })) };
        } else {
          assert.equal(name, cr.META_COMPLETION_RPC.finalize);
          if (!state.activated) return { data: null, error: { message: token } };
          const idempotent = state.status === "done";
          if (!idempotent) state.finalizations++;
          state.status = "done";
          data = { job: job(), snapshot_ingestion_id: snapshots.get(primary), current_ingestion_id: snapshots.get(primary),
            published_ingestion_id: published.get(primary), row_count: state.rows.size,
            staging_fingerprint: completionToken(primary), materialized_fingerprint: completionToken(primary),
            finished_at: finished, connection_id: j.connection_id, connection_last_sync_at: finished,
            connection_updated: !idempotent, idempotent };
        }
      }
      if (state.lose === name) { state.lose = ""; throw new Error(token); }
      return { data: state.tamper ? state.tamper(name, structuredClone(data) as Dict) : data, error: null };
    };
    const fetchImpl: typeof fetch = async (url, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
      assert.ok(!String(url).includes(token));
      const parsed = new URL(String(url)), after = parsed.searchParams.get("after");
      assert.equal(parsed.origin, "https://graph.facebook.com");
      if (parsed.pathname === `/v26.0/act_${j.external_account_id}`) {
        state.accountReads++; state.events.push("account");
        assert.equal(init?.method, "GET"); assert.equal(init?.redirect, "error"); assert.equal(init?.cache, "no-store");
        assert.deepEqual([...parsed.searchParams], [["fields", "id,account_id,currency,timezone_name"]]);
        return state.accountReply ? state.accountReply(url, init) : new Response(JSON.stringify(accountMetadata));
      }
      assert.equal(parsed.pathname, `/v26.0/act_${j.external_account_id}/insights`);
      state.fetches++; state.events.push("insights");
      let body: unknown;
      if (empty) body = { data: [] };
      else if (large) {
        const start = after ? 2000 : 0, end = after ? 2001 : 2000;
        const row = f.wirePages[0].data[0];
        const next = new URL(parsed); next.searchParams.set("after", "fixture-large-2");
        body = { data: Array.from({ length: end - start }, (_, index) => ({ ...row, ad_id: String(100000 + start + index) })),
          ...(after ? {} : { paging: { next: next.href, cursors: { after: "fixture-large-2" } } }) };
      } else body = f.wirePages[after === "fixture-page-2" ? 1 : after === "fixture-page-3" ? 2 : 0];
      return new Response(JSON.stringify(body));
    };
    const deps = { invokeRpc, fetchImpl };
    const fresh = (value = input, ports = deps) => m.createMetaAdsServerExecution(value, ports);
    const collectAll = async () => {
      for (let i = 0; i < 4; i++) {
        const result = await fresh().collectPage();
        if (result.collectionComplete) return result.checkpoint;
      }
      throw new Error("FIXTURE_PAGE_BOUND");
    };
    const materializeAll = async (checkpoint: MetaPageCheckpoint) => {
      const targets: MetaCompletionTarget[] = [];
      for (const report of [secondary, primary]) {
        const result = await fresh().materialize(checkpoint, report);
        assert.ok(result.target); targets.push(result.target);
      }
      return targets;
    };
    return { input, deps, state, fresh, collectAll, materializeAll };
  }
  const reject = async (fn: () => unknown, code?: string) => {
    await assert.rejects(async () => fn(), (error: unknown) => {
      assert.ok(error instanceof m.MetaAdsServerExecutionError);
      if (code) assert.equal(error.code, code);
      assert.equal(error.cause, undefined);
      for (const secret of [token, key, ciphertext]) {
        assert.ok(!String(error.stack).includes(secret)); assert.ok(!JSON.stringify(error).includes(secret));
      }
      return true;
    }); cases++;
  };
  const good = make(), inputBefore = structuredClone(good.input), cp = await good.collectAll();
  assert.equal(cp.totalRows, 6); assert.equal(cp.fetchedRows, 7); assert.equal(good.state.fetches, 3); cases++;
  assert.equal(good.state.accountReads, 3); assert.equal(good.state.events[0], "account");
  assert.equal(good.state.events[1], `rpc:${pr.META_PAGE_RPC.load}`); cases++;
  const targets = await good.materializeAll(cp);
  assert.equal(good.state.written, 12); assert.notEqual(targets[0].snapshotIngestionId, targets[1].snapshotIngestionId); cases++;
  await reject(() => good.fresh().finalize(cp, targets), "COMPLETION_UNCONFIRMED");
  assert.equal(good.state.status, "processing");
  const a = await good.fresh().activate(cp, targets);
  assert.equal(a.status, "processing"); assert.equal(a.idempotent, false); cases++;
  const done = await good.fresh().finalize(cp, targets);
  assert.deepEqual(done, { jobId: j.id, status: "done", progress: 100, canonicalRows: 6, projectionCount: 2, idempotent: false, finishedAt: finished }); cases++;
  const last = good.state.calls.length;
  assert.equal((await good.fresh().finalize(cp, targets)).idempotent, true);
  assert.equal((await good.fresh().activate(cp, targets)).idempotent, true);
  assert.deepEqual(good.state.calls.slice(last).map(c => c.name), [cr.META_COMPLETION_RPC.finalize, cr.META_COMPLETION_RPC.activate]);
  assert.equal(good.state.activations, 1); assert.equal(good.state.finalizations, 1); assert.equal(good.state.fetches, 3); cases++;
  assert.equal(good.state.accountReads, 3); cases++;
  assert.deepEqual(good.input, inputBefore); cases++;
  for (const secret of [token, key, ciphertext]) assert.ok(!JSON.stringify({ cp, targets, a, done }).includes(secret)); cases++;

  // Construction performs no transport IO. Repeated pages on one bounded execution
  // instance share the successful metadata check; a new instance rechecks.
  const cached = make(), instance = cached.fresh();
  assert.equal(cached.state.accountReads, 0); assert.equal(cached.state.calls.length, 0); cases++;
  let cachedCp: MetaPageCheckpoint | undefined;
  for (let page = 0; page < 3; page++) cachedCp = (await instance.collectPage()).checkpoint;
  assert.equal(cachedCp?.totalRows, 6); assert.equal(cached.state.accountReads, 1); assert.equal(cached.state.fetches, 3); cases++;
  const cachedTargets = await cached.materializeAll(cachedCp!);
  await cached.fresh().activate(cachedCp!, cachedTargets); await cached.fresh().finalize(cachedCp!, cachedTargets);
  assert.equal(cached.state.accountReads, 1); assert.equal(cached.state.status, "done"); cases++;

  const invalidMetadata: unknown[] = [null, [], {}, { ...accountMetadata, id: "act_9" },
    { ...accountMetadata, account_id: "9" }, { ...accountMetadata, account_id: Number(j.external_account_id) },
    { ...accountMetadata, currency: "USD" }, { ...accountMetadata, timezone_name: "UTC" },
    { ...accountMetadata, currency: "krw" }, { ...accountMetadata, timezone_name: "invalid-zone" },
    { error: { message: token, access_token: token } }];
  for (const body of invalidMetadata) {
    const t = make(); t.state.accountReply = async () => new Response(JSON.stringify(body));
    await reject(() => t.fresh().collectPage(), "ACCOUNT_UNCONFIRMED");
    assert.equal(t.state.accountReads, 1); assert.equal(t.state.fetches, 0); assert.equal(t.state.calls.length, 0);
    assert.equal(t.state.checkpoint, null); assert.equal(t.state.rows.size, 0);
  }
  for (const status of [401, 403, 429, 500]) {
    const t = make(); t.state.accountReply = async () => new Response(token, { status });
    await reject(() => t.fresh().collectPage(), "ACCOUNT_UNCONFIRMED");
    assert.equal(t.state.accountReads, 1); assert.equal(t.state.fetches, 0); assert.equal(t.state.calls.length, 0);
  }
  for (const reply of [async () => new Response(token), async () => { throw new Error(token); }]) {
    const t = make(); t.state.accountReply = reply;
    await reject(() => t.fresh().collectPage(), "ACCOUNT_UNCONFIRMED");
    assert.equal(t.state.calls.length, 0); assert.equal(t.state.fetches, 0);
  }
  const retry = make(), retryInstance = retry.fresh();
  retry.state.accountReply = async () => new Response(token, { status: 503 });
  await reject(() => retryInstance.collectPage(), "ACCOUNT_UNCONFIRMED");
  retry.state.accountReply = undefined;
  await retryInstance.collectPage(); await retryInstance.collectPage();
  assert.equal(retry.state.accountReads, 2); assert.equal(retry.state.fetches, 2); cases++;

  // Resuming in a fresh instance must check metadata again before touching even the
  // saved checkpoint. Metadata drift neither rewrites nor discards committed work.
  const drift = make(); await drift.fresh().collectPage();
  const committed = structuredClone(drift.state.checkpoint), rowsBefore = [...drift.state.rows], rpcBefore = drift.state.calls.length;
  drift.state.accountReply = async () => new Response(JSON.stringify({ ...accountMetadata, timezone_name: "UTC" }));
  await reject(() => drift.fresh().collectPage(), "ACCOUNT_UNCONFIRMED");
  assert.deepEqual(drift.state.checkpoint, committed); assert.deepEqual([...drift.state.rows], rowsBefore);
  assert.equal(drift.state.calls.length, rpcBefore); assert.equal(drift.state.fetches, 1); cases++;
  drift.state.accountReply = undefined;
  const driftCp = await drift.collectAll();
  assert.equal(driftCp.totalRows, 6); assert.equal(driftCp.fetchedRows, 7); assert.equal(drift.state.fetches, 3); cases++;

  // No caller-provided "verified" flag can bypass the transport/parity check.
  const spoof = make(); Object.assign(spoof.input, { accountVerified: true, skipAccountCheck: true, metadata: accountMetadata });
  spoof.state.accountReply = async () => new Response(token, { status: 403 });
  await reject(() => spoof.fresh().collectPage(), "ACCOUNT_UNCONFIRMED"); assert.equal(spoof.state.calls.length, 0);
  const unconnected = make(), draft = JSON.parse(readFileSync("scripts/fixtures/meta-ads-connection-draft.json", "utf8"));
  await reject(() => unconnected.fresh({ ...unconnected.input, policy: draft }), "INVALID_POLICY");
  assert.equal(unconnected.state.accountReads, 0); assert.equal(unconnected.state.calls.length, 0);

  // Policy and credential identity are fixed when the instance is created.
  const isolated = make(), isolatedInstance = isolated.fresh();
  isolated.input.connection.meta = { currency: "USD", timezone: "UTC" };
  isolated.input.policy = null;
  await isolatedInstance.collectPage();
  assert.equal(isolated.state.accountReads, 1); assert.equal(isolated.state.fetches, 1); cases++;

  // Concurrent callers wait for one check; no RPC escapes while it is unresolved.
  // RPCs intentionally reject here: the existing CAS/claim tests cover DB concurrency.
  const concurrent = make(); let release!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  concurrent.state.accountReply = async () => { await held; return new Response(JSON.stringify(accountMetadata)); };
  let blockedRpcCalls = 0;
  const concurrentInstance = concurrent.fresh(concurrent.input, { ...concurrent.deps,
    invokeRpc: async () => { blockedRpcCalls++; throw new Error(token); } });
  const waiting = Promise.all([reject(() => concurrentInstance.collectPage(), "COLLECTION_UNCONFIRMED"),
    reject(() => concurrentInstance.collectPage(), "COLLECTION_UNCONFIRMED")]);
  assert.equal(concurrent.state.accountReads, 1); assert.equal(blockedRpcCalls, 0);
  release(); await waiting; assert.equal(blockedRpcCalls, 2); cases++;

  // Once collected, metadata service failure cannot stop bounded materialization,
  // fenced activation/finalization or their idempotent replay.
  const offlineCompletion = make(), offlineCp = await offlineCompletion.collectAll();
  const readsBefore = offlineCompletion.state.accountReads;
  offlineCompletion.state.accountReply = async () => { throw new Error(token); };
  const offlineTargets = await offlineCompletion.materializeAll(offlineCp);
  await offlineCompletion.fresh().activate(offlineCp, offlineTargets);
  await offlineCompletion.fresh().finalize(offlineCp, offlineTargets);
  assert.equal((await offlineCompletion.fresh().finalize(offlineCp, offlineTargets)).idempotent, true);
  assert.equal(offlineCompletion.state.accountReads, readsBefore); assert.equal(offlineCompletion.state.written, 12); cases++;

  for (const patch of [{ provider: "google_ads" }, { provider: "naver_searchad" }, { status: "disconnected" },
    { id: secondary }, { workspace_id: secondary }, { advertiser_id: secondary }, { external_account_id: "9" },
    { credential_version: 2 }, { credential_ciphertext: null }, { credential_ciphertext: "bad" },
    { meta: { currency: "USD", timezone: "Asia/Seoul" } }, { meta: {} }]) {
    const t = make(); Object.assign(t.input.connection, patch);
    await reject(() => t.fresh()); assert.equal(t.state.calls.length, 0); assert.equal(t.state.fetches, 0); assert.equal(t.state.accountReads, 0);
  }
  for (const patch of [{ status: "pending" }, { status: "done" }, { snapshot_ingestion_id: snapshots.get(primary) },
    { data_level: "keyword" }, { automation_contract: "daily_report_v2" }, { attempt_count: 0 }]) {
    const t = make(); Object.assign(t.input.originalJob, patch); await reject(() => t.fresh()); assert.equal(t.state.calls.length, 0);
  }
  for (const policy of [null, {}, { ...object(initial.policy), metricPolicy: {} },
    { ...object(initial.policy), scope: { ...credentialScope, workspaceId: secondary } }]) {
    const t = make(); await reject(() => t.fresh({ ...t.input, policy }), "INVALID_POLICY"); assert.equal(t.state.calls.length, 0);
  }
  for (const list of [[], [secondary], [primary, primary], [primary, "bad"]]) {
    const t = make(); await reject(() => t.fresh({ ...t.input, targetReportIds: list }), "INVALID_TARGETS"); assert.equal(t.state.calls.length, 0);
  }
  for (const deps of [{}, { invokeRpc: good.deps.invokeRpc }, { fetchImpl: good.deps.fetchImpl }]) {
    await reject(() => good.fresh(good.input, deps as unknown as MetaAdsServerExecutionDependencies), "MISSING_DEPENDENCY");
  }
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { await reject(() => good.fresh(), "INVALID_INPUT"); } finally { Reflect.deleteProperty(globalThis, "window"); }
  delete process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY;
  await reject(() => good.fresh(), "INVALID_CREDENTIAL"); process.env.MEDIA_CREDENTIAL_ENCRYPTION_KEY = key;

  const empty = make(false, true), emptyCp = await empty.collectAll();
  assert.equal(emptyCp.phase, "empty");
  const emptyCalls = empty.state.calls.length;
  await reject(() => empty.fresh().materialize(emptyCp, primary)); assert.equal(empty.state.calls.length, emptyCalls);
  const partial = make(); const partialCp = (await partial.fresh().collectPage()).checkpoint;
  const partialCalls = partial.state.calls.length;
  await reject(() => partial.fresh().materialize(partialCp, primary)); assert.equal(partial.state.calls.length, partialCalls);
  await reject(() => good.fresh().activate(cp, [targets[0]]));
  await reject(() => good.fresh().activate({ ...cp, digest: "0".repeat(64) }, targets));
  await reject(() => good.fresh().activate(cp, [{ ...targets[0], completionToken: "bad" }, targets[1]]));

  for (const name of allRpcs) {
    const t = make();
    // Exercise errors before each transport result without ever switching to an old RPC.
    let operation: () => Promise<unknown>;
    if (Object.values(pr.META_PAGE_RPC).includes(name as typeof pr.META_PAGE_RPC.load)) operation = () => t.fresh().collectPage();
    else {
      const checkpoint = await t.collectAll();
      if (Object.values(hr.META_HANDOFF_RPC).includes(name as typeof hr.META_HANDOFF_RPC.prepare)) operation = () => t.fresh().materialize(checkpoint, primary);
      else {
        const ts = await t.materializeAll(checkpoint);
        if (name === cr.META_COMPLETION_RPC.finalize) await t.fresh().activate(checkpoint, ts);
        operation = () => name === cr.META_COMPLETION_RPC.activate ? t.fresh().activate(checkpoint, ts) : t.fresh().finalize(checkpoint, ts);
      }
    }
    t.state.fail = name; await reject(operation);
    assert.equal(t.state.calls.at(-1)?.name, name === pr.META_PAGE_RPC.cas ? pr.META_PAGE_RPC.load : name);
  }
  for (const name of [pr.META_PAGE_RPC.append, ...Object.values(hr.META_HANDOFF_RPC), ...Object.values(cr.META_COMPLETION_RPC)]) {
    const t = make();
    if (name === pr.META_PAGE_RPC.append) {
      t.state.lose = name; await reject(() => t.fresh().collectPage());
      const fetches = t.state.fetches; await t.fresh().collectPage(); assert.equal(t.state.fetches, fetches); assert.equal(t.state.rows.size, 2); cases++;
    } else {
      const checkpoint = await t.collectAll();
      if (Object.values(hr.META_HANDOFF_RPC).includes(name as typeof hr.META_HANDOFF_RPC.prepare)) {
        t.state.lose = name; await reject(() => t.fresh().materialize(checkpoint, primary));
        const result = await t.fresh().materialize(checkpoint, primary);
        assert.ok(result.materializationComplete); assert.equal(t.state.written, 6); cases++;
      } else {
        const ts = await t.materializeAll(checkpoint);
        if (name === cr.META_COMPLETION_RPC.finalize) await t.fresh().activate(checkpoint, ts);
        const call = () => name === cr.META_COMPLETION_RPC.activate ? t.fresh().activate(checkpoint, ts) : t.fresh().finalize(checkpoint, ts);
        t.state.lose = name; await reject(call); const result = await call(); assert.equal(result.idempotent, true); cases++;
      }
    }
  }
  for (const completed of [false, true]) {
    const t = make(), checkpoint = await t.collectAll(), ts = await t.materializeAll(checkpoint);
    if (completed) { await t.fresh().activate(checkpoint, ts); await t.fresh().finalize(checkpoint, ts); }
    t.state.claim++;
    await reject(() => t.fresh().activate(checkpoint, ts)); await reject(() => t.fresh().finalize(checkpoint, ts));
    assert.equal(t.state.activations, completed ? 1 : 0); assert.equal(t.state.finalizations, completed ? 1 : 0);
  }
  const mutations: Array<(name: string, data: Dict) => unknown> = [() => null, () => [], () => "invalid-response",
    (_, d) => ({ ...d, job: { ...object(d.job), attempt_count: 99 } }),
    (_, d) => ({ ...d, job: { ...object(d.job), started_at: "2026-09-19T00:00:00.000001Z" } }),
    (_, d) => ({ ...d, job: { ...object(d.job), raw_rows: 7 } }), (_, d) => ({ ...d, idempotent: "true" }),
    (_, d) => ({ ...d, secret: token })];
  for (const rpc of Object.values(cr.META_COMPLETION_RPC)) for (const mutate of mutations) {
    good.state.tamper = (name, d) => name === rpc ? mutate(name, d) : d;
    await reject(() => rpc === cr.META_COMPLETION_RPC.activate ? good.fresh().activate(cp, targets) : good.fresh().finalize(cp, targets));
  }
  good.state.tamper = undefined;
  for (const [rpc, patch] of [[cr.META_COMPLETION_RPC.activate, { projections: [] }],
    [cr.META_COMPLETION_RPC.activate, { projection_count: 1 }],
    [cr.META_COMPLETION_RPC.finalize, { current_ingestion_id: secondary }],
    [cr.META_COMPLETION_RPC.finalize, { published_ingestion_id: null }],
    [cr.META_COMPLETION_RPC.finalize, { connection_last_sync_at: "2026-09-19T00:00:00Z" }],
    [cr.META_COMPLETION_RPC.finalize, { staging_fingerprint: "bad" }]] as const) {
    good.state.tamper = (name, d) => name === rpc ? { ...d, ...patch } : d;
    await reject(() => rpc === cr.META_COMPLETION_RPC.activate ? good.fresh().activate(cp, targets) : good.fresh().finalize(cp, targets));
  }
  const large = make(true), largeCp = await large.collectAll();
  assert.equal(largeCp.totalRows, 2001); assert.equal(large.state.fetches, 2);
  const first = await large.fresh().materialize(largeCp, primary);
  assert.equal(first.nextRowIndex, 2000); assert.equal(first.materializationComplete, false); assert.equal(first.target, null); cases++;
  const second = await large.fresh().materialize(largeCp, primary);
  assert.equal(second.nextRowIndex, 2001); assert.equal(second.materializationComplete, true); assert.equal(large.state.written, 2001); cases++;
  assert.deepEqual(large.state.calls.filter(c => c.name === hr.META_HANDOFF_RPC.batch).map(c => c.p.batch_start), [0, 2000]); cases++;
  const capability = getMediaProviderSyncCapability("meta_ads");
  assert.equal(capability.syncRuntimeEnabled, false); cases++;
  // Completion names and payload keys are checked against the actual SQL candidate.
  const sql = readFileSync("scripts/sql/create-meta-ads-completion-claim-fence.sql", "utf8");
  for (const name of Object.values(cr.META_COMPLETION_RPC)) assert.ok(sql.includes(`CREATE FUNCTION public.${name}(p_payload jsonb)`));
  console.log(`META_SERVER_EXECUTION=PASS CASES=${cases} NETWORK=BLOCKED DB_EXECUTIONS=0`);
  console.log("CREDENTIAL_POLICY_TO_FENCED_RPCS=PASS CANONICAL_ROWS=6 FETCHED_ROWS=7 PROJECTIONS=2 MATERIALIZED_ROWS=12");
  console.log("LOST_ACK_RESUME=PASS DONE_REPLAY_WITHOUT_STAGING_LOAD=PASS BOUNDED_BATCH_2001=PASS");
  console.log("ACCOUNT_BEFORE_CHECKPOINT_AND_INSIGHTS=PASS INSTANCE_CACHE_AND_RESTART_RECHECK=PASS METADATA_FAILURE_WRITES=0");
  console.log("ACCOUNT_DRIFT_PRESERVES_CHECKPOINT=PASS COMPLETION_WITHOUT_META_REQUEST=PASS UNCONNECTED_DRAFT=REJECTED");
  console.log("RPC_TRANSPORT=MOCK SQL_RUNTIME=NOT_TESTED LIVE_META_API_CALLS=0 LIVE_WORKER=DISABLED");
}
if (process.argv.includes("--fixture-child")) {
  main().catch(error => {
    console.error(`META_SERVER_FIXTURE_FAILED AFTER_CASE=${cases} TYPE=${error?.name ?? "unknown"}`);
    process.exitCode = 1;
  });
} else {
  const result = spawnSync(process.execPath, ["--import", "tsx", process.argv[1], "--fixture-child"], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test", META_SERVER_FIXTURE: "1",
      MEDIA_CREDENTIAL_ENCRYPTION_KEY: Buffer.alloc(32, 47).toString("base64") },
    encoding: "utf8", timeout: 120000,
  });
  process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
  process.exitCode = result.status === 0 ? 0 : 1;
}
