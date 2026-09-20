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
import type { MetaAdsApiTestPreviewInput } from "../src/lib/media-sync/meta-ads-api-test-preview";

let cases = 0, networkAttempts = 0;
async function fixture() {
  assert.deepEqual(Object.keys(process.env).sort(), ["META_PREVIEW_FIXTURE", "NODE_ENV", "PATH"].sort());
  const deny = () => { networkAttempts++; throw new Error("NETWORK_FORBIDDEN"); };
  globalThis.fetch = deny;
  for (const [target, keys] of [[http, ["request", "get"]], [https, ["request", "get"]],
    [net, ["connect", "createConnection"]], [net.Socket.prototype, ["connect"]],
    [tls, ["connect"]], [dns, ["lookup", "resolve"]], [dns.promises, ["lookup", "resolve"]],
    [dgram.Socket.prototype, ["send", "connect"]]] as const) {
    for (const key of keys) Object.defineProperty(target, key, { configurable: true, value: deny });
  }
  syncBuiltinESMExports();
  let credentialReads = 0;
  const originalEnv = process.env;
  process.env = new Proxy(originalEnv, { get(target, key) {
    if (typeof key === "string" && /TOKEN|SECRET|CREDENTIAL|SUPABASE|DATABASE/.test(key)) {
      credentialReads++; throw new Error("CREDENTIAL_READ_FORBIDDEN");
    }
    return Reflect.get(target, key);
  } });
  const m = await import("../src/lib/media-sync/meta-ads-api-test-preview");
  const { buildMetaAdsInsightsRequest } = await import("../src/lib/media-sync/meta-ads-insights-request");
  const { buildMetaAdsAccountMetadataRequest } = await import("../src/lib/media-sync/meta-ads-account-preflight");
  const { getMediaProviderSyncCapability } = await import("../src/lib/media-sync/media-provider-sync-capabilities");
  const draft = JSON.parse(readFileSync("scripts/fixtures/meta-ads-connection-draft.json", "utf8"));
  const { context } = JSON.parse(readFileSync("scripts/fixtures/meta-ads-insights-pages.json", "utf8"));
  const input: MetaAdsApiTestPreviewInput = { externalAccountId: context.externalAccountId,
    currency: context.currency, timeZone: context.timeZone, date: context.dateFrom, metricPolicy: context.metricPolicy };
  const empty: MetaAdsApiTestPreviewInput = { externalAccountId: null, currency: null, timeZone: null, date: null,
    metricPolicy: { conversionActionType: null, revenueActionType: null, actionReportTime: null, attributionWindows: null } };
  const secret = "SYNTHETIC_PREVIEW_TEST_SECRET";
  function reject(value: unknown, code = "INVALID_PREVIEW_INPUT") {
    assert.throws(() => m.buildMetaAdsApiTestPreview(value), (error: unknown) => {
      assert.ok(error instanceof m.MetaAdsApiTestPreviewError); assert.equal(error.code, code); assert.equal(error.cause, undefined);
      assert.ok(!String(error.stack).includes(secret)); assert.ok(!JSON.stringify(error).includes(secret)); return true;
    }); cases++;
  }
  const before = JSON.stringify(input), complete = m.buildMetaAdsApiTestPreview(input);
  assert.equal(complete.status, "CONFIGURED_PREVIEW"); assert.equal(complete.liveExecutionEnabled, false);
  assert.deepEqual(complete.missingFields, []); assert.equal(complete.requests.length, 2);
  assert.equal(complete.plan.maximumRequests, 2); assert.equal(complete.plan.maxRowsPerPage, 25);
  assert.equal(complete.plan.dateWindowDays, 1); assert.equal(complete.plan.followPagination, false);
  assert.equal(complete.plan.automaticRetries, 0); cases++;
  // Compare with the actual request builders, not a separate handwritten API URL.
  const actual = [buildMetaAdsAccountMetadataRequest({ externalAccountId: context.externalAccountId, accessToken: secret }),
    buildMetaAdsInsightsRequest({ context: { ...context, dateFrom: input.date, dateTo: input.date }, accessToken: secret, pageSize: 25 })];
  for (let i = 0; i < actual.length; i++) {
    const url = new URL(actual[i].url), preview = complete.requests[i];
    assert.equal(preview.origin, url.origin); assert.equal(preview.path, url.pathname);
    assert.deepEqual(preview.query, Object.fromEntries(url.searchParams));
    assert.equal(preview.method, actual[i].init.method); assert.equal(preview.cache, actual[i].init.cache);
    assert.equal(preview.redirect, actual[i].init.redirect); assert.equal(preview.credentialIncluded, false);
    for (const k of ["headers", "init", "url", "accessToken", "access_token", "Authorization"]) assert.ok(!(k in preview));
    for (const k of ["access_token", "after", "before", "use_unified_attribution_setting", "use_account_attribution_setting"]) {
      assert.ok(!(k in preview.query));
    }
    cases++;
  }
  assert.deepEqual(JSON.parse(complete.requests[1].query.time_range!), { since: input.date, until: input.date }); cases++;
  const blank = m.buildMetaAdsApiTestPreview(empty);
  assert.equal(blank.status, "INCOMPLETE"); assert.equal(blank.missingFields.length, 8);
  assert.equal(blank.requests[0].path, "/v26.0/act_<AD_ACCOUNT_ID>");
  assert.equal(blank.requests[1].query.time_range, null);
  assert.equal(blank.requests[1].query.action_report_time, null);
  assert.equal(blank.requests[1].query.action_attribution_windows, null); cases++;
  for (const value of [blank, complete]) {
    const json = JSON.stringify(value);
    for (const sentinel of [secret, "SYNTHETIC_PREVIEW_ONLY_NEVER_SENT", "preview.unresolved"]) assert.ok(!json.includes(sentinel));
    assert.ok(!json.includes("Bearer "));
  }
  assert.ok(!JSON.stringify(blank).includes("2000-01-01")); assert.ok(!JSON.stringify(blank).includes('"XXX"')); cases++;
  for (const key of ["externalAccountId", "currency", "timeZone", "date"] as const) {
    assert.deepEqual(m.buildMetaAdsApiTestPreview({ ...input, [key]: null }).missingFields, [key]); cases++;
  }
  for (const key of Object.keys(input.metricPolicy)) {
    assert.deepEqual(m.buildMetaAdsApiTestPreview({ ...input, metricPolicy: { ...input.metricPolicy, [key]: null } }).missingFields,
      [`metricPolicy.${key}`]); cases++;
  }
  function frozen(value: unknown) {
    if (value && typeof value === "object") { assert.ok(Object.isFrozen(value)); Object.values(value).forEach(frozen); }
  }
  frozen(complete); frozen(blank); cases++;
  const mutable = structuredClone(input), separate = m.buildMetaAdsApiTestPreview(mutable);
  Object.assign(mutable, { date: "2026-09-02" }); Object.assign(mutable.metricPolicy, { attributionWindows: ["different"] });
  assert.deepEqual(separate, complete); assert.equal(JSON.stringify(input), before); cases++;
  for (const value of [null, {}, [], 1, { ...input, accessToken: secret }, { ...input, headers: { Authorization: secret } },
    { ...input, credential_ciphertext: secret }, { ...input, execute: true }, { ...input, apiVersion: "v27.0" },
    { ...input, endpoint: "https://example.com" }, { ...input, dateTo: "2026-09-02" }, { ...input, pageSize: 1000 },
    { ...input, after: "cursor" }, { ...input, retry: 3 }, { ...input, [Symbol("hidden")]: secret },
    Object.assign(Object.create({ inherited: true }), input)]) reject(value);
  for (const key of Object.keys(input)) { const value = { ...input } as Record<string, unknown>; delete value[key]; reject(value); }
  for (const value of ["", 123, "0", "01", "act_123", "1?access_token=" + secret, "9".repeat(31), "123\n"]) {
    reject({ ...input, externalAccountId: value });
  }
  for (const value of ["", "2026-02-29", "2026-09-31", "2026-9-1", "2026-09-01T00:00:00Z", 20260901]) reject({ ...input, date: value });
  assert.equal(m.buildMetaAdsApiTestPreview({ ...input, date: "2024-02-29" }).configuration.date, "2024-02-29"); cases++;
  for (const value of ["krw", "US", "KRW ", 0]) reject({ ...input, currency: value });
  for (const value of ["No/SuchZone", " Asia/Seoul", 9]) reject({ ...input, timeZone: value });
  for (const value of [null, {}, { ...input.metricPolicy, access_token: secret }, { ...input.metricPolicy, missingActionValue: 0 }]) {
    reject({ ...input, metricPolicy: value });
  }
  for (const key of ["conversionActionType", "revenueActionType", "actionReportTime"]) {
    for (const value of ["", "white space\n", "a".repeat(2001), 0]) reject({ ...input, metricPolicy: { ...input.metricPolicy, [key]: value } });
  }
  for (const value of [[], [null], [""], ["same", "same"], new Array(1), ["x\u007f"],
    Object.assign(["one"], { extra: secret }), Array.from({ length: 33 }, (_, i) => `window.${i}`)]) {
    reject({ ...input, metricPolicy: { ...input.metricPolicy, attributionWindows: value } });
  }
  let getters = 0; const getter = () => { getters++; throw new Error(secret); };
  reject({ ...input, get externalAccountId() { return getter(); } });
  reject({ ...input, get metricPolicy() { return getter(); } });
  reject({ ...input, metricPolicy: { ...input.metricPolicy, get actionReportTime() { return getter(); } } });
  const getterArray = ["one"]; Object.defineProperty(getterArray, "0", { get: getter });
  reject({ ...input, metricPolicy: { ...input.metricPolicy, attributionWindows: getterArray } });
  reject(new Proxy({}, { getPrototypeOf() { throw new Error(secret); } }));
  assert.equal(getters, 0); cases++;
  Object.defineProperty(globalThis, "window", { configurable: true, value: {} });
  try { reject(input, "SERVER_ONLY"); } finally { Reflect.deleteProperty(globalThis, "window"); }
  assert.equal(credentialReads, 0); assert.equal(networkAttempts, 0); cases++;
  process.env = originalEnv;

  const cli = (args: string[], poison = false) => spawnSync(process.execPath,
    ["--import", "tsx", "scripts/preview-meta-ads-api-test.ts", ...args], {
      encoding: "utf8", timeout: 10000, env: { PATH: process.env.PATH ?? "", NODE_ENV: "test",
        ...(poison ? { MEDIA_CREDENTIAL_ENCRYPTION_KEY: secret, META_ACCESS_TOKEN: secret, DATABASE_URL: secret } : {}) },
    });
  function cliJson(args: string[], poison = false) {
    const r = cli(args, poison); assert.equal(r.status, 0); assert.equal(r.stderr, "");
    assert.ok(!r.stdout.includes(secret)); const value = JSON.parse(r.stdout);
    assert.equal(value.liveExecutionEnabled, false);
    assert.deepEqual(value.verification, { networkAttempts: 0, apiCalls: 0, dbExecutions: 0, credentialReads: 0 });
    cases++; return value;
  }
  const defaultOutput = cliJson([]);
  assert.equal(defaultOutput.inputSource, "UNCONNECTED_DRAFT"); assert.equal(defaultOutput.status, "INCOMPLETE");
  assert.equal(defaultOutput.missingFields.length, 6);
  assert.deepEqual(defaultOutput.configuration.metricPolicy, draft.metricPolicyCandidate); cases++;
  assert.deepEqual(cliJson([], true), defaultOutput); cases++;
  const example = cliJson(["--example"]);
  assert.equal(example.inputSource, "SYNTHETIC_EXAMPLE"); assert.equal(example.status, "CONFIGURED_PREVIEW");
  assert.deepEqual(example.requests, complete.requests); cases++;
  const partial = cliJson(["--date", "2026-09-01"]);
  assert.equal(partial.configuration.date, "2026-09-01"); assert.equal(partial.missingFields.length, 5); cases++;
  const manual = cliJson(["--account-id", context.externalAccountId, "--currency", "KRW", "--timezone", "Asia/Seoul",
    "--date", "2026-09-01", "--conversion-action", "fixture.explicit_conversion", "--revenue-action", "fixture.explicit_revenue",
    "--report-time", "impression", "--attribution-window", "1d_click", "--attribution-window", "1d_view"]);
  assert.equal(manual.inputSource, "MANUAL_PREVIEW"); assert.equal(manual.status, "CONFIGURED_PREVIEW");
  assert.deepEqual(manual.configuration.metricPolicy.attributionWindows, ["1d_click", "1d_view"]); cases++;
  for (const args of [["--run"], ["--token", secret], ["--access-token", secret], ["--url", secret],
    ["--profile", "/Users/damon/Projects/dashboard/secret.json"], ["--output", "/tmp/meta-output"],
    ["--date"], ["--date", "2026-09-01", "--date", "2026-09-02"], ["--date-from", "2026-09-01"],
    ["--example", "--run"], ["--help", "--token", secret], ["--date", "2026-02-29"], ["--account-id", "act_123"]]) {
    const r = cli(args); assert.equal(r.status, 1); assert.equal(r.stdout, "");
    assert.ok(!r.stderr.includes(secret)); assert.ok(!r.stderr.includes("/Users/damon")); cases++;
  }
  const help = cli(["--help"]); assert.equal(help.status, 0); assert.ok(help.stdout.includes("Preview only")); cases++;
  assert.equal(getMediaProviderSyncCapability("meta_ads").syncRuntimeEnabled, false); cases++;
  console.log(`META_API_TEST_PREVIEW=PASS CASES=${cases} NETWORK_ATTEMPTS=${networkAttempts} CREDENTIAL_READS=${credentialReads} DB_EXECUTIONS=0`);
  console.log("BUILDER_PARITY=PASS ONE_DAY_FIRST_PAGE_25=PASS UNKNOWN_OR_LIVE_FLAGS=REJECTED");
  console.log("UNCONNECTED_DRAFT=INCOMPLETE SYNTHETIC_EXAMPLE=CONFIGURED_PREVIEW LIVE_EXECUTION=DISABLED");
}
if (process.env.META_PREVIEW_FIXTURE === "1") {
  fixture().catch(error => { console.error(`META_API_PREVIEW_FIXTURE_FAILED AFTER_CASE=${cases} TYPE=${error?.name ?? "unknown"}`); process.exitCode = 1; });
} else {
  const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/verify-meta-ads-api-test-preview.ts"], {
    env: { PATH: process.env.PATH ?? "", NODE_ENV: "test", META_PREVIEW_FIXTURE: "1" }, encoding: "utf8", timeout: 120000,
  });
  process.stdout.write(result.stdout ?? ""); process.stderr.write(result.stderr ?? "");
  process.exitCode = result.status === 0 ? 0 : 1;
}
