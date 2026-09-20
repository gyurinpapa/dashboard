import assert from "node:assert/strict";
// This fixture installs a network denylist before loading application modules.
import { buildMetaPageFixture } from "./export-meta-ads-page-checkpoint-fixture";
import type { MetaPageRpc } from "../src/lib/media-sync/meta-ads-page-checkpoint-repository";
import type { MetaHandoffRepositoryInput } from "../src/lib/media-sync/meta-ads-materialization-handoff-repository";

async function main() {
  const f = await buildMetaPageFixture();
  const r = await import("../src/lib/media-sync/meta-ads-materialization-handoff-repository");
  const c = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const page = await import("../src/lib/media-sync/meta-ads-page-checkpoint-repository");
  const { metaHash } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const primary = f.input.job.report_id, secondary = "11111111-1111-4111-8111-111111111111";
  const ids = [primary, secondary].sort();
  const snapshotIds = new Map([[primary, "22222222-2222-4222-8222-222222222222"],
    [secondary, "33333333-3333-4333-8333-333333333333"]]);
  function inputFor(total = 6): MetaHandoffRepositoryInput {
    if (total === 6) return { ...structuredClone(f.input), checkpoint: structuredClone(f.final), targetReportIds: [...ids] };
    const options = { pageSize: 2000, maxRetries: 0 };
    const s = c.createMetaPageScope(f.input.job, f.input.context, options), pages = Math.ceil(total / 2000);
    const body = { version: 1, scope: s.key, revision: pages * 2, phase: "collected", nextRowIndex: total,
      totalRows: total, fetchedRows: total, completedPages: pages, cursor: null, pending: null };
    return { ...structuredClone(f.input), collectorOptions: options, checkpoint: { ...body,
      digest: metaHash(c.metaPageJson({ namespace: "meta_page_checkpoint_v1", body })) }, targetReportIds: [...ids] };
  }
  type Dict = Record<string, unknown>;
  const asRecord = (v: unknown) => v as Dict;
  const make = (total = 6) => {
    const input = inputFor(total), scope = c.createMetaPageScope(input.job, input.context, input.collectorOptions);
    const checkpoint = c.validateMetaPageCheckpoint(input.checkpoint, scope);
    const envelope = page.metaPageDatabaseEnvelope(scope);
    const state = { receipt: false, mirror: null as string | null, claim: input.job.attempt_count,
      progress: new Map<string, { next: number; done: boolean }>(), written: 0,
      calls: [] as Array<{ name: string; p: Dict }>, before: "", after: "",
      mutate: undefined as undefined | ((name: string, data: Dict) => unknown) };
    const job = () => ({ ...structuredClone(input.job), raw_rows: total, normalized_rows: total, inserted_rows: total,
      progress: 70, snapshot_ingestion_id: state.mirror,
      started_at: new Date(input.job.started_at!).toISOString(), created_at: new Date(input.job.created_at).toISOString() });
    const invoke: MetaPageRpc = async (name, { p_payload: p }) => {
      assert.ok(Object.values(r.META_HANDOFF_RPC).includes(name as typeof r.META_HANDOFF_RPC.prepare));
      assert.deepEqual(p.page, envelope); assert.equal(p.expected_rows, total);
      assert.equal(p.checkpoint_revision, checkpoint.revision); assert.equal(p.checkpoint_digest, checkpoint.digest);
      assert.deepEqual(p.target_report_ids, ids);
      assert.ok(!JSON.stringify(p).includes("fixture-secret"));
      state.calls.push({ name, p: structuredClone(p) });
      if (state.claim !== input.job.attempt_count) return { data: null, error: { message: "fixture-secret-claim" } };
      if (state.before === name) { state.before = ""; throw new Error("fixture-secret-before"); }
      const target = p.target_report_id as string, snapshot = snapshotIds.get(target)!;
      let data: Dict;
      if (name === r.META_HANDOFF_RPC.prepare) {
        const created = !state.receipt;
        state.receipt = true;
        if (!state.progress.has(target)) state.progress.set(target, { next: 0, done: false });
        if (target === primary) state.mirror = snapshot;
        const progress = state.progress.get(target)!;
        data = { materialization: { job: job(), snapshot_ingestion_id: snapshot, expected_rows: total,
          next_row_index: progress.next, idempotent: progress.done }, handoff_created: created,
          checkpoint: structuredClone(checkpoint), targets: ids.map(report => ({ report_id: report,
            previous_ingestion_id: report === primary ? input.job.previous_ingestion_id : null, published_ingestion_id: null })),
          validation_batches: Array.from({ length: Math.ceil(total / 2000) }, (_, i) => ({ job_id: input.job.id,
            batch_start: i * 2000, batch_rows: Math.min(2000, total - i * 2000),
            batch_max_row_index: Math.min((i + 1) * 2000, total) - 1, canonical_mismatch_rows: 0,
            batch_content_fingerprint: metaHash(`fixture:${i}:${total}`), is_valid: true })) };
      } else if (name === r.META_HANDOFF_RPC.batch) {
        assert.equal(p.batch_size, 2000); assert.equal(p.snapshot_ingestion_id, snapshot);
        const progress = state.progress.get(target)!;
        const start = p.batch_start as number, end = Math.min(start + 2000, total), count = end - start;
        if (!progress.done) assert.equal(start, progress.next, "processing stale offset must never be blindly retried");
        const inserted = progress.done ? 0 : count;
        if (!progress.done) { state.written += inserted; progress.next = end; }
        data = { job: job(), snapshot_ingestion_id: snapshot, batch_start: start, batch_end_exclusive: end,
          expected_batch_rows: count, inserted_rows: inserted, materialized_batch_rows: count,
          next_row_index: end, complete: end === total, idempotent: progress.done };
      } else {
        assert.equal(name, r.META_HANDOFF_RPC.complete); assert.equal(p.snapshot_ingestion_id, snapshot);
        const progress = state.progress.get(target)!; assert.equal(progress.next, total);
        const idempotent = progress.done; progress.done = true;
        const token = metaHash(`${input.job.id}:${target}:${snapshot}:${total}:0:${total - 1}:0:${total - 1}`);
        data = { job: job(), snapshot_ingestion_id: snapshot, row_count: total,
          staging_fingerprint: token, materialized_fingerprint: token, idempotent };
      }
      if (state.after === name) { state.after = ""; throw new Error("fixture-secret-lost-response"); }
      return { data: state.mutate ? state.mutate(name, structuredClone(data)) : data, error: null };
    };
    return { input, state, invoke, fresh: () => r.createMetaMaterializationHandoffRepository(input, invoke) };
  };
  let cases = 0;
  const reject = async (fn: () => unknown, code?: string) => {
    await assert.rejects(async () => fn(), (error: unknown) => {
      assert.ok(error instanceof r.MetaHandoffRepositoryError);
      if (code) assert.equal(error.code, code);
      assert.ok(!String(error).includes("fixture-secret")); assert.equal(Object.hasOwn(error, "cause"), false);
      return true;
    }); cases++;
  };
  const good = make(), repo = good.fresh(), before = structuredClone(good.input);
  for (const report of [primary, secondary]) {
    const result = await repo.advance(report);
    assert.equal(result.materializationComplete, true); assert.equal(result.expectedRows, 6);
    assert.equal(result.activationAllowed, false); assert.equal(result.finalizationAllowed, false);
    assert.equal(result.completion?.job.status, "processing"); assert.equal(result.completion?.job.finished_at, null);
    assert.ok(Object.isFrozen(result.completion?.job)); cases++;
  }
  assert.equal(good.state.written, 12); assert.deepEqual(good.input, before);
  assert.equal(good.input.job.raw_rows, 0); assert.equal(good.input.job.snapshot_ingestion_id, null);
  assert.equal(good.state.calls.filter(x => x.name === r.META_HANDOFF_RPC.prepare).length, 2); cases++;
  const reverse = make(), reverseRepo = reverse.fresh();
  await reverseRepo.advance(secondary); await reverseRepo.advance(primary);
  assert.equal(reverse.state.written, 12); cases++;

  const large = make(2001);
  const first = await large.fresh().advance(primary);
  assert.equal(first.materializationComplete, false); assert.equal(first.nextRowIndex, 2000);
  assert.deepEqual(large.state.calls.map(c => c.name), [r.META_HANDOFF_RPC.prepare, r.META_HANDOFF_RPC.batch]); cases++;
  const second = await large.fresh().advance(primary);
  assert.equal(second.materializationComplete, true); assert.equal(large.state.written, 2001);
  assert.equal(large.state.calls.filter(c => c.name === r.META_HANDOFF_RPC.batch)[1].p.batch_start, 2000); cases++;
  const length = large.state.calls.length;
  assert.equal((await large.fresh().advance(primary)).completion?.idempotent, true);
  assert.deepEqual(large.state.calls.slice(length).map(c => c.name), [r.META_HANDOFF_RPC.prepare, r.META_HANDOFF_RPC.complete]); cases++;
  for (const name of Object.values(r.META_HANDOFF_RPC)) for (const mode of ["before", "after"] as const) {
    const t = make(); t.state[mode] = name;
    const instance = t.fresh(); await reject(() => instance.advance(primary), "RPC_UNCONFIRMED");
    const calls = t.state.calls.length;
    await reject(() => instance.complete({ targetReportId: primary, snapshotIngestionId: snapshotIds.get(primary)! }), "PREPARE_REQUIRED");
    assert.equal(t.state.calls.length, calls);
    assert.equal((await t.fresh().advance(primary)).materializationComplete, true);
    assert.equal(t.state.calls[calls].name, r.META_HANDOFF_RPC.prepare);
    assert.equal(t.state.written, 6); cases++;
  }
  const stale = make(); await stale.fresh().prepare(primary); stale.state.claim++;
  await reject(() => stale.fresh().advance(primary), "RPC_UNCONFIRMED"); assert.equal(stale.state.written, 0);
  const isolated = make(), isolatedRepo = isolated.fresh();
  await reject(() => isolatedRepo.advance("44444444-4444-4444-8444-444444444444"), "TARGET_NOT_ALLOWED");
  await reject(() => isolatedRepo.materializeBatch({ targetReportId: primary, snapshotIngestionId: snapshotIds.get(primary)!, batchStart: 0 }), "PREPARE_REQUIRED");
  assert.equal(isolated.state.calls.length, 0);
  const p = await isolatedRepo.prepare(primary), callCount = isolated.state.calls.length;
  for (const batchStart of [-1, 1, 1.5, NaN, 2000]) await reject(() => isolatedRepo.materializeBatch({ targetReportId: primary,
    snapshotIngestionId: p.snapshotIngestionId, batchStart }), "INVALID_INPUT");
  await reject(() => isolatedRepo.complete({ targetReportId: primary, snapshotIngestionId: p.snapshotIngestionId }), "PREPARE_REQUIRED");
  assert.equal(isolated.state.calls.length, callCount);

  for (const altered of [[], [primary, primary], [secondary], [primary, "bad"], Array(101).fill(primary)]) {
    const t = make(); await reject(() => r.createMetaMaterializationHandoffRepository({ ...t.input, targetReportIds: altered }, t.invoke), "INVALID_INPUT");
    assert.equal(t.state.calls.length, 0);
  }
  for (const patch of [{ provider: "google_ads" }, { provider: "naver_searchad" }, { attempt_count: 2 },
    { snapshot_ingestion_id: snapshotIds.get(primary) }, { status: "done" }]) {
    const t = make(); Object.assign(t.input.job, patch); await reject(() => t.fresh()); assert.equal(t.state.calls.length, 0);
  }
  await reject(() => r.createMetaMaterializationHandoffRepository(inputFor(), undefined as unknown as MetaPageRpc), "MISSING_DEPENDENCY");
  await reject(() => r.createMetaMaterializationHandoffRepository({ ...inputFor(), checkpoint: f.empty.final }, make().invoke), "INVALID_CHECKPOINT");

  const prepareMutations: Array<(data: Dict) => unknown> = [
    () => null, () => [], () => ({}), d => ({ ...d, secret: "fixture-secret" }),
    d => { asRecord(d.checkpoint).digest = "0".repeat(64); return d; },
    d => { d.targets = []; return d; }, d => { (d.targets as unknown[]).reverse(); return d; },
    d => { asRecord((d.targets as unknown[])[0]).published_ingestion_id = "bad"; return d; },
    d => { d.validation_batches = []; return d; },
    d => { asRecord((d.validation_batches as unknown[])[0]).canonical_mismatch_rows = 1; return d; },
    d => { asRecord((d.validation_batches as unknown[])[0]).batch_content_fingerprint = "bad"; return d; },
    d => { asRecord((d.validation_batches as unknown[])[0]).batch_rows = 7; return d; },
    d => { asRecord(d.materialization).next_row_index = 1; return d; },
    d => { asRecord(d.materialization).expected_rows = 7; return d; },
    d => { asRecord(d.materialization).idempotent = true; return d; },
    d => { d.handoff_created = "true"; return d; },
    d => { asRecord(asRecord(d.materialization).job).attempt_count = 2; return d; },
    d => { asRecord(asRecord(d.materialization).job).started_at = "2026-09-19T00:00:00.000001Z"; return d; },
    d => { asRecord(asRecord(d.materialization).job).raw_rows = 7; return d; },
    d => { asRecord(asRecord(d.materialization).job).snapshot_ingestion_id = snapshotIds.get(secondary); return d; },
    d => { asRecord(asRecord(d.materialization).job).error_detail = { bad: true }; return d; },
    d => { asRecord(asRecord(d.materialization).job).progress = 100; return d; },
    d => { asRecord(asRecord(d.materialization).job).execution_contract = "forbidden"; return d; },
  ];
  for (const mutate of prepareMutations) {
    const t = make(); t.state.mutate = (_, d) => mutate(d);
    await reject(() => t.fresh().advance(primary), "INVALID_DATABASE_RESULT");
    assert.equal(t.state.calls.length, 1); assert.equal(t.state.written, 0);
  }
  for (const [key, value] of Object.entries({ snapshot_ingestion_id: snapshotIds.get(secondary), batch_start: 1,
    batch_end_exclusive: 7, expected_batch_rows: 7, inserted_rows: 7, materialized_batch_rows: 5,
    next_row_index: 5, complete: false, idempotent: true })) {
    const t = make(); t.state.mutate = (name, d) => name === r.META_HANDOFF_RPC.batch ? { ...d, [key]: value } : d;
    await reject(() => t.fresh().advance(primary), "INVALID_DATABASE_RESULT");
    assert.equal(t.state.calls.at(-1)?.name, r.META_HANDOFF_RPC.batch);
  }
  for (const [key, value] of Object.entries({ snapshot_ingestion_id: snapshotIds.get(secondary), row_count: 7,
    staging_fingerprint: "0".repeat(64), materialized_fingerprint: "0".repeat(64), idempotent: "true" })) {
    const t = make(); t.state.mutate = (name, d) => name === r.META_HANDOFF_RPC.complete ? { ...d, [key]: value } : d;
    await reject(() => t.fresh().advance(primary), "INVALID_DATABASE_RESULT");
  }
  const drift = make(), driftRepo = drift.fresh(); await driftRepo.prepare(primary);
  drift.state.mutate = (_, d) => { asRecord((d.validation_batches as unknown[])[0]).batch_content_fingerprint = "f".repeat(64); return d; };
  await reject(() => driftRepo.prepare(primary), "INVALID_DATABASE_RESULT");
  const targetDrift = make(), targetRepo = targetDrift.fresh(); await targetRepo.prepare(primary);
  targetDrift.state.mutate = (_, d) => { asRecord((d.targets as unknown[])[0]).published_ingestion_id = snapshotIds.get(secondary); return d; };
  await reject(() => targetRepo.prepare(primary), "INVALID_DATABASE_RESULT");
  const rejectRpc = async (reply: unknown) => {
    const invoke = async () => reply as Awaited<ReturnType<MetaPageRpc>>;
    await reject(() => r.createMetaMaterializationHandoffRepository(inputFor(), invoke).advance(primary));
  };
  for (const reply of [null, {}, { data: {}, error: { message: "fixture-secret" } }, { data: undefined, error: null }]) await rejectRpc(reply);
  console.log(`META_HANDOFF_REPOSITORY=PASS CASES=${cases}`);
  console.log("NETWORK=BLOCKED DB_EXECUTIONS=0 BOUNDED_BATCH=2000 SAME_CLAIM_MOCK_RESUME=PASS");
  console.log("SQL_RUNTIME=NOT_TESTED ACTIVATION=DISABLED FINALIZATION=DISABLED LIVE_META_API_CALLS=0");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
