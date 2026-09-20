import assert from "node:assert/strict";
// Blocks fetch and Node network transports before application imports.
import { buildMetaPageFixture } from "./export-meta-ads-page-checkpoint-fixture";
import type { MetaCompletionClaimInput } from "../src/lib/media-sync/meta-ads-completion-claim-contract";

async function main() {
  const m = await import("../src/lib/media-sync/meta-ads-completion-claim-contract");
  const { metaHash } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const fixture = await buildMetaPageFixture(), job = fixture.input.job, total = fixture.final.totalRows;
  const reportIds = [job.report_id, "99999999-9999-4999-8999-999999999999"];
  const targets = reportIds.map((reportId, i) => {
    const snapshotIngestionId = i ? "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    return { reportId, snapshotIngestionId, previousIngestionId: i ? null : job.previous_ingestion_id,
      publishedIngestionId: i ? null : "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      completionToken: metaHash(`${job.id}:${reportId}:${snapshotIngestionId}:${total}:0:${total - 1}:0:${total - 1}`) };
  });
  const input: MetaCompletionClaimInput = { originalJob: job, context: fixture.input.context,
    collectorOptions: fixture.input.collectorOptions, checkpoint: fixture.final, targets };
  function evidence() {
    return { scope: fixture.scope.key, checkpoint: structuredClone(fixture.final),
      job: { ...structuredClone(job), snapshot_ingestion_id: targets[0].snapshotIngestionId,
        raw_rows: total, normalized_rows: total, inserted_rows: total, progress: 70 },
      targets: targets.map(t => ({ ...t, currentIngestionId: t.previousIngestionId, rowCount: total, status: "success" })) };
  }
  type Evidence = ReturnType<typeof evidence>;
  let cases = 0;
  const contract = m.createMetaCompletionClaimContract(input);
  function reject(e: unknown, code?: string) {
    assert.throws(() => contract.inspect(e), (error: unknown) => {
      assert.ok(error instanceof m.MetaCompletionClaimError);
      if (code) assert.equal(error.code, code);
      assert.equal(error.cause, undefined); assert.equal(error.message.includes("SECRET_SENTINEL"), false);
      return true;
    }); cases++;
  }
  function rejectInput(i: unknown) {
    assert.throws(() => m.createMetaCompletionClaimContract(i as MetaCompletionClaimInput), m.MetaCompletionClaimError); cases++;
  }
  const unchanged = structuredClone(input), e = evidence();
  assert.equal(contract.inspect(e).stage, "ready_for_activation");
  assert.equal(contract.inspect(e).activationAllowed, false);
  assert.equal(contract.inspect(e).finalizationAllowed, false);
  assert.equal(contract.inspect(e).requiresAtomicDatabaseFence, true);
  assert.deepEqual(input, unchanged); assert.deepEqual(e, evidence()); cases++;
  const active = evidence(); active.targets.forEach(t => { t.currentIngestionId = t.snapshotIngestionId; });
  assert.equal(contract.inspect(active).stage, "ready_for_finalization"); cases++;
  const done = structuredClone(active); Object.assign(done.job, { status: "done", progress: 100, finished_at: "2026-09-20T00:00:00Z" });
  assert.equal(contract.inspect(done).stage, "completed"); cases++;
  for (const base of [evidence(), active, done]) {
    for (const changes of [{ attempt_count: 2 }, { attempt_count: 0 }, { attempt_count: "1" },
      { started_at: "2026-09-19T00:00:00.000001Z" }, { started_at: "2026-09-20T00:00:00Z" }]) {
      const bad = structuredClone(base); Object.assign(bad.job, changes); reject(bad, "CLAIM_CHANGED");
    }
  }
  const equivalent = evidence(); equivalent.job.started_at = "2026-09-19T09:00:00+09:00";
  assert.equal(contract.inspect(equivalent).stage, "ready_for_activation"); cases++;
  for (const key of ["id", "workspace_id", "advertiser_id", "report_id", "connection_id", "created_by", "provider",
    "external_account_id", "date_from", "date_to", "data_level", "mode", "previous_ingestion_id", "snapshot_ingestion_id",
    "raw_rows", "normalized_rows", "inserted_rows", "failed_rows", "error", "error_detail", "automation_contract",
    "execution_contract", "sync_segment_progress", "status", "progress"]) {
    const bad = evidence(); Object.assign(bad.job, { [key]: "SECRET_SENTINEL" }); reject(bad, "EXECUTION_CHANGED");
  }
  for (const key of ["revision", "digest", "totalRows", "fetchedRows", "phase"]) {
    const bad = evidence(); Object.assign(bad.checkpoint, { [key]: "changed" }); reject(bad, "CHECKPOINT_CHANGED");
  }
  reject({ ...evidence(), scope: "changed" }, "CHECKPOINT_CHANGED");
  reject({ ...evidence(), targets: [] }, "TARGET_CHANGED");
  reject({ ...evidence(), targets: [e.targets[0], e.targets[0]] }, "TARGET_CHANGED");
  for (const key of ["reportId", "previousIngestionId", "publishedIngestionId", "snapshotIngestionId", "completionToken"]) {
    const bad = evidence(); Object.assign(bad.targets[1], { [key]: key === "reportId" ? targets[0].reportId : "changed" }); reject(bad, "TARGET_CHANGED");
  }
  for (const changes of [{ status: "processing" }, { rowCount: 5 }, { rowCount: "6" }]) {
    const bad = evidence(); Object.assign(bad.targets[1], changes); reject(bad, "MATERIALIZATION_INCOMPLETE");
  }
  const partial = evidence(); partial.targets[0].currentIngestionId = partial.targets[0].snapshotIngestionId;
  reject(partial, "POINTER_CONFLICT");
  const foreign = evidence(); foreign.targets[1].currentIngestionId = targets[0].snapshotIngestionId; reject(foreign, "POINTER_CONFLICT");
  const invalidDone = evidence(); Object.assign(invalidDone.job, done.job); reject(invalidDone, "EXECUTION_CHANGED");
  const invalidFinished = structuredClone(done); invalidFinished.job.finished_at = "2020-01-01T00:00:00Z"; reject(invalidFinished, "EXECUTION_CHANGED");
  for (const value of [null, [], {}, { ...evidence(), accessToken: "SECRET_SENTINEL" }]) reject(value);
  for (const value of [null, {}, { ...input, targets: [] }, { ...input, targets: [targets[0], targets[0]] },
    { ...input, checkpoint: null }, { ...input, originalJob: { ...job, provider: "google_ads" } },
    { ...input, targets: [{ ...targets[0], completionToken: "fake" }, targets[1]] }]) rejectInput(value);
  assert.ok(Object.isFrozen(contract.expected) && Object.isFrozen(contract.expected.targets[0])); cases++;
  const mutableInput = structuredClone(input), isolated = m.createMetaCompletionClaimContract(mutableInput);
  mutableInput.originalJob.attempt_count = 99;
  assert.equal(isolated.inspect(evidence()).stage, "ready_for_activation"); cases++;

  // Transaction MODEL only. All revalidation and writes occur in one modeled
  // critical section. Real row locks and SQL wrappers are not implemented here.
  let state: Evidence = evidence(); let writes = 0;
  function modeledTransaction(kind: "activate" | "finalize", fault?: "rollback" | "lost_ack") {
    const before = structuredClone(state), count = writes;
    try {
      const inspected = m.createMetaCompletionClaimContract(input).inspect(state);
      if (kind === "activate") {
        if (inspected.stage === "ready_for_activation") {
          for (const t of state.targets) {
            t.currentIngestionId = t.snapshotIngestionId; writes++;
            if (fault === "rollback") throw new Error("ROLLBACK");
          }
        } else assert.equal(inspected.stage, "ready_for_finalization");
      } else {
        assert.notEqual(inspected.stage, "ready_for_activation");
        if (inspected.stage !== "completed") {
          Object.assign(state.job, { status: "done", progress: 100, finished_at: "2026-09-20T00:00:00Z" }); writes++;
          if (fault === "rollback") throw new Error("ROLLBACK");
        }
      }
    } catch (error) { state = before; writes = count; throw error; }
    if (fault === "lost_ack") throw new Error("LOST_ACK");
  }
  // A precheck passes, but reclaim BEFORE the transaction must reject stale work.
  contract.inspect(state); state.job.attempt_count++;
  const reclaimed = structuredClone(state);
  assert.throws(() => modeledTransaction("activate"), m.MetaCompletionClaimError);
  assert.equal(writes, 0); assert.deepEqual(state, reclaimed); cases++;
  state = evidence(); assert.throws(() => modeledTransaction("activate", "rollback"));
  assert.deepEqual(state, evidence()); assert.equal(writes, 0); cases++;
  assert.throws(() => modeledTransaction("activate", "lost_ack")); assert.equal(writes, 2);
  modeledTransaction("activate"); assert.equal(writes, 2); cases++;
  state.job.attempt_count++; const staleFinal = structuredClone(state);
  assert.throws(() => modeledTransaction("finalize"), m.MetaCompletionClaimError);
  assert.deepEqual(state, staleFinal); assert.equal(writes, 2); cases++;
  state = structuredClone(active); assert.throws(() => modeledTransaction("finalize", "rollback"));
  assert.deepEqual(state, active); assert.equal(writes, 2); cases++;
  assert.throws(() => modeledTransaction("finalize", "lost_ack")); assert.equal(writes, 3);
  modeledTransaction("finalize"); assert.equal(writes, 3); cases++;
  state.job.attempt_count++; assert.throws(() => modeledTransaction("finalize"), m.MetaCompletionClaimError);
  assert.equal(writes, 3); cases++;
  console.log(`META_COMPLETION_CLAIM_CONTRACT=PASS CASES=${cases}`);
  console.log("NETWORK=BLOCKED DB_EXECUTIONS=0 TRANSACTION_MODEL_ONLY=true");
  console.log("ATOMIC_DB_FENCE=NOT_IMPLEMENTED LIVE_WORKER=DISABLED ACTIVATION_ALLOWED=false FINALIZATION_ALLOWED=false");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
