import assert from "node:assert/strict";
// This fixture module blocks network before dynamically importing application code.
import { buildMetaPageFixture } from "./export-meta-ads-page-checkpoint-fixture";
import type { MetaPageCheckpoint } from "../src/lib/media-sync/meta-ads-page-checkpoint-contract";
import type { MetaPageRpc } from "../src/lib/media-sync/meta-ads-page-checkpoint-repository";

async function main() {
  const f = await buildMetaPageFixture();
  const r = await import("../src/lib/media-sync/meta-ads-page-checkpoint-repository");
  const c = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const { runMetaAdsStagingOrchestrator: run } = await import("../src/lib/media-sync/meta-ads-staging-orchestrator");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  let cases = 0;
  const make = () => {
    const state = { checkpoint: null as MetaPageCheckpoint | null, rows: new Map<number, unknown>(),
      calls: [] as string[], fetches: 0, fail: "", lose: "", override: undefined as undefined | { data: unknown; error: unknown } };
    const invoke: MetaPageRpc = async (name, { p_payload: p }) => {
      state.calls.push(name);
      for (const [key, value] of Object.entries(f.envelope)) assert.deepEqual(p[key], value);
      assert.ok(!JSON.stringify(p).includes("fixture-only-never-stored"));
      if (state.fail === name) { state.fail = ""; throw new Error("fixture-only-never-stored"); }
      if (state.override) return state.override;
      let data: unknown;
      if (name === r.META_PAGE_RPC.load) data = structuredClone(state.checkpoint);
      else if (name === r.META_PAGE_RPC.cas) {
        const next = p.next as MetaPageCheckpoint;
        assert.deepEqual(p.checkpoint_text, r.metaPageDatabaseEvidence(next).checkpoint_text);
        if ((state.checkpoint?.revision ?? null) !== p.expected_revision) data = false;
        else { state.checkpoint = structuredClone(next); data = true; }
      } else {
        assert.equal(name, r.META_PAGE_RPC.append);
        assert.equal(p.expected_revision, state.checkpoint?.revision);
        assert.equal(p.pending_id, state.checkpoint?.pending?.id);
        const rows = (p.append_payload as { rows: Array<{ row_index: number }> }).rows;
        assert.deepEqual(rows, state.checkpoint?.pending?.rows);
        let inserted = 0;
        for (const row of rows) {
          if (state.rows.has(row.row_index)) assert.deepEqual(state.rows.get(row.row_index), row);
          else { state.rows.set(row.row_index, structuredClone(row)); inserted++; }
        }
        data = { submitted_rows: rows.length, inserted_rows: inserted, duplicate_rows: rows.length-inserted,
          first_row_index: rows[0]?.row_index ?? null, last_row_index: rows.at(-1)?.row_index ?? null };
      }
      if (state.lose === name) { state.lose = ""; throw new Error("fixture-only-never-stored"); }
      return { data, error: null };
    };
    const ports = () => r.createMetaAdsPageCheckpointRepository(f.input, invoke);
    const step = () => run({ ...f.input, accessToken: "fixture-only-never-stored" }, { ...ports(), collectPage: (request, options) => {
      state.fetches++;
      return collect(request, { fetchImpl: async () => new Response(JSON.stringify(f.wirePages[(request.cursor as { pageIndex: number } | null)?.pageIndex ?? 0])) }, options);
    } });
    return { state, ports, step };
  };
  const reject = async (fn: () => Promise<unknown>, code?: string) => {
    await assert.rejects(fn, (error: unknown) => {
      assert.ok(error instanceof c.MetaPageCheckpointError);
      if (code) assert.equal(error.code, code);
      assert.ok(!String(error).includes("fixture-only-never-stored"));
      assert.ok(!Object.hasOwn(error, "cause")); return true;
    }); cases++;
  };
  const good = make();
  for (let i=0;i<3;i++) { const result = await good.step(); assert.deepEqual(result.checkpoint, f.steps[i].confirmed); cases++; }
  assert.equal(good.state.rows.size, 6); assert.equal(good.state.fetches, 3);
  assert.equal(good.state.calls.filter((n) => n===r.META_PAGE_RPC.append).length, 2); cases++;
  const calls = good.state.calls.length;
  assert.equal((await good.step()).alreadyComplete, true);
  assert.equal(good.state.calls.length, calls+1); cases++;
  for (const failure of [r.META_PAGE_RPC.cas,r.META_PAGE_RPC.append]) {
    for (const mode of ["fail","lose"] as const) {
      const t = make(); t.state[mode] = failure;
      if (mode==="lose" && failure===r.META_PAGE_RPC.cas) {
        assert.deepEqual((await t.step()).checkpoint,f.steps[0].confirmed); cases++;
      } else {
        await reject(t.step);
        const before = t.state.fetches;
        assert.deepEqual((await t.step()).checkpoint, f.steps[0].confirmed);
        assert.equal(t.state.rows.size, 2);
        assert.equal(t.state.fetches, failure===r.META_PAGE_RPC.append ? before : before+1); cases++;
      }
    }
  }
  const t = make();
  await reject(() => t.ports().loadCheckpoint("wrong"),"INVALID_SCOPE"); assert.equal(t.state.calls.length,0);
  for (const result of [{data: {},error:null},{data: [],error:null},{data: f.steps[0].pending,error:"secret"}]) {
    t.state.override = result; await reject(() => t.ports().loadCheckpoint(f.scope.storageKey));
  }
  t.state.override = undefined;
  for (const revision of [-1,1.5,2]) await reject(() => t.ports().compareAndSetCheckpoint({storageKey:f.scope.storageKey,
    expectedRevision:revision,next:f.steps[0].pending}),"INVALID_CHECKPOINT");
  for (const data of [null,{},"true",1]) {
    t.state.override = {data,error:null};
    await reject(() => t.ports().compareAndSetCheckpoint({storageKey:f.scope.storageKey,expectedRevision:null,next:f.steps[0].pending}));
  }
  t.state.override = {data:false,error:null};
  assert.equal(await t.ports().compareAndSetCheckpoint({storageKey:f.scope.storageKey,expectedRevision:null,next:f.steps[0].pending}),false); cases++;
  const a = make(); await a.ports().compareAndSetCheckpoint({storageKey:f.scope.storageKey,expectedRevision:null,next:f.steps[0].pending});
  const request = {job:f.input.job,metaContext:f.input.context,rowStartIndex:0,dateWindowIndex:0,
    rows:f.steps[0].pending.pending!.rows.map((x)=>x.row)};
  for (const changed of [{...request,rowStartIndex:1},{...request,dateWindowIndex:1},
    {...request,job:{...request.job,attempt_count:2}}, {...request,rows:[]},
    {...request,rows:[{...request.rows[0],cost:999},...request.rows.slice(1)]}]) {
    await reject(()=>a.ports().appendBatch(changed),"APPEND_UNCONFIRMED");
  }
  assert.equal(a.state.calls.filter((n)=>n===r.META_PAGE_RPC.append).length,0); cases++;
  const first = await a.ports().appendBatch(request); const replay = await a.ports().appendBatch(request);
  assert.equal(first.insertedRows,2); assert.equal(replay.insertedRows,0); assert.equal(replay.duplicateRows,2); cases++;
  assert.throws(()=>r.createMetaAdsPageCheckpointRepository(f.input,undefined as unknown as MetaPageRpc),c.MetaPageCheckpointError); cases++;
  const reordered = JSON.parse(JSON.stringify(f.steps[0].pending));
  assert.deepEqual(r.metaPageDatabaseEvidence(reordered),r.metaPageDatabaseEvidence(f.steps[0].pending)); cases++;
  console.log(`META_PAGE_CHECKPOINT_REPOSITORY=PASS CASES=${cases}`);
  console.log("NETWORK=BLOCKED DB_EXECUTIONS=0 SAME_CLAIM_MOCK_RESUME=PASS SQL_RUNTIME=NOT_TESTED");
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
