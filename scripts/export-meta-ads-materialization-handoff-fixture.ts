import assert from "node:assert/strict";
import { createHash } from "node:crypto";
// Installs network denial before any application module is loaded.
import { buildMetaPageFixture } from "./export-meta-ads-page-checkpoint-fixture";

function uid(label: string): string {
  const bytes = createHash("sha1").update(Buffer.from("6ba7b8119dad11d180b400c04fd430c8", "hex"))
    .update("https://meta-fixture.invalid/" + label).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 15) | 80; bytes[8] = (bytes[8] & 63) | 128;
  const s = bytes.toString("hex"); return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}
export async function buildMetaHandoffFixture() {
  const page = await buildMetaPageFixture();
  const c = await import("../src/lib/media-sync/meta-ads-page-checkpoint-contract");
  const r = await import("../src/lib/media-sync/meta-ads-page-checkpoint-repository");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const primary = uid("meta-primary"), secondary = uid("meta-secondary");
  function wrap(p: typeof page) {
    const input = { ...p.input, checkpoint: p.final, targetReportIds: [primary, secondary].sort() };
    const request = { page: p.envelope, checkpoint_revision: p.final.revision, checkpoint_digest: p.final.digest,
      expected_rows: p.final.totalRows, target_report_ids: input.targetReportIds };
    return { page: p, input, primary, secondary, preparePayload: { ...request, target_report_id: primary } };
  }
  // Genuine mocked collector/CAS fixtures, not a fabricated terminal checkpoint.
  const large = structuredClone(page);
  large.input.collectorOptions = { pageSize: 2000, maxRetries: 0 };
  const scope = c.createMetaPageScope(large.input.job, large.input.context, large.input.collectorOptions);
  large.scope = scope; large.envelope = r.metaPageDatabaseEnvelope(scope); large.steps = [];
  const template = structuredClone(page.wirePages[0].data[0]);
  const rows = Array.from({ length: 2001 }, (_, i) => ({ ...structuredClone(template), ad_id: String(8000000000 + i) }));
  const pages = [{ data: rows.slice(0, 2000), paging: { cursors: { after: "fixture_large_2" },
    next: `https://graph.facebook.com/v26.0/act_${scope.context.externalAccountId}/insights?after=fixture_large_2` } },
    { data: rows.slice(2000) }];
  large.wirePages = pages;
  let state = c.initialMetaPageCheckpoint(scope);
  for (const raw of pages) {
    const collected = await collect({ context: scope.context, accessToken: "fixture-only", cursor: state.cursor },
      { fetchImpl: async () => new Response(JSON.stringify(raw)) }, scope.options);
    const pending = c.prepareMetaPageCheckpoint(scope, state, collected), n = pending.pending!.rows.length;
    const confirmed = c.confirmMetaPageAppend(scope, pending, { submittedRows: n, insertedRows: n, duplicateRows: 0,
      firstRowIndex: state.nextRowIndex, lastRowIndex: state.nextRowIndex + n - 1 });
    const job = large.input.job;
    large.steps.push({ pending, confirmed,
      prepare: { ...large.envelope, expected_revision: large.steps.length ? state.revision : null, ...r.metaPageDatabaseEvidence(pending) },
      append: { ...large.envelope, expected_revision: pending.revision, pending_id: pending.pending!.id,
        append_payload: { job_id: job.id, report_id: job.report_id, workspace_id: job.workspace_id, advertiser_id: job.advertiser_id,
          connection_id: job.connection_id, provider: "meta_ads", external_account_id: job.external_account_id,
          date_from: job.date_from, date_to: job.date_to, date_window_index: 0, rows: pending.pending!.rows } },
      confirm: { ...large.envelope, expected_revision: pending.revision, ...r.metaPageDatabaseEvidence(confirmed) } });
    state = confirmed;
  }
  large.final = state;
  assert.equal(state.phase, "collected"); assert.equal(state.totalRows, 2001); assert.equal(state.fetchedRows, 2001);
  return { small: wrap(page), large: wrap(large) };
}

async function worker() {
  const { createInterface } = await import("node:readline");
  const { createMetaMaterializationHandoffRepository } = await import("../src/lib/media-sync/meta-ads-materialization-handoff-repository");
  const reader = createInterface({ input: process.stdin, crlfDelay: Infinity }), lines = reader[Symbol.asyncIterator]();
  async function read() { const line = await lines.next(); assert.equal(line.done, false); return JSON.parse(line.value!); }
  try {
    const request = await read(); let id = 0;
    const repo = createMetaMaterializationHandoffRepository(request.input, async (name, { p_payload }) => {
      const sequence = ++id;
      process.stdout.write(JSON.stringify({ type: "rpc", id: sequence, name, payload: p_payload }) + "\n");
      const reply = await read(); assert.equal(reply.id, sequence);
      return { data: reply.data, error: reply.error };
    });
    const result = await repo.advance(request.targetReportId);
    process.stdout.write(JSON.stringify({ type: "result", result }) + "\n");
  } catch {
    process.stdout.write('{"type":"failure","code":"META_HANDOFF_WORKER_FAILED"}\n'); process.exitCode = 1;
  } finally { reader.close(); process.stdin.pause(); }
}
if (process.argv[1]?.endsWith("export-meta-ads-materialization-handoff-fixture.ts")) {
  (process.argv.includes("--rpc-worker") ? worker() : buildMetaHandoffFixture().then(f => {
    process.stdout.write(JSON.stringify(f) + "\n");
  })).catch(() => { process.stderr.write("META_HANDOFF_FIXTURE_FAILED\n"); process.exitCode = 1; });
}
