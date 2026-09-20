import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { verifyMetaSqlContracts } from "./verify-meta-ads-sql-contract";
import { convertMetaAdsDailyInsightsToCanonicalRows } from "../src/lib/media-sync/meta-ads-canonical-row";
import { prepareMetaAdsStagingRows } from "../src/lib/media-sync/meta-ads-staging-contract";

// Independent transactional specification MODEL. This does not interpret SQL,
// run PostgreSQL, prove lock scheduling, or connect the current runtime adapter.
const ids = {
  job: "11111111-1111-4111-8111-111111111111", workspace: "22222222-2222-4222-8222-222222222222",
  advertiser: "33333333-3333-4333-8333-333333333333", primary: "44444444-4444-4444-8444-444444444444",
  connection: "55555555-5555-4555-8555-555555555555", creator: "66666666-6666-4666-8666-666666666666",
  primarySnapshot: "77777777-7777-4777-8777-777777777777", primaryPrevious: "88888888-8888-4888-8888-888888888888",
  primaryPublished: "99999999-9999-4999-8999-999999999999", secondary: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  secondaryPrevious: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", secondarySnapshot: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
  secondaryPublished: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", tenant: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
};
type Binding = { reportId: string; previous: string | null; snapshot: string; published: string | null; expectedRows: number };
type Scope = { workspace: string; advertiser: string; creator: string };
type State = {
  job: Scope & { id: string; connection: string; provider: string; account: string; from: string; to: string;
    level: string; mode: string; status: string; rows: number; raw: number; normalized: number; failed: number;
    snapshot: string; previous: string | null; primary: string; finishedAt: string | null; progress: number };
  connection: { id: string; workspace: string; advertiser: string; tenant: string; provider: string; account: string; active: boolean; lastSync: string | null };
  mappings: { reportId: string; connection: string; workspace: string; advertiser: string; tenant: string }[];
  projections: (Scope & Binding)[];
  reports: { id: string; workspace: string; advertiser: string; tenant: string; source: string; from: string; to: string; current: string | null; published: string | null }[];
  ingestions: { id: string; reportId: string; workspace: string; creator: string; rows: number; status: string; kind: string; error: string | null; csvPath: string | null }[];
};
type Payload = { jobId: string; workspace: string; advertiser: string; connection: string; provider: string; account: string;
  from: string; to: string; expectedRows: number; projections: Binding[] };
type Fault = "before_updates" | "after_first_update" | "after_all_updates" | "after_commit";
const finished = "2026-09-20T00:00:00.000Z";
function check(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }

function setup() {
  const scope = { workspace: ids.workspace, advertiser: ids.advertiser, creator: ids.creator };
  const bindings: Binding[] = [
    { reportId: ids.primary, previous: ids.primaryPrevious, snapshot: ids.primarySnapshot, published: ids.primaryPublished, expectedRows: 6 },
    { reportId: ids.secondary, previous: ids.secondaryPrevious, snapshot: ids.secondarySnapshot, published: ids.secondaryPublished, expectedRows: 6 },
  ];
  const state: State = {
    job: { ...scope, id: ids.job, connection: ids.connection, provider: "meta_ads", account: "12345678901234567890",
      from: "2026-09-01", to: "2026-09-07", level: "creative", mode: "snapshot_replace", status: "processing",
      rows: 6, raw: 6, normalized: 6, failed: 0, snapshot: ids.primarySnapshot, previous: ids.primaryPrevious,
      primary: ids.primary, finishedAt: null, progress: 90 },
    connection: { id: ids.connection, workspace: ids.workspace, advertiser: ids.advertiser, tenant: ids.tenant,
      provider: "meta_ads", account: "12345678901234567890", active: true, lastSync: null },
    mappings: bindings.map((b) => ({ reportId: b.reportId, connection: ids.connection, workspace: ids.workspace, advertiser: ids.advertiser, tenant: ids.tenant })),
    projections: bindings.map((b) => ({ ...scope, ...b })),
    reports: bindings.map((b) => ({ id: b.reportId, workspace: ids.workspace, advertiser: ids.advertiser, tenant: ids.tenant,
      source: "api", from: "2026-09-01", to: "2026-09-07", current: b.previous, published: b.published })),
    ingestions: bindings.map((b) => ({ id: b.snapshot, reportId: b.reportId, workspace: ids.workspace, creator: ids.creator,
      rows: 6, status: "success", kind: "api", error: null, csvPath: null })),
  };
  const payload: Payload = { jobId: ids.job, workspace: ids.workspace, advertiser: ids.advertiser, connection: ids.connection,
    provider: "meta_ads", account: state.job.account, from: state.job.from, to: state.job.to, expectedRows: 6, projections: structuredClone(bindings) };
  return { state, payload };
}

function witness(state: State, payload: Payload, finalizing: boolean) {
  const { job, connection } = state;
  check(job.provider === "meta_ads" && job.level === "creative" && job.mode === "snapshot_replace" &&
    (job.status === "processing" || (finalizing && job.status === "done")), "EXECUTION");
  check(payload.jobId === job.id && payload.provider === job.provider && payload.workspace === job.workspace &&
    payload.advertiser === job.advertiser && payload.connection === job.connection && payload.account === job.account &&
    payload.from === job.from && payload.to === job.to, "EXECUTION_SCOPE");
  check(Number.isInteger(payload.expectedRows) && payload.expectedRows > 0 &&
    [job.rows, job.raw, job.normalized].every((n) => n === payload.expectedRows) && job.failed === 0, "COUNTS");
  check(connection.id === job.connection && connection.active && connection.provider === job.provider &&
    connection.workspace === job.workspace && connection.advertiser === job.advertiser && connection.account === job.account, "CONNECTION");
  const mappings = state.mappings.filter((m) => m.connection === job.connection);
  check(mappings.every((m) => m.workspace === job.workspace &&
    m.advertiser === job.advertiser && m.tenant === connection.tenant), "MAPPING_SCOPE");
  const idsOf = (values: { reportId: string }[]) => values.map((v) => v.reportId.toLowerCase()).sort();
  const targets = finalizing ? state.projections : payload.projections;
  const projectedIds = idsOf(state.projections);
  check(projectedIds.length > 0 && new Set(idsOf(targets)).size === targets.length &&
    JSON.stringify(idsOf(targets)) === JSON.stringify(projectedIds) &&
    JSON.stringify(idsOf(mappings)) === JSON.stringify(projectedIds), "TARGET_SET");
  const primary = state.projections.find((p) => p.reportId === job.primary);
  check(primary && primary.previous === job.previous && primary.snapshot === job.snapshot, "PRIMARY_MIRROR");
  let previous = 0; let active = 0;
  const bindings = [...targets].sort((a, b) => a.reportId.localeCompare(b.reportId));
  for (const target of bindings) {
    const projection = state.projections.find((p) => p.reportId === target.reportId)!;
    check(projection && projection.workspace === job.workspace && projection.advertiser === job.advertiser &&
      projection.creator === job.creator && projection.previous === target.previous && projection.snapshot === target.snapshot &&
      target.expectedRows === payload.expectedRows, "PROJECTION_AUTHORITY");
    const report = state.reports.find((r) => r.id === target.reportId);
    check(report && report.workspace === job.workspace && report.advertiser === job.advertiser &&
      report.tenant === connection.tenant && report.source === "api" && report.from === job.from && report.to === job.to, "REPORT_SCOPE");
    check(!state.mappings.some((m) => m.reportId === report.id && m.connection !== job.connection), "MULTI_CONNECTION_REPORT");
    check(finalizing || report.published === target.published, "PUBLISHED_BASELINE");
    if (report.current === projection.snapshot) active += 1;
    else if (report.current === projection.previous) previous += 1;
    else throw new Error("CURRENT_CONFLICT");
    const ingestion = state.ingestions.find((i) => i.id === projection.snapshot);
    check(ingestion && ingestion.reportId === report.id && ingestion.workspace === job.workspace &&
      ingestion.creator === job.creator && ingestion.status === "success" && ingestion.rows === payload.expectedRows &&
      ingestion.kind === "api" && ingestion.csvPath === null && ingestion.error === null, "SNAPSHOT_INCOMPLETE");
  }
  check(!(previous && active) && (!finalizing || active === targets.length), "PARTIAL_OR_INACTIVE");
  return { bindings, allActive: active === targets.length };
}

function model(initial: State) {
  const api = {
    state: structuredClone(initial), writeAttempts: 0,
    activate(payload: Payload, fault?: Fault) {
      const transaction = structuredClone(api.state);
      const beforeJob = structuredClone(transaction.job);
      const beforeConnection = structuredClone(transaction.connection);
      const beforePublished = transaction.reports.map((r) => r.published);
      const proof = witness(transaction, payload, false);
      if (fault === "before_updates") throw new Error("INJECTED_FAILURE");
      if (!proof.allActive) for (const [index, target] of proof.bindings.entries()) {
        transaction.reports.find((r) => r.id === target.reportId)!.current = target.snapshot;
        api.writeAttempts += 1;
        if (index === 0 && fault === "after_first_update") throw new Error("INJECTED_FAILURE");
      }
      if (fault === "after_all_updates") throw new Error("INJECTED_FAILURE");
      assert.deepEqual(transaction.job, beforeJob); assert.deepEqual(transaction.connection, beforeConnection);
      assert.deepEqual(transaction.reports.map((r) => r.published), beforePublished);
      api.state = transaction;
      if (fault === "after_commit") throw new Error("RESPONSE_LOST_AFTER_COMMIT");
      return { idempotent: proof.allActive, projectionCount: proof.bindings.length };
    },
    finalize(payload: Payload) {
      const transaction = structuredClone(api.state);
      witness(transaction, payload, true);
      const idempotent = transaction.job.status === "done";
      if (!idempotent) Object.assign(transaction.job, { status: "done", progress: 100, finishedAt: finished });
      if (transaction.connection.lastSync === null || transaction.connection.lastSync < transaction.job.finishedAt!)
        transaction.connection.lastSync = transaction.job.finishedAt;
      api.state = transaction;
      return { idempotent };
    },
  };
  return api;
}

function main() {
  verifyMetaSqlContracts();
  const fixture = JSON.parse(readFileSync("scripts/fixtures/meta-ads-ad-daily-insights.json", "utf8"));
  const rows = convertMetaAdsDailyInsightsToCanonicalRows(fixture);
  const dataset = prepareMetaAdsStagingRows({ context: fixture.context, rows });
  assert.equal(dataset.totalRows, 6);
  assert.ok(rows.some((row) => row.impressions === 0 && row.clicks === 0 && row.cost === 0 && (row.conversions > 0 || row.revenue > 0)));
  const { state, payload } = setup(); const inputBefore = structuredClone(payload);
  const good = model(state);
  assert.deepEqual(good.activate(payload), { idempotent: false, projectionCount: 2 });
  assert.equal(good.state.job.raw, dataset.totalRows);
  assert.equal(good.state.job.status, "processing"); assert.equal(good.state.connection.lastSync, null);
  assert.deepEqual(good.activate(payload), { idempotent: true, projectionCount: 2 });
  assert.equal(good.writeAttempts, 2);
  assert.deepEqual(good.finalize(payload), { idempotent: false });
  const completed = structuredClone(good.state);
  assert.deepEqual(good.finalize(payload), { idempotent: true }); assert.deepEqual(good.state, completed);
  assert.deepEqual(payload, inputBefore);
  assert.equal(good.state.job.raw, 6); assert.equal(good.state.connection.lastSync, finished);

  const cases: [string, (s: State, p: Payload) => void][] = [
    ["EXECUTION", (s) => { s.job.provider = "google_ads"; }],
    ["EXECUTION", (s) => { s.job.level = "keyword"; }],
    ["EXECUTION", (s) => { s.job.status = "failed"; }],
    ["EXECUTION_SCOPE", (_, p) => { p.workspace = ids.advertiser; }],
    ["EXECUTION_SCOPE", (_, p) => { p.advertiser = ids.workspace; }],
    ["EXECUTION_SCOPE", (_, p) => { p.connection = ids.advertiser; }],
    ["EXECUTION_SCOPE", (_, p) => { p.account = "other-account"; }],
    ["COUNTS", (s) => { s.job.raw = 12; }],
    ["COUNTS", (_, p) => { p.expectedRows = 0; }],
    ["COUNTS", (s) => { s.job.failed = 1; }],
    ["CONNECTION", (s) => { s.connection.active = false; }],
    ["CONNECTION", (s) => { s.connection.account = "other-account"; }],
    ["MAPPING_SCOPE", (s) => { s.mappings[1].tenant = ids.workspace; }],
    ["TARGET_SET", (_, p) => { p.projections.pop(); }],
    ["TARGET_SET", (_, p) => { p.projections.push(p.projections[1]); }],
    ["TARGET_SET", (_, p) => { p.projections[1].reportId = ids.connection; }],
    ["TARGET_SET", (s) => { s.mappings.pop(); }],
    ["TARGET_SET", (s) => { s.mappings.push({ ...s.mappings[0], reportId: ids.creator }); }],
    ["PRIMARY_MIRROR", (s) => { s.job.snapshot = ids.secondarySnapshot; }],
    ["PRIMARY_MIRROR", (s, p) => { s.projections.shift(); s.mappings.shift(); p.projections.shift(); }],
    ["PROJECTION_AUTHORITY", (s) => { s.projections[1].workspace = ids.advertiser; }],
    ["PROJECTION_AUTHORITY", (s) => { s.projections[1].creator = ids.workspace; }],
    ["PROJECTION_AUTHORITY", (_, p) => { p.projections[1].snapshot = ids.primarySnapshot; }],
    ["PROJECTION_AUTHORITY", (_, p) => { p.projections[1].previous = ids.primaryPrevious; }],
    ["REPORT_SCOPE", (s) => { s.reports[1].tenant = ids.advertiser; }],
    ["REPORT_SCOPE", (s) => { s.reports[1].from = "2026-08-01"; }],
    ["REPORT_SCOPE", (s) => { s.reports[1].source = "csv"; }],
    ["MULTI_CONNECTION_REPORT", (s) => { s.mappings.push({ ...s.mappings[1], connection: ids.advertiser }); }],
    ["PUBLISHED_BASELINE", (s) => { s.reports[1].published = ids.primaryPublished; }],
    ["CURRENT_CONFLICT", (s) => { s.reports[1].current = ids.primarySnapshot; }],
    ["SNAPSHOT_INCOMPLETE", (s) => { s.ingestions[1].status = "processing"; }],
    ["SNAPSHOT_INCOMPLETE", (s) => { s.ingestions[1].rows = 5; }],
    ["SNAPSHOT_INCOMPLETE", (s) => { s.ingestions[1].reportId = ids.primary; }],
    ["SNAPSHOT_INCOMPLETE", (s) => { s.ingestions[1].csvPath = "fixture.csv"; }],
    ["PARTIAL_OR_INACTIVE", (s) => { s.reports[1].current = ids.secondarySnapshot; }],
  ];
  for (const [code, corrupt] of cases) {
    const seed = setup(); corrupt(seed.state, seed.payload); const candidate = model(seed.state);
    assert.throws(() => candidate.activate(seed.payload), { message: code });
    assert.deepEqual(candidate.state, seed.state); assert.equal(candidate.writeAttempts, 0);
  }
  for (const fault of ["before_updates", "after_first_update", "after_all_updates"] as const) {
    const candidate = model(state);
    assert.throws(() => candidate.activate(payload, fault), { message: "INJECTED_FAILURE" });
    assert.deepEqual(candidate.state, state, "Model transaction must roll back every pointer");
    assert.equal(candidate.writeAttempts, fault === "before_updates" ? 0 : fault === "after_first_update" ? 1 : 2);
    assert.throws(() => candidate.finalize(payload), { message: "PARTIAL_OR_INACTIVE" });
  }
  const lost = model(state);
  assert.throws(() => lost.activate(payload, "after_commit"), { message: "RESPONSE_LOST_AFTER_COMMIT" });
  assert.equal(lost.state.job.status, "processing"); assert.equal(lost.state.connection.lastSync, null);
  assert.ok(lost.state.reports.every((r) => r.current === lost.state.projections.find((p) => p.reportId === r.id)!.snapshot));
  assert.deepEqual(lost.activate(payload), { idempotent: true, projectionCount: 2 }); assert.equal(lost.writeAttempts, 2);
  for (const drift of ["mapping", "snapshot", "pointer"] as const) {
    const candidate = model(state); candidate.activate(payload);
    if (drift === "mapping") candidate.state.mappings.pop();
    if (drift === "snapshot") candidate.state.ingestions[1].status = "processing";
    if (drift === "pointer") candidate.state.reports[1].current = ids.secondaryPrevious;
    const before = structuredClone(candidate.state);
    assert.throws(() => candidate.finalize(payload)); assert.deepEqual(candidate.state, before);
  }
  const nulls = setup();
  nulls.state.projections[0].previous = null; nulls.state.reports[0].current = null; nulls.state.job.previous = null;
  nulls.payload.projections[0].previous = null; nulls.payload.projections[0].published = null; nulls.state.reports[0].published = null;
  assert.equal(model(nulls.state).activate(nulls.payload).idempotent, false);
  const tokens = payload.projections.map((p) => createHash("sha256").update([payload.jobId,p.reportId,p.snapshot,6,0,5,0,5].join(":")).digest("hex"));
  assert.notEqual(tokens[0], tokens[1]);
  console.log(`META_ATOMIC_MODEL_PREFLIGHT_REJECTION_CASES=${cases.length}`);
  console.log("META_ATOMIC_MODEL_ROLLBACK_POINTS=3/3");
  console.log("META_ATOMIC_MODEL_RESPONSE_LOSS_EXACT_REPLAY=PASS");
  console.log("META_ATOMIC_MODEL_FINALIZATION_REVALIDATION=3/3");
  console.log("META_ATOMIC_MODEL_RAW6_TWO_PROJECTIONS_PUBLISHED_PRESERVED=PASS");
  console.log("MODEL_ONLY=true\nDB_EXECUTIONS=0\nPOSTGRES_CONCURRENCY_AND_ROLLBACK=NOT_TESTED\nMETA_ATOMIC_FANOUT_SPEC_MODEL=PASS");
}

main();
