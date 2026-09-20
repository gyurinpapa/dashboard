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

async function main() {
  const { buildMetaAdsInsightsRequest: build, metaRequestContext, MetaInsightsError } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const { parseMetaAdsInsightsPage: parse } = await import("../src/lib/media-sync/meta-ads-insights-response");
  const { MetaAdsCanonicalError, convertMetaAdsDailyInsightsToCanonicalRows: convert } = await import("../src/lib/media-sync/meta-ads-canonical-row");
  const { prepareMetaAdsStagingRows } = await import("../src/lib/media-sync/meta-ads-staging-contract");
  const fixture = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
  const source = JSON.parse(readFileSync("scripts/fixtures/meta-ads-ad-daily-insights.json", "utf8"));
  const context = metaRequestContext(fixture.context);
  let cases = 0;
  function rejects(fn: () => unknown, code: string) {
    assert.throws(fn, (error) => {
      assert.ok(error instanceof MetaInsightsError || error instanceof MetaAdsCanonicalError);
      assert.equal(error.code, code); return true;
    }); cases++;
  }
  const request = build({ context, accessToken: "fixture-secret-only", pageSize: 4 });
  const url = new URL(request.url);
  assert.equal(url.origin, "https://graph.facebook.com");
  assert.equal(url.pathname, `/v26.0/act_${context.externalAccountId}/insights`);
  assert.equal(url.searchParams.get("level"), "ad");
  assert.equal(url.searchParams.get("time_increment"), "1");
  assert.deepEqual(JSON.parse(url.searchParams.get("time_range")!), { since: context.dateFrom, until: context.dateTo });
  assert.equal(url.searchParams.get("action_report_time"), context.metricPolicy.actionReportTime);
  assert.deepEqual(JSON.parse(url.searchParams.get("action_attribution_windows")!), context.metricPolicy.attributionWindows);
  assert.equal(url.searchParams.get("breakdowns"), "[]"); assert.equal(url.searchParams.get("action_breakdowns"), "[]");
  assert.equal(request.init.headers.Authorization, "Bearer fixture-secret-only");
  assert.equal(request.init.redirect, "error"); assert.equal(request.init.cache, "no-store");
  assert.ok(!request.url.includes("fixture-secret-only")); cases++;
  const opaque = "abc+/==";
  assert.equal(new URL(build({ context, accessToken: "fake", after: opaque }).url).searchParams.get("after"), opaque); cases++;
  for (const accessToken of ["", "bad\r\nheader", "bad space"]) rejects(() => build({ context, accessToken }), "INVALID_INPUT");
  for (const pageSize of [0, 2001, 1.5, NaN]) rejects(() => build({ context, accessToken: "fake", pageSize }), "INVALID_INPUT");
  rejects(() => build({ context: { ...context, externalAccountId: "act_123" }, accessToken: "fake" }), "INVALID_INPUT");
  rejects(() => build({ context: { ...context, metricPolicy: { ...context.metricPolicy, conversionActionType: "" } }, accessToken: "fake" }), "UNRESOLVED_METRIC_POLICY");
  const parsed = fixture.pages.map((page: unknown) => parse(page, context, 4));
  const rows = parsed.flatMap((p: ReturnType<typeof parse>) => p.rows);
  assert.deepEqual(rows, convert({ context, records: source.records }));
  assert.equal(prepareMetaAdsStagingRows({ context, rows }).totalRows, 6);
  assert.equal(parsed[0].fetchedRows, 3); assert.equal(parsed[0].rows.length, 2);
  assert.equal(parsed[1].after, "fixture-page-3"); assert.equal(parsed[1].rows.length, 0);
  assert.equal(parsed[2].after, null);
  assert.ok(rows.some((row: { conversions: number; cost: number }) => row.conversions === 2.25 && row.cost === 0));
  assert.ok(rows.some((row: { revenue: number; cost: number }) => row.revenue === 99.5 && row.cost === 0)); cases++;
  for (const data of [null, {}, "rows"]) rejects(() => parse({ data }, context, 4), "INVALID_RESPONSE");
  rejects(() => parse(fixture.pages[0], context, 2), "INVALID_RESPONSE");
  const change = (fn: (record: Record<string, unknown>) => void) => {
    const record = structuredClone(source.records[0]); fn(record); return { data: [record] };
  };
  rejects(() => parse(change((r) => { delete r.actions; }), context, 4), "UNRESOLVED_METRIC_POLICY");
  rejects(() => parse(change((r) => { r.action_values = []; }), context, 4), "UNRESOLVED_METRIC_POLICY");
  rejects(() => parse(change((r) => { r.clicks = -1; }), context, 4), "INVALID_METRIC");
  rejects(() => parse(change((r) => { r.account_id = "999"; }), context, 4), "SCOPE_MISMATCH");
  rejects(() => parse(change((r) => { r.date_stop = "2026-09-02"; }), context, 4), "UNSUPPORTED_CONTRACT");
  rejects(() => parse({ data: [source.records[1], source.records[1]] }, context, 4), "DUPLICATE_AD_DAY");
  const endpoint = url.origin + url.pathname;
  for (const next of ["http://graph.facebook.com" + url.pathname + "?after=a", "https://evil.invalid/?after=a",
    endpoint + "?after=b", endpoint + "?after=a&after=a", endpoint + "?after=a#fragment",
    endpoint.replace("act_", "act_99") + "?after=a", "https://user:pass@graph.facebook.com" + url.pathname + "?after=a"]) {
    rejects(() => parse({ data: [], paging: { next, cursors: { after: "a" } } }, context, 4), "INVALID_RESPONSE");
  }
  for (const suffix of ["&level=campaign", "&time_increment=7", "&limit=999", "&unknown=value"]) {
    rejects(() => parse({ data: [], paging: { next: endpoint + "?after=a" + suffix, cursors: { after: "a" } } }, context, 4), "SCOPE_MISMATCH");
  }
  rejects(() => parse({ data: [], paging: { next: endpoint + "?after=a" } }, context, 4), "INVALID_RESPONSE");
  rejects(() => parse(fixture.errors.auth, context, 4), "API_ERROR");
  assert.equal(networkAttempts, 0);
  console.log(`META_INSIGHTS_WIRE_CONTRACT=PASS CASES=${cases}`);
  console.log("CANONICAL_STAGING_PARITY=PASS NETWORK_CALLS=0 DB_EXECUTIONS=0 LIVE_API_COMPATIBILITY=NOT_TESTED");
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
