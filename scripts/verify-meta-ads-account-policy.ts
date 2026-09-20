import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";
import dns from "node:dns";
import dgram from "node:dgram";
import type { MetaAdsAccountPolicy, MetaAdsPolicyDateRange } from "../src/lib/media-sync/meta-ads-account-policy";
import type { MetaAdsCredentialContext } from "../src/lib/media-sync/meta-ads-credentials";
import type { MetaAdsCanonicalContext, MetaAdsAdDailyInsight } from "../src/lib/media-sync/meta-ads-canonical-row";

let cases = 0, networkAttempts = 0;
async function fixture() {
  assert.equal(process.env.META_POLICY_FIXTURE, "1");
  assert.deepEqual(Object.keys(process.env).sort(), ["META_POLICY_FIXTURE", "NODE_ENV", "PATH"].sort());
  const deny = () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
  globalThis.fetch = deny;
  for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
    [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
    [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
    [dgram.Socket.prototype, ["send", "connect"]]] as const) {
    for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
  }
  syncBuiltinESMExports();
  const m = await import("../src/lib/media-sync/meta-ads-account-policy");
  const { buildMetaAdsInsightsRequest } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const { collectMetaAdsAdDailyInsightsPage: collect } = await import("../src/lib/media-sync/meta-ads-ad-daily-insights-collector");
  const { convertMetaAdsDailyInsightsToCanonicalRows: convert } = await import("../src/lib/media-sync/meta-ads-canonical-row");
  const { prepareMetaAdsStagingRows } = await import("../src/lib/media-sync/meta-ads-staging-contract");
  const wire = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8")) as {
    context: MetaAdsCanonicalContext; pages: unknown[];
  };
  const source = JSON.parse(readFileSync("scripts/fixtures/meta-ads-ad-daily-insights.json", "utf8")) as {
    records: MetaAdsAdDailyInsight[];
  };
  const scope: MetaAdsCredentialContext = { connectionId: "fixture-connection", workspaceId: "fixture-workspace",
    advertiserId: "fixture-advertiser", provider: "meta_ads", externalAccountId: wire.context.externalAccountId };
  const policy: MetaAdsAccountPolicy = { version: 1, scope, currency: wire.context.currency,
    timeZone: wire.context.timeZone, metricPolicy: wire.context.metricPolicy };
  const range = { dateFrom: wire.context.dateFrom, dateTo: wire.context.dateTo };
  const resolve = (p: unknown = policy, s = scope, r = range) => m.resolveMetaAdsAccountPolicy(p, s, r);
  function reject(p: unknown, code: string, s = scope, r = range) {
    assert.throws(() => resolve(p, s, r), (error: unknown) => {
      assert.ok(error instanceof m.MetaAdsAccountPolicyError);
      assert.equal(error.code, code); assert.equal(error.cause, undefined);
      assert.ok(!String(error.stack).includes("SYNTHETIC_SECRET_SENTINEL"));
      assert.ok(!JSON.stringify(error).includes("SYNTHETIC_SECRET_SENTINEL"));
      return true;
    }); cases++;
  }
  const before = JSON.stringify({ policy, scope, range });
  const resolved = resolve();
  assert.deepEqual(resolved, { version: 1, scope, context: wire.context }); cases++;
  for (const value of [resolved, resolved.scope, resolved.context, resolved.context.metricPolicy,
    resolved.context.metricPolicy.attributionWindows, resolved.context.breakdowns, resolved.context.actionBreakdowns]) {
    assert.ok(Object.isFrozen(value)); cases++;
  }
  const mutable = structuredClone(policy);
  const isolated = resolve(mutable);
  Object.assign(mutable.scope, { connectionId: "changed" });
  Object.assign(mutable.metricPolicy, { conversionActionType: "changed", attributionWindows: ["changed"] });
  assert.deepEqual(isolated, resolved); cases++;
  for (const value of [null, [], {}, { ...policy, version: 2 }, { ...policy, version: "1" },
    { ...policy, access_token: "SYNTHETIC_SECRET_SENTINEL" }, { ...policy, apiVersion: "v27.0" },
    { ...policy, reportType: "commerce" }, { ...policy, approved: true }, { ...policy, level: "campaign" }]) {
    reject(value, "INVALID_POLICY");
  }
  for (const key of Object.keys(policy)) {
    const omitted = { ...policy } as Record<string, unknown>; delete omitted[key];
    reject(omitted, "INVALID_POLICY");
  }
  for (const key of ["connectionId", "workspaceId", "advertiserId", "externalAccountId"] as const) {
    const different = { ...scope, [key]: key === "externalAccountId" ? "9" : "different" };
    reject({ ...policy, scope: different }, "SCOPE_MISMATCH");
    reject(policy, "SCOPE_MISMATCH", different);
  }
  for (const value of [null, {}, { ...scope, provider: "google_ads" }, { ...scope, provider: "naver_searchad" },
    { ...scope, externalAccountId: "act_123" }, { ...scope, externalAccountId: 123 },
    { ...scope, externalAccountId: "0123" }, { ...scope, workspaceId: " workspace" },
    { ...scope, connectionId: "" }, { ...scope, access_token: "SYNTHETIC_SECRET_SENTINEL" }]) {
    reject({ ...policy, scope: value }, "INVALID_SCOPE");
    reject(policy, "INVALID_SCOPE", value as MetaAdsCredentialContext);
  }
  for (const key of Object.keys(scope)) {
    const omitted = { ...scope } as Record<string, unknown>; delete omitted[key];
    reject({ ...policy, scope: omitted }, "INVALID_SCOPE");
  }
  for (const currency of [null, "", "krw", "KRW ", "US", "WON!", 0]) {
    reject({ ...policy, currency }, "INVALID_ACCOUNT_METADATA");
  }
  for (const timeZone of [null, "", "Asia/NoSuchZone", " Asia/Seoul", "Asia/Seoul\n", 9]) {
    reject({ ...policy, timeZone }, "INVALID_ACCOUNT_METADATA");
  }
  for (const r of [{ dateFrom: "2026-02-29", dateTo: "2026-03-01" },
    { dateFrom: "2026-09-02", dateTo: "2026-09-01" }, { dateFrom: "2026-09-01" },
    { ...range, dateTo: null }, { ...range, dateFrom: "2026-09-01T00:00:00Z" },
    { ...range, timeZone: "UTC" }]) reject(policy, "INVALID_DATE_RANGE", scope, r as MetaAdsPolicyDateRange);
  assert.equal(resolve(policy, scope, { dateFrom: "2024-02-29", dateTo: "2024-02-29" }).context.dateFrom, "2024-02-29"); cases++;
  for (const metricPolicy of [null, {}, { ...policy.metricPolicy, useAccountAttributionSetting: true },
    { ...policy.metricPolicy, use_unified_attribution_setting: true },
    { ...policy.metricPolicy, aggregation: "sum" }, { ...policy.metricPolicy, missingActionValue: 0 }]) {
    reject({ ...policy, metricPolicy }, "UNRESOLVED_METRIC_POLICY");
  }
  for (const key of Object.keys(policy.metricPolicy)) {
    const omitted = { ...policy.metricPolicy } as Record<string, unknown>; delete omitted[key];
    reject({ ...policy, metricPolicy: omitted }, "UNRESOLVED_METRIC_POLICY");
  }
  for (const key of ["conversionActionType", "revenueActionType", "actionReportTime"]) {
    for (const value of [null, "", " ", "label\n", "x".repeat(2001), 0, ["one", "two"]]) {
      reject({ ...policy, metricPolicy: { ...policy.metricPolicy, [key]: value } }, "UNRESOLVED_METRIC_POLICY");
    }
  }
  for (const windows of [null, [], "window", [""], [null], ["same", "same"], new Array(1),
    ["bad\n"], Array.from({ length: 33 }, (_, i) => `fixture.${i}`), Object.assign(["one"], { extra: true })]) {
    reject({ ...policy, metricPolicy: { ...policy.metricPolicy, attributionWindows: windows } }, "UNRESOLVED_METRIC_POLICY");
  }
  const ordered = ["fixture.window_b", "fixture.window_a"];
  assert.deepEqual(resolve({ ...policy, metricPolicy: { ...policy.metricPolicy, attributionWindows: ordered } }).context.metricPolicy.attributionWindows, ordered); cases++;
  let getterCalls = 0;
  const getter = () => { getterCalls++; return "SYNTHETIC_SECRET_SENTINEL"; };
  reject({ ...policy, get currency() { return getter(); } }, "INVALID_POLICY");
  reject({ ...policy, scope: { ...scope, get externalAccountId() { return getter(); } } }, "INVALID_SCOPE");
  reject({ ...policy, metricPolicy: { ...policy.metricPolicy, get conversionActionType() { return getter(); } } }, "UNRESOLVED_METRIC_POLICY");
  const getterArray = ["one"]; Object.defineProperty(getterArray, "0", { get: getter });
  reject({ ...policy, metricPolicy: { ...policy.metricPolicy, attributionWindows: getterArray } }, "UNRESOLVED_METRIC_POLICY");
  assert.equal(getterCalls, 0); cases++;
  reject({ ...policy, [Symbol("secret")]: "SYNTHETIC_SECRET_SENTINEL" }, "INVALID_POLICY");
  reject(Object.assign(Object.create({ inherited: true }), policy), "INVALID_POLICY");
  reject(new Proxy({}, { getPrototypeOf() { throw new Error("SYNTHETIC_SECRET_SENTINEL"); } }), "INVALID_POLICY");
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { reject(policy, "SERVER_ONLY"); } finally { Reflect.deleteProperty(globalThis, "window"); }

  const request = buildMetaAdsInsightsRequest({ context: resolved.context, accessToken: "synthetic-only", pageSize: 4 });
  const url = new URL(request.url);
  assert.equal(url.pathname, `/v26.0/act_${scope.externalAccountId}/insights`);
  assert.equal(url.searchParams.get("action_report_time"), policy.metricPolicy.actionReportTime);
  assert.deepEqual(JSON.parse(url.searchParams.get("action_attribution_windows")!), policy.metricPolicy.attributionWindows);
  assert.deepEqual(JSON.parse(url.searchParams.get("time_range")!), { since: range.dateFrom, until: range.dateTo });
  for (const key of ["use_account_attribution_setting", "use_unified_attribution_setting", "access_token"]) {
    assert.equal(url.searchParams.has(key), false);
  }
  assert.equal(request.init.headers.Authorization, "Bearer synthetic-only"); cases++;
  const options = { pageSize: 4, maxRetries: 0 };
  let calls = 0;
  const mockedFetch: typeof fetch = async () => new Response(JSON.stringify(wire.pages[calls++]), { status: 200 });
  const first = await collect({ context: resolved.context, accessToken: "synthetic-only" }, { fetchImpl: mockedFetch }, options);
  assert.ok(first.cursor);
  // Changing any account, date or metric semantic must reject a resume before I/O.
  const changedContexts = [resolve({ ...policy, currency: "USD" }).context,
    resolve({ ...policy, timeZone: "UTC" }).context,
    resolve(policy, scope, { ...range, dateTo: "2026-09-08" }).context,
    resolve({ ...policy, scope: { ...scope, externalAccountId: "9" } }, { ...scope, externalAccountId: "9" }).context,
    ...["conversionActionType", "revenueActionType", "actionReportTime"].map(key =>
      resolve({ ...policy, metricPolicy: { ...policy.metricPolicy, [key]: "fixture.changed" } }).context),
    resolve({ ...policy, metricPolicy: { ...policy.metricPolicy, attributionWindows: ["fixture.changed"] } }).context];
  for (const context of changedContexts) {
    await assert.rejects(collect({ context, accessToken: "synthetic-only", cursor: first.cursor },
      { fetchImpl: mockedFetch }, options), { code: "INVALID_CURSOR" });
    assert.equal(calls, 1); cases++;
  }
  const pages = [first];
  while (pages.at(-1)!.cursor) {
    assert.ok(pages.length < wire.pages.length);
    pages.push(await collect({ context: resolved.context, accessToken: "synthetic-only", cursor: pages.at(-1)!.cursor },
      { fetchImpl: mockedFetch }, options));
  }
  const rows = pages.flatMap(p => p.rows);
  assert.deepEqual(rows, convert({ context: wire.context, records: source.records }));
  assert.equal(rows.length, 6); assert.equal(pages.reduce((sum, p) => sum + p.fetchedRows, 0), 7);
  assert.equal(prepareMetaAdsStagingRows({ context: resolved.context, rows }).totalRows, 6); cases++;
  assert.ok(rows.some(r => r.cost === 0 && r.conversions === 2.25));
  assert.ok(rows.some(r => r.cost === 0 && r.revenue === 99.5));
  assert.ok(!rows.some(r => [r.impressions, r.clicks, r.cost, r.conversions, r.revenue].every(v => v === 0))); cases++;
  assert.throws(() => convert({ context: resolved.context, records: [{ ...source.records[0], actions: [] }] }),
    { code: "UNRESOLVED_METRIC_POLICY" }); cases++;
  assert.equal(JSON.stringify({ policy, scope, range }), before); cases++;
  assert.equal(networkAttempts, 0);
  console.log(`META_ACCOUNT_POLICY_CONTRACT=PASS CASES=${cases} NETWORK_ATTEMPTS=0 DB_EXECUTIONS=0`);
  console.log(`MOCK_COLLECTOR_PARITY=PASS CANONICAL_ROWS=6 FETCHED_ROWS=7 MOCK_REQUESTS=${calls}`);
  console.log("PRODUCTION_METRIC_SELECTION=UNRESOLVED LIVE_ACCOUNT_METADATA=NOT_VERIFIED RUNTIME_WIRING=DISABLED");
}
if (process.argv.includes("--fixture-child")) {
  fixture().catch(() => { console.error(`META_POLICY_FIXTURE_FAILED AFTER_CASE=${cases}`); process.exitCode = 1; });
} else {
  const result = spawnSync(process.execPath, ["--import", "tsx", process.argv[1], "--fixture-child"], {
    env: { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "test", META_POLICY_FIXTURE: "1" },
    encoding: "utf8", timeout: 30000,
  });
  process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
  process.exitCode = result.status === 0 ? 0 : 1;
}
